import { dbFor, type Ctx } from "../context";
import type { Db } from "../db/scoped";
import type { Adapter, Query, Where } from "../db/types";
import { HttpError } from "../http";
import { getProvider, type Provider } from "../wa";
import { asWaError } from "../wa/errors";
import { chunk, clamp, nowIso, sleep, uniq } from "@/lib/shared/utils";
import { normalizePhone } from "@/lib/shared/phone";
import { previewText, resolveSource, templateSlots, validateTemplate, type VarSlot } from "@/lib/shared/template";
import { isFatal, waErrorInfo } from "@/lib/shared/wa-errors";
import type {
  AudienceSpec,
  Campaign,
  CampaignMessage,
  CampaignStatus,
  Contact,
  Page,
  Template,
  VarSource,
  WorkspaceSettings,
} from "@/lib/shared/types";
import { contactRow, iterateContacts, normTag, segmentToQuery, ensureTags } from "./contacts";
import { recordOutbound, type OutboundItem } from "./conversations";
import { sendTemplateMessage, type TemplateRef } from "./sending";
import { getWorkspace } from "./workspace";

/* ───────── input ───────── */

export interface CampaignInput {
  name: string;
  template_id: string | null;
  audience: AudienceSpec;
  variable_map: Record<string, VarSource>;
  media_map: Record<string, string>;
  scheduled_at: string | null;
  throttle_per_min: number;
}

export const THROTTLE_PRESETS = [
  { value: 120, label: "Gentle", hint: "2 / sec" },
  { value: 600, label: "Steady", hint: "10 / sec" },
  { value: 1800, label: "Fast", hint: "30 / sec" },
  { value: 4800, label: "Max", hint: "80 / sec" },
];

/* ───────── audience ───────── */

const RETARGET_WHERE: Record<NonNullable<AudienceSpec["retarget"]>, Where> = {
  not_read: { delivered_at: { isNull: false }, read_at: { isNull: true } },
  not_delivered: { sent_at: { isNull: false }, delivered_at: { isNull: true }, status: { neq: "failed" } },
  failed: { status: "failed" },
  read_no_reply: { read_at: { isNull: false }, replied_at: { isNull: true } },
};

function consentList(a: AudienceSpec) {
  return a.include_pending ? ["opted_in", "pending"] : ["opted_in"];
}

/** Contacts-table query for query-style audiences (everything except explicit id lists). */
export async function audienceQuery(db: Db, a: AudienceSpec, withConsent = true): Promise<Query> {
  const where: Where = {};
  const and: Where[] = [];
  let or: Where[] | undefined;
  if (withConsent) where.opt_in = { in: consentList(a) };
  if (a.mode === "tags" && a.tags?.length) {
    const t = a.tags.map(normTag);
    where.tags = a.tag_match === "all" ? { has: t } : { hasAny: t };
  }
  if (a.mode === "segment" && a.segment_id) {
    const seg = await db.get<import("@/lib/shared/types").Segment>("segments", a.segment_id);
    if (seg) {
      const sq = segmentToQuery(seg);
      and.push(...(sq.and ?? []));
      or = sq.or;
    }
  }
  for (const t of a.exclude_tags ?? []) and.push({ tags: { notHas: [normTag(t)] } });
  let orAlso: Where[] | undefined;
  if (a.skip_recent_days && a.skip_recent_days > 0) {
    const cutoff = new Date(Date.now() - a.skip_recent_days * 86400000).toISOString();
    orAlso = [{ last_outbound_at: { isNull: true } }, { last_outbound_at: { lt: cutoff } }];
  }
  return { where, and: and.length ? and : undefined, or, orAlso };
}

async function retargetContactIds(db: Db, a: AudienceSpec): Promise<string[]> {
  if (!a.source_campaign_id || !a.retarget) return [];
  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    const rows = await db.select<CampaignMessage>("campaign_messages", {
      where: { campaign_id: a.source_campaign_id, ...RETARGET_WHERE[a.retarget] },
      order: [["created_at", "asc"], ["id", "asc"]],
      limit: 1000,
      offset,
    });
    ids.push(...rows.map((r) => r.contact_id).filter(Boolean));
    if (rows.length < 1000) break;
    offset += 1000;
  }
  return uniq(ids);
}

