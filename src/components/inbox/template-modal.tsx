"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MagnifyingGlass, PaperPlaneRight, Stack, UserCircle } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, EmptyState, Skeleton } from "@/components/ui/display";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { TemplateBubble } from "@/components/wa/template-bubble";
import { templateSlots, type VarSlot } from "@/lib/shared/template";
import { countryName, formatPhone } from "@/lib/shared/phone";
import { clock, cn, firstName } from "@/lib/shared/utils";
import type { Contact, Template, TemplateContent } from "@/lib/shared/types";
import type { Sender } from "./lib";

const GREETING = /(?:^|\b(?:hi|hello|hey|hii|dear|namaste|hola)[\s,:-]*)$/i;

/** First-name guess for the first body/header variable: "Hi {{1}}", "{{1}}, join…" or a single-word sample. */
function looksLikeName(slot: VarSlot, content: TemplateContent): boolean {
  if (slot.key === "body.1") {
    const before = content.body.split(/\{\{\s*1\s*\}\}/)[0] ?? "";
    if (GREETING.test(before.trim() ? before.trim() + " " : "")) return true;
  }
  if (slot.key === "header.1" && content.header?.format === "TEXT") {
    const before = content.header.text.split(/\{\{\s*1\s*\}\}/)[0] ?? "";
    if (GREETING.test(before.trim() ? before.trim() + " " : "")) return true;
  }
  return slot.key.endsWith(".1") && /^[A-Z][a-z]+$/.test(slot.sample.trim());
}

function labelFor(s: VarSlot): string {
  const m = /^body\.(\d+)$/.exec(s.key);
  if (m) return `Variable ${m[1]}`;
  if (s.key === "header.1") return "Header variable";
  return s.label;
}

function prefill(tpl: Template, contact: Contact | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of templateSlots(tpl.content)) {
    if (s.kind === "code") out[s.key] = s.sample;
    else if (s.kind === "text" && contact && looksLikeName(s, tpl.content)) {
      const f = firstName(contact.name);
      if (f) out[s.key] = f;
    }
  }
  return out;
}

function contactChoices(c: Contact | undefined): { label: string; value: string }[] {
  if (!c) return [];
  const list: { label: string; value: string }[] = [];
  const f = firstName(c.name);
  if (f) list.push({ label: "First name", value: f });
  if (c.name?.trim()) list.push({ label: "Full name", value: c.name.trim() });
  list.push({ label: "Phone", value: formatPhone(c.phone) });
  if (c.email) list.push({ label: "Email", value: c.email });
  if (c.country) list.push({ label: "Country", value: countryName(c.country) });
  for (const [k, v] of Object.entries(c.attributes ?? {})) if (v) list.push({ label: k.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), value: v });
  return list;
}

