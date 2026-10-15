"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MotionConfig, motion } from "motion/react";
import { ArrowUpRight, CopySimple, DotsThree, MagnifyingGlass, Megaphone, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { EmptyState, PageHeader, Progress, Skeleton } from "@/components/ui/display";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { CampaignStatusBadge, CategoryBadge } from "@/components/status";
import { useConfirm } from "@/components/confirm";
import { post, del, refresh, toastError } from "@/lib/client/api";
import { useCampaigns, useSegments } from "@/lib/client/hooks";
import { cn, fmtNum, fmtPct, shortDate } from "@/lib/shared/utils";
import type { Campaign, Segment } from "@/lib/shared/types";
import { ButtonLink } from "./button-link";
import { useDebounced } from "./hooks";
import { audienceSummary, campaignWhen } from "./lib";
import { toast } from "sonner";

type Filter = "all" | "running" | "scheduled" | "completed" | "draft";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "draft", label: "Draft" },
];

const PAGE = 30;

const EMPTY_TITLE: Record<Filter, string> = {
  all: "No campaigns match",
  running: "Nothing is sending right now",
  scheduled: "No scheduled campaigns",
  completed: "No completed campaigns yet",
  draft: "No drafts",
};
const EMPTY_HINT: Record<Filter, string> = {
  all: "Try a different filter or search term.",
  running: "Campaigns that are sending or paused show up here.",
  scheduled: "Pick a date and time in the Schedule step to line one up.",
  completed: "Finished campaigns and their results collect here.",
  draft: "Unfinished campaigns are saved here automatically.",
};

export function CampaignList() {
  const [status, setStatus] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");
  const [limit, setLimit] = React.useState(PAGE);
  const q = useDebounced(query.trim(), 300);

  const { data, isLoading, error } = useCampaigns({ status, q, limit });
  const { data: segments } = useSegments();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const filtered = status !== "all" || !!q;

  return (
    <MotionConfig reducedMotion="user">
      <PageHeader
        title="Campaigns"
        description="Broadcast approved templates to opted-in contacts and follow what happens next."
        actions={
          <ButtonLink href="/campaigns/new" trailing={<ArrowUpRight size={14} />}>
            New campaign
          </ButtonLink>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          aria-label="Filter campaigns"
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setLimit(PAGE);
          }}
          options={FILTERS}
        />
        <Input
          aria-label="Search campaigns"
          className="w-full sm:w-72"
          placeholder="Search by name or template"
          leading={<MagnifyingGlass size={16} />}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
        />
      </div>

      <div aria-live="polite">
        {isLoading && !data ? (
          <ul className="space-y-3" aria-busy>
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <RowSkeleton />
              </li>
            ))}
          </ul>
        ) : error && !data ? (
          <div className="bezel">
            <div className="bezel-core">
              <EmptyState
                icon={<Megaphone />}
                title="Couldn’t load campaigns"
                description="Check your connection and try again."
                action={
                  <Button variant="secondary" onClick={() => refresh("/api/campaigns")}>
                    Try again
                  </Button>
                }
              />
            </div>
          </div>
        ) : rows.length === 0 ? (
          <div className="bezel">
            <div className="bezel-core">
              {filtered ? (
                <EmptyState
                  icon={<MagnifyingGlass />}
                  title={q ? "No campaigns match" : EMPTY_TITLE[status]}
                  description={q ? "Try a different search term or filter." : EMPTY_HINT[status]}
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setStatus("all");
                        setQuery("");
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={<Megaphone />}
                  title="No campaigns yet"
                  description="Send your first broadcast: pick an approved template, choose who should get it, and WAdesk handles the pacing."
                  action={
                    <ButtonLink href="/campaigns/new" trailing={<ArrowUpRight size={14} />}>
                      New campaign
                    </ButtonLink>
                  }
                />
              )}
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {rows.map((c, i) => (
                <motion.li
                  key={c.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: Math.min(i, 8) * 0.04, ease: [0.32, 0.72, 0, 1] }}
                >
                  <CampaignRow c={c} segments={segments} />
                </motion.li>
              ))}
            </ul>
            {rows.length < total && (
              <div className="mt-5 flex justify-center">
                <Button variant="secondary" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more
                  <span className="tabular text-ink-3">
                    {rows.length} of {fmtNum(total)}
                  </span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </MotionConfig>
  );
}

/* ───────── row ───────── */

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="tabular text-[15px] font-medium leading-none tracking-tight">{value}</p>
      <p className="mt-1.5 text-xs text-ink-3">{label}</p>
    </div>
  );
}