/** Explicit-id audiences are fetched in chunks (keeps URLs short on PostgREST). */
async function* contactsByIds(db: Db, ids: string[], a: AudienceSpec): AsyncGenerator<Contact[]> {
  const recent = a.skip_recent_days ? Date.now() - a.skip_recent_days * 86400000 : 0;
  for (const part of chunk(ids, 100)) {
    const rows = await db.select<Contact>("contacts", { where: { id: { in: part }, opt_in: { in: consentList(a) } } });
    const ok = rows.filter((c) => !recent || !c.last_outbound_at || Date.parse(c.last_outbound_at) < recent);
    const ex = (a.exclude_tags ?? []).map(normTag);
    yield ok.filter((c) => !ex.some((t) => c.tags.includes(t)));
  }
}

export async function* audienceContacts(db: Db, a: AudienceSpec): AsyncGenerator<Contact[]> {
  if (a.mode === "contacts") {
    yield* contactsByIds(db, a.contact_ids ?? [], a);
  } else if (a.mode === "retarget") {
    yield* contactsByIds(db, await retargetContactIds(db, a), a);
  } else {
    yield* iterateContacts(db, await audienceQuery(db, a));
  }
}

export interface AudienceStats {
  eligible: number;
  opted_out: number;
  pending: number;
}

export async function audienceStats(db: Db, a: AudienceSpec): Promise<AudienceStats> {
  if (a.mode === "contacts" || a.mode === "retarget") {
    const ids = a.mode === "contacts" ? (a.contact_ids ?? []) : await retargetContactIds(db, a);
    let eligible = 0;
    let opted_out = 0;
    let pending = 0;
    for (const part of chunk(ids, 100)) {
      for (const c of await db.select<Contact>("contacts", { where: { id: { in: part } } })) {
        if (c.opt_in === "opted_out") opted_out++;
        else if (c.opt_in === "pending" && !a.include_pending) pending++;
        else eligible++;
      }
    }
    return { eligible, opted_out, pending };
  }
  const q = await audienceQuery(db, a, false);
  const withOpt = (opt: string | string[]) => ({ ...q, where: { ...q.where, opt_in: Array.isArray(opt) ? { in: opt } : opt } });
  const [eligible, opted_out, pending] = await Promise.all([
    db.count("contacts", withOpt(consentList(a)).where, q),
    db.count("contacts", withOpt("opted_out").where, q),
    a.include_pending ? Promise.resolve(0) : db.count("contacts", withOpt("pending").where, q),
  ]);
  return { eligible, opted_out, pending };
}

export async function audienceSample(db: Db, a: AudienceSpec, n = 6): Promise<Contact[]> {
  for await (const rows of audienceContacts(db, a)) return rows.slice(0, n);
  return [];
}

/* ───────── CRUD ───────── */

export function estimateCost(settings: WorkspaceSettings, category: string | null, messages: number): number {
  const key = (category ?? "MARKETING").toLowerCase() as "marketing" | "utility" | "authentication";
  return Math.round(messages * (settings.rates[key] ?? 0) * 100) / 100;
}

async function snapshotFor(db: Db, templateId: string | null) {
  if (!templateId) return { template_name: null, template_language: null, template_category: null, template_snapshot: null };
  const t = await db.get<Template>("templates", templateId);
  if (!t) throw new HttpError(404, "NOT_FOUND", "Template not found");
  return { template_name: t.name, template_language: t.language, template_category: t.category, template_snapshot: t.content };
}

export async function createCampaign(ctx: Ctx, input: CampaignInput): Promise<Campaign> {
  const snap = await snapshotFor(ctx.db, input.template_id);
  return ctx.db.insertOne<Campaign>("campaigns", {
    ...input,
    ...snap,
    status: "draft",
    started_at: null,
    completed_at: null,
    total: 0,
    sent: 0,
    delivered: 0,
    read: 0,
    replied: 0,
    failed: 0,
    clicked: 0,
    cost_estimate: 0,
    last_error: null,
    created_by: ctx.user.id,
  });
}

