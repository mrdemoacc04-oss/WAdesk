"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle, Warning } from "@phosphor-icons/react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/display";
import { api, errorMessage, refresh } from "@/lib/client/api";
import { chunk, fmtNum } from "@/lib/shared/utils";
import type { UniqueContact } from "./mapping";

export interface RunOptions {
  tags: string[];
  consent: boolean;
  duplicates: "update" | "skip";
  country: string;
  /** rows the file itself repeated, merged before sending */
  mergedInFile: number;
  invalid: number;
}

export interface RunState {
  phase: "idle" | "running" | "error" | "done";
  sent: number;
  total: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
  error?: string;
  opts?: RunOptions;
}

const IDLE: RunState = { phase: "idle", sent: 0, total: 0, created: 0, updated: 0, skipped: 0, invalid: 0 };
const CHUNK = 1000;

/** Sends contacts in slices of 1,000 and can pick up again from the slice that failed. */
export function useImportRunner() {
  const [state, setState] = React.useState<RunState>(IDLE);
  const job = React.useRef<{ chunks: UniqueContact[][]; next: number; acc: RunState; opts: RunOptions } | null>(null);
  const running = React.useRef(false);

  const loop = React.useCallback(async () => {
    const j = job.current;
    if (!j || running.current) return;
    running.current = true;
    setState({ ...j.acc, phase: "running", error: undefined });
    try {
      while (j.next < j.chunks.length) {
        const part = j.chunks[j.next];
        const r = await api<{ total: number; created: number; updated: number; skipped: number; invalid: unknown[] }>("/api/contacts/import", {
          method: "POST",
          body: {
            rows: part.map((c) => ({
              phone: c.phone,
              name: c.name || null,
              email: c.email || null,
              tags: c.tags,
              attributes: c.attributes,
            })),
            tags: j.opts.tags,
            consent: j.opts.consent,
            duplicates: j.opts.duplicates,
            default_country: j.opts.country,
          },
        });
        j.next++;
        j.acc = {
          ...j.acc,
          sent: j.acc.sent + part.length,
          created: j.acc.created + r.created,
          updated: j.acc.updated + r.updated,
          skipped: j.acc.skipped + r.skipped,
          invalid: j.acc.invalid + (r.invalid?.length ?? 0),
        };
        setState({ ...j.acc, phase: "running" });
      }
      await refresh("/api/contacts", "/api/tags", "/api/segments", "/api/dashboard");
      j.acc = { ...j.acc, phase: "done" };
      setState(j.acc);
    } catch (e) {
      setState({ ...j.acc, phase: "error", error: errorMessage(e) });
    } finally {
      running.current = false;
    }
  }, []);

  const start = React.useCallback(
    (contacts: UniqueContact[], opts: RunOptions) => {
      const acc: RunState = { ...IDLE, phase: "running", total: contacts.length, skipped: opts.mergedInFile, invalid: opts.invalid, opts };
      job.current = { chunks: chunk(contacts, CHUNK), next: 0, acc, opts };
      void loop();
    },
    [loop],
  );
  const retry = React.useCallback(() => void loop(), [loop]);
  const reset = React.useCallback(() => {
    job.current = null;
    setState(IDLE);
  }, []);

  return { state, start, retry, reset };
}

/* ───────── view ───────── */

export function StepRun({ state, onRetry, onBack, onAgain }: { state: RunState; onRetry: () => void; onBack: () => void; onAgain: () => void }) {
  const opts = state.opts;
  const tag = opts?.tags[0];
  const pct = state.total ? (state.sent / state.total) * 100 : 0;
  const imported = state.created + state.updated;

  if (state.phase === "done" && opts) {
    return (
      <div>
        <div className="mb-6 flex items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <CheckCircle size={26} weight="fill" />
          </span>
          <div>
            <h2 className="text-lg font-medium tracking-tight">Import complete</h2>
            <p className="mt-1 text-sm text-ink-3">
              {imported > 0 ? (
                <>
                  {fmtNum(imported)} {imported === 1 ? "contact is" : "contacts are"} in your list{tag ? <> and tagged <span className="font-mono text-ink-2">{tag}</span></> : ""}.
                </>
              ) : (
                "Nothing new was added. Everyone in the file was already in your list or was left out."
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3" aria-live="polite">
          <Result label="Created" value={state.created} />
          <Result label="Updated" value={state.updated} />
          <Result label="Skipped" value={state.skipped} note={state.skipped ? "duplicates or existing" : undefined} />
          <Result label="Invalid" value={state.invalid} note={state.invalid ? "not imported" : undefined} />
        </div>

        {imported > 0 && (
        <p className="mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-ink-2 hairline">
          {opts.consent
            ? "These contacts were saved as Opted in."
            : "These contacts were saved as Unconfirmed. Campaigns skip them until they opt in, or until you mark them as opted in once they've agreed."}
        </p>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2.5">
          <Link href={tag ? `/contacts?tags=${encodeURIComponent(tag)}` : "/contacts"} className={buttonVariants({ variant: "primary" })}>
            View contacts <ArrowUpRight size={14} />
          </Link>
          {tag && imported > 0 && (
            <Link href={`/campaigns/new?tags=${encodeURIComponent(tag)}`} className={buttonVariants({ variant: "secondary" })}>
              Create a campaign for these contacts
            </Link>
          )}
          <Button variant="ghost" onClick={onAgain}>
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-medium tracking-tight">{state.phase === "error" ? "Import paused" : "Importing your contacts"}</h2>
        <p className="mt-1 text-sm text-ink-3">{state.phase === "error" ? "Nothing already saved is lost. You can pick up where it stopped." : "Keep this tab open until it finishes."}</p>
      </div>

      <Progress value={pct} tone={state.phase === "error" ? "danger" : "accent"} className="h-2" />
      <div className="tabular mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-3" aria-live="polite">
        <span>
          {fmtNum(state.sent)} of {fmtNum(state.total)} sent
        </span>
        <span>
          {fmtNum(state.created)} created · {fmtNum(state.updated)} updated · {fmtNum(state.skipped)} skipped
        </span>
      </div>

      {state.phase === "error" && (
        <div role="alert" className="mt-5 flex items-start gap-3 rounded-2xl bg-danger-soft p-4 text-sm text-danger">
          <Warning size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Something went wrong</p>
            <p className="mt-0.5 leading-relaxed">{state.error}</p>
          </div>
        </div>
      )}
      {state.phase === "error" && (
        <div className="mt-5 flex items-center gap-2.5">
          <Button onClick={onRetry}>Try again</Button>
          <Button variant="ghost" onClick={onBack}>
            Back to review
          </Button>
        </div>
      )}
    </div>
  );
}

function Result({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3.5 hairline sm:p-4">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="tabular mt-1 text-[28px] font-medium leading-tight tracking-tight">{fmtNum(value)}</p>
      <p className="mt-0.5 h-4 text-xs text-ink-4">{note}</p>
    </div>
  );
}
