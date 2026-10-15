import type { Ctx } from "../context";
import type { Db } from "../db/scoped";
import { listConversations, unreadCount } from "./inbox";
import { estimateCost } from "./campaigns";
import { getAccount, getWorkspace } from "./workspace";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import type { AnalyticsData, DashboardData, DayPoint, Kpi } from "@/lib/shared/analytics";
import type { Campaign, CampaignMessage, Contact, Template } from "@/lib/shared/types";

const COLS = "campaign_id,status,error_code,sent_at,delivered_at,read_at,replied_at,failed_at";
type Slim = Pick<CampaignMessage, "campaign_id" | "status" | "error_code" | "sent_at" | "delivered_at" | "read_at" | "replied_at" | "failed_at">;

function dayKey(ts: string | number | Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));
}

function emptyDays(range: number, tz: string): Map<string, DayPoint> {
  const out = new Map<string, DayPoint>();
  for (let i = range - 1; i >= 0; i--) {
    const d = dayKey(Date.now() - i * 86400000, tz);
    out.set(d, { date: d, sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 });
  }
  return out;
}

async function slimRows(db: Db, sinceIso: string): Promise<Slim[]> {
  return db.select<Slim>("campaign_messages", {
    where: { sent_at: { gte: sinceIso } },
    columns: COLS,
    order: [["sent_at", "asc"]],
    limit: 60_000,
  });
}

function bucket(rows: Slim[], range: number, tz: string): DayPoint[] {
  const days = emptyDays(range, tz);
  const add = (ts: string | null, key: keyof Omit<DayPoint, "date">) => {
    if (!ts) return;
    const p = days.get(dayKey(ts, tz));
    if (p) p[key]++;
  };
  for (const r of rows) {
    add(r.sent_at, "sent");
    add(r.delivered_at, "delivered");
    add(r.read_at, "read");
    add(r.replied_at, "replied");
    add(r.failed_at, "failed");
  }
  return [...days.values()];
}

const rate = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export async function dashboardData(ctx: Ctx, range = 14): Promise<DashboardData> {
  const db = ctx.db;
  const ws = await getWorkspace(db);
  const tz = ws.settings.business_hours.timezone;
  const since = new Date(Date.now() - range * 2 * 86400000).toISOString(); // current + previous period
  const rows = await slimRows(db, since);

  const cutoff = Date.now() - range * 86400000;
  const cur = rows.filter((r) => Date.parse(r.sent_at!) >= cutoff);
  const prev = rows.filter((r) => Date.parse(r.sent_at!) < cutoff);
  const tally = (list: Slim[]) => ({
    sent: list.length,
    delivered: list.filter((r) => r.delivered_at).length,
    read: list.filter((r) => r.read_at).length,
    replied: list.filter((r) => r.replied_at).length,
  });
  const c = tally(cur);
  const p = tally(prev);
  const series = bucket(cur, range, tz);

  const kpi = (value: number, previous: number, pick: (d: DayPoint) => number): Kpi => ({ value, previous, spark: series.map(pick) });
  const rateSpark = (n: (d: DayPoint) => number) => (d: DayPoint) => (d.sent ? (n(d) / d.sent) * 100 : 0);

  const [total, optedIn, optedOut, pending, newWeek, tplRows, active, recent, unread, inbox, account, allCampaigns] = await Promise.all([
    db.count("contacts"),
    db.count("contacts", { opt_in: "opted_in" }),
    db.count("contacts", { opt_in: "opted_out" }),
    db.count("contacts", { opt_in: "pending" }),
    db.count("contacts", { created_at: { gte: new Date(Date.now() - 7 * 86400000).toISOString() } }),
    db.select<Template>("templates", { limit: 500, columns: "id,status" }),
    db.select<Campaign>("campaigns", { where: { status: { in: ["sending", "scheduled", "paused"] } }, order: [["created_at", "desc"]], limit: 6 }),
    db.select<Campaign>("campaigns", { where: { status: "completed" }, order: [["completed_at", "desc"]], limit: 5 }),
    unreadCount(db),
    listConversations(ctx, { tab: "unread", limit: 5 }),
    getAccount(db),
    db.select<Campaign>("campaigns", { where: { status: { in: ["completed", "sending"] } }, limit: 200 }),
  ]);

  const tpl = { approved: 0, pending: 0, rejected: 0, draft: 0 };
  for (const t of tplRows) {
    if (t.status === "APPROVED") tpl.approved++;
    else if (t.status === "PENDING") tpl.pending++;
    else if (t.status === "REJECTED") tpl.rejected++;
    else if (t.status === "DRAFT") tpl.draft++;
  }

  const byTpl = new Map<string, { sent: number; read: number; replied: number }>();
  for (const camp of allCampaigns) {
    if (!camp.template_name) continue;
    const t = byTpl.get(camp.template_name) ?? { sent: 0, read: 0, replied: 0 };
    t.sent += camp.sent;
    t.read += camp.read;
    t.replied += camp.replied;
    byTpl.set(camp.template_name, t);
  }

  return {
    range,
    kpis: {
      sent: kpi(c.sent, p.sent, (d) => d.sent),
      delivered_rate: kpi(rate(c.delivered, c.sent), rate(p.delivered, p.sent), rateSpark((d) => d.delivered)),
      read_rate: kpi(rate(c.read, c.delivered), rate(p.read, p.delivered), (d) => (d.delivered ? (d.read / d.delivered) * 100 : 0)),
      replied: kpi(c.replied, p.replied, (d) => d.replied),
    },
    series,
    audience: { total, opted_in: optedIn, opted_out: optedOut, pending, new_week: newWeek },
    active,
    recent,
    templates: tpl,
    unread,
    inbox: inbox.rows,
    account,
    top_templates: [...byTpl.entries()]
      .map(([name, v]) => ({ name, sent: v.sent, read_rate: rate(v.read, v.sent), reply_rate: rate(v.replied, v.sent) }))
      .filter((t) => t.sent > 0)
      .sort((a, b) => b.read_rate - a.read_rate)
      .slice(0, 4),
  };
}

