"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, ArrowSquareOut, CaretDown, ChatCircleDots, Lightning, PaperPlaneTilt, Timer } from "@phosphor-icons/react";
import { Avatar, Card, CardHeader, EmptyState, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/menu";
import { StatusTicks } from "@/components/wa/status-ticks";
import { ApiError, post, refresh, toastError } from "@/lib/client/api";
import { useMessages, useQuickReplies } from "@/lib/client/hooks";
import { formatPhone } from "@/lib/shared/phone";
import { ago, clock, cn, firstName } from "@/lib/shared/utils";
import type { ConversationListItem, Message } from "@/lib/shared/types";

const DAY = 24 * 3600_000;

function label(m: Message): string {
  if (m.body) return m.body;
  switch (m.type) {
    case "image": return "Photo";
    case "video": return "Video";
    case "audio": return "Voice message";
    case "document": return m.payload?.media?.filename ?? "Document";
    case "location": return "Location";
    case "button": return m.payload?.reply?.title ?? "Button reply";
    default: return "Message";
  }
}

function fill(body: string, name: string | null) {
  return body.replace(/\{\{\s*first_name\s*\}\}/gi, firstName(name) || "there").replace(/\{\{\s*name\s*\}\}/gi, name ?? "there");
}

function ReplyPanel({ c, onClose }: { c: ConversationListItem; onClose: () => void }) {
  const { data, mutate } = useMessages(c.id);
  const { data: quick } = useQuickReplies();
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const bottom = React.useRef<HTMLDivElement>(null);

  const [mountedAt] = React.useState(() => Date.now());
  const open = !closed && !!c.last_inbound_at && mountedAt - Date.parse(c.last_inbound_at) < DAY;
  const msgs = (data?.messages ?? []).filter((m) => m.type !== "note").slice(-5);
  const name = c.contact.name;

  React.useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  React.useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [msgs.length]);

  const insert = (body: string) => {
    const text = fill(body, name);
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text));
    ref.current?.focus();
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await post(`/api/conversations/${c.id}/messages`, { type: "text", body });
      setDraft("");
      toast.success(`Reply sent to ${firstName(name) || formatPhone(c.contact.phone)}`);
      await post(`/api/conversations/${c.id}/read`).catch(() => {});
      mutate();
      refresh("/api/dashboard", "/api/conversations", "/api/config");
      setTimeout(onClose, 450);
    } catch (e) {
      if (e instanceof ApiError && e.code === "WINDOW_CLOSED") setClosed(true);
      else toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") return onClose();
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      // "/price" + Enter expands the saved reply instead of sending the shortcut itself
      const hit = draft.startsWith("/") ? quick?.find((q) => `/${q.shortcut}` === draft.trim().toLowerCase()) : undefined;
      if (hit) setDraft(fill(hit.body, name));
      else void send();
    }
  };

  return (
    <div className="px-1 pb-3 pt-1">
      <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-2xl bg-surface-2 p-3 hairline">
        {!data ? (
          <Skeleton className="h-10 w-2/3" />
        ) : (
          msgs.map((m) => (
            <div key={m.id} className={cn("flex", m.direction === "out" && "justify-end")}>
              <div className={cn("max-w-[85%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug [overflow-wrap:anywhere]", m.direction === "out" ? "rounded-tr-md bg-bubble-out" : "rounded-tl-md bg-bubble-in shadow-[0_1px_0.5px_rgba(0,0,0,0.08)]")}>
                <span className="whitespace-pre-wrap">{label(m)}</span>
                <span className="ml-2 inline-flex translate-y-0.5 items-center gap-1 text-[10px] text-ink-3">
                  {clock(m.created_at)}
                  {m.direction === "out" && <StatusTicks status={m.status} size={12} />}
                </span>
              </div>
            </div>
          ))
        )}
        <div ref={bottom} />
      </div>

      {open ? (
        <>
          {quick && quick.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Quick reply shortcuts">
              <Lightning size={14} className="mr-0.5 text-ink-3" />
              {quick.slice(0, 6).map((q) => (
                <Tooltip key={q.id} content={<span className="block max-w-[240px] whitespace-normal">{fill(q.body, name)}</span>}>
                  <button
                    type="button"
                    onClick={() => insert(q.body)}
                    className="h-7 rounded-full bg-surface px-3 font-mono text-xs text-ink-2 hairline transition-colors duration-300 hover:bg-accent-soft hover:text-accent-ink"
                  >
                    /{q.shortcut}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
          <div className="mt-2.5 flex items-end gap-2">
            <textarea
              ref={ref}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              aria-label={`Reply to ${name ?? c.contact.phone}`}
              placeholder="Write a reply — type / for shortcuts"
              className="field-sizing-content max-h-32 min-h-11 w-full resize-none rounded-2xl bg-surface px-3.5 py-2.5 text-[16px] leading-snug hairline transition-shadow placeholder:text-ink-4 focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--accent)] md:text-sm"
            />
            <Button variant="accent" size="icon" aria-label="Send reply" loading={busy} disabled={!draft.trim()} onClick={send} className="shrink-0">
              <PaperPlaneTilt size={18} weight="fill" />
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
            <span>Enter to send · Shift+Enter for a new line</span>
            <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-1 transition-colors hover:text-ink">
              Open full chat <ArrowSquareOut size={13} />
            </Link>
          </div>
        </>
      ) : (
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-warn-soft p-3.5 text-[13px] text-ink-2">
          <Timer size={18} className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">The 24-hour reply window has closed</p>
            <p className="mt-0.5 text-ink-3">WhatsApp only allows an approved template to restart this conversation.</p>
          </div>
          <Link href={`/inbox?c=${c.id}`} className="shrink-0 self-center rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink hairline transition-colors hover:bg-surface-2">
            Send template
          </Link>
        </div>
      )}
    </div>
  );
}

export function NeedsReplyCard({ items, unread, loading }: { items: ConversationListItem[] | undefined; unread: number; loading: boolean }) {
  const [openId, setOpenId] = React.useState<string | null>(null);

  return (
    <Card className="h-full" coreClassName="h-full">
      <CardHeader
        title="Needs a reply"
        description={unread ? `${unread} unread · tap a chat to reply here` : undefined}
        action={
          <Link href="/inbox" className="flex shrink-0 items-center gap-1 whitespace-nowrap text-[13px] text-ink-3 transition-colors hover:text-ink">
            Open inbox <ArrowRight size={13} />
          </Link>
        }
      />
      {loading || !items ? (
        <Skeleton className="h-36 w-full" />
      ) : items.length === 0 ? (
        <EmptyState className="py-8" icon={<ChatCircleDots />} title="All caught up" description="New customer messages that need an answer will appear here." />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          <AnimatePresence initial={false}>
            {items.map((c) => {
              const open = openId === c.id;
              return (
                <motion.li key={c.id} layout="position" exit={{ opacity: 0, x: 24 }} transition={{ type: "spring", stiffness: 420, damping: 38 }} className={cn("rounded-2xl transition-colors duration-300", open && "bg-ink/[0.035]")}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : c.id)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left outline-none transition-colors duration-300 hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-accent/60"
                  >
                    <Avatar name={c.contact.name ?? c.contact.phone} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.contact.name ?? formatPhone(c.contact.phone)}</p>
                        <span className="shrink-0 text-xs text-ink-3">{ago(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {c.last_message_direction === "out" && <StatusTicks status={c.last_message_status ?? "sent"} size={13} />}
                        <p className="truncate text-[13px] text-ink-3">{c.last_message_preview}</p>
                      </div>
                    </div>
                    {c.unread_count > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white tabular">{c.unread_count}</span>}
                    <CaretDown size={15} className={cn("shrink-0 text-ink-4 transition-transform duration-500 ease-fluid", open && "rotate-180")} />
                  </button>
                  <div className={cn("grid transition-[grid-template-rows,opacity] duration-500 ease-fluid", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                    <div className="overflow-hidden px-1">{open && <ReplyPanel c={c} onClose={() => setOpenId(null)} />}</div>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </Card>
  );
}
