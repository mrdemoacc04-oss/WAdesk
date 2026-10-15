"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, Info, Plus, Trash, Warning } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Sheet } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Segmented, Switch } from "@/components/ui/controls";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { TagInput } from "@/components/ui/tag-input";
import { Badge } from "@/components/ui/display";
import { post, patch, refresh, errorMessage } from "@/lib/client/api";
import { useConfig, useTags, useTemplates } from "@/lib/client/hooks";
import { templateSlots } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import type { AutomationAction, AutomationRule, AutomationTrigger, Template } from "@/lib/shared/types";
import { RulePreview } from "./chat-preview";
import {
  ACTION_META,
  ACTION_ORDER,
  BUTTON_TITLE_MAX,
  MAX_ACTIONS,
  MAX_BUTTONS,
  PRIORITY_VALUE,
  TRIGGER_META,
  blankAction,
  priorityKey,
  withButtonIds,
  type PriorityKey,
  type RuleDraft,
} from "./rule-utils";

type KeyedAction = { key: string; action: AutomationAction };

let keySeq = 0;
const nextKey = () => `a${++keySeq}`;

interface Draft {
  name: string;
  enabled: boolean;
  priority: number;
  trigger: AutomationTrigger;
  actions: KeyedAction[];
}

function toDraft(src: RuleDraft | null): Draft {
  if (!src) {
    return {
      name: "",
      enabled: true,
      priority: PRIORITY_VALUE.normal,
      trigger: { type: "keyword", match: "contains", keywords: [] },
      actions: [{ key: nextKey(), action: blankAction("send_text") }],
    };
  }
  return {
    name: src.name,
    enabled: src.enabled,
    priority: src.priority,
    trigger: structuredClone(src.trigger),
    actions: src.actions.map((a) => ({ key: nextKey(), action: structuredClone(a) })),
  };
}

type Errors = { name?: string; keywords?: string; actions?: string; byAction: Record<string, string> };

function validate(d: Draft): Errors {
  const e: Errors = { byAction: {} };
  if (!d.name.trim()) e.name = "Give the rule a name so you can find it later.";
  if (d.trigger.type === "keyword" && d.trigger.keywords.length === 0) e.keywords = "Add at least one keyword.";
  if (d.actions.length === 0) e.actions = "Add at least one action.";
  for (const { key, action: a } of d.actions) {
    if (a.type === "send_text" && !a.body.trim()) e.byAction[key] = "Write the message to send.";
    else if (a.type === "send_buttons") {
      if (!a.body.trim()) e.byAction[key] = "Write the message that goes above the buttons.";
      else if (!a.buttons.some((b) => b.title.trim())) e.byAction[key] = "Add at least one button.";
    } else if (a.type === "send_template" && !a.template_id) e.byAction[key] = "Choose a template.";
    else if ((a.type === "add_tag" || a.type === "remove_tag") && !a.tag.trim()) e.byAction[key] = "Enter a tag.";
    else if (a.type === "assign" && !a.user_id) e.byAction[key] = "Choose a teammate.";
  }
  return e;
}

const hasErrors = (e: Errors) => !!(e.name || e.keywords || e.actions || Object.keys(e.byAction).length);

