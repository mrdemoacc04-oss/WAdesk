"use client";
import * as React from "react";
import { ArrowsClockwise, BellRinging, BellSlash, Prohibit, ShieldCheck, UserCheck } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Card, CardHeader, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { TagInput } from "@/components/ui/tag-input";
import { patch, refresh, toastError } from "@/lib/client/api";
import { useConfig } from "@/lib/client/hooks";
import { defaultSettings } from "@/lib/shared/constants";
import type { WorkspaceSettings } from "@/lib/shared/types";
import { MiniChat } from "./chat-preview";

type Compliance = WorkspaceSettings["compliance"];

const same = (a: Compliance, b: Compliance) => JSON.stringify(a) === JSON.stringify(b);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const POINTS = [
  { icon: UserCheck, title: "Message people who agreed to hear from you", body: "Meta expects a clear opt-in before any marketing message. Keep a record of where each contact said yes." },
  { icon: Prohibit, title: "Honour a stop request straight away", body: "When someone replies with an opt-out word, WAdesk marks them opted out and leaves them out of every future broadcast." },
  { icon: ShieldCheck, title: "Protect your quality rating", body: "Blocks and reports lower your rating, and a low rating can shrink your daily messaging limit. An easy way out keeps people from blocking you." },
];

export function ComplianceTab() {
  const { data: cfg } = useConfig();
  const saved = cfg?.workspace.settings.compliance;
  const [draft, setDraft] = React.useState<Compliance | null>(null);
  const [saving, setSaving] = React.useState(false);

  if (!saved) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-[26px]" />
        <Skeleton className="h-96 w-full rounded-[26px]" />
      </div>
    );
  }

  const canEdit = cfg.user.role !== "agent";
  const value = draft ?? saved;
  const dirty = !!draft && !same(draft, saved);
  const set = (p: Partial<Compliance>) => setDraft({ ...value, ...p });

  const outNorm = new Set(value.optout_keywords.map(norm));
  const overlap = value.optin_keywords.filter((k) => outNorm.has(norm(k)));
  const errors = {
    optout: value.optout_keywords.length === 0 ? "Keep at least one opt-out keyword so people can unsubscribe." : undefined,
    optoutReply: !value.optout_reply.trim() ? "Write the confirmation people receive when they opt out." : undefined,
    optinReply: !value.optin_reply.trim() ? "Write the confirmation people receive when they opt back in." : undefined,
    overlap: overlap.length ? `“${overlap[0]}” is in both lists. A word can only do one thing.` : undefined,
  };
  const blocked = !!(errors.optout || errors.optoutReply || errors.optinReply || errors.overlap);

  const save = async () => {
    setSaving(true);
    try {
      await patch("/api/workspace", {
        settings: {
          compliance: {
            ...value,
            optout_reply: value.optout_reply.trim(),
            optin_reply: value.optin_reply.trim(),
          },
        },
      });
      await refresh("/api/config");
      setDraft(null);
      toast.success("Opt-in and opt-out settings saved");
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const d = defaultSettings().compliance;
    setDraft({ ...d });
  };

  return (
    <fieldset disabled={!canEdit} className="contents">
      <div className="space-y-6">
        {!canEdit && <p className="rounded-2xl bg-warn-soft px-4 py-3 text-[13px] text-warn">Only owners and admins can change these settings.</p>}

        <Card>
          <CardHeader title="Consent on WhatsApp, in plain language" description="Three habits that keep your number healthy." />
          <ul className="grid gap-5 md:grid-cols-3">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <p.icon size={18} />
                </span>
                <div>
                  <h4 className="text-sm font-medium leading-snug">{p.title}</h4>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{p.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="h-full" coreClassName="flex h-full flex-col gap-5">
            <CardHeader
              className="mb-0"
              title="Opt-out"
              description="A contact who sends one of these words is unsubscribed."
              action={
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger">
                  <BellSlash size={18} />
                </span>
              }
            />
            <Field label="Opt-out keywords" error={errors.optout} hint="The whole message must match. Capital letters and punctuation are ignored.">
              <TagInput value={value.optout_keywords} onChange={(optout_keywords) => set({ optout_keywords })} placeholder="stop, unsubscribe…" aria-label="Opt-out keywords" />
            </Field>
            <Field label="Confirmation reply" error={errors.optoutReply}>
              <Textarea value={value.optout_reply} onChange={(e) => set({ optout_reply: e.target.value })} rows={3} maxLength={1000} invalid={!!errors.optoutReply} />
            </Field>
            <MiniChat className="mt-auto" incoming={value.optout_keywords[0]?.toUpperCase() ?? "STOP"} reply={value.optout_reply} />
          </Card>

          <Card className="h-full" coreClassName="flex h-full flex-col gap-5">
            <CardHeader
              className="mb-0"
              title="Opt-in"
              description="Lets someone who opted out come back by themselves."
              action={
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-ink">
                  <BellRinging size={18} />
                </span>
              }
            />
            <Field label="Opt-in keywords" error={errors.overlap} hint="Same rule: the whole message has to match.">
              <TagInput value={value.optin_keywords} onChange={(optin_keywords) => set({ optin_keywords })} placeholder="start, subscribe…" aria-label="Opt-in keywords" />
            </Field>
            <Field label="Confirmation reply" error={errors.optinReply}>
              <Textarea value={value.optin_reply} onChange={(e) => set({ optin_reply: e.target.value })} rows={3} maxLength={1000} invalid={!!errors.optinReply} />
            </Field>
            <MiniChat className="mt-auto" incoming={value.optin_keywords[0]?.toUpperCase() ?? "START"} reply={value.optin_reply} />
          </Card>
        </div>

        <Card>
          <div className="flex items-start justify-between gap-5">
            <div>
              <h3 className="text-[15px] font-medium tracking-tight">Add “Reply STOP to opt out” to marketing templates</h3>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-ink-3">
                Marketing templates you create get a short footer that tells people how to unsubscribe. It is the easiest way to keep blocks and reports down.
              </p>
            </div>
            <Switch checked={value.optout_footer} onCheckedChange={(optout_footer) => set({ optout_footer })} aria-label="Add opt-out footer to marketing templates" />
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" leading={<ArrowsClockwise size={14} />} onClick={reset} disabled={!canEdit}>
            Restore defaults
          </Button>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Discard
              </Button>
            )}
            <Button onClick={save} loading={saving} disabled={!dirty || blocked || !canEdit}>
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </fieldset>
  );
}
