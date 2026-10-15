"use client";
import * as React from "react";
import Link from "next/link";
import { ChartLineUp, DownloadSimple, Info, Lightbulb, WarningCircle } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, PageHeader, Skeleton } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { AreaChart } from "@/components/charts/area-chart";
import { Delta, Funnel, HBarList, Heatmap } from "@/components/charts/charts";
import { toast } from "sonner";
import { useAnalytics, useApi, useConfig } from "@/lib/client/hooks";
import type { AnalyticsData } from "@/lib/shared/analytics";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import { cn, fmtMoney, fmtNum } from "@/lib/shared/utils";
import { KpiTile } from "./kpi-tile";
import { bestTime, downloadCsv, longDay, pctOf, rollingRate, shortDay, sumSeries } from "./analytics-utils";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

/* ───────── small neutral change chip (spend going up is not good or bad) ───────── */

function NeutralDelta({ value, previous }: { value: number; previous: number }) {
  const change = previous ? Math.round(((value - previous) / previous) * 1000) / 10 : 0;
  const up = change > 0;
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-ink/[0.07] px-2 text-xs font-medium tabular text-ink-2" title="vs previous period">
      {Math.abs(change) < 0.05 ? "0%" : `${up ? "+" : ""}${change}%`}
    </span>
  );
}

/* ───────── loading ───────── */

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} padded={false} className={cn(i < 3 ? "lg:col-span-2" : "lg:col-span-3", "xl:col-span-1", i === 4 && "col-span-2 lg:col-span-3")} coreClassName="space-y-3 p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-full" />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton className="mb-5 h-5 w-40" />
        <Skeleton className="h-[300px] w-full" />
      </Card>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card>
          <Skeleton className="h-60 w-full" />
        </Card>
        <Card>
          <Skeleton className="h-60 w-full" />
        </Card>
      </div>
    </div>
  );
}

/* ───────── page ───────── */

