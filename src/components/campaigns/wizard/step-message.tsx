"use client";
import * as React from "react";
import { Check, MagnifyingGlass, Plus, SquaresFour, Warning } from "@phosphor-icons/react";
import { Badge, EmptyState, Inset, Skeleton } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CategoryBadge, TemplateStatusBadge } from "@/components/status";
import { MediaUploader } from "@/components/media-uploader";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { useTemplates, type TemplateRow } from "@/lib/client/hooks";
import { templateSlots, type VarSlot } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import type { Template, VarSource } from "@/lib/shared/types";
import { ButtonLink } from "../button-link";
import { SOURCE_OPTIONS, urlSuffixSample, type MappingState } from "../lib";
import { PreviewButton, type PreviewProps } from "./live-preview";
import { SectionTitle, StepHeader } from "./step-shell";

export function StepMessage({
  templateId,
  template,
  templateLoading,
  mapping,
  onPick,
  onSource,
  onMedia,
  preview,
}: {
  templateId: string | null;
  template: Template | undefined;
  templateLoading: boolean;
  mapping: MappingState;
  onPick: (t: TemplateRow) => void;
  onSource: (key: string, src: VarSource) => void;
  onMedia: (key: string, url: string | null) => void;
  preview: PreviewProps;
}) {
  const [picking, setPicking] = React.useState(!templateId);
  // if the template arrives later (prefill / loaded draft) keep the picker closed
  const showPicker = picking || (!templateId && !templateLoading);

  return (
    <div>
      <StepHeader
        title="Choose the message"
        description="Only templates approved by WhatsApp can be broadcast. Pick one, then decide what goes into each variable."
        action={<PreviewButton {...preview} />}
      />

      {showPicker ? (
        <TemplatePicker
          selectedId={templateId}
          onPick={(t) => {
            onPick(t);
            setPicking(false);
          }}
          onCancel={templateId ? () => setPicking(false) : undefined}
        />
      ) : templateLoading || !template ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : (
        <>
          <SelectedBar template={template} onChange={() => setPicking(true)} />
          <Personalise template={template} mapping={mapping} onSource={onSource} onMedia={onMedia} />
        </>
      )}
    </div>
  );
}

/* ───────── picker ───────── */

