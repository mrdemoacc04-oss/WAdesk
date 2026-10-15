"use client";
import * as React from "react";
import { ArrowLeft, ArrowRight, Info, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { TagChip } from "@/components/ui/tag-input";
import { flagEmoji, formatPhone } from "@/lib/shared/phone";
import { cn } from "@/lib/shared/utils";
import { TARGET_LABEL, buildRows, checkPhone, columnHeaders, dataRows, type ColumnMap, type Target } from "./mapping";
import type { ParsedFile } from "./parse";

const TARGETS: Target[] = ["phone", "name", "email", "tags", "custom", "skip"];

export function StepMap({
  file,
  hasHeader,
  onHeader,
  map,
  onMap,
  country,
  onBack,
  onNext,
}: {
  file: ParsedFile;
  hasHeader: boolean;
  onHeader: (v: boolean) => void;
  map: ColumnMap[];
  onMap: (m: ColumnMap[]) => void;
  country: string;
  onBack: () => void;
  onNext: () => void;
}) {
  const headers = columnHeaders(file, hasHeader);
  const rows = React.useMemo(() => dataRows(file, hasHeader), [file, hasHeader]);
  const prepared = React.useMemo(() => buildRows(file, hasHeader, map), [file, hasHeader, map]);
  const hasPhone = map.some((m) => m.target === "phone");

  const setTarget = (i: number, target: Target) => {
    const next = map.map((m, j) => {
      if (j === i) return { ...m, target };
      // phone and email can only live in one column
      if ((target === "phone" || target === "email") && m.target === target) return { ...m, target: "skip" as Target };
      return m;
    });
    onMap(next);
  };

  // does the chosen phone column look right?
  const phoneCol = map.findIndex((m) => m.target === "phone");
  const phoneCheck = React.useMemo(() => {
    if (phoneCol < 0) return null;
    const vals = rows.slice(0, 60).map((r) => r.cells[phoneCol] ?? "").filter(Boolean);
    if (!vals.length) return { ratio: 0, n: 0 };
    return { ratio: vals.filter((v) => checkPhone(v, country).ok).length / vals.length, n: vals.length };
  }, [rows, phoneCol, country]);

  const preview = prepared.slice(0, 5);
  const customFields = map.filter((m) => m.target === "custom" && m.field.trim());

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-medium tracking-tight">Match your columns</h2>
        <p className="mt-1 text-sm text-ink-3">We guessed what each column holds. Change anything that looks off. Only the phone number is required.</p>
      </div>

      {!file.headerLocked && (
        <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm hairline">
          <Switch checked={hasHeader} onCheckedChange={onHeader} aria-label="First row is a header" />
          <span className="flex-1">
            <span className="font-medium">First row is a header</span>
            <span className="ml-2 text-ink-3">{hasHeader ? "It names the columns and won't be imported." : "The first row will be imported as a contact."}</span>
          </span>
        </label>
      )}

      <ul className="divide-y divide-line rounded-2xl hairline">
        {headers.map((h, i) => {
          const samples = rows
            .slice(0, 40)
            .map((r) => r.cells[i] ?? "")
            .filter(Boolean)
            .slice(0, 3);
          const m = map[i] ?? { target: "skip" as Target, field: "" };
          return (
            <li key={i} className={cn("grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", m.target === "skip" && "bg-surface-2/50")}>
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-medium", m.target === "skip" && "text-ink-3")}>{h}</p>
                <p className="mt-0.5 truncate text-xs text-ink-3">{samples.length ? samples.join("  ·  ") : "Empty column"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <Select
                  size="sm"
                  aria-label={`What is “${h}”?`}
                  className={cn("w-full sm:w-[190px]", m.target === "phone" && "shadow-[inset_0_0_0_1.5px_var(--accent)]")}
                  value={m.target}
                  onValueChange={(t) => setTarget(i, t)}
                  options={TARGETS.map((t) => ({ value: t, label: TARGET_LABEL[t] }))}
                />
                {m.target === "custom" && (
                  <Input
                    aria-label={`Field name for ${h}`}
                    className="w-full sm:w-[170px] [&_input]:h-8 [&_input]:text-[13px]"
                    value={m.field}
                    onChange={(e) => onMap(map.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
                    placeholder="Field name"
                    invalid={!m.field.trim()}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {!hasPhone ? (
        <p role="alert" className="mt-3 flex items-start gap-2 text-sm text-danger">
          <Warning size={16} className="mt-0.5 shrink-0" /> Choose the column that holds the phone number.
        </p>
      ) : phoneCheck && phoneCheck.n > 0 && phoneCheck.ratio < 0.3 ? (
        <p role="status" className="mt-3 flex items-start gap-2 text-sm text-warn">
          <Warning size={16} className="mt-0.5 shrink-0" /> Most values in “{headers[phoneCol]}” don&apos;t look like phone numbers. Is that the right column?
        </p>
      ) : (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-3">
          <Info size={15} className="mt-0.5 shrink-0" /> Several columns can be Name (first and last name are joined). Numbers without a country code are read as the country you pick on the next step.
        </p>
      )}

      {/* live preview */}
      <h3 className="mb-2 mt-7 text-sm font-medium">How the first rows will look</h3>
      <div className="overflow-x-auto rounded-2xl hairline">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              {["Row", "Name", "Phone number", "Email", "Tags", customFields.length ? "Custom fields" : null].map((c, i) =>
                c === null ? null : (
                  <th key={i} className="h-10 whitespace-nowrap border-b border-line bg-surface-2/60 px-3 font-normal first:rounded-tl-2xl last:rounded-tr-2xl">
                    {c}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child_td]:border-0">
            {preview.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-3">
                  Nothing to preview yet. Pick a phone column above.
                </td>
              </tr>
            )}
            {preview.map((r, i) => {
              const p = r.phoneRaw ? checkPhone(r.phoneRaw, country) : null;
              return (
                <tr key={`${r.rowNo}-${i}`}>
                  <td className="tabular border-b border-line px-3 py-2.5 text-ink-3">{r.rowNo}</td>
                  <td className="max-w-[180px] truncate border-b border-line px-3 py-2.5">{r.name || <span className="text-ink-4">—</span>}</td>
                  <td className="border-b border-line px-3 py-2.5">
                    {!p ? (
                      <span className="text-danger">Missing</span>
                    ) : p.ok ? (
                      <span className="inline-flex items-center gap-2 whitespace-nowrap">
                        <span aria-hidden>{flagEmoji(p.country)}</span>
                        <span className="tabular font-mono text-[13px]">{formatPhone(p.e164)}</span>
                      </span>
                    ) : (
                      <span className="text-danger" title={p.reason}>
                        {r.phoneRaw.length > 22 ? r.phoneRaw.slice(0, 21) + "…" : r.phoneRaw} <span className="text-xs">· not valid</span>
                      </span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate border-b border-line px-3 py-2.5">{r.email || <span className="text-ink-4">—</span>}</td>
                  <td className="border-b border-line px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.tags.length ? r.tags.slice(0, 3).map((t) => <TagChip key={t} tag={t} />) : <span className="text-ink-4">—</span>}
                    </div>
                  </td>
                  {customFields.length > 0 && (
                    <td className="min-w-[180px] max-w-[260px] border-b border-line px-3 py-2.5 text-[13px] leading-snug text-ink-2">
                      {Object.entries(r.attributes).map(([k, v]) => `${k}: ${v}`).join(" · ") || <span className="text-ink-4">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} leading={<ArrowLeft size={15} />}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!hasPhone || map.some((m) => m.target === "custom" && !m.field.trim())} trailing={<ArrowRight size={14} />}>
          Review
        </Button>
      </div>
    </div>
  );
}
