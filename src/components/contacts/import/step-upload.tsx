"use client";
import * as React from "react";
import { ArrowRight, CheckCircle, DownloadSimple, FileText, UploadSimple, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, fmtNum } from "@/lib/shared/utils";
import { SAMPLE_CSV, downloadText } from "./mapping";
import { ACCEPT, ParseError, parseFile, parsePaste, type ParsedFile } from "./parse";

const fmtSize = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB` : `${(b / 1048576).toFixed(1)} MB`);

const KIND_LABEL: Record<ParsedFile["kind"], string> = {
  csv: "Text table",
  sheet: "Spreadsheet",
  vcf: "vCard",
  json: "JSON",
  paste: "Pasted list",
};

export function StepUpload({ file, onFile, onNext }: { file: ParsedFile | null; onFile: (f: ParsedFile | null) => void; onNext: (parsed?: ParsedFile) => void }) {
  const [tab, setTab] = React.useState<"file" | "paste">(file?.kind === "paste" ? "paste" : "file");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [drag, setDrag] = React.useState(false);
  const [paste, setPaste] = React.useState("");
  const [pasteError, setPasteError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [source, setSource] = React.useState<File | null>(null);

  const load = async (f: File, sheet?: string) => {
    setBusy(true);
    setError(null);
    setSource(f);
    try {
      onFile(await parseFile(f, { sheet }));
    } catch (e) {
      onFile(null);
      setError(e instanceof ParseError ? e.message : "We couldn't read this file. Try saving it as CSV or .xlsx and uploading again.");
    } finally {
      setBusy(false);
    }
  };

  const pasteLines = paste.split(/\r?\n/).filter((l) => l.trim()).length;
  const submitPaste = () => {
    setPasteError(null);
    try {
      const parsed = parsePaste(paste);
      onFile(parsed);
      onNext(parsed);
    } catch (e) {
      setPasteError(e instanceof ParseError ? e.message : "Couldn't read that list.");
    }
  };

  const hasFile = file && file.kind !== "paste";
  const dataRowCount = file ? file.rows.length - (file.headerLocked || file.headerGuess ? 1 : 0) : 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Add your contacts</h2>
          <p className="mt-1 text-sm text-ink-3">Upload a file or paste a list. We check every number before anything is saved.</p>
        </div>
        <Segmented<"file" | "paste"> aria-label="Import source" value={tab} onValueChange={setTab} options={[{ value: "file", label: "Upload a file" }, { value: "paste", label: "Paste numbers" }]} />
      </div>

      {tab === "file" ? (
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a contacts file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void load(f);
            }}
          />

          {hasFile ? (
            <div className="rounded-2xl bg-surface-2 p-5 hairline">
              <div className="flex flex-wrap items-start gap-4">
                <div className="bezel-sm shrink-0">
                  <div className="bezel-core grid size-12 place-items-center text-accent">
                    <FileText size={24} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{file.name}</p>
                  <p className="tabular mt-0.5 text-[13px] text-ink-3">
                    {fmtSize(file.size)} · {KIND_LABEL[file.kind]} · <span className="text-ink-2">{fmtNum(dataRowCount)} {dataRowCount === 1 ? "row" : "rows"}</span> · {file.columnCount} {file.columnCount === 1 ? "column" : "columns"}
                  </p>
                  {file.note && !file.sheets && <p className="mt-0.5 text-[13px] text-ink-3">{file.note}</p>}
                  {file.sheets && source && (
                    <div className="mt-3 flex max-w-sm items-center gap-2.5">
                      <span className="text-[13px] text-ink-3">Sheet</span>
                      <Select
                        size="sm"
                        aria-label="Sheet to import"
                        value={file.sheet}
                        onValueChange={(s) => void load(source, s)}
                        options={file.sheets.map((s) => ({ value: s, label: s }))}
                      />
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} leading={<UploadSimple size={14} />}>
                  Choose another
                </Button>
              </div>
              {file.warnings.length > 0 && (
                <ul className="mt-4 grid gap-1.5 rounded-xl bg-warn-soft p-3 text-[13px] text-warn" role="status">
                  {file.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Warning size={15} className="mt-0.5 shrink-0" /> {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex items-center gap-2 text-[13px] text-ink-2">
                <CheckCircle size={16} weight="fill" className="text-accent" /> File read. Next you&apos;ll match the columns.
              </div>
            </div>
          ) : (
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void load(f);
              }}
              className={cn(
                "group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-12 text-center transition-[background-color,border-color] duration-300 ease-fluid",
                drag ? "border-accent bg-accent-soft/70" : "border-line-strong bg-surface-2 hover:bg-surface-3/60",
              )}
            >
              <div className="bezel-sm mb-5 transition-transform duration-500 ease-fluid group-hover:-translate-y-0.5">
                <div className="bezel-core grid size-14 place-items-center text-ink-2">
                  <UploadSimple size={26} />
                </div>
              </div>
              <p className="text-base font-medium tracking-tight">{busy ? "Reading your file…" : drag ? "Drop it here" : "Drop a file here, or choose one"}</p>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-3">CSV, TSV, TXT, Excel (.xlsx, .xls), OpenDocument (.ods), vCard (.vcf) or JSON. Up to 50,000 rows.</p>
              <Button className="mt-6" loading={busy} onClick={(e) => (e.stopPropagation(), inputRef.current?.click())} leading={<UploadSimple size={16} />}>
                Choose file
              </Button>
            </div>
          )}

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
              <Warning size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">That file didn&apos;t work</p>
                <p className="mt-0.5 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={() => downloadText("wadesk-sample-contacts.csv", SAMPLE_CSV)} leading={<DownloadSimple size={15} />}>
              Download sample CSV
            </Button>
            <Button onClick={() => onNext()} disabled={!hasFile} trailing={<ArrowRight size={14} />}>
              Continue
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <label htmlFor="paste-numbers" className="sr-only">
            Numbers to import
          </label>
          <Textarea
            id="paste-numbers"
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setPasteError(null);
            }}
            placeholder={"+91 98765 43210\nPriya Sharma, +91 90000 00002\n+1 202 555 0147, Sam Carter"}
            className="min-h-[240px] font-mono text-[14px] md:text-[13px]"
            spellCheck={false}
            invalid={!!pasteError}
          />
          <p className="mt-2 text-[13px] leading-relaxed text-ink-3">One contact per line. A number on its own works, and so does “Name, number” or “number, name”.</p>
          {pasteError && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {pasteError}
            </p>
          )}
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="tabular text-[13px] text-ink-3" aria-live="polite">
              {pasteLines ? `${fmtNum(pasteLines)} ${pasteLines === 1 ? "line" : "lines"}` : ""}
            </span>
            <Button onClick={submitPaste} disabled={!pasteLines} trailing={<ArrowRight size={14} />}>
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