export async function analyticsData(ctx: Ctx, range = 30): Promise<AnalyticsData> {
  const db = ctx.db;
  const ws = await getWorkspace(db);
  const tz = ws.settings.business_hours.timezone;
  const since = new Date(Date.now() - range * 86400000).toISOString();
  const rows = await slimRows(db, since);
  const campaigns = await db.select<Campaign>("campaigns", { limit: 1000 });
  const byId = new Map(campaigns.map((c) => [c.id, c]));

  const series = bucket(rows, range, tz);
  const totals = {
    sent: rows.length,
    delivered: rows.filter((r) => r.delivered_at).length,
    read: rows.filter((r) => r.read_at).length,
    replied: rows.filter((r) => r.replied_at).length,
    failed: rows.filter((r) => r.status === "failed").length,
    cost: 0,
    currency: ws.settings.rates.currency,
  };

  const costByDay = new Map<string, number>(series.map((s) => [s.date, 0]));
  const tplAgg = new Map<string, { sent: number; delivered: number; read: number; replied: number; failed: number }>();
  const campAgg = new Map<string, { sent: number; delivered: number; read: number; replied: number }>();
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const failures = new Map<string, number>();
  const wk = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", hour12: false });

  for (const r of rows) {
    const camp = byId.get(r.campaign_id);
    const unit = estimateCost(ws.settings, camp?.template_category ?? "MARKETING", 1);
    totals.cost += unit;
    const dk = dayKey(r.sent_at!, tz);
    costByDay.set(dk, (costByDay.get(dk) ?? 0) + unit);

    const tname = camp?.template_name ?? "—";
    const t = tplAgg.get(tname) ?? { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 };
    t.sent++;
    if (r.delivered_at) t.delivered++;
    if (r.read_at) t.read++;
    if (r.replied_at) t.replied++;
    if (r.status === "failed") t.failed++;
    tplAgg.set(tname, t);

    const ca = campAgg.get(r.campaign_id) ?? { sent: 0, delivered: 0, read: 0, replied: 0 };
    ca.sent++;
    if (r.delivered_at) ca.delivered++;
    if (r.read_at) ca.read++;
    if (r.replied_at) ca.replied++;
    campAgg.set(r.campaign_id, ca);

    if (r.read_at) {
      const parts = wk.formatToParts(new Date(r.read_at));
      const wd = parts.find((x) => x.type === "weekday")?.value ?? "Mon";
      const hr = Number(parts.find((x) => x.type === "hour")?.value ?? 0) % 24;
      const di = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
      if (di >= 0) heat[di][hr]++;
    }
    if (r.status === "failed" && r.error_code) failures.set(r.error_code, (failures.get(r.error_code) ?? 0) + 1);
  }
  totals.cost = Math.round(totals.cost * 100) / 100;

  // contact growth, cumulative
  const contacts = await db.select<Pick<Contact, "created_at">>("contacts", { columns: "created_at", order: [["created_at", "asc"]], limit: 100_000 });
  const before = contacts.filter((c) => Date.parse(c.created_at) < Date.now() - range * 86400000).length;
  const perDay = new Map<string, number>(series.map((s) => [s.date, 0]));
  for (const c of contacts) {
    const k = dayKey(c.created_at, tz);
    if (perDay.has(k)) perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  let run = before;
  const growth = [...perDay.entries()].map(([date, n]) => ({ date, contacts: (run += n) }));

  return {
    range,
    totals,
    series,
    cost_series: [...costByDay.entries()].map(([date, cost]) => ({ date, cost: Math.round(cost * 100) / 100 })),
    growth,
    by_template: [...tplAgg.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sent - a.sent).slice(0, 12),
    by_campaign: [...campAgg.entries()]
      .map(([id, v]) => ({ id, name: byId.get(id)?.name ?? "Deleted campaign", ...v }))
      .sort((a, b) => b.sent - a.sent)
      .slice(0, 10),
    heatmap: heat,
    failures: [...failures.entries()].map(([code, count]) => ({ code, title: waErrorInfo(code).title, count })).sort((a, b) => b.count - a.count),
  };
}
