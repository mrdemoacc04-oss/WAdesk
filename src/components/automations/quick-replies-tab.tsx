"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChatsCircle, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardHeader, EmptyState, Kbd, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm";
import { del, patch, post, refresh, toastError } from "@/lib/client/api";
import { useQuickReplies } from "@/lib/client/hooks";
import type { QuickReply } from "@/lib/shared/types";

const cleanShortcut = (s: string) => s.trim().replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_-]/g, "");

function ReplyForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: { shortcut: string; body: string };
  submitLabel: string;
  onSubmit: (v: { shortcut: string; body: string }) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [shortcut, setShortcut] = React.useState(initial?.shortcut ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);

  const clean = cleanShortcut(shortcut);
  const errShortcut = tried && !clean ? "Use letters, numbers, - or _." : undefined;
  const errBody = tried && !body.trim() ? "Write the message to insert." : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!clean || !body.trim()) return;
    setBusy(true);
    const ok = await onSubmit({ shortcut: clean, body: body.trim() });
    setBusy(false);
    if (ok && !initial) {
      setShortcut("");
      setBody("");
      setTried(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[190px_minmax(0,1fr)]">
      <Field label="Shortcut" error={errShortcut}>
        <Input
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value)}
          placeholder="price"
          maxLength={30}
          invalid={!!errShortcut}
          leading={<span className="font-mono text-sm">/</span>}
          className="[&_input]:font-mono"
          aria-label="Shortcut"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="Message" error={errBody}>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Our packages start at…" rows={3} maxLength={4096} invalid={!!errBody} aria-label="Message" />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" loading={busy} leading={!initial ? <Plus size={16} /> : undefined}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function QuickRepliesTab() {
  const { data: replies, isLoading } = useQuickReplies();
  const confirm = useConfirm();
  const [editing, setEditing] = React.useState<string | null>(null);

  const add = async (v: { shortcut: string; body: string }) => {
    try {
      await post("/api/quick-replies", v);
      await refresh("/api/quick-replies");
      toast.success(`/${v.shortcut} added`);
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const update = (id: string) => async (v: { shortcut: string; body: string }) => {
    try {
      await patch(`/api/quick-replies/${id}`, v);
      await refresh("/api/quick-replies");
      setEditing(null);
      toast.success("Quick reply saved");
      return true;
    } catch (e) {
      toastError(e);
      return false;
    }
  };

  const remove = async (r: QuickReply) => {
    const ok = await confirm({ title: `Delete /${r.shortcut}?`, description: "Agents will no longer see it when they type / in the inbox.", confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    try {
      await del(`/api/quick-replies/${r.id}`);
      await refresh("/api/quick-replies");
      toast.success("Quick reply deleted");
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card className="self-start">
        <CardHeader title="Add a quick reply" description={<>Agents type <Kbd>/</Kbd> in the inbox, pick a shortcut and the message is inserted for them to edit and send.</>} />
        <ReplyForm submitLabel="Add quick reply" onSubmit={add} />
      </Card>

      <Card>
        <CardHeader title="Your quick replies" description={replies ? `${replies.length} saved` : undefined} />
        {isLoading || !replies ? (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : replies.length === 0 ? (
          <EmptyState icon={<ChatsCircle />} title="No quick replies yet" description="Save the answers you type again and again, like your address, payment details or a pricing summary." className="py-10" />
        ) : (
          <ul className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {replies.map((r) => (
                <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ duration: 0.3 }} className="py-4 first:pt-0 last:pb-0">
                  {editing === r.id ? (
                    <div className="rounded-2xl bg-surface-2 p-4 hairline">
                      <ReplyForm initial={{ shortcut: r.shortcut, body: r.body }} submitLabel="Save" onSubmit={update(r.id)} onCancel={() => setEditing(null)} />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3.5">
                      <span className="mt-0.5 inline-flex h-7 shrink-0 items-center rounded-full bg-accent-soft px-3 font-mono text-[13px] text-accent-ink">/{r.shortcut}</span>
                      <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{r.body}</p>
                      <div className="flex shrink-0 items-center">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit /${r.shortcut}`} onClick={() => setEditing(r.id)}>
                          <PencilSimple size={16} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete /${r.shortcut}`} onClick={() => remove(r)}>
                          <Trash size={16} />
                        </Button>
                      </div>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Card>
    </div>
  );
}
