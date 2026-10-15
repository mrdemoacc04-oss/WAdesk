"use client";
import * as React from "react";
import { format } from "date-fns";
import { MotionConfig } from "motion/react";
import {
  ArrowLeft,
  CalendarBlank,
  ChartLineUp,
  CheckCircle,
  Clock,
  PaperPlaneTilt,
  PencilSimple,
  Prohibit,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { AreaChart } from "@/components/charts/area-chart";
import { Funnel, HBarList } from "@/components/charts/charts";
import { CampaignStatusBadge, CategoryBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, EmptyState, KV, PageHeader, Skeleton } from "@/components/ui/display";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { post, refresh, toastError } from "@/lib/client/api";
import { useCampaignDetail, useConfig, useSegments, type CampaignDetailData } from "@/lib/client/hooks";
import { templateSlots } from "@/lib/shared/template";
import { cn, fmtMoney, fmtNum, fmtPct, shortDate, ago, pluralize } from "@/lib/shared/utils";
import type { Campaign } from "@/lib/shared/types";
import { ButtonLink } from "../button-link";
import { SAMPLE_CONTACT, audienceRefinements, audienceSummary, duration, issueInfo, previewValues, speedText } from "../lib";
import { CampaignActions } from "./actions";
import { Recipients } from "./recipients";

export function CampaignDetail({ id }: { id: string }) {
  const [live, setLive] = React.useState(false);
  const { data, error, isLoading } = useCampaignDetail(id, live);
  const status = data?.campaign.status;

  // poll fast while it can change underneath us
  React.useEffect(() => setLive(status === "sending" || status === "scheduled"), [status]);

  // keep serverless deployments moving: nudge the sender while this page is open
  React.useEffect(() => {
    if (status !== "sending") return;
    let inflight = false;
    const nudge = () => {
      if (inflight) return;
      inflight = true;
      post(`/api/campaigns/${id}/process`)
        .catch(() => {})
        .finally(() => {
          inflight = false;
        });
    };
    const t = setInterval(nudge, 8000);
    return () => clearInterval(t);
  }, [status, id]);

  if (!data) {
    if (error && !isLoading)
      return (
        <div className="bezel">
          <div className="bezel-core">
            <EmptyState
              icon={<Prohibit />}
              title="Campaign not found"
              description="It may have been deleted, or the link is wrong."
              action={
                <ButtonLink href="/campaigns" variant="secondary" leading={<ArrowLeft size={14} />}>
                  Back to campaigns
                </ButtonLink>
              }
            />
          </div>
        </div>
      );
    return <DetailSkeleton />;
  }

  return <Loaded data={data} live={live} />;
}

/* ───────── loaded ───────── */

function Loaded({ data, live }: { data: CampaignDetailData; live: boolean }) {
  const { campaign: c, timeline, queued, skipped } = data;
  const { data: segments } = useSegments();
  const { data: cfg } = useConfig();
  const currency = cfg?.workspace.settings.rates.currency ?? "INR";
  const isDraft = c.status === "draft";
  const scheduled = c.status === "scheduled";
  const inFlight = c.status === "sending" || c.status === "paused" || scheduled;

  return (
    <MotionConfig reducedMotion="user">
      <PageHeader
        back={
          <ButtonLink href="/campaigns" variant="ghost" size="sm" leading={<ArrowLeft size={14} />} className="-ml-3">
            Campaigns
          </ButtonLink>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="min-w-0 break-words">{c.name}</span>
            <span className="text-base tracking-normal">
              <CampaignStatusBadge status={c.status} />
            </span>
          </span>
        }
        description={
          <span>
            {c.template_name ? (
              <>
                <span className="font-mono text-[13px] text-ink-2">{c.template_name}</span>
                {" · "}
              </>
            ) : null}
            {audienceSummary(c.audience, segments)}
            {c.status === "completed" && c.completed_at ? ` · finished ${ago(c.completed_at)}` : c.started_at ? ` · started ${ago(c.started_at)}` : ""}
          </span>
        }
        actions={<CampaignActions c={c} />}
      />

      {c.status === "failed" && (
        <Banner tone="danger" icon={<WarningCircle size={18} weight="fill" />} title="This campaign failed">
          {c.last_error ?? "Sending stopped because of an error. Check the details below."}
        </Banner>
      )}
      {c.status === "cancelled" && (
        <Banner tone="neutral" icon={<Prohibit size={18} />} title="This campaign was cancelled">
          {skipped ? `${pluralize(skipped, "message")} that hadn’t gone out yet ${skipped === 1 ? "was" : "were"} skipped.` : "Nothing was waiting in the queue."}
        </Banner>
      )}

      {inFlight && <Hero c={c} queued={queued} currency={currency} />}

      {isDraft ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card coreClassName="p-2">
            <EmptyState
              icon={<PencilSimple />}
              title="This draft hasn’t been sent"
              description="Pick up where you left off: audience, message, schedule, then send."
              action={
                <ButtonLink href={`/campaigns/new?draft=${c.id}&step=details`} leading={<PencilSimple size={16} />}>
                  Continue editing
                </ButtonLink>
              }
            />
          </Card>
          <SideColumn c={c} data={data} segments={segments} currency={currency} />
        </div>
      ) : (
        <>
          {!scheduled && <Kpis c={c} />}
          <div className={cn("grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]", !scheduled && "mt-6")}>
            <div className="min-w-0 space-y-6">
              {!scheduled && (
                <>
                  <Card>
                    <CardHeader title="Delivery funnel" description="How far messages got, as a share of everything sent." />
                    {c.sent > 0 ? (
                      <Funnel
                        stages={[
                          { label: "Sent", value: c.sent },
                          { label: "Delivered", value: c.delivered },
                          { label: "Read", value: c.read },
                          { label: "Replied", value: c.replied },
                        ]}
                      />
                    ) : (
                      <EmptyState className="py-8" icon={<PaperPlaneTilt />} title="Nothing sent yet" description={inFlight ? "The funnel fills in as messages go out." : "No messages left the queue for this campaign."} />
                    )}
                  </Card>

                  <Card>
                    <CardHeader title="Activity" description="Messages sent, delivered and read over time." />
                    <Activity timeline={timeline} />
                  </Card>
                </>
              )}

              <Card>
                <CardHeader title="Recipients" description={scheduled ? "Everyone lined up to receive this campaign." : "Every contact in this campaign and where their message stands."} />
                <Recipients campaign={c} queued={queued} skipped={skipped} live={c.status === "sending"} />
              </Card>
            </div>
            <SideColumn c={c} data={data} segments={segments} currency={currency} />
          </div>
        </>
      )}
      {live && <p className="sr-only">Live updates are on.</p>}
    </MotionConfig>
  );
}

