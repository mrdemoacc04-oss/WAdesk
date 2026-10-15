"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { ApiError, errorMessage, post, refresh } from "@/lib/client/api";
import { useConfig, useTags } from "@/lib/client/hooks";
import { countryName, flagEmoji, formatPhone, normalizePhone } from "@/lib/shared/phone";
import type { Contact, OptIn } from "@/lib/shared/types";
import { toast } from "sonner";
import { OPT_OPTIONS } from "./shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AddContactModal({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated?: (c: Contact) => void }) {
  const { data: cfg } = useConfig();
  const { data: tags } = useTags();
  const country = cfg?.workspace.settings.default_country ?? "IN";

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [tagList, setTagList] = React.useState<string[]>([]);
  const [optIn, setOptIn] = React.useState<OptIn>("pending");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // fresh form every time the modal opens
  React.useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setEmail("");
      setTagList([]);
      setOptIn("pending");
      setNotes("");
      setTouched(false);
      setServerError(null);
    }
  }, [open]);

  const parsed = phone.trim() ? normalizePhone(phone, country) : null;
  const phoneError = !phone.trim() ? (touched ? "Enter a WhatsApp number" : null) : parsed && !parsed.ok ? (parsed.reason === "Too short" ? "That number is too short" : "That doesn't look like a valid phone number") : serverError;
  const emailError = email.trim() && !EMAIL_RE.test(email.trim()) ? "That email address looks incomplete" : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!parsed || !parsed.ok || emailError) return;
    setBusy(true);
    setServerError(null);
    try {
      const c = await post<Contact>("/api/contacts", {
        phone: parsed.e164,
        name: name.trim() || null,
        email: email.trim() || null,
        tags: tagList,
        opt_in: optIn,
        notes: notes.trim() || null,
      });
      toast.success(`Added ${c.name || formatPhone(c.phone)}`);
      await refresh("/api/contacts", "/api/tags", "/api/dashboard");
      onOpenChange(false);
      onCreated?.(c);
    } catch (err) {
      if (err instanceof ApiError && /already exists/i.test(err.message)) setServerError("A contact with this number already exists");
      else toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Add contact"
      description="Save one person. To add many at once, import a file instead."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="add-contact-form" loading={busy}>
            Add contact
          </Button>
        </>
      }
    >
      <form id="add-contact-form" onSubmit={submit} className="grid gap-4 pt-1" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="ac-name">
            <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoComplete="off" autoFocus />
          </Field>
          <Field
            label="WhatsApp number"
            htmlFor="ac-phone"
            error={phoneError}
            hint={
              parsed?.ok ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>{flagEmoji(parsed.country)}</span>
                  <span className="font-mono">{formatPhone(parsed.e164)}</span>
                  {parsed.country && <span>· {countryName(parsed.country)}</span>}
                </span>
              ) : (
                <>
                  Without a country code we read it as {countryName(country)} ({flagEmoji(country)}).
                </>
              )
            }
          >
            <Input id="ac-phone" value={phone} onChange={(e) => (setPhone(e.target.value), setServerError(null))} placeholder="+91 98765 43210" inputMode="tel" autoComplete="off" invalid={!!phoneError} />
          </Field>
        </div>

        <Field label="Email" htmlFor="ac-email" error={emailError}>
          <Input id="ac-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@example.com" autoComplete="off" invalid={!!emailError} />
        </Field>

        <Field label="Tags" hint="Press Enter or comma after each tag.">
          <TagInput value={tagList} onChange={setTagList} suggestions={(tags ?? []).map((t) => t.name)} aria-label="Tags" />
        </Field>

        <Field
          label="Opt-in status"
          htmlFor="ac-optin"
          hint={optIn === "opted_in" ? "Only choose this if they have agreed to receive WhatsApp messages from you." : "Unconfirmed contacts are saved but can't be messaged in campaigns until they opt in."}
        >
          <Select id="ac-optin" value={optIn} onValueChange={setOptIn} options={OPT_OPTIONS} />
        </Field>

        <Field label="Note" htmlFor="ac-note">
          <Textarea id="ac-note" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Where you met, what they asked for…" className="min-h-20" />
        </Field>
      </form>
    </Modal>
  );
}
