"use client";
import * as React from "react";
import { Check, Cards, FileText, ImageSquare, Plus, TextT, VideoCamera } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { Select } from "@/components/ui/select";
import { MediaUploader } from "@/components/media-uploader";
import { TEMPLATE_LANGUAGES } from "@/lib/shared/constants";
import { LIMITS, varIndexes } from "@/lib/shared/template";
import type { MediaFormat, TemplateCategory, TemplateHeader } from "@/lib/shared/types";
import { toast } from "sonner";
import { cn } from "@/lib/shared/utils";
import { ButtonsEditor } from "./buttons-editor";
import { Counter, FieldIssues, useIssues } from "./issues";
import { finalSlug, insertButton, liveSlug, makeButton, moveItem, patchButton, type ButtonType, type EButton, type EContent, type Format } from "./model";
import { VariableText } from "./variable-text";

const Section = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <Card id={id} className="scroll-mt-6">
    {children}
  </Card>
);

/* ───────── basics ───────── */

const GUIDE: Partial<Record<TemplateCategory, { title: string; line: string }>> = {
  MARKETING: { title: "Marketing", line: "Offers, launches, invites and reminders to buy." },
  UTILITY: { title: "Utility", line: "Updates on something the customer already did, like an order, booking or payment." },
};

export function BasicsSection({
  name,
  language,
  category,
  taken,
  serverError,
  onName,
  onLanguage,
  onCategory,
}: {
  name: string;
  language: string;
  category: TemplateCategory;
  taken: boolean;
  serverError: string | null;
  onName: (v: string) => void;
  onLanguage: (v: string) => void;
  onCategory: (v: TemplateCategory) => void;
}) {
  const { touch, invalid, readOnly } = useIssues();
  const ok = name.length > 0 && !taken && !invalid("name") && !serverError;
  return (
    <Section id="sec-basics">
      <CardHeader title="Basics" description="How the template is named and categorised for WhatsApp." />
      <div className="flex flex-col gap-5">
        <Field label="Template name" htmlFor="tpl-name" right={ok && !readOnly ? <span className="inline-flex items-center gap-1 text-accent-ink"><Check size={12} weight="bold" /> Looks good</span> : undefined}>
          <Input
            id="tpl-name"
            value={name}
            maxLength={LIMITS.name}
            autoComplete="off"
            spellCheck={false}
            placeholder="diwali_offer_2026"
            className="font-mono"
            invalid={invalid("name") || !!serverError}
            onChange={(e) => {
              onName(liveSlug(e.target.value));
              touch("name");
            }}
            onBlur={() => {
              onName(finalSlug(name));
              touch("name");
            }}
          />
          <FieldIssues path="name" extra={serverError} />
          {!invalid("name") && !serverError && !readOnly && (
            <p className="text-xs leading-relaxed text-ink-3">Type a normal title and it is formatted as lowercase_with_underscores. You can&apos;t rename a template after it is submitted.</p>
          )}
        </Field>

        <Field label="Category">
          <Segmented<TemplateCategory>
            aria-label="Category"
            value={category}
            onValueChange={onCategory}
            className={cn("self-start", readOnly && "pointer-events-none")}
            options={[
              { value: "MARKETING", label: "Marketing" },
              { value: "UTILITY", label: "Utility" },
              ...(category === "AUTHENTICATION" ? [{ value: "AUTHENTICATION" as const, label: "Authentication" }] : []),
            ]}
          />
          <dl className="mt-1 grid gap-1.5">
            {(["MARKETING", "UTILITY"] as const).map((c) => (
              <div key={c} className={cn("flex items-baseline gap-2 text-xs leading-relaxed transition-colors duration-300", category === c ? "text-ink-2" : "text-ink-4")}>
                <dt className="w-[68px] shrink-0 font-medium">{GUIDE[c]!.title}</dt>
                <dd>{GUIDE[c]!.line}</dd>
              </div>
            ))}
          </dl>
        </Field>

        <Field label="Language" htmlFor="tpl-lang" hint="Recipients see this version when their WhatsApp is set to this language.">
          <Select
            id="tpl-lang"
            value={language}
            onValueChange={onLanguage}
            className="max-w-xs"
            options={TEMPLATE_LANGUAGES.map((l) => ({
              value: l.code,
              label: (
                <>
                  {l.name} <span className="font-mono text-xs text-ink-4">{l.code}</span>
                </>
              ),
            }))}
          />
        </Field>
      </div>
    </Section>
  );
}

