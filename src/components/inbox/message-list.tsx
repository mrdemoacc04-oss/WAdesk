"use client";
import * as React from "react";
import { ArrowDown, CircleNotch } from "@phosphor-icons/react";
import { MessageBubble } from "@/components/wa/message-bubble";
import { Skeleton } from "@/components/ui/display";
import { cn, dayLabel } from "@/lib/shared/utils";
import type { Message, Template } from "@/lib/shared/types";
import { sameDay, type DisplayItem } from "./lib";

const GROUP_GAP_MS = 5 * 60_000;

function sameGroup(a: Message, b: Message): boolean {
  if (a.type === "note" || b.type === "note") return false;
  if (a.direction !== b.direction) return false;
  if ((a.payload?.author?.id ?? null) !== (b.payload?.author?.id ?? null)) return false;
  if (!sameDay(a.created_at, b.created_at)) return false;
  return Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < GROUP_GAP_MS;
}

export function MessageSkeleton() {
  const rows = [
    ["in", "w-56"],
    ["in", "w-40"],
    ["out", "w-64"],
    ["in", "w-72"],
    ["out", "w-44"],
    ["out", "w-56"],
  ] as const;
  return (
    <div className="absolute inset-0 space-y-3 overflow-hidden px-3 py-5 md:px-6" aria-hidden>
      {rows.map(([dir, w], i) => (
        <div key={i} className={cn("flex", dir === "out" ? "justify-end" : "justify-start")}>
          <Skeleton className={cn("h-10 rounded-2xl opacity-80", w)} />
        </div>
      ))}
    </div>
  );
}

export function MessageList({
  items,
  loaded,
  conversationKey,
  templates,
  onRetry,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  items: DisplayItem[];
  loaded: boolean;
  conversationKey: string;
  templates: Map<string, Template>;
  onRetry: (m: Message) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const pinned = React.useRef(true);
  const [unseen, setUnseen] = React.useState(0);
  const lastKey = React.useRef<string | null>(null);
  const firstKey = React.useRef<string | null>(null);
  const anchor = React.useRef<{ h: number; top: number } | null>(null);
  const didInitialScroll = React.useRef(false);

  /* "fresh" = arrived after this thread was first shown (drives the bubble-in animation).
     Everything at or before the newest message of the first load is history. */
  const [initLatest, setInitLatest] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (loaded && initLatest === null) setInitLatest(items.length ? Date.parse(items[items.length - 1].msg.created_at) : 0);
  }, [loaded, initLatest, items]);

  const isFresh = (i: DisplayItem) => initLatest !== null && (i.key.startsWith("tmp_") || Date.parse(i.msg.created_at) > initLatest);

  const toBottom = React.useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const d = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinned.current = d < 72;
    if (pinned.current) setUnseen((n) => (n ? 0 : n));
  };

  /* scroll behaviour on item changes */
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !items.length) return;
    const last = items[items.length - 1];
    const first = items[0];

    if (!didInitialScroll.current) {
      didInitialScroll.current = true;
      lastKey.current = last.key;
      firstKey.current = first.key;
      toBottom();
      return;
    }

    if (first.key !== firstKey.current && last.key === lastKey.current && anchor.current) {
      // older messages were prepended — keep what the agent was reading in place
      el.scrollTop = el.scrollHeight - anchor.current.h + anchor.current.top;
      anchor.current = null;
    }
    firstKey.current = first.key;

    if (last.key !== lastKey.current) {
      lastKey.current = last.key;
      if (pinned.current || last.msg.direction === "out") {
        toBottom();
        setUnseen(0);
      } else if (last.msg.direction === "in") {
        setUnseen((n) => n + 1);
      }
    }
  }, [items, toBottom]);

  /* keep pinned to the bottom while images/videos load */
  React.useEffect(() => {
    const c = contentRef.current;
    const box = scrollRef.current;
    if (!c || !box || typeof ResizeObserver === "undefined") return;
    // content grows (images load) or the pane shrinks (composer gets taller): stay on the newest message
    const ro = new ResizeObserver(() => {
      if (pinned.current) toBottom();
    });
    ro.observe(c);
    ro.observe(box);
    return () => ro.disconnect();
  }, [toBottom]);

  const loadMore = () => {
    const el = scrollRef.current;
    if (el) anchor.current = { h: el.scrollHeight, top: el.scrollTop };
    onLoadMore();
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        data-conv={conversationKey}
        className="wa-wallpaper absolute inset-0 overflow-y-auto overscroll-contain px-3 py-4 [overflow-anchor:none] md:px-6"
      >
        <div ref={contentRef} className="mx-auto flex max-w-[880px] flex-col [overflow-wrap:anywhere]">
          {hasMore && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="mx-auto mb-3 inline-flex h-8 items-center gap-2 rounded-full bg-surface/90 px-4 text-[12.5px] font-medium text-ink-2 shadow-btn hairline transition-colors hover:bg-surface disabled:opacity-60"
            >
              {loadingMore && <CircleNotch size={14} className="animate-spin" />}
              Load earlier messages
            </button>
          )}
          {items.map((it, idx) => {
            const prev = idx > 0 ? items[idx - 1].msg : null;
            const m = it.msg;
            const newDay = !prev || !sameDay(prev.created_at, m.created_at);
            const grouped = !!prev && !newDay && sameGroup(prev, m);
            const note = m.type === "note";
            const author = m.payload?.author?.name;
            return (
              <React.Fragment key={it.key}>
                {newDay && (
                  <div className={cn("mx-auto mb-2 w-fit rounded-full bg-surface/90 px-3 py-1 text-[11.5px] font-medium text-ink-3 shadow-btn hairline", idx === 0 ? "mt-0" : "mt-4")}>
                    {dayLabel(m.created_at)}
                  </div>
                )}
                <div className={cn(note ? "my-2" : grouped ? "mt-0.5" : "mt-2.5", idx === 0 && !newDay && "mt-0")}>
                  <MessageBubble m={m} templates={templates} showAuthor={!grouped && !note && m.direction === "out" && !!author} fresh={isFresh(it)} onRetry={onRetry} />
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {!loaded && <MessageSkeleton />}

      {unseen > 0 && (
        <button
          type="button"
          onClick={() => {
            toBottom();
            setUnseen(0);
          }}
          className="absolute bottom-4 left-1/2 inline-flex h-9 -translate-x-1/2 animate-pop items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-bg shadow-pop"
        >
          <ArrowDown size={14} weight="bold" />
          {unseen === 1 ? "New message" : `${unseen} new messages`}
        </button>
      )}
    </div>
  );
}
