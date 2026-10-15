"use client";
import * as React from "react";
import { ArrowSquareOut, CursorClick, ListBullets, PaperPlaneRight, Plus, X } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { MessageBubble } from "@/components/wa/message-bubble";
import { LIMITS } from "@/lib/shared/template";
import { slugify } from "@/lib/shared/utils";
import type { Interactive, Message } from "@/lib/shared/types";
import type { Sender } from "./lib";

type Kind = "buttons" | "list" | "cta_url";
type Row = { title: string; description: string };
type Section = { title: string; rows: Row[] };

const MAX_SECTIONS = 5;
const BTN_LEN = 20;
const ROW_LEN = 24;
const ROW_DESC = 72;

function uniqueIds(titles: string[], fallback: string): string[] {
  const used = new Set<string>();
  return titles.map((t, i) => {
    const base = slugify(t).slice(0, 40) || `${fallback}_${i + 1}`;
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    return id;
  });
}

const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;

export function InteractiveModal({ open, onOpenChange, onSend }: { open: boolean; onOpenChange: (o: boolean) => void; onSend: Sender }) {
  const [kind, setKind] = React.useState<Kind>("buttons");
  const [body, setBody] = React.useState("");
  const [buttons, setButtons] = React.useState<string[]>(["", ""]);
  const [listButton, setListButton] = React.useState("View options");
  const [sections, setSections] = React.useState<Section[]>([{ title: "", rows: [{ title: "", description: "" }] }]);
  const [ctaText, setCtaText] = React.useState("");
  const [ctaUrl, setCtaUrl] = React.useState("https://");

  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  /** What would be sent, or why not. */
  const built = React.useMemo((): { ok: true; value: Interactive } | { ok: false; reason: string } => {
    if (!body.trim()) return { ok: false, reason: "Write the message first." };
    if (kind === "buttons") {
      const titles = buttons.map((b) => b.trim()).filter(Boolean);
      if (!titles.length) return { ok: false, reason: "Add at least one button." };
      if (new Set(titles.map((t) => t.toLowerCase())).size !== titles.length) return { ok: false, reason: "Button names must be different." };
      const ids = uniqueIds(titles, "btn");
      return { ok: true, value: { kind: "buttons", body: body.trim(), buttons: titles.map((title, i) => ({ id: ids[i], title })) } };
    }
    if (kind === "list") {
      if (!listButton.trim()) return { ok: false, reason: "Name the button that opens the list." };
      const secs = sections
        .map((s) => ({ title: s.title.trim(), rows: s.rows.filter((r) => r.title.trim()) }))
        .filter((s) => s.rows.length);
      if (!secs.length) return { ok: false, reason: "Add at least one row." };
      const allTitles = secs.flatMap((s) => s.rows.map((r) => r.title.trim()));
      const ids = uniqueIds(allTitles, "row");
      let k = 0;
      return {
        ok: true,
        value: {
          kind: "list",
          body: body.trim(),
          button: listButton.trim(),
          sections: secs.map((s, i) => ({
            title: s.title || (secs.length === 1 ? "Options" : `Section ${i + 1}`),
            rows: s.rows.map((r) => ({ id: ids[k++], title: r.title.trim(), ...(r.description.trim() ? { description: r.description.trim() } : {}) })),
          })),
        },
      };
    }
    if (!ctaText.trim()) return { ok: false, reason: "Name the link button." };
    if (!URL_RE.test(ctaUrl.trim())) return { ok: false, reason: "Enter a full link starting with https://" };
    return { ok: true, value: { kind: "cta_url", body: body.trim(), display_text: ctaText.trim(), url: ctaUrl.trim() } };
  }, [body, kind, buttons, listButton, sections, ctaText, ctaUrl]);

  /** Lenient version for the live preview (placeholders instead of blanks). */
  const preview: Interactive = React.useMemo(() => {
    const b = body.trim() || "Your message appears here…";
    if (kind === "buttons") {
      const t = buttons.map((x, i) => x.trim() || (buttons.length > 1 || i > 0 ? `Button ${i + 1}` : "Button"));
      return { kind: "buttons", body: b, buttons: t.map((title, i) => ({ id: String(i), title })) };
    }
    if (kind === "list") return { kind: "list", body: b, button: listButton.trim() || "Options", sections: [] };
    return { kind: "cta_url", body: b, display_text: ctaText.trim() || "Open link", url: ctaUrl };
  }, [body, kind, buttons, listButton, ctaText, ctaUrl]);

  const previewMessage: Message = React.useMemo(
    () => ({
      id: "preview",
      workspace_id: "",
      conversation_id: "",
      contact_id: "",
      direction: "out",
      type: "interactive",
      body: preview.body,
      payload: { interactive: preview },
      status: "sent",
      wa_message_id: null,
      error_code: null,
      error_message: null,
      campaign_id: null,
      sent_by: null,
      created_at: new Date().toISOString(),
      sent_at: null,
      delivered_at: null,
      read_at: null,
    }),
    [preview],
  );

  const reset = () => {
    setBody("");
    setButtons(["", ""]);
    setListButton("View options");
    setSections([{ title: "", rows: [{ title: "", description: "" }] }]);
    setCtaText("");
    setCtaUrl("https://");
  };

  const submit = () => {
    if (!built.ok) return;
    onOpenChange(false);
    void onSend({ type: "interactive", interactive: built.value }).then((ok) => ok && reset());
  };

  const setRow = (si: number, ri: number, patch: Partial<Row>) =>
    setSections((s) => s.map((sec, i) => (i !== si ? sec : { ...sec, rows: sec.rows.map((r, j) => (j === ri ? { ...r, ...patch } : r)) })));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      className="min-h-[440px]"
      title="Interactive message"
      description="Let the customer answer with a tap instead of typing."
      footer={
        <>
          {!built.ok && <span className="mr-auto text-[13px] text-ink-3">{built.reason}</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!built.ok} onClick={submit} trailing={<PaperPlaneRight size={14} />}>
            Send message
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Segmented
            aria-label="Message type"
            value={kind}
            onValueChange={setKind}
            options={[
              { value: "buttons", label: "Reply buttons", icon: <CursorClick size={15} /> },
              { value: "list", label: "List", icon: <ListBullets size={15} /> },
              { value: "cta_url", label: "Link button", icon: <ArrowSquareOut size={15} /> },
            ]}
          />

          <Field label="Message" right={`${body.length}/1024`}>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1024} rows={3} placeholder="Which plan would you like to hear more about?" autoFocus />
          </Field>

          {kind === "buttons" && (
            <Field label="Buttons" hint={`Up to ${LIMITS.interactiveButtons} buttons, ${BTN_LEN} characters each. The customer taps one to reply.`}>
              <div className="space-y-2">
                {buttons.map((b, i) => (
                  <Input
                    key={i}
                    value={b}
                    maxLength={BTN_LEN}
                    aria-label={`Button ${i + 1}`}
                    placeholder={`Button ${i + 1}`}
                    onChange={(e) => setButtons((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                    trailing={
                      buttons.length > 1 ? (
                        <button type="button" aria-label={`Remove button ${i + 1}`} onClick={() => setButtons((arr) => arr.filter((_, j) => j !== i))} className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.07]">
                          <X size={13} />
                        </button>
                      ) : undefined
                    }
                  />
                ))}
                {buttons.length < LIMITS.interactiveButtons && (
                  <Button variant="ghost" size="sm" leading={<Plus size={14} weight="bold" />} onClick={() => setButtons((arr) => [...arr, ""])}>
                    Add button
                  </Button>
                )}
              </div>
            </Field>
          )}

          {kind === "list" && (
            <>
              <Field label="List button" hint={`The label on the button that opens the list (${BTN_LEN} characters).`}>
                <Input value={listButton} maxLength={BTN_LEN} onChange={(e) => setListButton(e.target.value)} placeholder="View options" />
              </Field>
              <div className="space-y-3">
                {sections.map((sec, si) => (
                  <div key={si} className="space-y-2 rounded-2xl bg-surface-2 p-3 hairline">
                    <div className="flex items-center gap-2">
                      <Input
                        className="flex-1"
                        value={sec.title}
                        maxLength={ROW_LEN}
                        aria-label={`Section ${si + 1} title`}
                        placeholder={sections.length === 1 ? "Section title (optional)" : `Section ${si + 1} title`}
                        onChange={(e) => setSections((s) => s.map((x, i) => (i === si ? { ...x, title: e.target.value } : x)))}
                      />
                      {sections.length > 1 && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove section ${si + 1}`} onClick={() => setSections((s) => s.filter((_, i) => i !== si))}>
                          <X size={15} />
                        </Button>
                      )}
                    </div>
                    {sec.rows.map((r, ri) => (
                      <div key={ri} className="grid gap-2 sm:grid-cols-2">
                        <Input value={r.title} maxLength={ROW_LEN} aria-label={`Row ${ri + 1} title`} placeholder={`Row ${ri + 1}`} onChange={(e) => setRow(si, ri, { title: e.target.value })} />
                        <Input
                          value={r.description}
                          maxLength={ROW_DESC}
                          aria-label={`Row ${ri + 1} description`}
                          placeholder="Description (optional)"
                          onChange={(e) => setRow(si, ri, { description: e.target.value })}
                          trailing={
                            sec.rows.length > 1 ? (
                              <button
                                type="button"
                                aria-label={`Remove row ${ri + 1}`}
                                onClick={() => setSections((s) => s.map((x, i) => (i === si ? { ...x, rows: x.rows.filter((_, j) => j !== ri) } : x)))}
                                className="grid size-6 place-items-center rounded-full hover:bg-ink/[0.07]"
                              >
                                <X size={13} />
                              </button>
                            ) : undefined
                          }
                        />
                      </div>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={totalRows >= LIMITS.listRows}
                      leading={<Plus size={14} weight="bold" />}
                      onClick={() => setSections((s) => s.map((x, i) => (i === si ? { ...x, rows: [...x.rows, { title: "", description: "" }] } : x)))}
                    >
                      Add row
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={sections.length >= MAX_SECTIONS || totalRows >= LIMITS.listRows}
                    leading={<Plus size={14} weight="bold" />}
                    onClick={() => setSections((s) => [...s, { title: "", rows: [{ title: "", description: "" }] }])}
                  >
                    Add section
                  </Button>
                  <span className="tabular text-xs text-ink-3">
                    {totalRows}/{LIMITS.listRows} rows
                  </span>
                </div>
              </div>
            </>
          )}

          {kind === "cta_url" && (
            <>
              <Field label="Button label" right={`${ctaText.length}/${BTN_LEN}`}>
                <Input value={ctaText} maxLength={BTN_LEN} onChange={(e) => setCtaText(e.target.value)} placeholder="View pricing" />
              </Field>
              <Field label="Link" hint="Opens in the customer's browser.">
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://digibind.media/pricing" inputMode="url" autoCapitalize="none" spellCheck={false} />
              </Field>
            </>
          )}
        </div>

        <div className="md:sticky md:top-0 md:self-start">
          <p className="mb-2 text-[13px] font-medium text-ink-2">Preview</p>
          <div className="wa-wallpaper min-h-[200px] rounded-2xl p-3 hairline">
            <MessageBubble m={previewMessage} />
            {kind === "list" && (
              <div className="mt-2 rounded-xl bg-bubble-in/95 p-2 text-[12.5px] shadow-btn">
                {(sections.some((s) => s.rows.some((r) => r.title.trim())) ? sections : []).map((s, i) => (
                  <div key={i} className="px-1.5 py-1">
                    {s.title.trim() && <p className="text-[11.5px] font-medium text-ink-3">{s.title}</p>}
                    {s.rows
                      .filter((r) => r.title.trim())
                      .map((r, j) => (
                        <p key={j} className="mt-1 break-words">
                          {r.title}
                          {r.description.trim() && <span className="block text-[11.5px] text-ink-3">{r.description}</span>}
                        </p>
                      ))}
                  </div>
                ))}
                {!sections.some((s) => s.rows.some((r) => r.title.trim())) && <p className="px-1.5 py-1 text-ink-3">Rows appear here as you add them.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
