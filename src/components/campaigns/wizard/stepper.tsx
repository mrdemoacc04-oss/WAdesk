"use client";
import * as React from "react";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";
import { STEPS } from "./types";

function Dot({ i, active, done }: { i: number; active: boolean; done: boolean }) {
  return (
    <span
      className={cn(
        "tabular grid size-7 shrink-0 place-items-center rounded-full text-xs font-medium transition-[background-color,color,box-shadow] duration-500 ease-fluid",
        active ? "bg-ink text-bg shadow-btn" : done ? "bg-accent-soft text-accent-ink" : "bg-surface text-ink-3 hairline",
      )}
    >
      {done && !active ? <Check size={13} weight="bold" /> : i + 1}
    </span>
  );
}

/** Slim vertical rail on wide screens. */
export function VerticalStepper({ step, reached, onGo }: { step: number; reached: number; onGo: (i: number) => void }) {
  return (
    <nav aria-label="Campaign steps" className="sticky top-6 hidden self-start min-[1400px]:block">
      <ol>
        {STEPS.map((s, i) => {
          const done = i < step || (i <= reached && i !== step);
          const can = i <= reached;
          return (
            <li key={s.id} className="relative pb-6 last:pb-0">
              {i < STEPS.length - 1 && (
                <span aria-hidden className={cn("absolute left-[13px] top-8 h-[calc(100%-2rem)] w-px transition-colors duration-500", i < reached ? "bg-accent-line" : "bg-line-strong")} />
              )}
              <button
                type="button"
                onClick={() => onGo(i)}
                disabled={!can}
                aria-current={i === step ? "step" : undefined}
                className="group/step flex w-full items-center gap-3 rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default"
              >
                <Dot i={i} active={i === step} done={done} />
                <span className="min-w-0 leading-tight">
                  <span className={cn("block text-sm font-medium transition-colors", i === step ? "text-ink" : can ? "text-ink-2 group-hover/step:text-ink" : "text-ink-4")}>{s.label}</span>
                  <span className={cn("block text-xs", i === step ? "text-ink-3" : "text-ink-4")}>{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Compact indicator for narrower screens: numbered pills, labels from sm up, current label always. */
export function HorizontalStepper({ step, reached, onGo }: { step: number; reached: number; onGo: (i: number) => void }) {
  return (
    <nav aria-label="Campaign steps" className="mb-6 min-[1400px]:hidden">
      <ol className="flex items-center gap-1.5 overflow-x-auto">
        {STEPS.map((s, i) => {
          const can = i <= reached;
          const done = i <= reached && i !== step;
          return (
            <React.Fragment key={s.id}>
              <li className="shrink-0">
                <button
                  type="button"
                  onClick={() => onGo(i)}
                  disabled={!can}
                  aria-current={i === step ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${s.label}`}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-full pr-3 outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-default",
                    i === step ? "bg-ink/[0.06] pl-1.5" : "pl-1.5 hover:bg-ink/[0.04] disabled:hover:bg-transparent",
                    i !== step && "max-sm:pr-1.5",
                  )}
                >
                  <Dot i={i} active={i === step} done={done} />
                  <span className={cn("text-[13px] font-medium", i === step ? "text-ink" : can ? "text-ink-2 max-sm:hidden" : "text-ink-4 max-sm:hidden")}>{s.label}</span>
                </button>
              </li>
              {i < STEPS.length - 1 && <li aria-hidden className={cn("h-px min-w-3 flex-1 transition-colors duration-500", i < reached ? "bg-accent-line" : "bg-line-strong")} />}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
