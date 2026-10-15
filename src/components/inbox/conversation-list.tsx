"use client";
import * as React from "react";
import { motion } from "motion/react";
import { preload } from "swr";
import { ChatCircleDots, FileText, ImageSquare, MagnifyingGlass, MapPin, Microphone, Plus, Prohibit, Sticker, VideoCamera, X } from "@phosphor-icons/react";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/menu";
import { StatusTicks } from "@/components/wa/status-ticks";
import { fetcher } from "@/lib/client/api";
import { cn } from "@/lib/shared/utils";
import type { ConversationListItem, Member } from "@/lib/shared/types";
import { compactTime, displayName, memberFor, previewKind, useNow } from "./lib";

export type InboxTab = "open" | "unread" | "mine" | "unassigned" | "resolved";

const TABS: { value: InboxTab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "unread", label: "Unread" },
  { value: "mine", label: "Mine" },
  { value: "unassigned", label: "Unassigned" },
  { value: "resolved", label: "Resolved" },
];

const EMPTY: Record<InboxTab, { title: string; description: string }> = {
  open: { title: "No open conversations", description: "Customer replies and new chats will show up here." },
  unread: { title: "You're all caught up", description: "Conversations with unread messages appear here." },
  mine: { title: "Nothing assigned to you", description: "Conversations assigned to you will appear here." },
  unassigned: { title: "Every conversation has an owner", description: "Unassigned conversations will appear here." },
  resolved: { title: "No resolved conversations", description: "Resolved conversations are kept here and reopen when the customer writes back." },
};

