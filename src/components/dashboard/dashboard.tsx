"use client";
import * as React from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ArrowRight, ArrowUpRight, ChatCircleDots, CheckCircle, Circle, FileArrowUp, Megaphone, PlugsConnected, SquaresFour, Warning } from "@phosphor-icons/react";
import { Badge, Card, CardHeader, EmptyState, Kbd, PageHeader, Progress, Skeleton } from "@/components/ui/display";
import { Segmented } from "@/components/ui/controls";
import { buttonVariants } from "@/components/ui/button";
import { AreaChart } from "@/components/charts/area-chart";
import { Delta, HBarList, StackedBar, StatTile } from "@/components/charts/charts";
import { CampaignStatusBadge } from "@/components/status";
import { NeedsReplyCard } from "./reply-card";
import { useConfig, useDashboard } from "@/lib/client/hooks";
import { cn, firstName, fmtNum, fmtPct, shortDate } from "@/lib/shared/utils";
import { formatPhone } from "@/lib/shared/phone";
import type { Campaign } from "@/lib/shared/types";

const TIERS: Record<string, string> = {
  TIER_50: "50 customers a day",
  TIER_250: "250 customers a day",
  TIER_1K: "1,000 customers a day",
  TIER_2K: "2,000 customers a day",
  TIER_10K: "10,000 customers a day",
  TIER_100K: "100,000 customers a day",
  TIER_UNLIMITED: "Unlimited customers",
};

function Reveal({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("animate-fade-up", className)} style={{ animationDelay: `${60 + i * 70}ms` }}>
      {children}
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Working late," : h < 12 ? "Good morning," : h < 17 ? "Good afternoon," : "Good evening,";
}

