"use client";
import * as React from "react";
import { CaretLeft, CaretRight, Clock, MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/menu";
import { StatusTicks } from "@/components/wa/status-ticks";
import { useRecipients } from "@/lib/client/hooks";
import { formatPhone } from "@/lib/shared/phone";
import { cn, clock, fmtNum } from "@/lib/shared/utils";
import type { Campaign, CampaignMessage } from "@/lib/shared/types";
import { useDebounced } from "../hooks";
import { issueInfo, recipientState, type RecipientState } from "../lib";

type Filter = "all" | "queued" | "sent" | "delivered" | "read" | "replied" | "failed" | "skipped";

const PAGE = 50;

const STATE_BADGE: Record<RecipientState, { label: string; tone: "neutral" | "accent" | "info" | "danger" | "warn" }> = {
  replied: { label: "Replied", tone: "accent" },
  read: { label: "Read", tone: "info" },
  delivered: { label: "Delivered", tone: "neutral" },
  sent: { label: "Sent", tone: "neutral" },
  queued: { label: "Queued", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  skipped: { label: "Skipped", tone: "warn" },
};

function StateBadge({ m }: { m: CampaignMessage }) {
  const s = recipientState(m);
  const b = STATE_BADGE[s];
  return (
    <Badge tone={b.tone}>
      {s === "queued" ? (
        <Clock size={12} />
      ) : s === "skipped" ? null : (
        <StatusTicks status={s === "replied" ? "read" : s} size={13} className={s === "read" || s === "replied" ? undefined : "text-current"} />
      )}
      {b.label}
    </Badge>
  );
}

function Times({ m }: { m: CampaignMessage }) {
  if (!m.sent_at && !m.failed_at) return <span className="text-ink-4">—</span>;
  const last = m.replied_at ? ["Replied", m.replied_at] : m.read_at ? ["Read", m.read_at] : m.delivered_at ? ["Delivered", m.delivered_at] : null;
  return (
    <span className="tabular block text-right text-[13px] leading-snug text-ink-2 md:text-left">
      {m.sent_at ? <span className="block">Sent {clock(m.sent_at)}</span> : <span className="block">Failed {clock(m.failed_at)}</span>}
      {last && (
        <span className="block text-ink-3">
          {last[0]} {clock(last[1])}
        </span>
      )}
    </span>
  );
}

function Issue({ m }: { m: CampaignMessage }) {
  if (m.status !== "failed" && m.status !== "skipped") return <span className="text-ink-4">—</span>;
  const info = issueInfo(m.error_code);
  const hint = m.error_code === "MISSING_VAR" && m.error_message ? m.error_message : info.hint;
  return (
    <Tooltip content={hint}>
      <span tabIndex={0} className="block cursor-help text-[13px] leading-snug text-ink-2 underline decoration-line-strong decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
        {info.title}
      </span>
    </Tooltip>
  );
}

export function Recipients({
  campaign,
  queued,
  skipped,
  live,
}: {
  campaign: Campaign;
  queued: number;
  skipped: number;
  live: boolean;
}) {
  const [status, setStatus] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const q = useDebounced(query.trim(), 300);

  const { data, isLoading } = useRecipients(campaign.id, { status: status === "all" ? undefined : status, q, limit: PAGE, offset: page * PAGE }, live);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const options: { value: Filter; label: string; count?: number }[] = [
    { value: "all", label: "All" },
    { value: "queued", label: "Queued", count: queued },
    { value: "sent", label: "Sent", count: campaign.sent },
    { value: "delivered", label: "Delivered", count: campaign.delivered },
    { value: "read", label: "Read", count: campaign.read },
    { value: "replied", label: "Replied", count: campaign.replied },
    { value: "failed", label: "Failed", count: campaign.failed },
    { value: "skipped", label: "Skipped", count: skipped },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3">
        <Input
          aria-label="Search recipients"
          className="w-full sm:max-w-xs"
          leading={<MagnifyingGlass size={16} />}
          placeholder="Name or phone"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <Segmented
          size="sm"
          aria-label="Filter recipients"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
          options={options}
        />
      </div>

      <div className="mt-4" aria-live="polite" aria-busy={isLoading && !data}>
        {isLoading && !data ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            className="py-10"
            icon={<UsersThree />}
            title={q || status !== "all" ? "No recipients match" : "No recipients yet"}
            description={q || status !== "all" ? "Try a different filter or search." : "Recipients appear here once the campaign is sent."}
          />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.25fr)_128px_minmax(0,0.9fr)_minmax(0,1.1fr)] gap-x-4 border-b border-line px-1 pb-2 text-xs text-ink-3 md:grid">
              <span>Contact</span>
              <span>Status</span>
              <span>Times</span>
              <span>Issue</span>
            </div>
            <ul className="divide-y divide-line">
              {rows.map((m) => (
                <li key={m.id} className="grid items-center gap-x-4 gap-y-2 px-1 py-3 md:grid-cols-[minmax(0,1.25fr)_128px_minmax(0,0.9fr)_minmax(0,1.1fr)]">
                  <div className="flex min-w-0 items-center justify-between gap-3 md:block">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.contact_name || "Unnamed contact"}</p>
                      <p className="truncate font-mono text-xs text-ink-3">{formatPhone(m.phone)}</p>
                    </div>
                    <div className="md:hidden">
                      <StateBadge m={m} />
                    </div>
                  </div>
                  <div className="hidden md:block">
                    <StateBadge m={m} />
                  </div>
                  <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 md:block", !m.sent_at && !m.failed_at && "max-md:hidden")}>
                    <span className="text-xs text-ink-3 md:hidden">Times</span>
                    <Times m={m} />
                  </div>
                  {(m.status === "failed" || m.status === "skipped") && (
                    <div className="flex items-baseline justify-between gap-4 md:block">
                      <span className="text-xs text-ink-3 md:hidden">Issue</span>
                      <Issue m={m} />
                    </div>
                  )}
                  {m.status !== "failed" && m.status !== "skipped" && (
                    <div className="hidden md:block">
                      <Issue m={m} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-ink-3">
              <span className="tabular">
                {fmtNum(page * PAGE + 1)}–{fmtNum(Math.min(total, (page + 1) * PAGE))} of {fmtNum(total)}
              </span>
              {pages > 1 && (
                <div className="flex items-center gap-1.5">
                  <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    <CaretLeft size={14} />
                  </Button>
                  <span className="tabular min-w-14 text-center">
                    {page + 1} / {pages}
                  </span>
                  <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                    <CaretRight size={14} />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