/** Pill tabs sized to fit the 330px list pane without scrolling. */
function ListTabs({ value, onChange, unread }: { value: InboxTab; onChange: (v: InboxTab) => void; unread: number }) {
  const id = React.useId();
  return (
    <div role="tablist" aria-label="Conversation filter" className="flex items-center gap-0.5 rounded-full bg-ink/[0.055] p-1">
      {TABS.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex h-7 min-w-0 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-full px-1 text-xs font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`inbox-tab-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgba(20,21,15,0.08),0_0_0_1px_var(--line)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{t.label}</span>
            {t.value === "unread" && unread > 0 && <span className="tabular relative text-[11px] text-accent">{unread > 99 ? "99+" : unread}</span>}
          </button>
        );
      })}
    </div>
  );
}

function PreviewIcon({ preview }: { preview: string | null }) {
  const k = previewKind(preview);
  const cls = "shrink-0 text-ink-3";
  if (k === "image") return <ImageSquare size={14} className={cls} />;
  if (k === "video") return <VideoCamera size={14} className={cls} />;
  if (k === "audio") return <Microphone size={14} className={cls} />;
  if (k === "document") return <FileText size={14} className={cls} />;
  if (k === "location") return <MapPin size={14} className={cls} />;
  if (k === "sticker") return <Sticker size={14} className={cls} />;
  return null;
}

const Row = React.memo(function Row({
  c,
  selected,
  members,
  now,
  onSelect,
  index,
}: {
  c: ConversationListItem;
  selected: boolean;
  members: Member[] | undefined;
  now: number;
  onSelect: (id: string, via: "pointer" | "key") => void;
  index: number;
}) {
  const unread = c.unread_count > 0;
  const out = c.last_message_direction === "out";
  const agent = memberFor(members, c.assigned_to);
  const optedOut = c.contact.opt_in === "opted_out";
  const prefetch = () => {
    void preload(`/api/conversations/${c.id}`, fetcher);
    void preload(`/api/conversations/${c.id}/messages?limit=80`, fetcher);
  };
  return (
    <motion.li layout="position" transition={{ type: "spring", stiffness: 520, damping: 44, mass: 0.9 }} className="list-none">
      <button
        type="button"
        data-row={index}
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(c.id, "pointer")}
        onPointerEnter={prefetch}
        className={cn(
          "flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent/60",
          selected ? "bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]" : "hover:bg-ink/[0.04]",
        )}
      >
        <Avatar name={c.contact.name} seed={c.contact.name ?? c.contact.phone} size={40} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate text-[14px]", unread ? "font-semibold text-ink" : "font-medium text-ink")}>{displayName(c.contact)}</span>
            <span className={cn("tabular shrink-0 text-[11.5px]", unread ? "font-medium text-accent" : "text-ink-3")}>{compactTime(c.last_message_at, now)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <span className={cn("flex min-w-0 flex-1 items-center gap-1 text-[13px]", unread ? "text-ink-2" : "text-ink-3")}>
              {out && <StatusTicks status={c.last_message_status ?? "sent"} size={14} className="shrink-0" />}
              <PreviewIcon preview={c.last_message_preview} />
              <span className="truncate break-words">
                {out && <span className="text-ink-4">You: </span>}
                {c.last_message_preview || "No messages yet"}
              </span>
            </span>
            {optedOut && (
              <Tooltip content="Opted out of messages">
                <span className="grid shrink-0 place-items-center text-danger" aria-label="Opted out">
                  <Prohibit size={14} />
                </span>
              </Tooltip>
            )}
            {agent && (
              <Tooltip content={`Assigned to ${agent.name}`}>
                <span className="shrink-0">
                  <Avatar name={agent.name} seed={agent.color} size={18} />
                </span>
              </Tooltip>
            )}
            {unread && (
              <span className="tabular grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white" aria-label={`${c.unread_count} unread`}>
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </span>
        </span>
      </button>
    </motion.li>
  );
});

function ListSkeleton() {
  return (
    <div className="space-y-1 px-2 pt-1" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-3 py-2.5">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-0.5">
            <div className="flex justify-between gap-6">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-8" />
            </div>
            <Skeleton className="h-3 w-[78%]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationList({
  rows,
  total,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  tab,
  onTab,
  query,
  onQuery,
  onMore,
  onNewChat,
  members,
  unreadTotal,
  className,
}: {
  rows: ConversationListItem[] | undefined;
  total: number;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string, via: "pointer" | "key") => void;
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  query: string;
  onQuery: (q: string) => void;
  onMore: () => void;
  onNewChat: () => void;
  members: Member[] | undefined;
  unreadTotal: number;
  className?: string;
}) {
  const now = useNow(30_000);
  const listRef = React.useRef<HTMLUListElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const focusRow = (i: number) => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${i}"]`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows?.length) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const t = e.target as HTMLElement;
    const inSearch = t === searchRef.current;
    const rowAttr = t.closest<HTMLElement>("[data-row]")?.dataset.row;
    if (!inSearch && rowAttr === undefined) return;
    e.preventDefault();
    let idx = rowAttr !== undefined ? Number(rowAttr) : -1;
    if (inSearch) {
      if (e.key === "ArrowUp") return;
      idx = -1;
    }
    const next = e.key === "ArrowDown" ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
    onSelect(rows[next].id, "key");
    focusRow(next);
  };

  const isFiltering = query.trim().length > 0;
  const empty = EMPTY[tab];

  return (
    <section aria-label="Conversations" className={cn("min-h-0 flex-col bg-surface", className)} onKeyDown={onKeyDown}>
      <div className="space-y-3 px-3.5 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[19px] font-medium tracking-[-0.02em]">Inbox</h1>
          <Button size="sm" variant="secondary" leading={<Plus size={14} weight="bold" />} onClick={onNewChat}>
            New chat
          </Button>
        </div>
        <Input
          ref={searchRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search name, number or message"
          aria-label="Search conversations"
          leading={<MagnifyingGlass size={16} />}
          trailing={
            query ? (
              <button type="button" aria-label="Clear search" onClick={() => onQuery("")} className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.07]">
                <X size={13} />
              </button>
            ) : undefined
          }
        />
        <ListTabs value={tab} onChange={onTab} unread={unreadTotal} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line pb-3 pt-1.5" aria-live="polite" aria-busy={loading}>
        {error && !rows ? (
          <EmptyState
            icon={<ChatCircleDots />}
            title="Couldn't load conversations"
            description="Check your connection and try again."
            action={
              <Button size="sm" variant="secondary" onClick={onRetry}>
                Try again
              </Button>
            }
          />
        ) : !rows ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            className="py-16"
            icon={isFiltering ? <MagnifyingGlass /> : <ChatCircleDots />}
            title={isFiltering ? "No matches" : empty.title}
            description={isFiltering ? `Nothing in this view matches “${query.trim()}”.` : empty.description}
            action={
              !isFiltering && tab === "open" ? (
                <Button size="sm" variant="secondary" leading={<Plus size={14} weight="bold" />} onClick={onNewChat}>
                  New chat
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul ref={listRef} role="list" className="space-y-0.5 px-2">
              {rows.map((c, i) => (
                <Row key={c.id} c={c} index={i} selected={c.id === selectedId} members={members} now={now} onSelect={onSelect} />
              ))}
            </ul>
            {rows.length < total && (
              <div className="flex justify-center pt-2">
                <Button size="sm" variant="ghost" onClick={onMore}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