function TemplatePicker({ selectedId, onPick, onCancel }: { selectedId: string | null; onPick: (t: TemplateRow) => void; onCancel?: () => void }) {
  const { data, isLoading } = useTemplates({ status: "APPROVED" });
  const [q, setQ] = React.useState("");
  const [cat, setCat] = React.useState<"ALL" | "MARKETING" | "UTILITY">("ALL");

  const rows = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((t) => (cat === "ALL" || t.category === cat) && (!term || t.name.toLowerCase().includes(term) || t.content.body.toLowerCase().includes(term)));
  }, [data, q, cat]);

  return (
    <div>
      <div className="mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Input
            aria-label="Search templates"
            className="min-w-0 flex-1"
            leading={<MagnifyingGlass size={16} />}
            placeholder="Search templates"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ButtonLink href="/templates/new" variant="secondary" size="md" leading={<Plus size={14} />} className="shrink-0">
            <span className="max-sm:hidden">Create a new template</span>
            <span className="sm:hidden">New</span>
          </ButtonLink>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented
            size="sm"
            aria-label="Template category"
            value={cat}
            onValueChange={setCat}
            options={[
              { value: "ALL", label: "All" },
              { value: "MARKETING", label: "Marketing" },
              { value: "UTILITY", label: "Utility" },
            ]}
          />
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Keep current template
            </Button>
          )}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[268px] rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Inset>
          <EmptyState
            className="py-8"
            icon={<SquaresFour />}
            title={data?.length ? "No templates match" : "No approved templates yet"}
            description={data?.length ? "Try a different search or category." : "Create a template and submit it to WhatsApp. Once it’s approved it shows up here."}
            action={
              !data?.length ? (
                <ButtonLink href="/templates/new" variant="secondary" leading={<Plus size={14} />}>
                  Create a template
                </ButtonLink>
              ) : undefined
            }
          />
        </Inset>
      ) : (
        <div role="radiogroup" aria-label="Approved templates" className="grid gap-3 sm:grid-cols-2">
          {rows.map((t) => (
            <TemplateTile key={t.id} t={t} selected={t.id === selectedId} onPick={() => onPick(t)} />
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateTile({ t, selected, onPick }: { t: TemplateRow; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={cn(
        "group/tile relative flex flex-col gap-3 rounded-2xl p-2.5 text-left outline-none transition-[box-shadow,background-color,transform] duration-300 ease-fluid focus-visible:ring-2 focus-visible:ring-accent/60",
        selected ? "bg-accent-soft/60 shadow-[inset_0_0_0_1.5px_var(--accent)]" : "bg-surface hairline hover:-translate-y-px hover:bg-surface-2/70",
      )}
    >
      <div aria-hidden className="wa-wallpaper relative h-[184px] overflow-hidden rounded-xl hairline [mask-image:linear-gradient(to_bottom,black_78%,transparent)]">
        <div className="pointer-events-none absolute left-3 top-3 origin-top-left" style={{ width: 272, transform: "scale(0.72)" }}>
          <TemplateBubble content={t.content} highlight={false} className="animate-none" />
        </div>
      </div>
      <div className="min-w-0 px-1 pb-0.5">
        <p className="truncate font-mono text-[13px] font-medium">{t.name}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={t.category} />
          {t.kind === "carousel" && <Badge>Carousel</Badge>}
        </div>
        <p className="mt-2 text-xs text-ink-3">{t.usage?.campaigns ? `Used in ${t.usage.campaigns} campaign${t.usage.campaigns === 1 ? "" : "s"}` : "Not used yet"}</p>
      </div>
      {selected && (
        <span className="absolute right-4 top-4 grid size-6 place-items-center rounded-full bg-accent text-white shadow-btn">
          <Check size={13} weight="bold" />
        </span>
      )}
    </button>
  );
}

/* ───────── selected ───────── */

function SelectedBar({ template, onChange }: { template: Template; onChange: () => void }) {
  const approved = template.status === "APPROVED";
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4 hairline">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-medium">{template.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={template.category} />
            <TemplateStatusBadge status={template.status} />
            <span className="text-xs text-ink-3">{template.language}</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={onChange}>
          Change template
        </Button>
      </div>
      {!approved && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-[13px] text-warn">
          <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
          This template is {template.status.toLowerCase()}, so it can’t be broadcast. Choose an approved one to continue.
        </p>
      )}
    </div>
  );
}

/* ───────── variable mapping ───────── */

function Personalise({
  template,
  mapping,
  onSource,
  onMedia,
}: {
  template: Template;
  mapping: MappingState;
  onSource: (key: string, src: VarSource) => void;
  onMedia: (key: string, url: string | null) => void;
}) {
  const slots = React.useMemo(() => templateSlots(template.content), [template.content]);
  const media = slots.filter((s) => s.kind === "media");
  const text = slots.filter((s) => s.kind !== "media");

  if (!slots.length)
    return (
      <Inset className="mt-6 text-[13px] leading-relaxed text-ink-2">This template has no variables, so every contact receives exactly the same message.</Inset>
    );

  return (
    <div className="mt-8 space-y-8">
      {text.length > 0 && (
        <section>
          <SectionTitle title="Fill in the variables" description="Choose where each value comes from. The preview updates as you go." className="mb-4" />
          <div className="divide-y divide-line">
            {text.map((s) => (
              <VarRow
                key={s.key}
                slot={s}
                sample={s.kind === "url" ? urlSuffixSample(template.content, s.key, s.sample) : s.sample}
                src={mapping.variable_map[s.key]}
                onChange={(src) => onSource(s.key, src)}
              />
            ))}
          </div>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <SectionTitle title="Media" description="Each slot starts with the file the template was approved with. Replace it to send a different one in this campaign." className="mb-4" />
          <div className="grid gap-4 sm:grid-cols-2">
            {media.map((s) => {
              const replaced = !!mapping.media_map[s.key];
              return (
                <div key={s.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{s.label}</p>
                    <Badge tone={replaced ? "accent" : "neutral"} size="sm">
                      {replaced ? "Replaced" : "Template file"}
                    </Badge>
                  </div>
                  <MediaUploader
                    compact
                    format={s.mediaFormat ?? "IMAGE"}
                    url={mapping.media_map[s.key] || s.sample || undefined}
                    filename={template.content.header && "filename" in template.content.header && !replaced ? template.content.header.filename : undefined}
                    onChange={(u) => onMedia(s.key, u.url)}
                    onClear={replaced ? () => onMedia(s.key, null) : undefined}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function VarRow({ slot, sample, src, onChange }: { slot: VarSlot; sample: string; src: VarSource | undefined; onChange: (s: VarSource) => void }) {
  const source = src?.source ?? "static";
  const fallback = src && src.source !== "static" ? (src.fallback ?? "") : "";
  const idBase = `var-${slot.key}`;

  const switchTo = (next: VarSource["source"]) => {
    if (next === source) return;
    if (next === "static") return onChange({ source: "static", value: sample });
    if (next === "attribute") return onChange({ source: "attribute", key: "", fallback });
    onChange({ source: next, fallback: fallback || (next === "first_name" || next === "name" ? "there" : "") });
  };

  const missingFallback = src && src.source !== "static" && src.source !== "phone" && !fallback.trim();

  return (
    <div className="py-5 first:pt-0 last:pb-0">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">{slot.kind === "code" ? "Offer code" : slot.label}</p>
        {sample && (
          <p className="min-w-0 truncate text-xs text-ink-3">
            Sample: <span className="text-ink-2">{sample}</span>
          </p>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-[200px_minmax(0,1fr)]">
        <Select
          aria-label={`Source for ${slot.label}`}
          value={source}
          onValueChange={switchTo}
          options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        {src?.source === "static" || !src ? (
          <Input
            id={idBase}
            aria-label={`Text for ${slot.label}`}
            placeholder={sample || "Text to send"}
            value={src?.source === "static" ? src.value : ""}
            onChange={(e) => onChange({ source: "static", value: e.target.value })}
            invalid={!src || !src.value.trim()}
          />
        ) : src.source === "attribute" ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Input
              aria-label={`Custom field name for ${slot.label}`}
              placeholder="Field name, e.g. city"
              value={src.key}
              onChange={(e) => onChange({ ...src, key: e.target.value })}
              invalid={!src.key.trim()}
            />
            <Input aria-label={`Fallback for ${slot.label}`} placeholder="Fallback if empty" value={src.fallback ?? ""} onChange={(e) => onChange({ ...src, fallback: e.target.value })} />
          </div>
        ) : (
          <Input
            aria-label={`Fallback for ${slot.label}`}
            placeholder={src.source === "phone" ? "Always available" : "Fallback if empty, e.g. there"}
            disabled={src.source === "phone"}
            value={src.fallback ?? ""}
            onChange={(e) => onChange({ ...src, fallback: e.target.value })}
          />
        )}
      </div>
      {missingFallback && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warn">
          <Warning size={13} weight="fill" className="mt-px shrink-0" />
          Contacts without this field will fail to send. Add a fallback to cover them.
        </p>
      )}
    </div>
  );
}
