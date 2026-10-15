"use client";
import * as React from "react";
import { Phone } from "@phosphor-icons/react";
import { Card, CardHeader, PageHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/input";
import { useConfirm } from "@/components/confirm";
import { MiniChat } from "@/components/automations/chat-preview";
import { useConfig } from "@/lib/client/hooks";
import { normalizePhone, toWaId } from "@/lib/shared/phone";
import { QrCard } from "./qr-card";
import { SavedLinks, useSavedLinks, type SavedLink } from "./saved-links";
import { WebsiteChatButton } from "./chat-button";

const DEFAULT_MESSAGE = "Hi! I'd like to know more.";

const cleanKeyword = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24);

export function GrowthPage() {
  const { data: cfg } = useConfig();
  const confirm = useConfirm();
  const { links, add, remove } = useSavedLinks();

  const [phoneDraft, setPhoneDraft] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState(DEFAULT_MESSAGE);
  const [keyword, setKeyword] = React.useState("");

  const connected = cfg?.account && cfg.account.status !== "disconnected" ? cfg.account.display_phone_number : null;
  const phoneText = phoneDraft ?? connected ?? "";
  const country = cfg?.workspace.settings.default_country ?? "IN";

  const parsed = phoneText.trim() ? normalizePhone(phoneText, country) : null;
  const digits = parsed?.ok ? toWaId(parsed.e164) : null;
  const phoneError = phoneText.trim() && parsed && !parsed.ok ? "Enter a full number with country code, for example +91 98765 43210." : undefined;

  const kw = cleanKeyword(keyword);
  const text = [message.trim(), kw ? `[${kw.toUpperCase()}]` : ""].filter(Boolean).join(" ");
  const url = digits ? `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;

  const load = (l: SavedLink) => {
    setPhoneDraft(l.phone);
    setMessage(l.message);
    setKeyword(l.keyword);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const del = async (l: SavedLink) => {
    const ok = await confirm({ title: `Delete “${l.name}”?`, description: "The saved entry is removed from this browser. The link itself keeps working wherever you've shared it.", confirmLabel: "Delete", tone: "danger" });
    if (ok) remove(l.id);
  };

  return (
    <div>
      <PageHeader title="Links & QR" description="Let customers start a WhatsApp chat with one tap or one scan, with the message already typed." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="lg:col-start-1 lg:row-start-1" coreClassName="flex flex-col gap-5">
          <CardHeader className="mb-0" title="Link details" description="Everything updates as you type." />
          <Field
            label="WhatsApp number"
            htmlFor="wa-number"
            error={phoneError}
            hint={phoneDraft === null && connected ? "This is your connected number. Change it to link to a different one." : "Include the country code."}
          >
            <Input
              id="wa-number"
              value={phoneText}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="+91 98765 43210"
              inputMode="tel"
              autoComplete="off"
              invalid={!!phoneError}
              leading={<Phone size={16} />}
              className="[&_input]:font-mono"
            />
          </Field>
          <Field label="Prefilled message" htmlFor="wa-message" hint="What appears in the customer's message box. They still tap send themselves.">
            <Textarea id="wa-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={500} placeholder={DEFAULT_MESSAGE} />
          </Field>
          <Field label="Tracking keyword (optional)" htmlFor="wa-keyword" hint="People who message with this keyword can be tagged automatically.">
            <Input id="wa-keyword" value={keyword} onChange={(e) => setKeyword(cleanKeyword(e.target.value))} placeholder="SPRING24" autoCapitalize="characters" spellCheck={false} className="[&_input]:font-mono [&_input]:uppercase [&_input]:placeholder:normal-case" />
          </Field>
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">What people will send</p>
            <MiniChat reply={text || "Your message appears here…"} />
          </div>
        </Card>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <QrCard url={url} keyword={kw} fileBase={digits ? `wa-${digits}` : "wa-link"} onSave={(name) => add({ name, url: url!, phone: phoneText, message, keyword: kw })} />
        </div>

        <SavedLinks className="lg:col-start-1 lg:row-start-2" links={links} onLoad={load} onDelete={del} />
      </div>

      <div className="mt-6">
        <WebsiteChatButton url={url} />
      </div>
    </div>
  );
}
