"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "@phosphor-icons/react";
import { Card, PageHeader } from "@/components/ui/display";
import { useConfig } from "@/lib/client/hooks";
import { cn } from "@/lib/shared/utils";
import { autoMap, buildRows, validateRows, type ColumnMap, type Validation } from "./mapping";
import type { ParsedFile } from "./parse";
import { StepMap } from "./step-map";
import { StepReview } from "./step-review";
import { StepRun, useImportRunner } from "./step-run";
import { StepUpload } from "./step-upload";

type Step = "upload" | "map" | "review" | "import";
const STEPS: { id: Step; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "review", label: "Review" },
  { id: "import", label: "Import" },
];

export function ImportWizard() {
  const { data: cfg } = useConfig();
  const [step, setStep] = React.useState<Step>("upload");
  const [file, setFile] = React.useState<ParsedFile | null>(null);
  const [hasHeader, setHasHeader] = React.useState(true);
  const [map, setMap] = React.useState<ColumnMap[]>([]);
  const [countryPick, setCountryPick] = React.useState<string | null>(null);
  const country = countryPick ?? cfg?.workspace.settings.default_country ?? "IN";
  const [tags, setTags] = React.useState<string[]>([]);
  const [duplicates, setDuplicates] = React.useState<"update" | "skip">("update");
  const [consent, setConsent] = React.useState(false);
  const runner = useImportRunner();

  const onFile = (f: ParsedFile | null) => {
    setFile(f);
    if (f) {
      const header = f.headerLocked ? true : f.headerGuess;
      setHasHeader(header);
      setMap(autoMap(f, header, country));
    } else setMap([]);
  };

  const onHeader = (v: boolean) => {
    setHasHeader(v);
    if (file) setMap(autoMap(file, v, country));
  };

  /* rows + validation (review step) */
  const rows = React.useMemo(() => (file && map.length ? buildRows(file, hasHeader, map) : []), [file, hasHeader, map]);
  const [validation, setValidation] = React.useState<Validation | null>(null);
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    if (step !== "review") return;
    let stale = false;
    setValidation(null);
    setProgress(0);
    validateRows(rows, country, () => stale, (n) => !stale && setProgress(n)).then((v) => {
      if (!stale && v) setValidation(v);
    });
    return () => {
      stale = true;
    };
  }, [step, rows, country]);

  // don't let people close the tab mid-import by accident
  React.useEffect(() => {
    if (runner.state.phase !== "running") return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [runner.state.phase]);

  const startImport = () => {
    if (!validation) return;
    setStep("import");
    runner.start(validation.unique, {
      tags,
      consent,
      duplicates,
      country,
      mergedInFile: validation.duplicates,
      invalid: validation.invalid.length,
    });
  };

  const startOver = () => {
    runner.reset();
    setFile(null);
    setMap([]);
    setTags([]);
    setConsent(false);
    setDuplicates("update");
    setCountryPick(null);
    setValidation(null);
    setStep("upload");
  };

  const index = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={
          <Link href="/contacts" className="inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
            <ArrowLeft size={14} /> Contacts
          </Link>
        }
        title="Import contacts"
        description="Bring in a list from a spreadsheet, a phone export or a pasted set of numbers."
      />

      <Card padded={false}>
        <div className="border-b border-line px-5 py-4 sm:px-7">
          <StepIndicator index={index} />
        </div>
        <div className="p-5 sm:p-7">
          {step === "upload" && <StepUpload file={file} onFile={onFile} onNext={(parsed) => (parsed ?? file) && setStep("map")} />}
          {step === "map" && file && (
            <StepMap file={file} hasHeader={hasHeader} onHeader={onHeader} map={map} onMap={setMap} country={country} onBack={() => setStep("upload")} onNext={() => setStep("review")} />
          )}
          {step === "review" && file && (
            <StepReview
              file={file}
              hasHeader={hasHeader}
              validation={validation}
              progress={progress}
              totalRows={rows.length}
              country={country}
              onCountry={setCountryPick}
              tags={tags}
              onTags={setTags}
              duplicates={duplicates}
              onDuplicates={setDuplicates}
              consent={consent}
              onConsent={setConsent}
              onBack={() => setStep("map")}
              onImport={startImport}
              badEmails={validation?.badEmails ?? 0}
            />
          )}
          {step === "import" && <StepRun state={runner.state} onRetry={runner.retry} onBack={() => (runner.reset(), setStep("review"))} onAgain={startOver} />}
        </div>
      </Card>
    </div>
  );
}

function StepIndicator({ index }: { index: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Import progress">
      {STEPS.map((s, i) => {
        const done = i < index;
        const current = i === index;
        return (
          <li key={s.id} className={cn("flex items-center gap-2", i < STEPS.length - 1 && "flex-1")} aria-current={current ? "step" : undefined}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium transition-colors duration-300",
                done ? "bg-accent text-white" : current ? "bg-ink text-bg" : "bg-ink/[0.07] text-ink-3",
              )}
            >
              {done ? <Check size={12} weight="bold" /> : i + 1}
            </span>
            <span className={cn("whitespace-nowrap text-[13px] font-medium", current ? "text-ink" : "hidden text-ink-3 sm:inline")}>
              {s.label}
              <span className="sr-only">{done ? " (done)" : ""}</span>
            </span>
            {i < STEPS.length - 1 && <span className={cn("hidden h-px flex-1 sm:block", done ? "bg-accent/50" : "bg-line")} aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
