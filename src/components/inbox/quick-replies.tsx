"use client";
import * as React from "react";
import { Lightning, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Field } from "@/components/ui/input";
import { EmptyState, Kbd } from "@/components/ui/display";
import { useConfirm } from "@/components/confirm";
import { del, patch, post, refresh, toastError } from "@/lib/client/api";
import { useQuickReplies } from "@/lib/client/hooks";
import { cn } from "@/lib/shared/utils";
import type { QuickReply } from "@/lib/shared/types";

export function filterQuickReplies(all: QuickReply[] | undefined, query: string): QuickReply[] {
  const list = all ?? [];
  const q = query.trim().toLowerCase();
  if (!q) return list;
  const starts = list.filter((r) => r.shortcut.startsWith(q));
  const rest = list.filter((r) => !r.shortcut.startsWith(q) && (r.shortcut.includes(q) || r.body.toLowerCase().includes(q)));
  return [...starts, ...rest];
}

/** Floating list above the composer. Never takes focus — the textarea keeps it so typing keeps filtering. */
export function QuickReplyPanel({
  items,
  loading,
  active,
  onActive,
  onPick,
  onManage,
  query,
}: {
  items: QuickReply[];
  loading: boolean;
  active: number;
  onActive: (i: number) => void;
  onPick: (r: QuickReply) => void;
  onManage: () => void;
  query: string;
}) {
  const listRef = React.useRef<HTMLUListElement>(null);
  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-qr="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <div className="menu absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-2xl bg-surface shadow-pop hairline" data-state="open" role="listbox" aria-label="Quick replies">
      <ul ref={listRef} className="max-h-60 overflow-y-auto p-1.5">
        {items.length === 0 ? (
          <li className="px-3 py-5 text-center text-[13px] text-ink-3">
            {loading ? "Loading quick replies…" : query ? `No quick reply matches “${query}”.` : "No quick replies yet."}
          </li>
        ) : (
          items.map((r, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                data-qr={i}
                // keep focus in the textarea
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(r)}
                onPointerMove={() => i !== active && onActive(i)}
                className={cn("flex w-full items-baseline gap-3 rounded-xl px-2.5 py-2 text-left transition-colors", i === active ? "bg-ink/[0.06]" : "")}
              >
                <span className="shrink-0 font-mono text-[12.5px] font-medium text-accent-ink">/{r.shortcut}</span>
                <span className="line-clamp-1 min-w-0 flex-1 break-words text-[13px] text-ink-2">{r.body}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/60 px-3 py-2">
        <span className="hidden items-center gap-2 text-xs text-ink-3 sm:flex">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> choose <Kbd>Enter</Kbd> insert
        </span>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onManage} className="ml-auto text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
          Manage quick replies
        </button>
      </div>
    </div>
  );
}

type Draft = { id: string | null; shortcut: string; body: string };

export function ManageQuickRepliesModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, isLoading } = useQuickReplies();
  const confirm = useConfirm();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setDraft(null);
  }, [open]);

  const save = async () => {
    if (!draft) return;
    const shortcut = draft.shortcut.trim().replace(/^\//, "");
    if (!shortcut || !draft.body.trim()) return;
    setBusy(true);
    try {
      if (draft.id) await patch(`/api/quick-replies/${draft.id}`, { shortcut, body: draft.body });
      else await post("/api/quick-replies", { shortcut, body: draft.body });
      await refresh("/api/quick-replies");
      setDraft(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: QuickReply) => {
    const ok = await confirm({ title: `Delete /${r.shortcut}?`, description: "Agents will no longer be able to insert it.", confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    try {
      await del(`/api/quick-replies/${r.id}`);
      await refresh("/api/quick-replies");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Quick replies"
      description="Type / in the composer, then pick a shortcut to insert its text."
      size="md"
      footer={
        <Button variant="secondary" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      }
    >
      {draft ? (
        <form
          className="space-y-3 rounded-2xl bg-surface-2 p-4 hairline"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Field label="Shortcut" hint="Letters, numbers, - and _. Agents type it after “/”.">
            <Input
              autoFocus
              value={draft.shortcut}
              onChange={(e) => setDraft({ ...draft, shortcut: e.target.value.replace(/\s/g, "") })}
              maxLength={30}
              leading={<span className="font-mono text-sm">/</span>}
              className="font-mono"
              placeholder="pricing"
            />
          </Field>
          <Field label="Reply text">
            <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} maxLength={4096} rows={4} placeholder="Hi {{first_name}}, thanks for reaching out…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy} disabled={!draft.shortcut.trim() || !draft.body.trim()}>
              {draft.id ? "Save changes" : "Add quick reply"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" size="sm" leading={<Plus size={14} weight="bold" />} onClick={() => setDraft({ id: null, shortcut: "", body: "" })}>
          New quick reply
        </Button>
      )}

      <div className="mt-4">
        {isLoading && !data ? (
          <p className="py-8 text-center text-sm text-ink-3">Loading…</p>
        ) : !data?.length ? (
          <EmptyState className="py-10" icon={<Lightning />} title="No quick replies yet" description="Save the answers you type every day and insert them in one keystroke." />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[13px] font-medium text-accent-ink">/{r.shortcut}</p>
                  <p className="mt-0.5 line-clamp-2 break-words text-[13px] text-ink-2">{r.body}</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit /${r.shortcut}`} onClick={() => setDraft({ id: r.id, shortcut: r.shortcut, body: r.body })}>
                  <PencilSimple size={16} />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete /${r.shortcut}`} onClick={() => remove(r)}>
                  <Trash size={16} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
