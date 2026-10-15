"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { ChatCircleDots, Plus, Trash, Warning, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/dialog";
import { Avatar, Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { OptInBadge } from "@/components/status";
import { useConfirm } from "@/components/confirm";
import { del, patch, post, refresh, toastError } from "@/lib/client/api";
import { useApi, useTags } from "@/lib/client/hooks";
import { countryName, flagEmoji, formatPhone } from "@/lib/shared/phone";
import type { CampaignMessage, Contact, Conversation, OptIn } from "@/lib/shared/types";
import { ago, cn, shortDate } from "@/lib/shared/utils";
import { OPT_OPTIONS, SOURCE_LABEL, displayName } from "./shared";

type History = (CampaignMessage & { campaign_name: string })[];
interface Detail {
  contact: Contact;
  conversation: Conversation | null;
  history: History;
}

interface AttrRow {
  id: number;
  key: string;
  value: string;
}

let rowSeq = 0;
const toRows = (attrs: Record<string, string>): AttrRow[] => Object.entries(attrs ?? {}).map(([key, value]) => ({ id: ++rowSeq, key, value: String(value) }));
const fromRows = (rows: AttrRow[]): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
};

export function ContactSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  // keep the last id around so the content doesn't vanish while the drawer slides out
  const [shown, setShown] = React.useState<string | null>(id);
  React.useEffect(() => {
    if (id) setShown(id);
  }, [id]);

  // after a delete we stop asking the server about this contact but keep showing it while the drawer slides out
  const [gone, setGone] = React.useState<Detail | null>(null);
  const { data, error, isLoading } = useApi<Detail>(shown && !gone ? `/api/contacts/${shown}` : null);
  const detail = gone ?? data;
  const ready = detail && shown && detail.contact.id === shown;
  React.useEffect(() => {
    if (!id) {
      const t = setTimeout(() => setGone(null), 400);
      return () => clearTimeout(t);
    }
  }, [id]);

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      title={ready ? displayName(detail.contact) : "Contact"}
      width={560}
      className="px-0 pb-0"
    >
      {ready ? (
        <DetailBody key={detail.contact.id} detail={detail} onClose={onClose} onDeleting={() => setGone(detail)} />
      ) : error && !isLoading ? (
        <EmptyState title="This contact isn't available" description="It may have been deleted." action={<Button variant="secondary" onClick={onClose}>Close</Button>} />
      ) : (
        <SheetSkeleton />
      )}
    </Sheet>
  );
}

