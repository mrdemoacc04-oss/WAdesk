"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, EnvelopeSimple, Megaphone, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Avatar, Badge, Skeleton } from "@/components/ui/display";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TagInput } from "@/components/ui/tag-input";
import { OptInBadge } from "@/components/status";
import { StatusTicks } from "@/components/wa/status-ticks";
import { patch, refresh, toastError } from "@/lib/client/api";
import { useApi, useConfig, useConversation, useTags } from "@/lib/client/hooks";
import { countryName, flagEmoji, formatPhone } from "@/lib/shared/phone";
import { ago, cn } from "@/lib/shared/utils";
import type { CampaignMessage, Contact, Conversation } from "@/lib/shared/types";
import { AssignSelect, useConversationActions, WindowPill } from "./conversation-controls";
import { displayName, useNow } from "./lib";

type History = CampaignMessage & { campaign_name: string };
interface ContactBundle {
  contact: Contact;
  conversation: Conversation | null;
  history: History[];
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-ink-2">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Notes({ contact }: { contact: Contact }) {
  const [value, setValue] = React.useState(contact.notes ?? "");
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const saved = React.useRef(contact.notes ?? "");
  const latest = React.useRef(value);
  React.useEffect(() => {
    latest.current = value;
  });

  const save = React.useCallback(
    async (v: string) => {
      if (v === saved.current) return;
      setState("saving");
      try {
        await patch(`/api/contacts/${contact.id}`, { notes: v.trim() ? v : null });
        saved.current = v;
        setState("saved");
        void refresh("/api/contacts");
      } catch (e) {
        toastError(e);
        setState("idle");
      }
    },
    [contact.id],
  );

  React.useEffect(() => {
    if (value === saved.current) return;
    setState("idle");
    const t = setTimeout(() => void save(value), 800);
    return () => clearTimeout(t);
  }, [value, save]);

  // flush a pending edit if the panel closes or the conversation changes
  React.useEffect(
    () => () => {
      if (latest.current !== saved.current) {
        void patch(`/api/contacts/${contact.id}`, { notes: latest.current.trim() ? latest.current : null })
          .then(() => refresh("/api/contacts"))
          .catch(() => {});
      }
    },
    [contact.id],
  );

  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save(value)}
        maxLength={2000}
        rows={3}
        aria-label="Notes about this contact"
        placeholder="Add context for your team — budget, preferences, last call…"
        className="min-h-20 text-[13.5px] leading-snug"
      />
      <p className="mt-1.5 h-4 text-xs text-ink-3" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : ""}
      </p>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-5 p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function CopyPhone({ phone }: { phone: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      aria-label="Copy phone number"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(phone);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          toast.error("Couldn't copy the number");
        }
      }}
      className="grid size-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.07] hover:text-ink"
    >
      {done ? <Check size={13} weight="bold" className="text-accent" /> : <Copy size={13} />}
    </button>
  );
}

