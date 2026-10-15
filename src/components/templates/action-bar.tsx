"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, CaretDown, CheckCircle, FloppyDisk, Warning, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { Issue } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";
import { sectionOf } from "./model";

const SECTION_LABEL: Record<string, string> = {
  "sec-basics": "Basics",
  "sec-format": "Format",
  "sec-body": "Message",
  "sec-buttons": "Buttons",
  "sec-cards": "Cards",
};

/** Sticky footer of the form column: what's left to fix, save, submit. */
export function ActionBar({
  errors,
  warnings,
  open,
  onOpen,
  onJump,
  dirty,
  saved,
  saving,
  onSave,
  onSubmit,
}: {
  errors: Issue[];
  warnings: Issue[];
  open: boolean;
  onOpen: (o: boolean) => void;
  onJump: (i: Issue) => void;
  dirty: boolean;
  saved: boolean;
  saving: null | "draft" | "submit";
  onSave: () => void;
  onSubmit: () => void;
}) {
  const all = [...errors, ...warnings];
  const tone = errors.length ? "danger" : warnings.length ? "warn" : "ok";
  const label = errors.length ? `${errors.length} to fix` : warnings.length ? `${warnings.length} ${warnings.length === 1 ? "suggestion" : "suggestions"}` : "Ready to submit";
  const status = saving ? "Saving…" : dirty ? "Unsaved changes" : saved ? "All changes saved" : "Not saved yet";

  return (
    <div className="sticky bottom-[84px] z-20 mt-5 md:bottom-5 xl:mr-[392px] 2xl:mr-[400px]">
      <div className="rounded-[24px] bg-surface/90 shadow-pop backdrop-blur-xl hairline">
        <AnimatePresence initial={false}>
          {open && all.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <ul className="max-h-52 overflow-y-auto border-b border-line p-2" aria-label="Things to fix">
                {all.map((i, k) => (
                  <li key={i.path + k}>
                    <button
                      type="button"
                      onClick={() => onJump(i)}
                      className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] leading-snug outline-none transition-colors hover:bg-ink/[0.05] focus-visible:bg-ink/[0.05]"
                    >
                      <span className={cn("mt-px shrink-0", i.level === "error" ? "text-danger" : "text-warn")}>
                        {i.level === "error" ? <WarningCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />}
                      </span>
                      <span className="min-w-0 flex-1">{i.message}</span>
                      <span className="mt-px shrink-0 text-xs text-ink-4">{SECTION_LABEL[sectionOf(i.path)]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 p-3">
          <button
            type="button"
            onClick={() => all.length && onOpen(!open)}
            aria-expanded={open}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
              tone === "danger" && "bg-danger-soft text-danger",
              tone === "warn" && "bg-warn-soft text-warn",
              tone === "ok" && "cursor-default bg-accent-soft text-accent-ink",
            )}
          >
            {tone === "ok" ? <CheckCircle size={15} weight="fill" /> : tone === "danger" ? <WarningCircle size={15} weight="fill" /> : <Warning size={15} weight="fill" />}
            <span aria-live="polite">{label}</span>
            {all.length > 0 && <CaretDown size={12} weight="bold" className={cn("transition-transform duration-300", open && "rotate-180")} />}
          </button>
          <span className={cn("flex items-center gap-1.5 text-xs", dirty ? "text-warn" : "text-ink-3")} aria-live="polite">
            <span className={cn("size-1.5 rounded-full", dirty ? "bg-warn" : saved ? "bg-accent" : "bg-ink-4")} />
            {status}
          </span>

          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" leading={<FloppyDisk size={16} />} loading={saving === "draft"} disabled={saving === "submit"} onClick={onSave}>
              Save draft
            </Button>
            <Button className="flex-1 sm:flex-none" trailing={<ArrowUpRight size={14} />} loading={saving === "submit"} disabled={saving === "draft"} onClick={onSubmit}>
              Submit for review
            </Button>
          </div>
          <p className="w-full text-xs leading-relaxed text-ink-3">
            <span className="sm:hidden">Review usually takes minutes, up to 24 hours.</span>
            <span className="hidden sm:inline">Meta usually reviews templates within minutes, and can take up to 24 hours. You can send it in a campaign once it&apos;s approved.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