/* ───────── format + header ───────── */

const FORMATS: { value: Format; label: string; icon: React.ReactNode; line: string }[] = [
  { value: "TEXT", label: "Text", icon: <TextT size={15} />, line: "A text message, with an optional header line above it." },
  { value: "IMAGE", label: "Image", icon: <ImageSquare size={15} />, line: "An image on top of the message. Upload a sample for review; each campaign can send its own image." },
  { value: "VIDEO", label: "Video", icon: <VideoCamera size={15} />, line: "A video on top of the message. Upload a sample for review; each campaign can send its own video." },
  { value: "DOCUMENT", label: "Document", icon: <FileText size={15} />, line: "A file such as a PDF catalogue or invoice attached to the message." },
  { value: "CAROUSEL", label: "Carousel", icon: <Cards size={15} />, line: "Swipeable cards, each with its own media, text and buttons, under a short message. No footer or message-level buttons." },
];

export function FormatSection({
  format,
  header,
  onFormat,
  onHeader,
}: {
  format: Format;
  header: TemplateHeader | null | undefined;
  onFormat: (f: Format) => void;
  onHeader: (h: TemplateHeader | null) => void;
}) {
  const { readOnly } = useIssues();
  const current = FORMATS.find((f) => f.value === format)!;
  return (
    <Section id="sec-format">
      <CardHeader title="Format" description="What the message is made of." />
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Format" className={cn("grid grid-cols-3 gap-2 sm:grid-cols-5", readOnly && "pointer-events-none")}>
          {FORMATS.map((f) => {
            const on = f.value === format;
            return (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onFormat(f.value)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1.5 py-3 text-[13px] font-medium outline-none transition-[background-color,color,box-shadow,transform] duration-300 ease-fluid focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]",
                  on ? "bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1.5px_var(--accent-line)]" : "bg-surface-2 text-ink-3 hairline hover:bg-surface-3/70 hover:text-ink",
                )}
              >
                <span className="[&_svg]:size-5">{f.icon}</span>
                <span className="max-w-full truncate">{f.label}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">{current.line}</p>

        {format === "TEXT" && <TextHeader header={header?.format === "TEXT" ? header : null} onChange={onHeader} />}
        {(format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") && header && header.format !== "TEXT" && <MediaHeader format={format} header={header} onChange={onHeader} />}
      </div>
    </Section>
  );
}

function TextHeader({ header, onChange }: { header: Extract<TemplateHeader, { format: "TEXT" }> | null; onChange: (h: TemplateHeader | null) => void }) {
  const { touch, invalid } = useIssues();
  const ref = React.useRef<HTMLInputElement>(null);
  const text = header?.text ?? "";
  const hasVar = varIndexes(text).length > 0;
  const set = (t: string, example?: string) => {
    onChange(t ? { format: "TEXT", text: t, example: example ?? header?.example } : null);
    touch("header");
  };
  const addVar = () => {
    const el = ref.current;
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    set(text.slice(0, at) + "{{1}}" + text.slice(end));
  };
  return (
    <div className="flex flex-col gap-3">
      <Field label="Header (optional)" htmlFor="tpl-header" right={<Counter n={text.length} max={LIMITS.headerText} />}>
        <Input
          id="tpl-header"
          ref={ref}
          value={text}
          placeholder="e.g. Your order is on its way"
          invalid={invalid("header")}
          onChange={(e) => set(e.target.value)}
          onBlur={() => touch("header")}
          trailing={
            <Button variant="soft" size="xs" leading={<Plus size={12} weight="bold" />} disabled={hasVar} onMouseDown={(e) => e.preventDefault()} onClick={addVar} title={hasVar ? "A header allows one variable" : undefined}>
              Variable
            </Button>
          }
          className="[&_input]:pr-24"
        />
        <FieldIssues path="header" />
      </Field>
      {hasVar && (
        <Field label={<>Sample for <span className="font-mono text-accent-ink">{"{{1}}"}</span></>} htmlFor="tpl-header-ex">
          <Input
            id="tpl-header-ex"
            value={header?.example ?? ""}
            placeholder="e.g. Aarav"
            invalid={invalid("header.example")}
            onChange={(e) => {
              onChange({ format: "TEXT", text, example: e.target.value });
              touch("header.example");
            }}
            onBlur={() => touch("header.example")}
          />
          <FieldIssues path="header.example" />
        </Field>
      )}
    </div>
  );
}

function MediaHeader({ format, header, onChange }: { format: MediaFormat; header: Exclude<TemplateHeader, { format: "TEXT" }>; onChange: (h: TemplateHeader | null) => void }) {
  const { touch, readOnly } = useIssues();
  return (
    <div className="flex flex-col gap-3">
      <div className={readOnly ? "pointer-events-none" : ""}>
        <MediaUploader
          format={format}
          url={header.media_url}
          filename={header.filename}
          onChange={(u) => {
            if (u.kind !== format.toLowerCase()) return void toast.error(`That file is ${u.kind === "image" ? "an image" : `a ${u.kind}`}, not a ${format.toLowerCase()}.`);
            onChange({ format, media_url: u.url, ...(format === "DOCUMENT" ? { filename: u.filename } : {}) });
            touch("header");
          }}
          onClear={() => onChange({ format })}
        />
      </div>
      <FieldIssues path="header" />
      {format === "DOCUMENT" && header.media_url && (
        <Field label="File name shown in the chat" htmlFor="tpl-filename">
          <Input id="tpl-filename" value={header.filename ?? ""} maxLength={200} placeholder="catalogue.pdf" onChange={(e) => onChange({ ...header, filename: e.target.value })} />
        </Field>
      )}
      <p className="text-xs leading-relaxed text-ink-3">This is the sample WhatsApp reviews. You choose the actual file for each campaign.</p>
    </div>
  );
}

/* ───────── message: body + footer ───────── */

export function MessageSection({
  content,
  carousel,
  optout,
  onBody,
  onExamples,
  onFooter,
}: {
  content: EContent;
  carousel: boolean;
  optout: string;
  onBody: (v: string) => void;
  onExamples: (v: string[]) => void;
  onFooter: (v: string) => void;
}) {
  const { touch, invalid, readOnly } = useIssues();
  const footer = content.footer ?? "";
  return (
    <Section id="sec-body">
      <CardHeader title="Message" description={carousel ? "The text above the cards." : "The main text. Use variables for anything that changes per person."} />
      <div className="flex flex-col gap-6">
        <VariableText
          id="tpl-body"
          value={content.body}
          onChange={onBody}
          samples={content.body_examples}
          onSamples={onExamples}
          max={LIMITS.body}
          path="body"
          examplePath={(n) => `body.example.${n}`}
          placeholder="Hi {{1}}, your order has shipped…"
          hint="*bold*  _italic_  ~strike~"
        />

        {!carousel && (
          <div className="border-t border-line pt-5">
            <Field label="Footer (optional)" htmlFor="tpl-footer" right={<Counter n={footer.length} max={LIMITS.footer} />}>
              <Input
                id="tpl-footer"
                value={footer}
                placeholder={optout}
                invalid={invalid("footer")}
                onChange={(e) => {
                  onFooter(e.target.value);
                  touch("footer");
                }}
                onBlur={() => touch("footer")}
              />
              <FieldIssues path="footer" />
              {!readOnly && footer !== optout && (
                <div>
                  <Button
                    variant={content.body && !footer ? "soft" : "ghost"}
                    size="xs"
                    leading={<Plus size={12} weight="bold" />}
                    onClick={() => {
                      onFooter(optout);
                      touch("footer");
                    }}
                  >
                    Add opt-out line
                  </Button>
                </div>
              )}
            </Field>
          </div>
        )}
      </div>
    </Section>
  );
}

/* ───────── buttons (non-carousel) ───────── */

const ALL_TYPES: ButtonType[] = ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"];

export function ButtonsSection({ buttons, setButtons }: { buttons: EButton[]; setButtons: (fn: (b: EButton[]) => EButton[]) => void }) {
  return (
    <Section id="sec-buttons">
      <CardHeader title="Buttons" description={`Optional, up to ${LIMITS.buttonsTotal}. Quick replies must sit together, either before or after the other buttons.`} />
      <ButtonsEditor
        buttons={buttons}
        types={ALL_TYPES}
        maxTotal={LIMITS.buttonsTotal}
        prefix="buttons"
        onAdd={(type) => {
          const b = makeButton(type);
          setButtons((list) => insertButton(list, b));
          return b._k!;
        }}
        onRemove={(i) => setButtons((list) => list.filter((_, k) => k !== i))}
        onMove={(i, dir) => setButtons((list) => moveItem(list, i, i + dir))}
        onPatch={(i, patch) => setButtons((list) => list.map((b, k) => (k === i ? patchButton(b, patch) : b)))}
      />
    </Section>
  );
}