export function ContactPanel({ conversationId, overlay, onClose, className }: { conversationId: string; overlay?: boolean; onClose?: () => void; className?: string }) {
  const { data: raw } = useConversation(conversationId);
  const bundle = raw?.conversation.id === conversationId ? raw : undefined;
  const contactId = bundle?.contact.id ?? null;
  const { data, mutate } = useApi<ContactBundle>(contactId ? `/api/contacts/${contactId}` : null, { refreshInterval: 10_000 });
  const { data: cfg } = useConfig();
  const { data: allTags } = useTags();
  const actions = useConversationActions(conversationId);
  const now = useNow(30_000);
  const [showAll, setShowAll] = React.useState(false);

  const contact = data?.contact.id === contactId ? data.contact : bundle?.contact;
  const conv = bundle?.conversation;

  const setTags = async (tags: string[]) => {
    if (!contact) return;
    try {
      await mutate(
        async (cur) => {
          const c = await patch<Contact>(`/api/contacts/${contact.id}`, { tags });
          return cur ? { ...cur, contact: c } : cur;
        },
        {
          optimisticData: (cur) => (cur ? { ...cur, contact: { ...cur.contact, tags } } : (cur as unknown as ContactBundle)),
          rollbackOnError: true,
          populateCache: true,
          revalidate: false,
        },
      );
      void refresh("/api/contacts", "/api/tags");
    } catch (e) {
      toastError(e);
    }
  };

  const attrs = Object.entries(contact?.attributes ?? {}).filter(([, v]) => v);
  const history = data?.history ?? [];
  const shown = showAll ? history : history.slice(0, 4);

  return (
    <aside aria-label="Contact details" className={cn("flex min-h-0 flex-col bg-surface", className)}>
      {overlay && (
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
          <h2 className="text-[15px] font-medium">Contact</h2>
          <Button variant="ghost" size="icon-sm" aria-label="Close contact panel" onClick={onClose}>
            <X size={17} />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!contact ? (
          <PanelSkeleton />
        ) : (
          <>
            <div className="px-5 pb-5 pt-6">
              <div className="flex items-center gap-3.5">
                <Avatar name={contact.name} seed={contact.name ?? contact.phone} size={56} />
                <div className="min-w-0">
                  <h2 className="break-words text-[17px] font-medium leading-tight tracking-tight">{displayName(contact)}</h2>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="truncate font-mono text-[12.5px] text-ink-2">{formatPhone(contact.phone)}</span>
                    <CopyPhone phone={contact.phone} />
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <OptInBadge status={contact.opt_in} />
                {contact.country && (
                  <Badge tone="neutral">
                    <span aria-hidden>{flagEmoji(contact.country)}</span> {countryName(contact.country)}
                  </Badge>
                )}
              </div>
              {contact.email && (
                <p className="mt-3 flex items-center gap-2 break-all text-[13px] text-ink-2">
                  <EnvelopeSimple size={15} className="shrink-0 text-ink-3" /> {contact.email}
                </p>
              )}
            </div>

            <Section title="Conversation">
              <dl className="space-y-3 text-[13px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-ink-3">Status</dt>
                  <dd>
                    {conv ? (
                      <button
                        type="button"
                        onClick={() => (conv.status === "open" ? actions.resolve() : actions.reopen())}
                        className="group inline-flex items-center gap-2 outline-none"
                        aria-label={conv.status === "open" ? "Resolve conversation" : "Reopen conversation"}
                      >
                        <Badge tone={conv.status === "open" ? "accent" : "neutral"} dot>
                          {conv.status === "open" ? "Open" : "Resolved"}
                        </Badge>
                        <span className="text-xs text-ink-3 underline-offset-2 group-hover:text-ink group-hover:underline">{conv.status === "open" ? "Resolve" : "Reopen"}</span>
                      </button>
                    ) : (
                      <Skeleton className="h-5 w-16" />
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-ink-3">Assigned to</dt>
                  <dd className="min-w-0">
                    <AssignSelect className="w-[158px]" value={conv?.assigned_to} members={cfg?.members} meId={cfg?.user.id} onChange={(id) => void actions.assign(id)} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-ink-3">Reply window</dt>
                  <dd className="min-w-0">
                    <WindowPill short expiresAt={bundle?.window_expires_at} now={now} loaded={!!bundle} />
                  </dd>
                </div>
                {conv?.last_inbound_at && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-3">Last heard from</dt>
                    <dd className="text-ink-2">{ago(conv.last_inbound_at)}</dd>
                  </div>
                )}
              </dl>
            </Section>

            <Section title="Tags">
              <TagInput value={contact.tags} onChange={setTags} suggestions={(allTags ?? []).map((t) => t.name)} aria-label="Contact tags" />
            </Section>

            <Section title="Details">
              {attrs.length === 0 ? (
                <p className="text-[13px] text-ink-3">No custom attributes yet.</p>
              ) : (
                <dl className="space-y-2 text-[13px]">
                  {attrs.map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-4">
                      <dt className="shrink-0 capitalize text-ink-3">{k.replace(/_/g, " ")}</dt>
                      <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            <Section title="Notes">
              <Notes key={contact.id} contact={contact} />
            </Section>

            <Section title="Recent campaigns">
              {!data ? (
                <Skeleton className="h-12 w-full" />
              ) : history.length === 0 ? (
                <p className="text-[13px] text-ink-3">No campaign messages sent to this contact.</p>
              ) : (
                <>
                  <ul className="-my-1.5 divide-y divide-line">
                    {shown.map((h) => (
                      <li key={h.id}>
                        <Link href={`/campaigns/${h.campaign_id}`} className="group flex items-center gap-3 py-2.5 outline-none">
                          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-violet-soft text-violet">
                            <Megaphone size={15} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium group-hover:underline">{h.campaign_name}</span>
                            <span className="block text-xs text-ink-3">{ago(h.sent_at ?? h.created_at)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {h.replied_at && (
                              <Badge tone="accent" size="sm">
                                Replied
                              </Badge>
                            )}
                            <StatusTicks status={h.status === "sending" ? "queued" : h.status === "skipped" ? "" : h.status} size={15} />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {history.length > 4 && (
                    <button type="button" onClick={() => setShowAll((s) => !s)} className="mt-2 text-xs font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                      {showAll ? "Show fewer" : `Show all ${history.length}`}
                    </button>
                  )}
                </>
              )}
            </Section>

            <div className="border-t border-line px-5 py-4">
              <Link href={`/contacts?open=${contact.id}`} className={cn(buttonVariants({ variant: "secondary", size: "md" }), "w-full justify-between pr-1.5")}>
                Open in contacts
                <span className="grid size-7 place-items-center rounded-full bg-ink/[0.07]">
                  <ArrowUpRight size={14} />
                </span>
              </Link>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