export async function updateCampaign(ctx: Ctx, id: string, input: Partial<CampaignInput>): Promise<Campaign> {
  const cur = await ctx.db.get<Campaign>("campaigns", id);
  if (!cur) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  if (!["draft", "scheduled"].includes(cur.status)) throw new HttpError(409, "LOCKED", "This campaign has already started.");
  if (cur.status === "scheduled") throw new HttpError(409, "LOCKED", "Unschedule the campaign to edit it.");
  const patch: Record<string, any> = { ...input };
  if (input.template_id !== undefined && input.template_id !== cur.template_id) Object.assign(patch, await snapshotFor(ctx.db, input.template_id));
  return (await ctx.db.updateOne<Campaign>("campaigns", id, patch))!;
}

export async function listCampaigns(db: Db, f: { status?: string; q?: string; limit?: number; offset?: number }): Promise<Page<Campaign>> {
  const where: Where = {};
  if (f.status && f.status !== "all") {
    if (f.status === "running") where.status = { in: ["sending", "paused"] };
    else where.status = f.status;
  }
  return db.selectPage<Campaign>("campaigns", {
    where,
    search: f.q?.trim() ? { cols: ["name", "template_name"], term: f.q.trim() } : undefined,
    order: [["created_at", "desc"]],
    limit: f.limit ?? 50,
    offset: f.offset ?? 0,
  });
}

export async function deleteCampaign(ctx: Ctx, id: string) {
  const c = await ctx.db.get<Campaign>("campaigns", id);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  if (c.status === "sending") throw new HttpError(409, "RUNNING", "Pause or cancel the campaign before deleting it.");
  await ctx.db.delete("campaign_messages", { campaign_id: id });
  await ctx.db.delete("campaigns", { id });
}

export async function duplicateCampaign(ctx: Ctx, id: string): Promise<Campaign> {
  const c = await ctx.db.get<Campaign>("campaigns", id);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  return createCampaign(ctx, {
    name: `${c.name} (copy)`,
    template_id: c.template_id,
    audience: c.audience,
    variable_map: c.variable_map,
    media_map: c.media_map,
    scheduled_at: null,
    throttle_per_min: c.throttle_per_min,
  });
}

export async function retargetCampaign(
  ctx: Ctx,
  sourceId: string,
  retarget: NonNullable<AudienceSpec["retarget"]>,
): Promise<Campaign> {
  const src = await ctx.db.get<Campaign>("campaigns", sourceId);
  if (!src) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  const label = { not_read: "unread", not_delivered: "undelivered", failed: "failed", read_no_reply: "no reply" }[retarget];
  return createCampaign(ctx, {
    name: `${src.name} — ${label} follow-up`,
    template_id: src.template_id,
    audience: { mode: "retarget", source_campaign_id: sourceId, retarget, include_pending: false },
    variable_map: src.variable_map,
    media_map: src.media_map,
    scheduled_at: null,
    throttle_per_min: src.throttle_per_min,
  });
}

/* ───────── pre-flight ───────── */

export interface CheckIssue {
  level: "error" | "warning" | "ok";
  message: string;
}

export interface CampaignCheck {
  ok: boolean;
  issues: CheckIssue[];
  audience: AudienceStats;
  cost: number;
  currency: string;
}