export function Dashboard() {
  const [range, setRange] = React.useState(14);
  const { data, isLoading } = useDashboard(range);
  const { data: cfg } = useConfig();
  const [hello, setHello] = React.useState("Welcome back,");
  React.useEffect(() => setHello(greeting()), []);

  const live = cfg?.providerMode === "live";
  const acct = data?.account ?? cfg?.account ?? null;
  const k = data?.kpis;

  const setup = [
    { done: !!live, label: "Connect your WhatsApp number", href: "/settings", icon: PlugsConnected, hint: "Add your Cloud API credentials" },
    { done: (data?.audience.total ?? 0) > 0, label: "Import your contacts", href: "/contacts/import", icon: FileArrowUp, hint: "CSV, Excel, vCard or JSON" },
    { done: (data?.templates.approved ?? 0) > 0, label: "Get a template approved", href: "/templates/new", icon: SquaresFour, hint: "Text, media or carousel" },
    { done: (data?.recent.length ?? 0) > 0 || (data?.active.length ?? 0) > 0, label: "Send your first campaign", href: "/campaigns/new", icon: Megaphone, hint: "Broadcast to a segment" },
  ];
  const setupDone = setup.filter((s) => s.done).length;

  return (
    <div>
      <PageHeader
        title={hello}
        accent={firstName(cfg?.user.name) || "there"}
        description="Here's how your WhatsApp is performing."
        actions={
          <>
            <Segmented
              aria-label="Date range"
              value={String(range)}
              onValueChange={(v) => setRange(Number(v))}
              options={[
                { value: "7", label: "7 days" },
                { value: "14", label: "14 days" },
                { value: "30", label: "30 days" },
              ]}
            />
            <Link href="/campaigns/new" className={buttonVariants({ variant: "primary" })}>
              New campaign
              <span className="grid size-7 place-items-center rounded-full bg-bg/15 transition-transform duration-500 ease-fluid group-hover/btn:translate-x-0.5">
                <ArrowUpRight size={14} />
              </span>
            </Link>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !k ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} coreClassName="h-[142px]">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="mt-9 h-9 w-24" />
            </Card>
          ))
        ) : (
          <>
            <Reveal i={0}>
              <Card coreClassName="h-[142px]">
                <StatTile label="Messages sent" value={fmtNum(k.sent.value)} delta={<Delta value={k.sent.value} previous={k.sent.previous} />} spark={k.sent.spark} sparkColor="var(--viz-1)" />
              </Card>
            </Reveal>
            <Reveal i={1}>
              <Card coreClassName="h-[142px]">
                <StatTile label="Delivery rate" value={`${k.delivered_rate.value}%`} delta={<Delta points value={k.delivered_rate.value} previous={k.delivered_rate.previous} />} spark={k.delivered_rate.spark} sparkColor="var(--viz-1)" />
              </Card>
            </Reveal>
            <Reveal i={2}>
              <Card coreClassName="h-[142px]">
                <StatTile label="Read rate" value={`${k.read_rate.value}%`} delta={<Delta points value={k.read_rate.value} previous={k.read_rate.previous} />} spark={k.read_rate.spark} sparkColor="var(--viz-1)" />
              </Card>
            </Reveal>
            <Reveal i={3}>
              <Card coreClassName="h-[142px]">
                <StatTile label="Replies" value={fmtNum(k.replied.value)} delta={<Delta value={k.replied.value} previous={k.replied.previous} />} spark={k.replied.spark} sparkColor="var(--viz-1)" />
              </Card>
            </Reveal>
          </>
        )}
      </div>

      {/* activity + health */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Reveal i={4}>
          <Card>
            <CardHeader title="Message activity" description={`Sent, read and replied over the last ${range} days`} />
            {!data ? (
              <Skeleton className="h-[276px] w-full" />
            ) : data.series.every((d) => d.sent === 0) ? (
              <EmptyState
                className="py-16"
                icon={<Megaphone />}
                title="Nothing sent in this period"
                description="Launch a campaign and its delivery, read and reply counts will appear here as they happen."
                action={
                  <Link href="/campaigns/new" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Create a campaign
                  </Link>
                }
              />
            ) : (
              <AreaChart
                data={data.series}
                series={[
                  { key: "sent", label: "Sent", color: "var(--viz-1)" },
                  { key: "read", label: "Read", color: "var(--viz-2)" },
                  { key: "replied", label: "Replied", color: "var(--viz-3)" },
                ]}
                formatX={(d) => format(parseISO(d), "d MMM")}
                height={276}
              />
            )}
          </Card>
        </Reveal>

        <Reveal i={5}>
          <Card className="h-full" coreClassName="h-full">
            <CardHeader title="Account health" />
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", live && acct?.status === "connected" ? "bg-accent-bright animate-pulse-ring" : live || cfg?.providerMode === "none" ? "bg-warn" : "bg-info")} />
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium">{live ? (acct?.verified_name ?? "WhatsApp Business") : cfg?.providerMode === "mock" ? "Demo connection" : "WhatsApp not connected"}</p>
                    <p className="line-clamp-2 text-sm text-ink-3">
                      {live
                        ? acct?.display_phone_number
                          ? formatPhone(acct.display_phone_number)
                          : "Connected"
                        : cfg?.providerMode === "mock"
                          ? "Messages are simulated. Connect your number to go live."
                          : "Add your Cloud API credentials to start sending."}
                    </p>
                  </div>
                  {!live && (
                    <Link href="/settings" className={cn(buttonVariants({ variant: "soft", size: "xs" }), "ml-auto shrink-0")}>
                      Connect
                    </Link>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-surface-2 p-3.5 hairline">
                    <dt className="text-xs text-ink-3">Quality rating</dt>
                    <dd className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                      {acct?.quality_rating === "GREEN" && <CheckCircle size={17} weight="fill" className="text-accent" />}
                      {(acct?.quality_rating === "YELLOW" || acct?.quality_rating === "RED") && <Warning size={17} weight="fill" className={acct.quality_rating === "RED" ? "text-danger" : "text-warn"} />}
                      {acct?.quality_rating ? acct.quality_rating[0] + acct.quality_rating.slice(1).toLowerCase() : "Unknown"}
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-surface-2 p-3.5 hairline">
                    <dt className="text-xs text-ink-3">Daily limit</dt>
                    <dd className="mt-1.5 text-sm font-medium">{acct?.messaging_limit_tier ? (TIERS[acct.messaging_limit_tier] ?? acct.messaging_limit_tier) : "—"}</dd>
                  </div>
                </dl>

                <div>
                  <div className="mb-2.5 flex items-center justify-between text-[13px]">
                    <span className="text-ink-2">Audience</span>
                    <Link href="/contacts" className="flex items-center gap-1 text-ink-3 transition-colors hover:text-ink">
                      {fmtNum(data.audience.total)} contacts <ArrowRight size={13} />
                    </Link>
                  </div>
                  <StackedBar
                    segments={[
                      { label: "Opted in", value: data.audience.opted_in, color: "var(--viz-1)" },
                      { label: "Unconfirmed", value: data.audience.pending, color: "var(--viz-2)" },
                      { label: "Opted out", value: data.audience.opted_out, color: "var(--viz-3)" },
                    ]}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4 text-[13px]">
                  <span className="mr-1 text-ink-3">Templates</span>
                  <Link href="/templates"><Badge tone="accent">{data.templates.approved} approved</Badge></Link>
                  {data.templates.pending > 0 && <Link href="/templates"><Badge tone="warn">{data.templates.pending} in review</Badge></Link>}
                  {data.templates.rejected > 0 && <Link href="/templates"><Badge tone="danger">{data.templates.rejected} rejected</Badge></Link>}
                </div>
              </div>
            )}
          </Card>
        </Reveal>
      </div>

      {/* campaigns · inbox · setup */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        <Reveal i={6} className="grid grid-cols-1 content-start gap-4">
          <Card>
            <CardHeader
              title="Active campaigns"
              action={
                <Link href="/campaigns" className="flex items-center gap-1 text-[13px] text-ink-3 transition-colors hover:text-ink">
                  All campaigns <ArrowRight size={13} />
                </Link>
              }
            />
            {!data ? (
              <Skeleton className="h-28 w-full" />
            ) : data.active.length === 0 ? (
              <EmptyState className="py-6" icon={<Megaphone />} title="Nothing running" description="Scheduled and in-flight campaigns show up here with live progress." />
            ) : (
              <ul className="-mx-2 space-y-1">
                {data.active.map((c) => (
                  <ActiveRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Best templates" description="By read rate" />
            {!data ? <Skeleton className="h-28 w-full" /> : <HBarList items={data.top_templates.map((t) => ({ label: <span className="font-mono text-xs">{t.name}</span>, value: t.read_rate, sub: `${fmtNum(t.sent)} sent` }))} format={(v) => `${v}%`} max={100} empty="Send a campaign to see how templates perform." />}
          </Card>
        </Reveal>

        <Reveal i={7}>
          <NeedsReplyCard items={data?.inbox} unread={data?.unread ?? 0} loading={!data} />
        </Reveal>

        <Reveal i={8} className="grid grid-cols-1 content-start gap-4 lg:col-span-2 xl:col-span-1">
          {setupDone < setup.length && (
            <Card>
              <CardHeader title="Get set up" description={`${setupDone} of ${setup.length} done`} />
              <Progress value={(setupDone / setup.length) * 100} className="mb-4" />
              <ul className="space-y-0.5">
                {setup.map((s) => (
                  <li key={s.label}>
                    <Link href={s.href} className={cn("group flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-300 hover:bg-ink/[0.04]", s.done && "opacity-60")}>
                      {s.done ? <CheckCircle size={20} weight="fill" className="shrink-0 text-accent" /> : <Circle size={20} className="shrink-0 text-ink-4" />}
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm font-medium", s.done && "line-through decoration-ink-4")}>{s.label}</span>
                        {!s.done && <span className="block text-xs text-ink-3">{s.hint}</span>}
                      </span>
                      {!s.done && <ArrowRight size={14} className="shrink-0 text-ink-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Shortcuts" description="Jump anywhere without leaving the keyboard" />
            <div className="-mx-2 grid gap-0.5">
              {[
                { href: "/campaigns/new", label: "New campaign", hint: "Broadcast to an audience", icon: Megaphone, keys: ["N"] },
                { href: "/contacts/import", label: "Import contacts", hint: "CSV, Excel, vCard, JSON", icon: FileArrowUp, keys: [] },
                { href: "/templates/new", label: "Create a template", hint: "Text, media or carousel", icon: SquaresFour, keys: [] },
                { href: "/inbox", label: "Open the inbox", hint: "Reply to customers", icon: ChatCircleDots, keys: ["G", "I"] },
              ].map((a) => (
                <Link key={a.href} href={a.href} className="group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors duration-300 hover:bg-ink/[0.04]">
                  <span className="grid size-9 place-items-center rounded-xl bg-surface-2 text-ink-2 hairline">
                    <a.icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{a.label}</span>
                    <span className="block text-xs text-ink-3">{a.hint}</span>
                  </span>
                  {a.keys.length > 0 ? (
                    <span className="flex items-center gap-1">
                      {a.keys.map((k, i) => (
                        <React.Fragment key={k}>
                          {i > 0 && <span className="text-[10px] text-ink-4">then</span>}
                          <Kbd>{k}</Kbd>
                        </React.Fragment>
                      ))}
                    </span>
                  ) : (
                    <ArrowRight size={14} className="text-ink-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-ink" />
                  )}
                </Link>
              ))}
            </div>
            <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-3">
              <Kbd>⌘K</Kbd> searches everything. Press <Kbd>G</Kbd> then <Kbd>D</Kbd> dashboard, <Kbd>C</Kbd> contacts, <Kbd>M</Kbd> campaigns, <Kbd>T</Kbd> templates, <Kbd>A</Kbd> analytics, <Kbd>S</Kbd> settings.
            </p>
          </Card>
        </Reveal>
      </div>

      {/* recent */}
      <Reveal i={9} className="mt-4">
        <Card padded={false}>
          <div className="p-5 pb-2">
            <CardHeader title="Recent campaigns" className="mb-0" action={<Link href="/campaigns" className="flex items-center gap-1 text-[13px] text-ink-3 transition-colors hover:text-ink">View all <ArrowRight size={13} /></Link>} />
          </div>
          {!data ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : data.recent.length === 0 ? (
            <p className="px-5 pb-8 pt-4 text-sm text-ink-3">Finished campaigns appear here.</p>
          ) : (
            <div className="overflow-x-auto pb-2">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-3">
                    <th className="px-5 py-2.5 font-medium">Campaign</th>
                    <th className="px-3 py-2.5 text-right font-medium">Sent</th>
                    <th className="px-3 py-2.5 text-right font-medium">Delivered</th>
                    <th className="px-3 py-2.5 text-right font-medium">Read</th>
                    <th className="px-3 py-2.5 text-right font-medium">Replied</th>
                    <th className="px-5 py-2.5 text-right font-medium">Finished</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {data.recent.map((c) => (
                    <tr key={c.id} className="group border-t border-line transition-colors hover:bg-ink/[0.025]">
                      <td className="px-5 py-3">
                        <Link href={`/campaigns/${c.id}`} className="font-medium underline-offset-4 group-hover:underline">
                          {c.name}
                        </Link>
                        <p className="font-mono text-xs text-ink-3">{c.template_name}</p>
                      </td>
                      <td className="px-3 py-3 text-right">{fmtNum(c.sent)}</td>
                      <td className="px-3 py-3 text-right">{fmtPct(c.delivered, c.sent)}</td>
                      <td className="px-3 py-3 text-right">{fmtPct(c.read, c.sent)}</td>
                      <td className="px-3 py-3 text-right">{fmtPct(c.replied, c.sent)}</td>
                      <td className="px-5 py-3 text-right text-ink-3">{shortDate(c.completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Reveal>
    </div>
  );
}

function ActiveRow({ c }: { c: Campaign }) {
  const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
  return (
    <li>
      <Link href={`/campaigns/${c.id}`} className="block rounded-2xl px-2 py-3 transition-colors duration-300 hover:bg-ink/[0.04]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <CampaignStatusBadge status={c.status} />
        </div>
        {c.status === "scheduled" ? (
          <p className="text-[13px] text-ink-3">Starts {shortDate(c.scheduled_at)} · {fmtNum(c.total)} contacts</p>
        ) : (
          <>
            <Progress value={pct} tone={c.status === "paused" ? "warn" : "accent"} />
            <p className="mt-1.5 text-xs text-ink-3 tabular">
              {fmtNum(c.sent)} of {fmtNum(c.total)} sent · {pct}%
            </p>
          </>
        )}
      </Link>
    </li>
  );
}