/* ───────── banner ───────── */

function Banner({ tone, icon, title, children, action }: { tone: "danger" | "warn" | "neutral"; icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      role="status"
      className={cn(
        "mb-6 flex flex-wrap items-start gap-3 rounded-2xl px-4 py-3.5 text-sm",
        tone === "danger" ? "bg-danger-soft text-danger" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-ink/[0.05] text-ink-2",
      )}
    >
      <span className="mt-px shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">{children}</p>
      </div>
      {action}
    </div>
  );
}

/* ───────── hero ───────── */

function Hero({ c, queued, currency }: { c: Campaign; queued: number; currency: string }) {
  const pct = c.total ? Math.min(100, (c.sent / c.total) * 100) : 0;
  const sending = c.status === "sending";
  const paused = c.status === "paused";
  const scheduled = c.status === "scheduled";
  const [busy, setBusy] = React.useState(false);

  const resume = async () => {
    setBusy(true);
    try {
      await post(`/api/campaigns/${c.id}/state`, { action: "resume" });
      await refresh("/api/campaigns");
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {paused && c.last_error && (
        <Banner
          tone="warn"
          icon={<Warning size={18} weight="fill" />}
          title="Paused because of an error"
          action={
            <Button size="sm" variant="secondary" loading={busy} onClick={resume}>
              Try again
            </Button>
          }
        >
          {c.last_error}
        </Banner>
      )}
      <Card className="mb-6" coreClassName="p-5 sm:p-7">
        {scheduled ? (
          <div className="flex flex-wrap items-center justify-between gap-x-10 gap-y-5">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-info-soft text-info">
                <CalendarBlank size={22} />
              </span>
              <div>
                <p className="text-[13px] text-ink-3">Scheduled to go out</p>
                <p className="mt-1 text-xl font-medium tracking-[-0.02em]">{c.scheduled_at ? shortDate(c.scheduled_at) : "—"}</p>
                {c.scheduled_at && <p className="mt-0.5 text-sm text-ink-3">{ago(c.scheduled_at)}</p>}
              </div>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <Stat label="Recipients" value={fmtNum(c.total)} />
              <Stat label="Takes" value={duration(c.total, c.throttle_per_min).replace("about ", "~")} />
              <Stat label="Estimated cost" value={c.cost_estimate > 0 ? fmtMoney(c.cost_estimate, currency) : "—"} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
              <div>
                <p className="flex items-center gap-2 text-[13px] text-ink-3">
                  {sending ? <span className="size-2 animate-pulse-ring rounded-full bg-accent-bright" /> : <Clock size={14} />}
                  {sending ? "Sending now" : "Paused"}
                </p>
                <p className="tabular mt-2 text-[34px] font-medium leading-none tracking-[-0.04em]">
                  {fmtNum(c.sent)}
                  <span className="ml-2 text-lg font-normal tracking-normal text-ink-3">of {fmtNum(c.total)} sent</span>
                </p>
              </div>
              <div className="text-right text-[13px] text-ink-3">
                <p className="tabular text-2xl font-medium tracking-[-0.03em] text-ink">{Math.round(pct)}%</p>
                <p className="mt-1">{sending ? (queued > 0 ? `${duration(queued, c.throttle_per_min)} left` : "Finishing up") : `${fmtNum(queued)} waiting`}</p>
              </div>
            </div>
            <div
              className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.08]"
              role="progressbar"
              aria-valuenow={Math.round(pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Sending progress"
            >
              <div
                className={cn("relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-fluid", paused ? "bg-warn" : "bg-accent")}
                style={{ width: `${Math.max(pct, c.sent ? 1.5 : 0)}%` }}
              >
                {sending && (
                  <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_30%,rgba(255,255,255,0.38)_50%,transparent_70%)] bg-[length:200%_100%]" />
                )}
              </div>
            </div>
            <p className="mt-3 text-xs text-ink-3">
              {speedText(c.throttle_per_min)}
              {c.failed > 0 && ` · ${fmtNum(c.failed)} failed so far`}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="tabular mt-1 text-xl font-medium tracking-[-0.02em]">{value}</p>
    </div>
  );
}

/* ───────── kpis ───────── */

function Kpis({ c }: { c: Campaign }) {
  const items: { label: string; value: number; sub: string; icon?: React.ReactNode }[] = [
    { label: "Sent", value: c.sent, sub: c.total ? `of ${fmtNum(c.total)} recipients` : "no messages yet" },
    { label: "Delivered", value: c.delivered, sub: `${fmtPct(c.delivered, c.sent)} of sent` },
    { label: "Read", value: c.read, sub: `${fmtPct(c.read, c.sent)} of sent` },
    { label: "Replied", value: c.replied, sub: `${fmtPct(c.replied, c.sent)} of sent` },
    { label: "Failed", value: c.failed, sub: `${fmtPct(c.failed, c.total)} of recipients`, icon: c.failed > 0 ? <WarningCircle size={14} weight="fill" className="text-danger" /> : undefined },
  ];
  return (
    <Card padded={false}>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[20px] bg-line sm:grid-cols-5">
        {items.map((it, i) => (
          <div key={it.label} className={cn("bg-surface p-5 sm:px-6 sm:py-6", i === items.length - 1 && "max-sm:col-span-2")}>
            <dt className="flex items-center gap-1.5 text-[13px] text-ink-3">
              {it.label}
              {it.icon}
            </dt>
            <dd className="tabular mt-2.5 text-[32px] font-medium leading-none tracking-[-0.04em]">{fmtNum(it.value)}</dd>
            <p className="tabular mt-2 text-xs text-ink-3">{it.sub}</p>
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ───────── activity ───────── */

function Activity({ timeline }: { timeline: CampaignDetailData["timeline"] }) {
  const { data, longSpan } = React.useMemo(() => {
    if (!timeline.length) return { data: [], longSpan: false };
    const first = Date.parse(timeline[0].t);
    const last = Date.parse(timeline[timeline.length - 1].t);
    const rows = timeline.length === 1 ? [{ t: new Date(first - 300_000).toISOString(), sent: 0, delivered: 0, read: 0, replied: 0 }, ...timeline] : timeline;
    return { data: rows, longSpan: last - first > 20 * 3600_000 };
  }, [timeline]);

  if (!timeline.length)
    return <EmptyState className="py-8" icon={<ChartLineUp />} title="No activity yet" description="The chart starts drawing as soon as messages are sent." />;

  return (
    <AreaChart
      data={data}
      xKey="t"
      height={240}
      series={[
        { key: "sent", label: "Sent", color: "var(--viz-1)" },
        { key: "delivered", label: "Delivered", color: "var(--viz-2)" },
        { key: "read", label: "Read", color: "var(--viz-3)" },
      ]}
      formatX={(t) => format(new Date(t), longSpan ? "d MMM, h a" : "h:mm a")}
    />
  );
}

/* ───────── side column ───────── */

function SideColumn({ c, data, segments, currency }: { c: Campaign; data: CampaignDetailData; segments: ReturnType<typeof useSegments>["data"]; currency: string }) {
  const refinements = audienceRefinements(c.audience);
  const problems = data.errors.filter((e) => e.code !== "CANCELLED");
  const cancelledSkips = data.errors.find((e) => e.code === "CANCELLED")?.count ?? 0;
  const slots = React.useMemo(() => (c.template_snapshot ? templateSlots(c.template_snapshot) : []), [c.template_snapshot]);
  const values = React.useMemo(() => previewValues(slots, c, SAMPLE_CONTACT), [slots, c]);

  return (
    <div className="min-w-0 space-y-6">
      {problems.length > 0 && (
        <Card>
          <CardHeader title="What went wrong" description="Grouped by cause, most common first." />
          <HBarList
            color="var(--st-critical)"
            items={problems.map((e) => {
              const info = issueInfo(e.code);
              return {
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <WarningCircle size={14} weight="fill" className="shrink-0 text-danger" />
                    <span className="truncate">{info.title}</span>
                  </span>
                ),
                value: e.count,
                hint: e.hint || info.hint,
              };
            })}
          />
          <ul className="mt-5 space-y-2.5 border-t border-line pt-4">
            {problems.map((e) => (
              <li key={e.code} className="text-xs leading-relaxed text-ink-3">
                <span className="font-medium text-ink-2">{issueInfo(e.code).title}.</span> {e.hint || issueInfo(e.code).hint}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <CardHeader title="Message" description="Shown with a sample contact’s details." />
        {c.template_snapshot ? (
          <div className="wa-wallpaper flex justify-center overflow-hidden rounded-2xl px-3 py-5 hairline">
            <TemplateBubble content={c.template_snapshot} values={values} highlight />
          </div>
        ) : (
          <EmptyState className="py-6" title="No template chosen" description="Pick a template in the editor to see the message here." />
        )}
        {c.template_name && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-ink-2">{c.template_name}</span>
            {c.template_category && <CategoryBadge category={c.template_category} />}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Audience" />
        <dl className="divide-y divide-line">
          <KV label="Who">{audienceSummary(c.audience, segments)}</KV>
          {c.status !== "draft" && <KV label="Recipients">{fmtNum(c.total)}</KV>}
          {c.status !== "draft" && data.queued > 0 && <KV label="Still waiting">{fmtNum(data.queued)}</KV>}
          {data.skipped > 0 && <KV label="Skipped">{fmtNum(data.skipped)}</KV>}
          {refinements.map((r) => (
            <KV key={r} label="Filter">
              <span className="font-normal text-ink-2">{r}</span>
            </KV>
          ))}
        </dl>
        {cancelledSkips > 0 && <p className="mt-3 text-xs text-ink-3">{pluralize(cancelledSkips, "message")} skipped because the campaign was cancelled.</p>}
      </Card>

      <Card>
        <CardHeader title="Schedule and cost" />
        <dl className="divide-y divide-line">
          {c.scheduled_at && c.status === "scheduled" && <KV label="Scheduled for">{shortDate(c.scheduled_at)}</KV>}
          {c.started_at && <KV label="Started">{shortDate(c.started_at)}</KV>}
          {c.completed_at && <KV label={c.status === "cancelled" ? "Cancelled" : "Finished"}>{shortDate(c.completed_at)}</KV>}
          {c.status === "draft" && <KV label="Starts">{c.scheduled_at ? shortDate(c.scheduled_at) : "When you send"}</KV>}
          <KV label="Speed">{speedText(c.throttle_per_min)}</KV>
          <KV label="Estimated cost">{c.cost_estimate > 0 ? fmtMoney(c.cost_estimate, currency) : "—"}</KV>
        </dl>
        <p className="mt-3 text-xs leading-relaxed text-ink-3">An estimate from the per-message rates in Settings. Meta’s invoice is the final word.</p>
        {c.status === "completed" && c.sent > 0 && c.failed === 0 && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-3">
            <CheckCircle size={14} weight="fill" className="text-accent" />
            Every message went out without errors.
          </p>
        )}
      </Card>
    </div>
  );
}

/* ───────── skeleton ───────── */

function DetailSkeleton() {
  return (
    <div aria-busy>
      <div className="mb-7 space-y-3">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-28 rounded-[26px]" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Skeleton className="h-56 rounded-[26px]" />
          <Skeleton className="h-72 rounded-[26px]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-80 rounded-[26px]" />
          <Skeleton className="h-48 rounded-[26px]" />
        </div>
      </div>
    </div>
  );
}