export async function checkCampaign(ctx: Ctx, c: Campaign): Promise<CampaignCheck> {
  const issues: CheckIssue[] = [];
  const ws = await getWorkspace(ctx.db);
  const audience = await audienceStats(ctx.db, c.audience);
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });
  const ok = (message: string) => issues.push({ level: "ok", message });

  if (!c.name.trim()) err("Name your campaign.");
  const tpl = c.template_id ? await ctx.db.get<Template>("templates", c.template_id) : null;
  if (!tpl) err("Choose a message template.");
  else if (tpl.status !== "APPROVED") err(`“${tpl.name}” is ${tpl.status.toLowerCase()} — only approved templates can be broadcast.`);
  else ok(`Template “${tpl.name}” is approved.`);

  if (tpl) {
    const bad = validateTemplate(tpl).filter((i) => i.level === "error");
    if (bad.length && tpl.status === "APPROVED") warn("This template has issues against Meta's current rules — sends may fail.");
    const content = c.template_snapshot ?? tpl.content;
    for (const s of templateSlots(content)) {
      if (s.kind === "media") {
        if (!c.media_map[s.key] && !s.sample) err(`Add the ${s.label.toLowerCase()}.`);
      } else if (s.kind === "code") {
        // falls back to the sample code
      } else if (!c.variable_map[s.key]) {
        err(`Fill in “${s.label}”.`);
      } else {
        const v = c.variable_map[s.key];
        if (v.source === "static" && !v.value.trim()) err(`“${s.label}” is empty.`);
      }
    }
  }

  if (audience.eligible === 0) err("No eligible contacts in this audience.");
  else ok(`${audience.eligible.toLocaleString("en-IN")} contacts will receive this.`);
  if (audience.opted_out) ok(`${audience.opted_out.toLocaleString("en-IN")} opted-out contacts are excluded automatically.`);
  if (audience.pending) warn(`${audience.pending.toLocaleString("en-IN")} contacts with unconfirmed consent are excluded. Turn on “Include unconfirmed contacts” only if you have their permission.`);
  if (c.audience.include_pending) warn("Including contacts whose consent isn't confirmed can hurt your quality rating.");
  if (c.scheduled_at && Date.parse(c.scheduled_at) < Date.now() - 60_000) err("The scheduled time is in the past.");

  const cost = estimateCost(ws.settings, tpl?.category ?? c.template_category, audience.eligible);
  return { ok: !issues.some((i) => i.level === "error"), issues, audience, cost, currency: ws.settings.rates.currency };
}

/* ───────── launch ───────── */

async function materialize(db: Db, c: Campaign): Promise<number> {
  await db.delete("campaign_messages", { campaign_id: c.id }); // idempotent re-launch
  let total = 0;
  const seen = new Set<string>();
  for await (const rows of audienceContacts(db, c.audience)) {
    const fresh = rows.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => seen.add(r.id));
    if (!fresh.length) continue;
    await db.insert(
      "campaign_messages",
      fresh.map((r) => ({
        campaign_id: c.id,
        contact_id: r.id,
        phone: r.phone,
        contact_name: r.name,
        status: "queued",
        wa_message_id: null,
        error_code: null,
        error_message: null,
        claimed_at: null,
        sent_at: null,
        delivered_at: null,
        read_at: null,
        replied_at: null,
        failed_at: null,
      })),
    );
    total += fresh.length;
  }
  return total;
}

export async function launchCampaign(ctx: Ctx, id: string, when: "now" | "schedule"): Promise<Campaign> {
  const c = await ctx.db.get<Campaign>("campaigns", id);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  if (c.status !== "draft") throw new HttpError(409, "LOCKED", "This campaign was already launched.");
  const check = await checkCampaign(ctx, c);
  const firstError = check.issues.find((i) => i.level === "error");
  if (firstError) throw new HttpError(422, "NOT_READY", firstError.message, check.issues);
  if (when === "schedule" && !c.scheduled_at) throw new HttpError(422, "NOT_READY", "Pick a date and time to schedule.");

  const total = await materialize(ctx.db, c);
  const now = nowIso();
  const patch: Partial<Campaign> = {
    total,
    cost_estimate: check.cost,
    status: when === "now" ? "sending" : "scheduled",
    started_at: when === "now" ? now : null,
    scheduled_at: when === "now" ? null : c.scheduled_at,
    last_error: null,
  };
  return (await ctx.db.updateOne<Campaign>("campaigns", id, patch))!;
}