export function AnalyticsPage() {
  const [range, setRange] = React.useState<Range>(30);
  const { data, isLoading, isValidating, error } = useAnalytics(range);
  // Double-length window gives us the previous period for the change chips (capped by the API at 90 days).
  const { data: wide } = useApi<AnalyticsData>(range * 2 <= 90 ? `/api/analytics?range=${range * 2}` : null);
  const { data: cfg } = useConfig();

  const stale = !!data && data.range !== range;
  const analytics = data;
  const currency = analytics?.totals.currency ?? "INR";

  const prev = React.useMemo(() => {
    if (!wide || wide.range !== range * 2 || wide.series.length < range * 2) return null;
    const p = sumSeries(wide.series.slice(0, range));
    const cost = wide.cost_series.slice(0, range).reduce((s, d) => s + d.cost, 0);
    return p.sent > 0 ? { ...p, cost } : null;
  }, [wide, range]);

  const derived = React.useMemo(() => {
    if (!analytics) return null;
    const t = analytics.totals;
    const s = analytics.series;
    return {
      delivery: pctOf(t.delivered, t.sent),
      read: pctOf(t.read, t.delivered),
      reply: pctOf(t.replied, t.delivered),
      sparkSent: s.map((p) => p.sent),
      sparkDelivery: rollingRate(s, (p) => p.delivered, (p) => p.sent),
      sparkRead: rollingRate(s, (p) => p.read, (p) => p.delivered),
      sparkReply: rollingRate(s, (p) => p.replied, (p) => p.delivered),
      sparkCost: analytics.cost_series.map((c) => c.cost),
      best: bestTime(analytics.heatmap),
    };
  }, [analytics]);

  const exportCsv = () => {
    if (!analytics) return;
    const costBy = new Map(analytics.cost_series.map((c) => [c.date, c.cost]));
    const growthBy = new Map(analytics.growth.map((g) => [g.date, g.contacts]));
    const rows: (string | number)[][] = [["Date", "Sent", "Delivered", "Read", "Replied", "Failed", `Estimated spend (${currency})`, "Total contacts"]];
    for (const p of analytics.series) rows.push([p.date, p.sent, p.delivered, p.read, p.replied, p.failed, costBy.get(p.date) ?? 0, growthBy.get(p.date) ?? ""]);
    downloadCsv(`wadesk-analytics-${range}d-${new Date().toLocaleDateString("en-CA")}.csv`, rows);
    toast.success("Daily numbers exported");
  };

  const headerActions = (
    <>
      <Segmented
        aria-label="Date range"
        value={String(range) as `${Range}`}
        onValueChange={(v) => setRange(Number(v) as Range)}
        options={RANGES.map((r) => ({ value: String(r) as `${Range}`, label: `${r} days` }))}
      />
      <Button variant="secondary" leading={<DownloadSimple size={16} />} onClick={exportCsv} disabled={!analytics}>
        Export CSV
      </Button>
    </>
  );

  const header = <PageHeader title="Analytics" description="How your WhatsApp messages are delivered, read and answered." actions={headerActions} />;

  if (error && !analytics) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState icon={<WarningCircle />} title="Couldn't load analytics" description="Check your connection and try again." action={<Button variant="secondary" onClick={() => location.reload()}>Reload</Button>} />
        </Card>
      </div>
    );
  }

  if (isLoading || !analytics || !derived) {
    return (
      <div>
        {header}
        <AnalyticsSkeleton />
      </div>
    );
  }

  const { totals, series } = analytics;
  const tz = cfg?.workspace.settings.business_hours.timezone;

  if (totals.sent === 0) {
    return (
      <div>
        {header}
        <Card>
          <EmptyState
            icon={<ChartLineUp />}
            title={`No messages sent in the last ${range} days`}
            description="Once you send a campaign, delivery, reads and replies show up here. Try a longer range if you sent something earlier."
            action={
              <Link href="/campaigns" className={buttonVariants({ variant: "secondary" })}>
                Go to campaigns
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  const spanLabel = `Last ${range} days`;
  const failedTotal = analytics.failures.reduce((s, f) => s + f.count, 0);

  const templateItems = analytics.by_template
    .filter((t) => t.sent > 0)
    .map((t) => ({ name: t.name, sent: t.sent, rate: pctOf(t.read, t.delivered), delivered: t.delivered }))
    .sort((a, b) => b.rate - a.rate || b.sent - a.sent)
    .map((t) => ({
      label: t.name === "—" ? <span className="text-ink-3">Deleted template</span> : <span className="font-mono text-[12.5px]">{t.name}</span>,
      value: t.rate,
      sub: `· ${fmtNum(t.sent)} sent`,
      hint: `${fmtNum(t.delivered)} delivered, ${fmtNum(Math.round((t.rate / 100) * t.delivered))} read`,
    }));

  const qualifying = analytics.by_campaign.filter((c) => c.delivered >= 10);
  const campaignRows = (qualifying.length ? qualifying : analytics.by_campaign)
    .map((c) => ({ ...c, readRate: pctOf(c.read, c.delivered), replyRate: pctOf(c.replied, c.delivered) }))
    .sort((a, b) => b.readRate - a.readRate || b.sent - a.sent)
    .slice(0, 6);

  const growthStart = analytics.growth[0]?.contacts ?? 0;
  const growthEnd = analytics.growth[analytics.growth.length - 1]?.contacts ?? 0;
  const growthDelta = growthEnd - growthStart;

  return (
    <div>
      {header}

      <div className={cn("space-y-5 transition-opacity duration-300", (stale || (isValidating && stale)) && "opacity-60")} aria-busy={stale}>
        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-6 xl:grid-cols-5">
          <KpiTile
            className="lg:col-span-2 xl:col-span-1"
            label="Messages sent"
            value={fmtNum(totals.sent)}
            delta={prev && <Delta value={totals.sent} previous={prev.sent} />}
            hint={totals.failed ? `${fmtNum(totals.failed)} failed` : spanLabel}
            spark={derived.sparkSent}
            color="var(--viz-1)"
          />
          <KpiTile
            className="lg:col-span-2 xl:col-span-1"
            label="Delivery rate"
            value={`${derived.delivery}%`}
            delta={prev && <Delta value={derived.delivery} previous={pctOf(prev.delivered, prev.sent)} points />}
            hint={`${fmtNum(totals.delivered)} delivered`}
            spark={derived.sparkDelivery}
            color="var(--viz-1)"
          />
          <KpiTile
            className="lg:col-span-2 xl:col-span-1"
            label="Read rate"
            value={`${derived.read}%`}
            delta={prev && <Delta value={derived.read} previous={pctOf(prev.read, prev.delivered)} points />}
            hint={`${fmtNum(totals.read)} read`}
            spark={derived.sparkRead}
            color="var(--viz-2)"
          />
          <KpiTile
            className="lg:col-span-3 xl:col-span-1"
            label="Reply rate"
            value={`${derived.reply}%`}
            delta={prev && <Delta value={derived.reply} previous={pctOf(prev.replied, prev.delivered)} points />}
            hint={`${fmtNum(totals.replied)} replies`}
            spark={derived.sparkReply}
            color="var(--viz-3)"
          />
          <KpiTile
            className="col-span-2 lg:col-span-3 xl:col-span-1"
            label="Estimated spend"
            value={fmtMoney(totals.cost, currency)}
            delta={prev && <NeutralDelta value={totals.cost} previous={prev.cost} />}
            hint="Estimate from your rates"
            spark={derived.sparkCost}
            color="var(--ink-2)"
          />
        </div>

        {/* activity */}
        <Card>
          <CardHeader title="Message activity" description="Messages sent each day, and how many were read or answered." />
          <AreaChart
            data={series}
            height={300}
            formatX={(d) => shortDay(String(d))}
            series={[
              { key: "sent", label: "Sent", color: "var(--viz-1)" },
              { key: "read", label: "Read", color: "var(--viz-2)" },
              { key: "replied", label: "Replied", color: "var(--viz-3)" },
            ]}
          />
        </Card>

        {/* funnel + failures */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-5" coreClassName="h-full">
            <CardHeader title="Delivery funnel" description="Where messages drop off between sending and replying." />
            <Funnel
              stages={[
                { label: "Sent", value: totals.sent },
                { label: "Delivered", value: totals.delivered },
                { label: "Read", value: totals.read },
                { label: "Replied", value: totals.replied },
              ]}
            />
            <p className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-ink-3">
              <Info size={14} className="mt-px shrink-0" />
              People who turn off read receipts are never counted as read, so the real number is a little higher.
            </p>
          </Card>

          <Card className="xl:col-span-7" coreClassName="h-full">
            <CardHeader title="Why messages failed" description={failedTotal ? `${fmtNum(failedTotal)} failed in the last ${range} days.` : undefined} />
            {analytics.failures.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-3">No failed messages in this period. Nothing to fix.</p>
            ) : (
              <HBarList
                color="var(--st-critical)"
                empty="No failed messages"
                items={analytics.failures.slice(0, 6).map((f) => {
                  const info = waErrorInfo(f.code);
                  return {
                    label: (
                      <span className="block min-w-0">
                        <span className="flex items-center gap-1.5 text-ink">
                          <WarningCircle size={15} weight="fill" className="shrink-0" style={{ color: "var(--st-critical)" }} />
                          <span className="truncate">{f.title || info.title}</span>
                          <span className="font-mono text-[11px] text-ink-4">{f.code}</span>
                        </span>
                        <span className="mt-0.5 block whitespace-normal pl-[21px] text-xs leading-snug text-ink-3">{info.hint}</span>
                      </span>
                    ),
                    value: f.count,
                    sub: `· ${pctOf(f.count, failedTotal)}%`,
                    hint: info.hint,
                  };
                })}
              />
            )}
          </Card>
        </div>

        {/* best time */}
        <Card>
          <CardHeader title="Best time to send" description={`When contacts open your messages${tz ? `, in ${tz.replace(/_/g, " ")} time` : ""}.`} />
          {derived.best ? (
            <div className="mb-6 flex items-start gap-3.5 rounded-2xl bg-accent-soft px-4 py-3.5 text-accent-ink" aria-live="polite">
              <Lightbulb size={20} className="mt-0.5 shrink-0" weight="fill" />
              <div className="text-sm leading-relaxed">
                <p className="font-medium">
                  Contacts open messages most on {derived.best.day} {derived.best.window}
                </p>
                <p className="mt-0.5 text-[13px] opacity-85">
                  {fmtNum(derived.best.reads)} of {fmtNum(derived.best.total)} reads ({derived.best.share}%) happened in that window on {derived.best.dayLong}s.
                  {derived.best.next && <> {derived.best.next.day} {derived.best.next.window} is the next best slot.</>} Schedule campaigns to land just before it.
                </p>
              </div>
            </div>
          ) : (
            <p className="mb-6 flex items-start gap-3 rounded-2xl bg-surface-2 px-4 py-3.5 text-sm leading-relaxed text-ink-3 hairline" aria-live="polite">
              <Lightbulb size={20} className="mt-0.5 shrink-0" />
              Not enough read data yet to suggest a time. Keep sending and this fills in as people open your messages.
            </p>
          )}
          <Heatmap grid={analytics.heatmap} unit="reads" />
        </Card>

        {/* templates + campaigns */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card coreClassName="h-full">
            <CardHeader title="By template" description="Share of delivered messages that were read." />
            <HBarList items={templateItems} format={(v) => `${v}%`} max={100} empty="No template data yet" />
          </Card>

          <Card coreClassName="h-full">
            <CardHeader title="Top campaigns" description="Ranked by read rate." />
            {campaignRows.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">No campaigns in this period.</p>
            ) : (
              <div>
                <div className="grid grid-cols-[minmax(0,1fr)_64px_64px] gap-3 pb-2 text-xs text-ink-3 sm:grid-cols-[minmax(0,1fr)_72px_72px]">
                  <span>Campaign</span>
                  <span className="text-right">Read</span>
                  <span className="text-right">Replied</span>
                </div>
                <ul className="divide-y divide-line">
                  {campaignRows.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="-mx-2 grid grid-cols-[minmax(0,1fr)_64px_64px] items-center gap-3 rounded-xl px-2 py-3 outline-none transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-accent/60 sm:grid-cols-[minmax(0,1fr)_72px_72px]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          <span className="tabular block text-xs text-ink-3">{fmtNum(c.sent)} sent</span>
                        </span>
                        <span className="tabular text-right text-sm font-medium">{c.readRate}%</span>
                        <span className="tabular text-right text-sm font-medium">{c.replyRate}%</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* spend + growth */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Spend"
              description={`Estimated daily cost in ${currency}. Total ${fmtMoney(totals.cost, currency)}, about ${fmtMoney(totals.sent ? totals.cost / totals.sent : 0, currency)} per message.`}
            />
            <AreaChart data={analytics.cost_series} height={240} formatX={(d) => shortDay(String(d))} series={[{ key: "cost", label: `Estimated spend (${currency})`, color: "var(--viz-1)" }]} />
          </Card>
          <Card>
            <CardHeader
              title="Audience growth"
              description={growthDelta > 0 ? `${fmtNum(growthDelta)} new contacts, ${fmtNum(growthEnd)} in total.` : `${fmtNum(growthEnd)} contacts in total. Nobody new in this period.`}
            />
            <AreaChart data={analytics.growth} height={240} formatX={(d) => shortDay(String(d))} series={[{ key: "contacts", label: "Contacts", color: "var(--viz-1)" }]} />
          </Card>
        </div>

        <p className="px-1 pt-1 text-xs leading-relaxed text-ink-3">
          Rates use delivered messages as the base. Spend is an estimate from the per-message rates in Settings; Meta&apos;s invoice is the source of truth. {series.length ? `Data from ${longDay(series[0].date)} to ${longDay(series[series.length - 1].date)}.` : ""}
        </p>
      </div>
    </div>
  );
}
