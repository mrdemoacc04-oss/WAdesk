"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Warning, WarningCircle } from "@phosphor-icons/react";
import type { Issue } from "@/lib/shared/template";
import { cn } from "@/lib/shared/utils";

/**
 * Validation is live, but errors only surface next to a field once the person has touched it
 * (or tried to save/submit), so an empty form doesn't greet them with a wall of red.
 */
interface IssueCtx {
  issues: Issue[];
  showAll: boolean;
  readOnly: boolean;
  touch: (...paths: string[]) => void;
  touched: (path: string) => boolean;
  /** visible issues exactly at `path` */
  at: (path: string) => Issue[];
  /** worst visible level at `path`, for styling inputs */
  invalid: (path: string) => boolean;
}

const Ctx = React.createContext<IssueCtx>({
  issues: [],
  showAll: false,
  readOnly: false,
  touch: () => {},
  touched: () => false,
  at: () => [],
  invalid: () => false,
});

export const useIssues = () => React.useContext(Ctx);

export function IssueProvider({
  issues,
  showAll,
  readOnly,
  touchedPaths,
  onTouch,
  children,
}: {
  issues: Issue[];
  showAll: boolean;
  readOnly: boolean;
  touchedPaths: ReadonlySet<string>;
  onTouch: (paths: string[]) => void;
  children: React.ReactNode;
}) {
  const value = React.useMemo<IssueCtx>(() => {
    const touched = (path: string) => showAll || touchedPaths.has(path);
    const at = (path: string) => issues.filter((i) => i.path === path && (i.level === "warning" || touched(path)));
    return {
      issues,
      showAll,
      readOnly,
      touch: (...paths) => onTouch(paths),
      touched,
      at,
      invalid: (path) => at(path).some((i) => i.level === "error"),
    };
  }, [issues, showAll, readOnly, touchedPaths, onTouch]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Messages for one validator path, rendered right under the field they belong to. */
export function FieldIssues({ path, extra, className }: { path: string; extra?: string | null; className?: string }) {
  const { at } = useIssues();
  const list: { message: string; level: "error" | "warning" }[] = at(path).map((i) => ({ message: i.message, level: i.level }));
  if (extra) list.unshift({ message: extra, level: "error" });
  return (
    <div aria-live="polite" className={className}>
      <AnimatePresence initial={false}>
        {list.map((i) => (
          <motion.p
            key={i.level + i.message}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
            className={cn("flex items-start gap-1.5 overflow-hidden text-xs leading-relaxed", i.level === "error" ? "text-danger" : "text-warn")}
          >
            <span className="mt-px shrink-0 pt-px">{i.level === "error" ? <WarningCircle size={13} weight="fill" /> : <Warning size={13} weight="fill" />}</span>
            <span className="min-w-0 py-0.5">{i.message}</span>
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** n/max counter that warms up near the limit. */
export function Counter({ n, max, className }: { n: number; max: number; className?: string }) {
  return (
    <span className={cn("tabular text-xs", n > max ? "font-medium text-danger" : n > max * 0.9 ? "text-warn" : "text-ink-4", className)}>
      {n}/{max}
    </span>
  );
}