/* ───────── pieces ───────── */

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
        {hint && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function TagField({ value, onChange, invalid, suggestions, label }: { value: string; onChange: (v: string) => void; invalid?: boolean; suggestions: string[]; label: string }) {
  const hits = suggestions.filter((s) => s !== value.toLowerCase().trim()).slice(0, 6);
  return (
    <div className="space-y-2">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="For example: lead" aria-label={label} invalid={invalid} maxLength={40} />
      {hits.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-3">Your tags</span>
          {hits.map((t) => (
            <button key={t} type="button" onClick={() => onChange(t)} className="h-6 rounded-full bg-ink/[0.06] px-2.5 text-xs text-ink-2 transition-colors hover:bg-ink/[0.1]">
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  index,
  total,
  item,
  error,
  templates,
  tagNames,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  item: KeyedAction;
  error?: string;
  templates: Template[];
  tagNames: string[];
  onChange: (a: AutomationAction) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { data: cfg } = useConfig();
  const a = item.action;
  const meta = ACTION_META[a.type];
  const Icon = meta.icon;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className={cn("rounded-2xl bg-surface-2 p-4 hairline", error && "shadow-[inset_0_0_0_1.5px_var(--danger)]")}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface text-ink-2 hairline">
          <Icon size={16} />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-medium">
          <span className="tabular mr-1.5 text-ink-3">{index + 1}.</span>
          {meta.label}
        </p>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-xs" aria-label="Move action up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp size={14} />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Move action down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown size={14} />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Remove action" onClick={onRemove}>
            <Trash size={14} />
          </Button>
        </div>
      </div>

      {a.type === "send_text" && (
        <Field hint={<>Use <code className="font-mono text-ink-2">{"{{first_name}}"}</code> or <code className="font-mono text-ink-2">{"{{name}}"}</code> to personalise. You can also use *bold* and _italic_.</>}>
          <Textarea value={a.body} onChange={(e) => onChange({ ...a, body: e.target.value })} placeholder="Hi {{first_name}}, thanks for getting in touch…" rows={4} maxLength={1024} invalid={!!error} aria-label="Message text" />
        </Field>
      )}

      {a.type === "send_buttons" && (
        <div className="space-y-3">
          <Textarea value={a.body} onChange={(e) => onChange({ ...a, body: e.target.value })} placeholder="The message that goes above the buttons. {{first_name}} works here too." rows={3} maxLength={1024} invalid={!!error} aria-label="Message above the buttons" />
          <div className="space-y-2">
            {a.buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  value={b.title}
                  maxLength={BUTTON_TITLE_MAX}
                  onChange={(e) => onChange({ ...a, buttons: a.buttons.map((x, n) => (n === i ? { ...x, title: e.target.value } : x)) })}
                  placeholder={`Button ${i + 1}`}
                  aria-label={`Button ${i + 1} title`}
                  trailing={<span className={cn("tabular text-[11px]", b.title.length >= BUTTON_TITLE_MAX ? "text-warn" : "text-ink-4")}>{b.title.length}/{BUTTON_TITLE_MAX}</span>}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove button ${i + 1}`} disabled={a.buttons.length <= 1} onClick={() => onChange({ ...a, buttons: a.buttons.filter((_, n) => n !== i) })}>
                  <Trash size={15} />
                </Button>
              </div>
            ))}
            {a.buttons.length < MAX_BUTTONS && (
              <Button variant="ghost" size="sm" leading={<Plus size={14} />} onClick={() => onChange({ ...a, buttons: [...a.buttons, { id: "", title: "" }] })}>
                Add button
              </Button>
            )}
          </div>
        </div>
      )}

      {a.type === "send_template" && <TemplatePicker value={a.template_id} templates={templates} invalid={!!error} onChange={(id) => onChange({ ...a, template_id: id })} />}

      {(a.type === "add_tag" || a.type === "remove_tag") && (
        <TagField value={a.tag} onChange={(tag) => onChange({ ...a, tag })} invalid={!!error} suggestions={tagNames} label={a.type === "add_tag" ? "Tag to add" : "Tag to remove"} />
      )}

      {a.type === "assign" && (
        <Select
          value={a.user_id || undefined}
          onValueChange={(user_id) => onChange({ ...a, user_id })}
          placeholder="Choose a teammate"
          aria-label="Teammate"
          options={(cfg?.members ?? []).map((m) => ({ value: m.user_id, label: m.name, description: m.role === "owner" ? "Owner" : m.role === "admin" ? "Admin" : "Agent" }))}
        />
      )}

      {a.type === "opt_out" && <p className="text-[13px] leading-relaxed text-ink-3">The contact is marked as opted out and left out of broadcasts from now on.</p>}
      {a.type === "opt_in" && <p className="text-[13px] leading-relaxed text-ink-3">The contact is marked as opted in and can receive broadcasts.</p>}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </motion.li>
  );
}

function TemplatePicker({ value, templates, invalid, onChange }: { value: string; templates: Template[]; invalid?: boolean; onChange: (id: string) => void }) {
  const chosen = templates.find((t) => t.id === value);
  const slots = chosen ? templateSlots(chosen.content).filter((s) => s.kind === "text").length : 0;
  return (
    <div className="space-y-2.5">
      <Select
        value={value || undefined}
        onValueChange={onChange}
        placeholder={templates.length ? "Choose an approved template" : "No approved templates yet"}
        aria-label="Template"
        className={invalid ? "shadow-[inset_0_0_0_1.5px_var(--danger)]" : undefined}
        options={templates.map((t) => {
          const n = templateSlots(t.content).filter((s) => s.kind === "text").length;
          return { value: t.id, label: <span className="font-mono text-[13px]">{t.name}</span>, description: `${t.category.toLowerCase()} · ${t.language}${n ? ` · ${n} variable${n === 1 ? "" : "s"}` : ""}` };
        })}
      />
      {!templates.length && <p className="text-xs text-ink-3">Only approved templates can be sent. Create one on the Templates page and wait for approval.</p>}
      {chosen && slots > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
          <Warning size={14} className="mt-0.5 shrink-0" weight="fill" />
          This template has {slots} variable{slots === 1 ? "" : "s"}. An automation can&apos;t fill them in, so WhatsApp may reject the message. A template without variables works best here.
        </p>
      )}
    </div>
  );
}

/* ───────── editor ───────── */

export function RuleEditor({ open, onOpenChange, rule, seed }: { open: boolean; onOpenChange: (o: boolean) => void; rule: AutomationRule | null; seed: RuleDraft | null }) {
  const { data: cfg } = useConfig();
  const { data: approved } = useTemplates({ status: "APPROVED" });
  const { data: tags } = useTags();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(rule ?? seed));
  const [saving, setSaving] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const templates = React.useMemo<Template[]>(() => approved ?? [], [approved]);
  const templateMap = React.useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const tagNames = React.useMemo(() => (tags ?? []).map((t) => t.name), [tags]);
  const errors = validate(draft);
  const show = submitted ? errors : ({ byAction: {} } as Errors);
  const editing = !!rule;

  const set = (patchDraft: Partial<Draft>) => setDraft((d) => ({ ...d, ...patchDraft }));
  const setAction = (key: string, a: AutomationAction) => setDraft((d) => ({ ...d, actions: d.actions.map((x) => (x.key === key ? { key, action: a } : x)) }));
  const move = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.actions];
      const j = index + dir;
      if (j < 0 || j >= next.length) return d;
      [next[index], next[j]] = [next[j], next[index]];
      return { ...d, actions: next };
    });

  const trigger = draft.trigger;
  const previewIncoming = trigger.type === "keyword" ? trigger.keywords[0] ?? "Hi" : trigger.type === "first_message" ? "Hi, I have a question" : "Hello, is anyone there?";
  const previewActions = draft.actions.map((x) => x.action);
  const backstage = previewActions.filter((a) => !a.type.startsWith("send_"));
  const hoursOff = trigger.type === "outside_hours" && cfg && !cfg.workspace.settings.business_hours.enabled;

  const changeTrigger = (type: AutomationTrigger["type"]) => {
    if (type === trigger.type) return;
    if (type === "keyword") set({ trigger: { type: "keyword", match: "contains", keywords: [] } });
    else set({ trigger: { type } as AutomationTrigger });
  };

  const save = async () => {
    setSubmitted(true);
    if (hasErrors(errors)) {
      toast.error("A few things need your attention before you can save.");
      return;
    }
    const body = {
      name: draft.name.trim(),
      enabled: draft.enabled,
      priority: draft.priority,
      trigger: draft.trigger,
      actions: withButtonIds(draft.actions.map((x) => x.action)),
    };
    setSaving(true);
    try {
      if (editing) await patch(`/api/automations/${rule!.id}`, body);
      else await post("/api/automations", body);
      await refresh("/api/automations");
      toast.success(editing ? "Rule saved" : "Rule created");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const pKey = priorityKey(draft.priority);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width={980}
      title={editing ? "Edit rule" : "New rule"}
      description="Choose what starts the rule and what WhatsApp does next."
      footer={
        <>
          <label className="mr-auto flex items-center gap-2.5 text-sm text-ink-2">
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => set({ enabled })} aria-label="Rule is on" />
            {draft.enabled ? "On" : "Off"}
          </label>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button loading={saving} onClick={save}>
            {editing ? "Save rule" : "Create rule"}
          </Button>
        </>
      }
    >
      <div className="@container">
        <div className="grid gap-9 @2xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-8">
            <Field label="Rule name" error={show.name}>
              <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="For example: Pricing questions" maxLength={80} invalid={!!show.name} aria-label="Rule name" />
            </Field>

            <Section title="When" hint="What a customer does to start this rule.">
              <Select
                value={trigger.type}
                onValueChange={changeTrigger}
                aria-label="Trigger"
                options={(Object.keys(TRIGGER_META) as AutomationTrigger["type"][]).map((t) => {
                  const Icon = TRIGGER_META[t].icon;
                  return { value: t, label: TRIGGER_META[t].label, description: TRIGGER_META[t].description, icon: <Icon size={16} className="text-ink-3" /> };
                })}
              />
              {trigger.type === "keyword" && (
                <div className="space-y-3">
                  <Segmented
                    size="sm"
                    aria-label="How to match"
                    value={trigger.match}
                    onValueChange={(match) => set({ trigger: { ...trigger, match } })}
                    options={[
                      { value: "contains", label: "Contains" },
                      { value: "exact", label: "Is exactly" },
                      { value: "starts_with", label: "Starts with" },
                    ]}
                  />
                  <Field error={show.keywords} hint="Press Enter after each keyword. Capital letters and punctuation are ignored.">
                    <TagInput value={trigger.keywords} onChange={(keywords) => set({ trigger: { ...trigger, keywords } })} placeholder="price, cost, quote…" aria-label="Keywords" />
                  </Field>
                </div>
              )}
              {trigger.type === "first_message" && <p className="text-[13px] leading-relaxed text-ink-3">Runs once, the first time a new contact writes to you. It is skipped if a teammate has already taken the chat.</p>}
              {trigger.type === "outside_hours" && (
                <div className="space-y-2">
                  <p className="text-[13px] leading-relaxed text-ink-3">Runs when someone writes outside your business hours, at most once every 12 hours per chat. Skipped if a teammate has taken the chat.</p>
                  {hoursOff && (
                    <p className="flex items-start gap-2 rounded-xl bg-warn-soft px-3 py-2 text-xs leading-relaxed text-warn">
                      <Warning size={14} className="mt-0.5 shrink-0" weight="fill" />
                      Business hours are switched off, so this rule won&apos;t run yet. Turn them on in Hours &amp; greetings.
                    </p>
                  )}
                </div>
              )}
            </Section>

            <Section title="Then" hint="Actions run in order, top to bottom.">
              <ul className="space-y-3">
                <AnimatePresence initial={false}>
                  {draft.actions.map((item, i) => (
                    <ActionCard
                      key={item.key}
                      index={i}
                      total={draft.actions.length}
                      item={item}
                      error={show.byAction[item.key]}
                      templates={templates}
                      tagNames={tagNames}
                      onChange={(a) => setAction(item.key, a)}
                      onRemove={() => set({ actions: draft.actions.filter((x) => x.key !== item.key) })}
                      onMove={(dir) => move(i, dir)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
              {show.actions && <p className="text-xs text-danger">{show.actions}</p>}
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary" leading={<Plus size={16} />} disabled={draft.actions.length >= MAX_ACTIONS}>
                    Add action
                  </Button>
                </MenuTrigger>
                <MenuContent align="start" className="min-w-[280px]">
                  {ACTION_ORDER.map((t) => {
                    const Icon = ACTION_META[t].icon;
                    return (
                      <MenuItem key={t} icon={<Icon size={17} />} onSelect={() => set({ actions: [...draft.actions, { key: nextKey(), action: blankAction(t) }] })}>
                        {ACTION_META[t].label}
                      </MenuItem>
                    );
                  })}
                </MenuContent>
              </Menu>
              {draft.actions.length >= MAX_ACTIONS && <p className="text-xs text-ink-3">A rule can have up to {MAX_ACTIONS} actions.</p>}
            </Section>

            <Section title="Priority" hint="Decides which keyword rule goes first when several match.">
              <Segmented
                aria-label="Priority"
                value={pKey}
                onValueChange={(k: PriorityKey) => set({ priority: k === pKey ? draft.priority : PRIORITY_VALUE[k] })}
                options={[
                  { value: "first", label: "First" },
                  { value: "normal", label: "Normal" },
                  { value: "last", label: "Last" },
                ]}
              />
              <div className="flex items-start gap-2.5 rounded-2xl bg-info-soft px-3.5 py-3 text-[13px] leading-relaxed text-info">
                <Info size={16} className="mt-0.5 shrink-0" />
                <p>
                  The first matching keyword rule wins, so only one keyword rule replies to a message. Welcome and away messages are sent only when no teammate has taken the chat. STOP and START replies always come first.
                </p>
              </div>
            </Section>
          </div>

          <aside className="min-w-0 @2xl:sticky @2xl:top-0 @2xl:self-start">
            <p className="mb-3 text-[13px] font-medium text-ink-2">What the customer sees</p>
            <RulePreview workspaceName={cfg?.workspace.name ?? "Your business"} incoming={previewIncoming} actions={previewActions} templates={templateMap} />
            <p className="mt-3 text-center text-xs text-ink-3">Preview uses the sample name Aarav Mehta.</p>
            {backstage.length > 0 && (
              <div className="mt-4 rounded-2xl bg-surface-2 p-3.5 hairline">
                <p className="mb-2 text-xs font-medium text-ink-2">Behind the scenes</p>
                <ul className="space-y-1.5">
                  {backstage.map((a, i) => {
                    const meta = ACTION_META[a.type];
                    const Icon = meta.icon;
                    let text: string = meta.label;
                    if (a.type === "add_tag") text = a.tag ? `Adds the tag “${a.tag}”` : "Adds a tag";
                    if (a.type === "remove_tag") text = a.tag ? `Removes the tag “${a.tag}”` : "Removes a tag";
                    if (a.type === "assign") text = `Assigns the chat to ${cfg?.members.find((m) => m.user_id === a.user_id)?.name ?? "a teammate"}`;
                    if (a.type === "opt_out") text = "Marks the contact as opted out";
                    if (a.type === "opt_in") text = "Marks the contact as opted in";
                    return (
                      <li key={i} className="flex items-start gap-2 text-xs text-ink-2">
                        <Icon size={14} className="mt-px shrink-0 text-ink-3" />
                        {text}
                      </li>
                    );
                  })}
                </ul>
                <Badge className="mt-2.5" tone="neutral" size="sm">
                  Not visible to the customer
                </Badge>
              </div>
            )}
          </aside>
        </div>
      </div>
    </Sheet>
  );
}
