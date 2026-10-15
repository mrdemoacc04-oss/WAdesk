"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Funnel, Megaphone, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/confirm";
import { del, patch, post, refresh, toastError } from "@/lib/client/api";
import { useSegments, useTags, useApi } from "@/lib/client/hooks";
import { countryList, countryName, flagEmoji } from "@/lib/shared/phone";
import type { Contact, Page, Segment, SegmentField, SegmentOp, SegmentRule } from "@/lib/shared/types";
import { dateOnly, fmtNum, pluralize } from "@/lib/shared/utils";
import { OPT_LABEL, OPT_OPTIONS, SOURCE_LABEL, useDebounced } from "./shared";

/* ───────── rule model ───────── */

const FIELDS: { value: SegmentField; label: string }[] = [
  { value: "tag", label: "Tag" },
  { value: "opt_in", label: "Opted-in status" },
  { value: "country", label: "Country" },
  { value: "source", label: "Source" },
  { value: "attribute", label: "Custom field" },
  { value: "created_at", label: "Created" },
  { value: "last_inbound_at", label: "Last message" },
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
];

const OPS: Record<SegmentField, { value: SegmentOp; label: string }[]> = {
  tag: [
    { value: "has", label: "has" },
    { value: "has_not", label: "doesn't have" },
  ],
  opt_in: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  country: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  source: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ],
  attribute: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "exists", label: "exists" },
    { value: "not_exists", label: "doesn't exist" },
  ],
  created_at: [
    { value: "after", label: "after" },
    { value: "before", label: "before" },
  ],
  last_inbound_at: [
    { value: "after", label: "after" },
    { value: "before", label: "before" },
    { value: "exists", label: "exists" },
    { value: "not_exists", label: "doesn't exist" },
  ],
  name: [
    { value: "contains", label: "contains" },
    { value: "is", label: "is" },
  ],
  phone: [
    { value: "contains", label: "contains" },
    { value: "is", label: "is" },
  ],
};

const isDateField = (f: SegmentField) => f === "created_at" || f === "last_inbound_at";
const needsValue = (r: Pick<SegmentRule, "op">) => r.op !== "exists" && r.op !== "not_exists";

interface DraftRule {
  uid: number;
  field: SegmentField;
  key: string;
  op: SegmentOp;
  value: string;
}

let uidSeq = 0;
const blankRule = (field: SegmentField = "tag", country = "IN"): DraftRule => ({
  uid: ++uidSeq,
  field,
  key: "",
  op: OPS[field][0].value,
  value: defaultValue(field, country),
});

function defaultValue(field: SegmentField, country: string): string {
  if (field === "opt_in") return "opted_in";
  if (field === "country") return country;
  if (isDateField(field)) return "30d";
  return "";
}

const fromApi = (r: SegmentRule): DraftRule => ({ uid: ++uidSeq, field: r.field, key: r.key ?? "", op: r.op, value: r.value ?? "" });

function isComplete(r: DraftRule): boolean {
  if (r.field === "attribute" && !r.key.trim()) return false;
  if (!needsValue(r)) return true;
  if (!r.value.trim()) return false;
  if (isDateField(r.field)) return parseWhen(r.value) !== null;
  return true;
}

const toApi = (r: DraftRule): SegmentRule => ({
  field: r.field,
  ...(r.field === "attribute" ? { key: r.key.trim() } : {}),
  op: r.op,
  value: needsValue(r) ? r.value.trim() : "",
});

/** "30d" or an ISO date → a human sentence and the resolved date. */
function parseWhen(v: string): { text: string; date: Date } | null {
  const m = /^(\d{1,4})\s*d$/i.exec(v.trim());
  if (m) {
    const n = Number(m[1]);
    return { text: n === 1 ? "1 day ago" : `${n} days ago`, date: new Date(Date.now() - n * 86400000) };
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(v.trim())) {
    const d = new Date(v.trim());
    if (!Number.isNaN(d.getTime())) return { text: dateOnly(d.toISOString()), date: d };
  }
  return null;
}

export function describeRule(r: SegmentRule): string {
  const f = FIELDS.find((x) => x.value === r.field)?.label ?? r.field;
  const key = r.field === "attribute" ? ` “${r.key ?? ""}”` : "";
  const op = OPS[r.field]?.find((o) => o.value === r.op)?.label ?? r.op;
  if (!needsValue(r)) return `${f}${key} ${op}`;
  let val = r.value;
  if (r.field === "opt_in") val = OPT_LABEL[r.value as keyof typeof OPT_LABEL] ?? r.value;
  else if (r.field === "country") val = countryName(r.value);
  else if (r.field === "source") val = SOURCE_LABEL[r.value] ?? r.value;
  else if (isDateField(r.field)) val = parseWhen(r.value)?.text ?? r.value;
  return `${f}${key} ${op} ${val}`;
}