export function TemplateModal({
  open,
  onOpenChange,
  templates,
  contact,
  onSend,
  windowClosed,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** approved templates; undefined while loading */
  templates: Template[] | undefined;
  contact: Contact | undefined;
  onSend: Sender;
  windowClosed: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
      setValues({});
      setTouched(false);
    }
  }, [open]);

  const selected = templates?.find((t) => t.id === selectedId) ?? null;
  const slots = React.useMemo(() => (selected ? templateSlots(selected.content) : []), [selected]);
  const fillable = slots.filter((s) => s.kind !== "media");
  const mediaSlots = slots.filter((s) => s.kind === "media");
  const missing = fillable.filter((s) => s.kind !== "code" && !values[s.key]?.trim());

  const choose = (t: Template) => {
    setSelectedId(t.id);
    setValues(prefill(t, contact));
    setTouched(false);
  };

  const list = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return (templates ?? []).filter((t) => !q || t.name.includes(q) || t.content.body.toLowerCase().includes(q));
  }, [templates, search]);

  const choices = contactChoices(contact);

  const submit = () => {
    if (!selected) return;
    if (missing.length) {
      setTouched(true);
      return;
    }
    const clean: Record<string, string> = {};
    for (const s of fillable) {
      const v = values[s.key]?.trim();
      if (v) clean[s.key] = v;
    }
    onOpenChange(false);
    void onSend({ type: "template", template_id: selected.id, values: clean });
  };

  const urlPrefix = (slot: VarSlot): string | null => {
    const m = /^button\.(\d+)\.1$/.exec(slot.key);
    const b = m ? selected?.content.buttons[Number(m[1])] : undefined;
    return b && b.type === "URL" ? b.url.replace(/\{\{\s*1\s*\}\}/, "") : null;
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title="Send a template"
      description={windowClosed ? "The reply window is closed, so only an approved template can reach this customer." : "Approved templates can be sent at any time."}
      footer={
        <>
          {selected && missing.length > 0 && touched && <span className="mr-auto text-[13px] text-danger">Fill in {labelFor(missing[0]).toLowerCase()}.</span>}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!selected} onClick={submit} trailing={<PaperPlaneRight size={14} />}>
            Send template
          </Button>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[250px_minmax(0,1fr)]">
        {/* picker */}
        <div className={cn("min-w-0", selected && "hidden md:block")}>
          <Input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" aria-label="Search templates" leading={<MagnifyingGlass size={16} />} />
          <div className="-mx-1 mt-2 max-h-[min(440px,55dvh)] overflow-y-auto px-1">
            {!templates ? (
              <div className="space-y-2 pt-1" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] rounded-xl" />
                ))}
              </div>
            ) : templates.length === 0 ? (
              <EmptyState
                className="px-2 py-8"
                icon={<Stack />}
                title="No approved templates"
                description="Create a template and get it approved before messaging outside the 24-hour window."
                action={
                  <Link href="/templates" className={buttonVariants({ variant: "secondary", size: "sm" })}>
                    Go to templates
                  </Link>
                }
              />
            ) : list.length === 0 ? (
              <p className="px-2 py-8 text-center text-[13px] text-ink-3">No template matches “{search}”.</p>
            ) : (
              <ul className="space-y-1 pt-1">
                {list.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => choose(t)}
                      aria-pressed={t.id === selectedId}
                      className={cn("block w-full rounded-xl px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60", t.id === selectedId ? "bg-ink/[0.07]" : "hover:bg-ink/[0.045]")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-[12.5px] font-medium">{t.name}</span>
                        <Badge size="sm" tone={t.category === "MARKETING" ? "violet" : t.category === "UTILITY" ? "info" : "neutral"}>
                          {t.category === "MARKETING" ? "Marketing" : t.category === "UTILITY" ? "Utility" : "Auth"}
                        </Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 break-words text-[12.5px] leading-snug text-ink-3">{t.content.body}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* fill + preview */}
        <div className={cn("min-w-0", !selected && "hidden md:block")}>
          {!selected ? (
            <div className="grid h-full min-h-[240px] place-items-center rounded-2xl bg-surface-2 p-8 text-center text-sm text-ink-3 hairline">Choose a template to fill it in and preview how it will look.</div>
          ) : (
            <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_290px]">
              <div className="min-w-0 space-y-4">
                <div>
                  <button type="button" onClick={() => setSelectedId(null)} className="mb-2 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink md:hidden">
                    <ArrowLeft size={14} /> All templates
                  </button>
                  <p className="truncate font-mono text-sm font-medium">{selected.name}</p>
                  <p className="mt-0.5 text-[13px] text-ink-3">
                    Sending to <span className="font-medium text-ink-2">{contact?.name?.trim() || formatPhone(contact?.phone)}</span>
                  </p>
                </div>

                {fillable.length === 0 ? (
                  <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-ink-3 hairline">This template has no variables to fill in.</p>
                ) : (
                  fillable.map((s) => {
                    const prefix = s.kind === "url" ? urlPrefix(s) : null;
                    const example = prefix && s.sample.startsWith(prefix) ? s.sample.slice(prefix.length) : s.sample;
                    const err = touched && s.kind !== "code" && !values[s.key]?.trim();
                    return (
                      <Field
                        key={s.key}
                        label={labelFor(s)}
                        hint={prefix ? `Added to the end of ${prefix}${example ? ` · Example: ${example}` : ""}` : s.sample ? `Example: ${s.sample}` : undefined}
                        error={err ? "Required" : undefined}
                      >
                        <Input
                          value={values[s.key] ?? ""}
                          invalid={err}
                          onChange={(e) => setValues((v) => ({ ...v, [s.key]: e.target.value }))}
                          aria-label={labelFor(s)}
                          placeholder={example}
                          trailing={
                            s.kind === "text" && choices.length ? (
                              <Menu>
                                <MenuTrigger asChild>
                                  <button type="button" aria-label="Insert from contact" className="grid size-7 place-items-center rounded-full hover:bg-ink/[0.07]">
                                    <UserCircle size={17} />
                                  </button>
                                </MenuTrigger>
                                <MenuContent className="max-h-72 overflow-y-auto">
                                  <MenuLabel>Insert from contact</MenuLabel>
                                  <MenuSeparator />
                                  {choices.map((c) => (
                                    <MenuItem key={c.label} onSelect={() => setValues((v) => ({ ...v, [s.key]: c.value }))} shortcut={<span className="max-w-[110px] truncate">{c.value}</span>}>
                                      {c.label}
                                    </MenuItem>
                                  ))}
                                </MenuContent>
                              </Menu>
                            ) : undefined
                          }
                        />
                      </Field>
                    );
                  })
                )}

                {mediaSlots.length > 0 && (
                  <p className="text-[13px] text-ink-3">
                    {mediaSlots.length === 1 ? `The ${mediaSlots[0].mediaFormat?.toLowerCase() ?? "media"} from the template is included.` : "The media from the template is included."}
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="mb-2 text-[13px] font-medium text-ink-2">Preview</p>
                <div className="wa-wallpaper rounded-2xl p-3 hairline">
                  <TemplateBubble content={selected.content} values={values} time={clock(new Date().toISOString())} status="sent" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
