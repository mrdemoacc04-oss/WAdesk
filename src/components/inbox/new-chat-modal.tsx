"use client";
import * as React from "react";
import { MagnifyingGlass, UsersThree } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { post, qs, refresh, toastError } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { formatPhone } from "@/lib/shared/phone";
import { cn } from "@/lib/shared/utils";
import type { Contact, Conversation, Page } from "@/lib/shared/types";
import { useDebounced } from "./lib";

export function NewChatModal({ open, onOpenChange, onOpened }: { open: boolean; onOpenChange: (o: boolean) => void; onOpened: (conversationId: string) => void }) {
  const [q, setQ] = React.useState("");
  const dq = useDebounced(q.trim(), 220);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const { data, isLoading } = useApi<Page<Contact>>(open ? `/api/contacts${qs({ q: dq, limit: 8 })}` : null);

  React.useEffect(() => {
    if (!open) {
      setQ("");
      setBusy(null);
    }
  }, [open]);
  React.useEffect(() => setActive(0), [dq]);

  const rows = data?.rows ?? [];

  const pick = async (c: Contact) => {
    if (busy) return;
    setBusy(c.id);
    try {
      const conv = await post<Conversation>("/api/conversations", { contact_id: c.id });
      await refresh("/api/conversations?");
      onOpenChange(false);
      onOpened(conv.id);
    } catch (e) {
      toastError(e);
      setBusy(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(rows.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void pick(rows[active] ?? rows[0]);
    }
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New chat" description="Pick a contact to open their conversation." size="sm">
      <div onKeyDown={onKeyDown}>
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number" aria-label="Search contacts" leading={<MagnifyingGlass size={16} />} />
        <div className="mt-3 min-h-[280px]" aria-live="polite">
          {isLoading && !data ? (
            <div className="space-y-1" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <Skeleton className="size-9 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState className="py-10" icon={<UsersThree />} title="No contacts found" description={dq ? `Nothing matches “${dq}”. Add the contact first, then come back.` : "Add contacts to start a conversation."} />
          ) : (
            <ul className="space-y-0.5">
              {rows.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => pick(c)}
                    onPointerMove={() => setActive(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors",
                      i === active ? "bg-ink/[0.06]" : "hover:bg-ink/[0.04]",
                      busy === c.id && "opacity-60",
                    )}
                  >
                    <Avatar name={c.name} seed={c.name ?? c.phone} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.name?.trim() || formatPhone(c.phone)}</span>
                      <span className="block truncate font-mono text-xs text-ink-3">{formatPhone(c.phone)}</span>
                    </span>
                    {c.opt_in === "opted_out" ? (
                      <Badge tone="danger" size="sm">
                        Opted out
                      </Badge>
                    ) : c.opt_in === "pending" ? (
                      <Badge tone="warn" size="sm">
                        Unconfirmed
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