function SheetSkeleton() {
  return (
    <div className="space-y-6 px-6 pt-2">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function DetailBody({ detail, onClose, onDeleting }: { detail: Detail; onClose: () => void; onDeleting: () => void }) {
  const { contact, history } = detail;
  const router = useRouter();
  const confirm = useConfirm();
  const { data: allTags } = useTags();

  const [name, setName] = React.useState(contact.name ?? "");
  const [email, setEmail] = React.useState(contact.email ?? "");
  const [notes, setNotes] = React.useState(contact.notes ?? "");
  const [tags, setTags] = React.useState<string[]>(contact.tags);
  const [attrs, setAttrs] = React.useState<AttrRow[]>(() => toRows(contact.attributes));
  const [optIn, setOptIn] = React.useState<OptIn>(contact.opt_in);
  const [consent, setConsent] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [opening, setOpening] = React.useState(false);

  // when the saved status changes (after a save), forget any consent ticks
  React.useEffect(() => {
    setConsent(false);
    setOptIn(contact.opt_in);
  }, [contact.opt_in]);

  const attrObj = fromRows(attrs);
  const sameTags = tags.length === contact.tags.length && tags.every((t) => contact.tags.includes(t));
  const sameAttrs = JSON.stringify(Object.entries(attrObj).sort()) === JSON.stringify(Object.entries(contact.attributes ?? {}).sort());
  const dirty =
    name.trim() !== (contact.name ?? "") ||
    email.trim() !== (contact.email ?? "") ||
    notes !== (contact.notes ?? "") ||
    !sameTags ||
    !sameAttrs ||
    optIn !== contact.opt_in;

  const reopening = contact.opt_in === "opted_out" && optIn === "opted_in";
  const emailBad = !!email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const canSave = dirty && !emailBad && (!reopening || consent);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        tags,
        attributes: attrObj,
      };
      if (optIn !== contact.opt_in) body.opt_in = optIn;
      await patch(`/api/contacts/${contact.id}`, body);
      toast.success("Contact saved");
      await refresh("/api/contacts", "/api/tags", "/api/dashboard");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${displayName(contact)}?`,
      description: "This removes the contact and their chat history from WAdesk. Past campaign stats keep their counts. This can't be undone.",
      confirmLabel: "Delete contact",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await del(`/api/contacts/${contact.id}`);
      toast.success("Contact deleted");
      onDeleting();
      onClose();
      await new Promise((r) => setTimeout(r, 60)); // let the detail request unmount before refreshing the lists
      await refresh("/api/contacts", "/api/tags", "/api/dashboard");
    } catch (e) {
      toastError(e);
    }
  };

  const openChat = async () => {
    setOpening(true);
    try {
      const conv = await post<Conversation>("/api/conversations", { contact_id: contact.id });
      router.push(`/inbox?c=${conv.id}`);
    } catch (e) {
      toastError(e);
      setOpening(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-7 px-6 pb-6">
        {/* header */}
        <div className="flex items-center gap-4">
          <Avatar name={contact.name} seed={contact.phone} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="inline-flex items-center gap-2 whitespace-nowrap font-mono text-[15px]">
                <span aria-hidden>{flagEmoji(contact.country)}</span>
                {formatPhone(contact.phone)}
              </span>
              <OptInBadge status={contact.opt_in} />
            </div>
            <p className="mt-1 text-[13px] text-ink-3">
              {contact.country ? `${countryName(contact.country)} · ` : ""}Added {ago(contact.created_at)} · {SOURCE_LABEL[contact.source] ?? contact.source}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={openChat} loading={opening} leading={<ChatCircleDots size={16} />}>
            Open chat
          </Button>
        </div>

        {/* basics */}
        <div className="grid gap-4">
          <Field label="Name" htmlFor="cs-name">
            <Input id="cs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="No name saved" autoComplete="off" />
          </Field>
          <Field label="Email" htmlFor="cs-email" error={emailBad ? "That email address looks incomplete" : undefined}>
            <Input id="cs-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="No email saved" autoComplete="off" invalid={emailBad} />
          </Field>
          <Field label="Notes" htmlFor="cs-notes">
            <Textarea id="cs-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your team should know" className="min-h-20" />
          </Field>
        </div>

        <Field label="Tags">
          <TagInput value={tags} onChange={setTags} suggestions={(allTags ?? []).map((t) => t.name)} aria-label="Tags" />
        </Field>

        {/* attributes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Custom fields</span>
            <Button variant="ghost" size="xs" onClick={() => setAttrs((a) => [...a, { id: ++rowSeq, key: "", value: "" }])} leading={<Plus size={13} />}>
              Add field
            </Button>
          </div>
          {attrs.length === 0 ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-ink-3 hairline">
              No custom fields. Add things like city or order number and use them as variables in campaigns.
            </p>
          ) : (
            <ul className="grid gap-2">
              {attrs.map((r) => (
                <li key={r.id} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-2">
                  <Input value={r.key} onChange={(e) => setAttrs((a) => a.map((x) => (x.id === r.id ? { ...x, key: e.target.value } : x)))} placeholder="Field name" aria-label="Field name" />
                  <Input value={r.value} onChange={(e) => setAttrs((a) => a.map((x) => (x.id === r.id ? { ...x, value: e.target.value } : x)))} placeholder="Value" aria-label={`Value for ${r.key || "field"}`} />
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${r.key || "field"}`} onClick={() => setAttrs((a) => a.filter((x) => x.id !== r.id))}>
                    <X size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* opt-in */}
        <div className="grid gap-3">
          <Field
            label="Opt-in status"
            htmlFor="cs-optin"
            hint={
              contact.opt_in === "opted_in" && contact.opted_in_at
                ? `Opted in ${ago(contact.opted_in_at)}${contact.opt_in_source ? ` via ${contact.opt_in_source.replace(/_/g, " ")}` : ""}.`
                : contact.opt_in === "opted_out" && contact.opted_out_at
                  ? `Opted out ${ago(contact.opted_out_at)}${contact.opt_in_source ? ` via ${contact.opt_in_source.replace(/_/g, " ")}` : ""}.`
                  : "Only opted-in contacts receive campaigns."
            }
          >
            <Select id="cs-optin" value={optIn} onValueChange={setOptIn} options={OPT_OPTIONS} />
          </Field>
          {reopening && (
            <div role="alert" className="rounded-2xl bg-warn-soft p-4 text-sm text-warn">
              <div className="flex items-start gap-3">
                <Warning size={20} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">This person opted out</p>
                  <p className="mt-1 leading-relaxed">
                    They asked not to receive WhatsApp messages from you. Only switch them back on if they have explicitly told you they want messages again. Messaging people without consent can get your number restricted by Meta.
                  </p>
                  <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-ink">
                    <Checkbox checked={consent} onCheckedChange={(c) => setConsent(c === true)} className="mt-0.5" />
                    <span>They have given their explicit consent to receive messages again.</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* details */}
        <dl className="divide-y divide-line rounded-2xl bg-surface-2 px-4 hairline">
          <Row label="WhatsApp number">
            <span className="font-mono">{contact.phone}</span>
          </Row>
          <Row label="Country">{contact.country ? `${flagEmoji(contact.country)} ${countryName(contact.country)}` : "Unknown"}</Row>
          <Row label="Last message from them">{contact.last_inbound_at ? shortDate(contact.last_inbound_at) : "Never"}</Row>
          <Row label="Last message to them">{contact.last_outbound_at ? shortDate(contact.last_outbound_at) : "Never"}</Row>
        </dl>

        {/* campaign history */}
        <div>
          <h3 className="mb-2 text-[13px] font-medium text-ink-2">Recent campaign sends</h3>
          {history.length === 0 ? (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-ink-3 hairline">No campaigns have been sent to this contact yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl hairline">
              {history.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{h.campaign_name}</p>
                    <p className="text-xs text-ink-3">{shortDate(h.sent_at ?? h.created_at)}</p>
                  </div>
                  <HistoryBadge m={h} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-2 border-t border-line bg-surface/95 px-6 py-3.5 backdrop-blur">
        <Button variant="danger-soft" onClick={remove} leading={<Trash size={16} />}>
          Delete
        </Button>
        <div className="flex items-center gap-2">
          {dirty && <span className="hidden text-xs text-ink-3 sm:inline">Unsaved changes</span>}
          <Button onClick={save} loading={saving} disabled={!canSave}>
            Save changes
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right font-medium")}>{children}</dd>
    </div>
  );
}

function HistoryBadge({ m }: { m: CampaignMessage }) {
  if (m.replied_at) return <Badge tone="violet" dot>Replied</Badge>;
  switch (m.status) {
    case "read":
      return <Badge tone="accent" dot>Read</Badge>;
    case "delivered":
      return <Badge tone="info" dot>Delivered</Badge>;
    case "sent":
      return <Badge dot>Sent</Badge>;
    case "failed":
      return <Badge tone="danger" dot>Failed</Badge>;
    case "skipped":
      return <Badge tone="warn" dot>Skipped</Badge>;
    default:
      return <Badge dot>Queued</Badge>;
  }
}