export async function setCampaignState(ctx: Ctx, id: string, action: "pause" | "resume" | "cancel" | "unschedule"): Promise<Campaign> {
  const c = await ctx.db.get<Campaign>("campaigns", id);
  if (!c) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  const next = async (status: CampaignStatus, extra: Record<string, any> = {}) => (await ctx.db.updateOne<Campaign>("campaigns", id, { status, ...extra }))!;

  if (action === "pause") {
    if (!["sending", "scheduled"].includes(c.status)) throw new HttpError(409, "STATE", "Only running or scheduled campaigns can be paused.");
    return next("paused");
  }
  if (action === "resume") {
    if (c.status !== "paused") throw new HttpError(409, "STATE", "This campaign isn't paused.");
    const started = c.started_at ?? nowIso();
    return next("sending", { started_at: started, last_error: null });
  }
  if (action === "unschedule") {
    if (c.status !== "scheduled") throw new HttpError(409, "STATE", "This campaign isn't scheduled.");
    await ctx.db.delete("campaign_messages", { campaign_id: id });
    return next("draft", { total: 0 });
  }
  if (!["sending", "paused", "scheduled"].includes(c.status)) throw new HttpError(409, "STATE", "Nothing to cancel.");
  await ctx.db.update("campaign_messages", { campaign_id: id, status: { in: ["queued", "sending"] } }, { status: "skipped", error_code: "CANCELLED", claimed_at: null });
  const out = await next("cancelled", { completed_at: nowIso() });
  await refreshStats(ctx.db, id);
  return out;
}

/* ───────── stats ───────── */

export async function refreshStats(db: Db, campaignId: string): Promise<Campaign | null> {
  const w = (extra: Where) => ({ campaign_id: campaignId, ...extra });
  const [total, sent, delivered, read, replied, failed] = await Promise.all([
    db.count("campaign_messages", w({ status: { neq: "skipped" } })),
    db.count("campaign_messages", w({ sent_at: { isNull: false } })),
    db.count("campaign_messages", w({ delivered_at: { isNull: false } })),
    db.count("campaign_messages", w({ read_at: { isNull: false } })),
    db.count("campaign_messages", w({ replied_at: { isNull: false } })),
    db.count("campaign_messages", w({ status: "failed" })),
  ]);
  const camp = await db.get<Campaign>("campaigns", campaignId);
  if (!camp) return null;
  const ws = await getWorkspace(db);
  return db.updateOne<Campaign>("campaigns", campaignId, {
    total,
    sent,
    delivered,
    read,
    replied,
    failed,
    cost_estimate: estimateCost(ws.settings, camp.template_category, sent || total),
  });
}

/* ───────── dispatcher ───────── */

type Outcome =
  | { kind: "sent"; row: CampaignMessage; id: string; contact: Contact; values: Record<string, string> }
  | { kind: "failed"; row: CampaignMessage; code: string; message: string }
  | { kind: "skipped"; row: CampaignMessage; code: string }
  | { kind: "requeue"; row: CampaignMessage; rateLimited: boolean }
  | { kind: "fatal"; row: CampaignMessage; code: string; message: string };

function resolveValues(slots: VarSlot[], c: Campaign, contact: Contact): { values: Record<string, string>; missing: string | null } {
  const values: Record<string, string> = {};
  for (const s of slots) {
    if (s.kind === "media") {
      values[s.key] = c.media_map[s.key] || s.sample;
      continue;
    }
    const src = c.variable_map[s.key];
    const v = resolveSource(src, contact);
    if (v === null) {
      if (s.kind === "code" && s.sample) {
        values[s.key] = s.sample;
        continue;
      }
      return { values, missing: s.label };
    }
    values[s.key] = v;
  }
  return { values, missing: null };
}

const RATE_LIMIT_CODES = new Set(["130429", "80007", "4", "17"]);