/* ───────── component ───────── */

type View = { kind: "list" } | { kind: "edit"; id?: string };

export function SegmentsManager({
  open,
  onOpenChange,
  onApply,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** show a segment's contacts in the table */
  onApply: (id: string) => void;
  onDeleted: (id: string) => void;
}) {
  const { data: segments, isLoading } = useSegments();
  const [view, setView] = React.useState<View>({ kind: "list" });

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setView({ kind: "list" }), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const editing = view.kind === "edit" ? segments?.find((s) => s.id === view.id) : undefined;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      width={640}
      title={view.kind === "list" ? "Segments" : view.id ? "Edit segment" : "New segment"}
      description={view.kind === "list" ? "Saved groups of contacts that update themselves. Use them to pick who gets a campaign." : undefined}
      className="px-0 pb-0"
    >
      {view.kind === "list" ? (
        <SegmentList
          segments={segments}
          loading={isLoading}
          onNew={() => setView({ kind: "edit" })}
          onEdit={(id) => setView({ kind: "edit", id })}
          onApply={(id) => {
            onApply(id);
            onOpenChange(false);
          }}
        />
      ) : (
        <SegmentEditor
          key={view.id ?? "new"}
          segment={editing}
          onBack={() => setView({ kind: "list" })}
          onDeleted={(id) => {
            onDeleted(id);
            setView({ kind: "list" });
          }}
        />
      )}
    </Sheet>
  );
}

/* ───────── list ───────── */

