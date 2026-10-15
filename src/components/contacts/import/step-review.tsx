"use client";
import * as React from "react";
import { format } from "date-fns";
import { ArrowLeft, DownloadSimple, ShieldCheck, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox, Segmented } from "@/components/ui/controls";
import { Field } from "@/components/ui/input";
import { Progress } from "@/components/ui/display";
import { Select } from "@/components/ui/select";
import { TagInput } from "@/components/ui/tag-input";
import { useTags } from "@/lib/client/hooks";
import { countryList, flagEmoji } from "@/lib/shared/phone";
import { cn, fmtNum } from "@/lib/shared/utils";
import { columnHeaders, downloadText, type Validation } from "./mapping";
import type { ParsedFile } from "./parse";

export const importTagSuggestion = () => `import-${format(new Date(), "yyyy-MM-dd")}`;

export function StepReview({
  file,
  hasHeader,
  validation,
  progress,
  totalRows,
  country,
  onCountry,
  tags,
  onTags,
  duplicates,
  onDuplicates,
  consent,
  onConsent,
  onBack,
  onImport,
  badEmails,
}: {
  file: ParsedFile;
  hasHeader: boolean;
  validation: Validation | null;
  progress: number;
  totalRows: number;
  country: string;
  onCountry: (c: string) => void;
  tags: string[];
  onTags: (t: string[]) => void;
  duplicates: "update" | "skip";
  onDuplicates: (d: "update" | "skip") => void;
  consent: boolean;
  onConsent: (c: boolean) => void;
  onBack: () => void;
  onImport: () => void;
  badEmails: number;
}) {
  const { data: allTags } = useTags();
  const countries = React.useMemo(() => countryList(), []);
  const suggestion = importTagSuggestion();
  const valid = validation?.unique.length ?? 0;
  const invalidCount = validation?.invalid.length ?? 0;
  const dupes = validation?.duplicates ?? 0;

  const downloadInvalid = async () => {
    if (!validation) return;
    const Papa = (await import("papaparse")).default;
    const head = [...columnHeaders(file, hasHeader), "Row", "Problem"];
    const csv = Papa.unparse({ fields: head, data: validation.invalid.map((p) => [...p.row.cells, String(p.row.rowNo), p.reason]) });
    downloadText("wadesk-invalid-rows.csv", csv);
  };

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-medium tracking-tight">Review before importing</h2>
        <p className="mt-1 text-sm text-ink-3">Nothing is saved until you press Import.</p>
      </div>

      {/* tiles */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-live="polite">
        <Tile label="Valid" value={validation ? valid : undefined} tone="accent" note="ready to import" />
        <Tile label="Invalid" value={validation ? invalidCount : undefined} tone={invalidCount ? "danger" : "neutral"} note={invalidCount ? "will be skipped" : "none"} />
        <Tile label="Duplicates in file" value={validation ? dupes : undefined} tone={dupes ? "warn" : "neutral"} note={dupes ? "merged into one" : "none"} />
      </div>
      {!validation && (
        <div className="mt-3" role="status">
          <Progress value={totalRows ? (progress / totalRows) * 100 : 0} />
          <p className="tabular mt-1.5 text-xs text-ink-3">
            Checking numbers… {fmtNum(progress)} of {fmtNum(totalRows)}
          </p>
        </div>
      )}
      {validation && (
        <p className="mt-3 text-[13px] text-ink-3">
          {fmtNum(validation.total)} {validation.total === 1 ? "row" : "rows"} read from {file.name}.
          {badEmails > 0 && ` ${fmtNum(badEmails)} ${badEmails === 1 ? "email" : "emails"} didn't look valid and will be left out.`}
        </p>
      )}

      {/* options */}
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <Field label="Default country" htmlFor="imp-country" hint="Numbers without a country code are read as this country.">
          <Select
            id="imp-country"
            value={country}
            onValueChange={onCountry}
            options={countries.map((c) => ({ value: c.code, label: `${flagEmoji(c.code)}  ${c.name}`, description: c.dial }))}
          />
        </Field>
        <Field label="If a contact already exists" hint={duplicates === "update" ? "Their name, email, tags and fields are filled in from your file." : "Existing contacts are left exactly as they are."}>
          <Segmented<"update" | "skip">
            aria-label="If a contact already exists"
            value={duplicates}
            onValueChange={onDuplicates}
            className="self-start"
            options={[
              { value: "update", label: "Update them" },
              { value: "skip", label: "Skip them" },
            ]}
          />
        </Field>
      </div>

      <div className="mt-5">
        <Field label="Tags for everyone in this import" hint="Tags make it easy to find and message this group later.">
          <TagInput value={tags} onChange={onTags} suggestions={(allTags ?? []).map((t) => t.name)} aria-label="Tags for this import" />
        </Field>
        {!tags.includes(suggestion) && (
          <button
            type="button"
            onClick={() => onTags([...tags, suggestion])}
            className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-xs font-medium text-accent-ink transition-colors hover:bg-accent-line/70"
          >
            <Sparkle size={13} /> Add <span className="font-mono">{suggestion}</span>
          </button>
        )}
      </div>

      {/* consent */}
      <div className={cn("mt-6 rounded-2xl p-4 transition-colors duration-300 hairline", consent ? "bg-accent-soft/60" : "bg-surface-2")}>
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={consent} onCheckedChange={(c) => onConsent(c === true)} className="mt-0.5" aria-describedby="consent-note" />
          <span className="text-sm font-medium leading-snug">I confirm these people have agreed to receive WhatsApp messages from my business.</span>
        </label>
        <p id="consent-note" className="ml-[30px] mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink-3" />
          <span>
            {consent
              ? "They will be saved as Opted in and can be included in campaigns."
              : "Meta requires opt-in before you message anyone. Without this confirmation, imported contacts are saved as Unconfirmed and can't be messaged in campaigns until they opt in."}
          </span>
        </p>
      </div>

      {/* problems */}
      {validation && invalidCount > 0 && (
        <div className="mt-7">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">
              {fmtNum(invalidCount)} {invalidCount === 1 ? "row" : "rows"} with problems
            </h3>
            <Button variant="secondary" size="sm" onClick={downloadInvalid} leading={<DownloadSimple size={15} />}>
              Download invalid rows (CSV)
            </Button>
          </div>
          <div className="max-h-[300px] overflow-auto rounded-2xl hairline">
            <table className="w-full min-w-[480px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3">
                  <th className="sticky top-0 h-9 w-16 border-b border-line bg-surface px-3 font-normal">Row</th>
                  <th className="sticky top-0 h-9 border-b border-line bg-surface px-3 font-normal">Value</th>
                  <th className="sticky top-0 h-9 border-b border-line bg-surface px-3 font-normal">Problem</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-0">
                {validation.invalid.slice(0, 100).map((p, i) => (
                  <tr key={`${p.row.rowNo}-${i}`}>
                    <td className="tabular border-b border-line px-3 py-2 text-ink-3">{p.row.rowNo}</td>
                    <td className="max-w-[220px] truncate border-b border-line px-3 py-2 font-mono text-[13px]">{p.row.phoneRaw || <span className="font-sans text-ink-4">empty</span>}</td>
                    <td className="border-b border-line px-3 py-2 text-danger">{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invalidCount > 100 && <p className="mt-2 text-xs text-ink-3">Showing the first 100. The download has all {fmtNum(invalidCount)}.</p>}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} leading={<ArrowLeft size={15} />}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {validation && valid === 0 && <span className="text-sm text-danger">No valid numbers to import.</span>}
          <Button onClick={onImport} disabled={!validation || valid === 0}>
            Import {validation ? fmtNum(valid) : ""} {valid === 1 ? "contact" : "contacts"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone, note }: { label: string; value?: number; tone: "accent" | "danger" | "warn" | "neutral"; note: string }) {
  const color = { accent: "text-accent-ink", danger: "text-danger", warn: "text-warn", neutral: "text-ink" }[tone];
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5 hairline sm:p-4">
      <p className="text-xs text-ink-3 sm:text-[13px]">{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-medium tracking-tight sm:text-[28px]", color)}>{value === undefined ? <span className="skeleton inline-block h-7 w-12 align-middle" /> : fmtNum(value)}</p>
      <p className="mt-0.5 text-xs text-ink-4">{note}</p>
    </div>
  );
}