export async function processCampaign(
  ws: string,
  campaignId: string,
  budgetMs = 45_000,
): Promise<{ sent: number; remaining: number; status: CampaignStatus | "missing" }> {
  const db = dbFor(ws);
  const t0 = Date.now();
  let campaign = await db.get<Campaign>("campaigns", campaignId);
  if (!campaign) return { sent: 0, remaining: 0, status: "missing" };
  if (campaign.status !== "sending") return { sent: 0, remaining: 0, status: campaign.status };

  let provider: Provider;
  try {
    provider = await getProvider(ws);
  } catch (e) {
    const w = asWaError(e);
    await db.updateOne("campaigns", campaignId, { status: "paused", last_error: w.message });
    return { sent: 0, remaining: 0, status: "paused" };
  }

  const tpl: TemplateRef = {
    name: campaign.template_name!,
    language: campaign.template_language!,
    content: campaign.template_snapshot!,
  };
  const slots = templateSlots(tpl.content);
  const rate = Math.max(0.5, campaign.throttle_per_min / 60);
  let batchSize = clamp(Math.round(rate), 1, 50);
  const mediaCache = new Map<string, string>();
  let sentTotal = 0;
  let rateHits = 0;

  while (Date.now() - t0 < budgetMs) {
    campaign = (await db.get<Campaign>("campaigns", campaignId))!;
    if (!campaign || campaign.status !== "sending") break;

    const rows = await db.claimQueued<CampaignMessage>(campaignId, batchSize);
    if (!rows.length) break;
    const batchStart = Date.now();

    const contacts = new Map<string, Contact>();
    for (const c of await db.select<Contact>("contacts", { where: { id: { in: rows.map((r) => r.contact_id) } } })) contacts.set(c.id, c);

    const outcomes: Outcome[] = await Promise.all(
      rows.map(async (row): Promise<Outcome> => {
        const contact = contacts.get(row.contact_id);
        if (!contact || contact.opt_in === "opted_out") return { kind: "skipped", row, code: "OPTED_OUT" };
        if (provider.mode === "live" && contact.source === "demo") return { kind: "skipped", row, code: "DEMO" };
        const { values, missing } = resolveValues(slots, campaign!, contact);
        if (missing) return { kind: "failed", row, code: "MISSING_VAR", message: `No value for “${missing}” and no fallback` };
        try {
          const res = await sendTemplateMessage(provider, contact.phone, tpl, values, `c:${campaignId.slice(0, 8)}`, mediaCache);
          return { kind: "sent", row, id: res.id, contact, values };
        } catch (e) {
          const w = asWaError(e);
          if (RATE_LIMIT_CODES.has(w.code)) return { kind: "requeue", row, rateLimited: true };
          if (isFatal(w.code)) return { kind: "fatal", row, code: w.code, message: w.message };
          return { kind: "failed", row, code: w.code, message: w.details ? `${w.message} — ${w.details}` : w.message };
        }
      }),
    );

    // persist the whole batch with a handful of bulk writes
    const now = nowIso();
    const updates: CampaignMessage[] = [];
    const outbound: OutboundItem[] = [];
    let fatal: { code: string; message: string } | null = null;
    let rateLimited = false;
    const suppress: string[] = [];

    for (const o of outcomes) {
      const base = { ...o.row, claimed_at: null };
      if (o.kind === "sent") {
        updates.push({ ...base, status: "sent", wa_message_id: o.id, sent_at: now });
        outbound.push({
          contact_id: o.contact.id,
          type: "template",
          body: previewText(tpl.content.body, (n) => o.values[`body.${n}`] ?? ""),
          payload: { template: { id: campaign.template_id ?? undefined, name: tpl.name, language: tpl.language, values: o.values } },
          status: "sent",
          wa_message_id: o.id,
          campaign_id: campaignId,
        });
        sentTotal++;
      } else if (o.kind === "failed") {
        updates.push({ ...base, status: "failed", error_code: o.code, error_message: o.message, failed_at: now });
        if (waErrorInfo(o.code).suppress) suppress.push(o.row.contact_id);
      } else if (o.kind === "skipped") {
        updates.push({ ...base, status: "skipped", error_code: o.code, error_message: waErrorInfo(o.code).title });
      } else if (o.kind === "requeue") {
        updates.push({ ...base, status: "queued" });
        rateLimited = rateLimited || o.rateLimited;
      } else {
        updates.push({ ...base, status: "queued" });
        fatal = { code: o.code, message: o.message };
      }
    }

    await db.upsert("campaign_messages", updates, ["id"]);
    await recordOutbound(db, outbound);
    if (suppress.length) {
      await db.update("contacts", { id: { in: suppress } }, { opt_in: "opted_out", opted_out_at: now, opt_in_source: "meta_block" });
    }

    if (fatal) {
      const f = fatal as { code: string; message: string };
      await db.updateOne("campaigns", campaignId, {
        status: "paused",
        last_error: `${waErrorInfo(f.code).title}: ${f.message}`,
      });
      break;
    }
    if (rateLimited) {
      batchSize = Math.max(1, Math.floor(batchSize / 2));
      if (++rateHits >= 3) break;
      await sleep(2000);
      continue;
    }

    const target = (rows.length / rate) * 1000;
    const spent = Date.now() - batchStart;
    if (spent < target) await sleep(Math.min(target - spent, Math.max(0, budgetMs - (Date.now() - t0))));
  }

  const remaining = await db.count("campaign_messages", { campaign_id: campaignId, status: { in: ["queued", "sending"] } });
  const latest = await db.get<Campaign>("campaigns", campaignId);
  if (latest && latest.status === "sending" && remaining === 0) {
    await db.updateOne("campaigns", campaignId, { status: "completed", completed_at: nowIso() });
  }
  await refreshStats(db, campaignId);
  const final = await db.get<Campaign>("campaigns", campaignId);
  return { sent: sentTotal, remaining, status: final?.status ?? "missing" };
}