function SegmentList({
  segments,
  loading,
  onNew,
  onEdit,
  onApply,
}: {
  segments?: Segment[];
  loading: boolean;
  onNew: () => void;
  onEdit: (id: string) => void;
  onApply: (id: string) => void;
}) {
  return (
    <div className="px-6 pb-6">
      <div className="mb-4 flex justify-end">
        <Button onClick={onNew} leading={<Plus size={16} />} size="sm">
          New segment
        </Button>
      </div>
      {loading && !segments ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : !segments?.length ? (
        <EmptyState
          icon={<Funnel />}
          title="No segments yet"
          description="A segment is a saved filter, like everyone tagged vip who joined in the last 30 days. Build one and message it in a click."
          action={
            <Button onClick={onNew} leading={<Plus size={16} />}>
              Create a segment
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {segments.map((s) => (
            <li key={s.id} className="rounded-2xl bg-surface-2 p-4 hairline">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => onEdit(s.id)} className="max-w-full truncate rounded-md text-left text-[15px] font-medium outline-none hover:underline focus-visible:underline">
                    {s.name}
                  </button>
                  <p className="tabular mt-0.5 text-[13px] text-ink-3">{pluralize(s.count ?? 0, "contact")} opted in</p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => onEdit(s.id)}>
                  <PencilSimple size={16} />
                </Button>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
                <span className="text-ink-3">{s.match === "all" ? "All of: " : "Any of: "}</span>
                {s.rules.length ? s.rules.map(describeRule).join(s.match === "all" ? "  ·  " : "  or  ") : "No rules"}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => onApply(s.id)}>
                  Show contacts
                </Button>
                <Link href={`/campaigns/new?segment=${s.id}`} className={buttonVariants({ variant: "soft", size: "sm" })}>
                  <Megaphone size={15} /> Message this segment
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────── editor ───────── */

function SegmentEditor({
  segment,
  onBack,
  onDeleted,
}: {
  segment?: Segment;
  onBack: () => void;
  onDeleted: (id: string) => void;
}) {
  const confirm = useConfirm();
  const { data: tags } = useTags();
  const { data: sample } = useApi<Page<Contact>>("/api/contacts?limit=200");
  const [name, setName] = React.useState(segment?.name ?? "");
  const [match, setMatch] = React.useState<"all" | "any">(segment?.match ?? "all");
  const [rules, setRules] = React.useState<DraftRule[]>(() => (segment?.rules.length ? segment.rules.map(fromApi) : [blankRule()]));
  const [saving, setSaving] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const attrKeys = React.useMemo(() => {
    const set = new Set<string>();
    for (const c of sample?.rows ?? []) Object.keys(c.attributes ?? {}).forEach((k) => set.add(k));
    return [...set].sort();
  }, [sample]);

  const complete = rules.filter(isComplete);
  const allComplete = rules.length > 0 && complete.length === rules.length;

  /* live preview */
  const previewKey = useDebounced(JSON.stringify({ match, rules: complete.map(toApi) }), 350);
  const [preview, setPreview] = React.useState<{ total: number; opted_in: number } | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  React.useEffect(() => {
    const body = JSON.parse(previewKey) as { match: "all" | "any"; rules: SegmentRule[] };
    if (!body.rules.length) {
      setPreview(null);
      return;
    }
    let live = true;
    setPreviewing(true);
    post<{ total: number; opted_in: number }>("/api/segments/preview", { name: name.trim() || "Preview", ...body })
      .then((r) => live && setPreview(r))
      .catch(() => live && setPreview(null))
      .finally(() => live && setPreviewing(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  const update = (uid: number, patchRule: Partial<DraftRule>) => setRules((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patchRule } : r)));

  const save = async () => {
    setShowErrors(true);
    if (!name.trim() || !allComplete) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), match, rules: rules.map(toApi) };
      if (segment) await patch(`/api/segments/${segment.id}`, body);
      else await post("/api/segments", body);
      toast.success(segment ? "Segment saved" : "Segment created");
      await refresh("/api/segments");
      onBack();
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!segment) return;
    const ok = await confirm({
      title: `Delete “${segment.name}”?`,
      description: "The contacts stay as they are. Campaigns that used this segment will need a new audience.",
      confirmLabel: "Delete segment",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await del(`/api/segments/${segment.id}`);
      toast.success("Segment deleted");
      await refresh("/api/segments");
      onDeleted(segment.id);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6 px-6 pb-6">
        <Button variant="ghost" size="sm" onClick={onBack} leading={<ArrowLeft size={15} />} className="-ml-2">
          All segments
        </Button>

        <Field label="Segment name" htmlFor="seg-name" error={showErrors && !name.trim() ? "Give this segment a name" : undefined}>
          <Input id="seg-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="VIP customers in Mumbai" autoFocus={!segment} invalid={showErrors && !name.trim()} />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-medium text-ink-2">Match</span>
          <Segmented<"all" | "any">
            size="sm"
            value={match}
            onValueChange={setMatch}
            aria-label="How rules combine"
            options={[
              { value: "all", label: "All of these" },
              { value: "any", label: "Any of these" },
            ]}
          />
        </div>

        <div className="grid gap-2.5">
          {rules.map((r, i) => (
            <RuleRow
              key={r.uid}
              index={i}
              rule={r}
              match={match}
              tagNames={(tags ?? []).map((t) => ({ name: t.name, count: t.count }))}
              attrKeys={attrKeys}
              invalid={showErrors && !isComplete(r)}
              canRemove={rules.length > 1}
              onChange={(p) => update(r.uid, p)}
              onRemove={() => setRules((rs) => rs.filter((x) => x.uid !== r.uid))}
            />
          ))}
          <div>
            <Button variant="secondary" size="sm" leading={<Plus size={15} />} onClick={() => setRules((rs) => [...rs, blankRule()])}>
              Add rule
            </Button>
          </div>
        </div>

        <div className="rounded-2xl bg-accent-soft/70 px-4 py-3.5 text-sm hairline" aria-live="polite">
          {!complete.length ? (
            <span className="text-ink-3">Fill in a rule to see how many contacts match.</span>
          ) : previewing && !preview ? (
            <Skeleton className="h-5 w-48" />
          ) : preview ? (
            <span className={previewing ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <strong className="tabular text-lg font-medium tracking-tight">{fmtNum(preview.total)}</strong> {preview.total === 1 ? "contact matches" : "contacts match"}
              <span className="text-ink-2"> · </span>
              <strong className="tabular font-medium">{fmtNum(preview.opted_in)}</strong> <span className="text-ink-2">opted in and can be messaged</span>
              {!allComplete && <span className="mt-1 block text-xs text-ink-3">Counting the finished rules only.</span>}
            </span>
          ) : (
            <span className="text-ink-3">Couldn&apos;t count right now.</span>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface/95 px-6 py-3.5 backdrop-blur">
        <div className="flex items-center gap-2">
          {segment && (
            <Button variant="danger-soft" onClick={remove} leading={<Trash size={16} />}>
              Delete
            </Button>
          )}
          {segment && (
            <Link href={`/campaigns/new?segment=${segment.id}`} className={buttonVariants({ variant: "soft" })}>
              Message this segment <ArrowUpRight size={14} />
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {segment ? "Save segment" : "Create segment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───────── one rule ───────── */

function RuleRow({
  index,
  rule,
  match,
  tagNames,
  attrKeys,
  invalid,
  canRemove,
  onChange,
  onRemove,
}: {
  index: number;
  rule: DraftRule;
  match: "all" | "any";
  tagNames: { name: string; count: number }[];
  attrKeys: string[];
  invalid: boolean;
  canRemove: boolean;
  onChange: (p: Partial<DraftRule>) => void;
  onRemove: () => void;
}) {
  const listId = React.useId();
  const dateField = isDateField(rule.field);
  const countries = React.useMemo(() => countryList(), []);

  const valueControl = (() => {
    if (!needsValue(rule)) return null;
    switch (rule.field) {
      case "tag": {
        const opts = tagNames.map((t) => ({ value: t.name, label: t.name, description: `${fmtNum(t.count)} contacts` }));
        if (rule.value && !opts.some((o) => o.value === rule.value)) opts.unshift({ value: rule.value, label: rule.value, description: "No contacts yet" });
        return <Select aria-label="Tag" value={rule.value || undefined} onValueChange={(v) => onChange({ value: v })} options={opts} placeholder={opts.length ? "Choose a tag" : "No tags yet"} />;
      }
      case "opt_in":
        return <Select aria-label="Opt-in status" value={rule.value || undefined} onValueChange={(v) => onChange({ value: v })} options={OPT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />;
      case "country":
        return (
          <Select
            aria-label="Country"
            value={rule.value || undefined}
            onValueChange={(v) => onChange({ value: v })}
            options={countries.map((c) => ({ value: c.code, label: `${flagEmoji(c.code)}  ${c.name}`, description: c.dial }))}
            placeholder="Choose a country"
          />
        );
      case "source":
        return <Select aria-label="Source" value={rule.value || undefined} onValueChange={(v) => onChange({ value: v })} options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} placeholder="Choose a source" />;
      case "created_at":
      case "last_inbound_at":
        return <DateValue value={rule.value} onChange={(v) => onChange({ value: v })} invalid={invalid} />;
      default:
        return <Input aria-label="Value" value={rule.value} onChange={(e) => onChange({ value: e.target.value })} placeholder={rule.field === "phone" ? "+91 or digits" : "Value"} invalid={invalid && !rule.value.trim()} />;
    }
  })();

  return (
    <div className="rounded-2xl bg-surface-2 p-3 hairline">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-ink-3">{index === 0 ? "Where" : match === "all" ? "And" : "Or"}</span>
        <button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove rule ${index + 1}`} className="grid size-6 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.07] hover:text-ink disabled:opacity-30">
          <X size={13} />
        </button>
      </div>
      <div className="flex flex-wrap items-start gap-2">
        <Select
          aria-label={`Rule ${index + 1} field`}
          className="w-[168px]"
          value={rule.field}
          onValueChange={(f) => onChange({ field: f, op: OPS[f][0].value, key: "", value: defaultValue(f, "IN") })}
          options={FIELDS}
        />
        {rule.field === "attribute" && (
          <>
            <Input
              aria-label="Custom field name"
              className="w-[150px]"
              list={listId}
              value={rule.key}
              onChange={(e) => onChange({ key: e.target.value })}
              placeholder="Field name"
              invalid={invalid && !rule.key.trim()}
            />
            <datalist id={listId}>
              {attrKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </>
        )}
        <Select aria-label={`Rule ${index + 1} operator`} className="w-[140px]" value={rule.op} onValueChange={(op) => onChange({ op })} options={OPS[rule.field]} />
        {valueControl && <div className={dateField ? "basis-full" : "min-w-[170px] flex-1"}>{valueControl}</div>}
      </div>
    </div>
  );
}

/* ───────── relative / absolute date value ───────── */

function DateValue({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const [mode, setMode] = React.useState<"rel" | "abs">(() => (/^\d+\s*d$/i.test(value.trim()) || !value ? "rel" : "abs"));
  const when = parseWhen(value);
  const days = /^(\d+)\s*d$/i.exec(value.trim())?.[1] ?? "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Date style"
          className="w-[132px]"
          value={mode}
          onValueChange={(m) => {
            setMode(m);
            onChange(m === "rel" ? "30d" : new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
          }}
          options={[
            { value: "rel", label: "Days ago" },
            { value: "abs", label: "On a date" },
          ]}
        />
        {mode === "rel" ? (
          <Input
            aria-label="Number of days ago"
            className="w-[110px] [&_input::-webkit-inner-spin-button]:appearance-none [&_input]:[appearance:textfield]"
            type="number"
            min={0}
            inputMode="numeric"
            value={days}
            onChange={(e) => onChange(e.target.value === "" ? "" : `${Math.max(0, Math.floor(Number(e.target.value)))}d`)}
            placeholder="30"
            trailing={<span className="pr-1 text-xs text-ink-3">days</span>}
            invalid={invalid && !when}
          />
        ) : (
          <Input aria-label="Date" className="w-[170px]" type="date" value={/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : ""} onChange={(e) => onChange(e.target.value)} invalid={invalid && !when} />
        )}
        <span className="text-xs text-ink-3">
          {when ? (mode === "rel" ? `${when.text} · ${dateOnly(when.date.toISOString())}` : when.text) : "Pick how far back"}
        </span>
      </div>
    </div>
  );
}