function CampaignRow({ c, segments }: { c: Campaign; segments?: Segment[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState(false);

  const hasResults = c.sent > 0;
  const pct = c.total ? Math.min(100, (c.sent / c.total) * 100) : 0;
  const sending = c.status === "sending";

  const duplicate = async () => {
    setBusy(true);
    try {
      const copy = await post<Campaign>(`/api/campaigns/${c.id}/duplicate`);
      refresh("/api/campaigns");
      toast.success("Copied to a new draft");
      router.push(`/campaigns/new?draft=${copy.id}&step=details`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      description: "Its results and recipient log are removed for good. Messages already sent stay in the inbox.",
      confirmLabel: "Delete campaign",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await del(`/api/campaigns/${c.id}`);
      await refresh("/api/campaigns", "/api/dashboard");
      toast.success("Campaign deleted");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="bezel-sm group relative transition-transform duration-500 ease-fluid hover:-translate-y-px">
      <div className="bezel-core px-4 py-4 sm:px-5">
        <div className="grid items-center gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_268px_196px]">
          {/* identity */}
          <div className="min-w-0 pr-9 lg:pr-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Link
                href={`/campaigns/${c.id}`}
                className="min-w-0 max-w-full truncate text-[15px] font-medium tracking-tight outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent/60"
              >
                {c.name}
              </Link>
              <CampaignStatusBadge status={c.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-ink-3">
              {c.template_name ? (
                <>
                  <span className="max-w-[16rem] truncate font-mono text-xs text-ink-2">{c.template_name}</span>
                  {c.template_category && <CategoryBadge category={c.template_category} />}
                </>
              ) : (
                <span>No template yet</span>
              )}
              <span aria-hidden className="text-ink-4">
                ·
              </span>
              <span className="truncate">{audienceSummary(c.audience, segments)}</span>
            </div>
            {(sending || c.status === "paused") && c.total > 0 && (
              <div className="mt-3.5 max-w-md">
                <Progress value={pct} tone={c.status === "paused" ? "warn" : "accent"} />
                <p className="tabular mt-1.5 text-xs text-ink-3">
                  {fmtNum(c.sent)} of {fmtNum(c.total)} sent · {Math.round(pct)}%
                  {c.status === "paused" && " · paused"}
                </p>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-3 lg:hidden">{campaignWhen(c)}</p>
          </div>

          {/* results */}
          <div>
            {hasResults ? (
              <div className="grid grid-cols-3 gap-4 border-t border-line pt-4 lg:border-0 lg:pt-0">
                <Metric label="Delivered" value={fmtPct(c.delivered, c.sent, 0)} />
                <Metric label="Read" value={fmtPct(c.read, c.sent, 0)} />
                <Metric label="Replied" value={fmtPct(c.replied, c.sent, 0)} />
              </div>
            ) : (
              <p className="border-t border-line pt-4 text-[13px] text-ink-3 lg:border-0 lg:pt-0">
                {c.status === "scheduled" ? (
                  <>
                    <span className="tabular font-medium text-ink">{fmtNum(c.total)}</span> recipients lined up
                    {c.scheduled_at && <span className="block text-xs">for {shortDate(c.scheduled_at)}</span>}
                  </>
                ) : c.status === "draft" ? (
                  "Not sent yet"
                ) : sending ? (
                  "First results arrive in a moment"
                ) : (
                  "No messages were sent"
                )}
              </p>
            )}
          </div>

          {/* when + menu */}
          <div className="absolute right-3 top-3 flex items-center gap-3 lg:static lg:justify-end">
            <span className="hidden whitespace-nowrap text-xs text-ink-3 lg:block">{campaignWhen(c)}</span>
            <Menu>
              <MenuTrigger asChild>
                <button
                  aria-label={`Actions for ${c.name}`}
                  className="relative z-10 grid size-9 place-items-center rounded-full text-ink-3 outline-none transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 data-[state=open]:bg-ink/[0.06]"
                >
                  <DotsThree size={20} weight="bold" />
                </button>
              </MenuTrigger>
              <MenuContent>
                <MenuItem icon={<CopySimple size={16} />} disabled={busy} onSelect={duplicate}>
                  Duplicate
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<Trash size={16} />} danger disabled={sending} onSelect={remove}>
                  Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="bezel-sm">
      <div className="bezel-core grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_268px_80px] lg:items-center lg:gap-8">
        <div className="space-y-3">
          <Skeleton className={cn("h-4 w-56")} />
          <Skeleton className="h-3 w-80 max-w-full" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
          <Skeleton className="h-9" />
        </div>
        <Skeleton className="h-3 w-16 lg:justify-self-end" />
      </div>
    </div>
  );
}