/** One scheduler pass over every workspace: start due campaigns, advance running ones. */
export async function dispatchTick(root: Adapter, budgetMs = 45_000) {
  const now = nowIso();
  const due = await root.select<Campaign>("campaigns", { where: { status: "scheduled", scheduled_at: { lte: now } }, limit: 25 });
  for (const c of due) {
    await root.update("campaigns", { where: { id: c.id, status: "scheduled" } }, { status: "sending", started_at: now });
  }
  const active = await root.select<Campaign>("campaigns", { where: { status: "sending" }, order: [["started_at", "asc"]], limit: 25 });
  if (!active.length) return { processed: 0 };
  const share = Math.max(5_000, Math.floor(budgetMs / active.length));
  let processed = 0;
  await Promise.all(
    active.map(async (c) => {
      try {
        const r = await processCampaign(c.workspace_id, c.id, share);
        processed += r.sent;
      } catch (e) {
        console.error("[dispatch]", c.id, e);
      }
    }),
  );
  return { processed };
}

/* ───────── detail ───────── */

export async function listRecipients(
  db: Db,
  campaignId: string,
  f: { status?: string; q?: string; limit?: number; offset?: number },
): Promise<Page<CampaignMessage>> {
  const where: Where = { campaign_id: campaignId };
  switch (f.status) {
    case "queued":
      where.status = { in: ["queued", "sending"] };
      break;
    case "sent":
      where.sent_at = { isNull: false };
      break;
    case "delivered":
      where.delivered_at = { isNull: false };
      break;
    case "read":
      where.read_at = { isNull: false };
      break;
    case "replied":
      where.replied_at = { isNull: false };
      break;
    case "failed":
      where.status = "failed";
      break;
    case "skipped":
      where.status = "skipped";
      break;
  }
  return db.selectPage<CampaignMessage>("campaign_messages", {
    where,
    search: f.q?.trim() ? { cols: ["phone", "contact_name"], term: f.q.trim() } : undefined,
    order: [["created_at", "asc"], ["id", "asc"]],
    limit: Math.min(f.limit ?? 50, 200),
    offset: f.offset ?? 0,
  });
}

export interface CampaignDetail {
  campaign: Campaign;
  errors: { code: string; count: number; title: string; hint: string }[];
  timeline: { t: string; sent: number; delivered: number; read: number; replied: number }[];
  queued: number;
  skipped: number;
}

export async function campaignDetail(db: Db, id: string): Promise<CampaignDetail> {
  const camp = await db.get<Campaign>("campaigns", id);
  if (!camp) throw new HttpError(404, "NOT_FOUND", "Campaign not found");
  const live = camp.status === "sending" ? await refreshStats(db, id) : camp;
  const campaign = live ?? camp;

  const [queued, skipped, failedRows, stamped] = await Promise.all([
    db.count("campaign_messages", { campaign_id: id, status: { in: ["queued", "sending"] } }),
    db.count("campaign_messages", { campaign_id: id, status: "skipped" }),
    db.select<CampaignMessage>("campaign_messages", { where: { campaign_id: id, status: { in: ["failed", "skipped"] } }, limit: 5000 }),
    db.select<CampaignMessage>("campaign_messages", { where: { campaign_id: id, sent_at: { isNull: false } }, limit: 20000 }),
  ]);

  const byCode = new Map<string, number>();
  for (const r of failedRows) {
    const k = r.error_code ?? "unknown";
    byCode.set(k, (byCode.get(k) ?? 0) + 1);
  }
  const errors = [...byCode.entries()]
    .map(([code, count]) => ({ code, count, ...waErrorInfo(code) }))
    .sort((a, b) => b.count - a.count)
    .map(({ code, count, title, hint }) => ({ code, count, title, hint }));

  // bucket by 5-minute slices for short sends, hours for long ones
  const first = stamped.reduce((m, r) => Math.min(m, Date.parse(r.sent_at!)), Infinity);
  const last = stamped.reduce((m, r) => Math.max(m, Date.parse(r.read_at ?? r.delivered_at ?? r.sent_at!)), 0);
  const span = Math.max(1, last - first);
  const bucketMs = span < 3 * 3600_000 ? 300_000 : 3600_000;
  const buckets = new Map<number, { sent: number; delivered: number; read: number; replied: number }>();
  const bump = (ts: string | null, key: "sent" | "delivered" | "read" | "replied") => {
    if (!ts) return;
    const b = Math.floor(Date.parse(ts) / bucketMs) * bucketMs;
    const cur = buckets.get(b) ?? { sent: 0, delivered: 0, read: 0, replied: 0 };
    cur[key]++;
    buckets.set(b, cur);
  };
  for (const r of stamped) {
    bump(r.sent_at, "sent");
    bump(r.delivered_at, "delivered");
    bump(r.read_at, "read");
    bump(r.replied_at, "replied");
  }
  const timeline = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t: new Date(t).toISOString(), ...v }));

  return { campaign, errors, timeline, queued, skipped };
}

/* ───────── single test send ───────── */

export async function sendTestMessage(
  ctx: Ctx,
  input: { template_id: string; phone: string; variable_map: Record<string, VarSource>; media_map: Record<string, string> },
) {
  const tpl = await ctx.db.get<Template>("templates", input.template_id);
  if (!tpl) throw new HttpError(404, "NOT_FOUND", "Template not found");
  if (tpl.status !== "APPROVED") throw new HttpError(422, "NOT_APPROVED", "Only approved templates can be sent.");
  const ws = await getWorkspace(ctx.db);
  const p = normalizePhone(input.phone, ws.settings.default_country);
  if (!p.ok) throw new HttpError(422, "BAD_PHONE", `Phone: ${p.reason}`);

  let contact = await ctx.db.one<Contact>("contacts", { phone: p.e164 });
  if (!contact) {
    contact = await ctx.db.insertOne<Contact>(
      "contacts",
      contactRow({ phone: p.e164, country: p.country, name: "Test recipient", tags: ["test"], source: "manual", opt_in: "pending" }),
    );
    await ensureTags(ctx.db, ["test"]);
  }

  const slots = templateSlots(tpl.content);
  const camp = { variable_map: input.variable_map, media_map: input.media_map } as Campaign;
  const { values, missing } = resolveValues(slots, camp, contact);
  if (missing) throw new HttpError(422, "MISSING_VAR", `Fill in “${missing}” first.`);

  const provider = await getProvider(ctx.ws);
  try {
    const res = await sendTemplateMessage(provider, p.e164, tpl, values, `t:${tpl.id.slice(0, 8)}`);
    await recordOutbound(ctx.db, [
      {
        contact_id: contact.id,
        type: "template",
        body: previewText(tpl.content.body, (n) => values[`body.${n}`] ?? ""),
        payload: { template: { id: tpl.id, name: tpl.name, language: tpl.language, values } },
        status: "sent",
        wa_message_id: res.id,
        sent_by: ctx.user.id,
      },
    ]);
    return { id: res.id, contact_id: contact.id, mode: provider.mode };
  } catch (e) {
    const w = asWaError(e);
    throw new HttpError(422, "SEND_FAILED", `${waErrorInfo(w.code).title}. ${w.details ?? w.message}`, { code: w.code });
  }
}

