"use client";
import * as React from "react";
import { Checkbox as C, Switch as S } from "radix-ui";
import { Check, Minus } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { cn } from "@/lib/shared/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root
      className={cn(
        "peer inline-flex h-[22px] w-10 shrink-0 items-center rounded-full bg-ink/15 p-0.5 transition-colors duration-300 ease-fluid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <S.Thumb className="block size-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-fluid data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-md bg-surface hairline-strong transition-[background-color,box-shadow] duration-200 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50 data-[state=checked]:bg-accent data-[state=checked]:shadow-none data-[state=indeterminate]:bg-accent data-[state=indeterminate]:shadow-none",
        className,
      )}
      {...props}
    >
      <C.Indicator className="text-white">{props.checked === "indeterminate" ? <Minus size={12} weight="bold" /> : <Check size={12} weight="bold" />}</C.Indicator>
    </C.Root>
  );
}

/** Segmented control with a sliding pill — filters and view switches. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "md",
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; count?: number; icon?: React.ReactNode }[];
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}) {
  const id = React.useId();
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn("inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full bg-ink/[0.055] p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(o.value)}
            className={cn(
              "relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-[13px]",
              active ? "text-ink" : "text-ink-3 hover:text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-[0_1px_2px_rgba(20,21,15,0.08),0_0_0_1px_var(--line)]"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
              {o.count !== undefined && <span className={cn("tabular text-[11px]", active ? "text-ink-3" : "text-ink-4")}>{o.count}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Underline tabs for page sections. */
export function TabBar<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
}) {
  const id = React.useId();
  return (
    <div role="tablist" className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(o.value)}
            className={cn("relative inline-flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium outline-none transition-colors duration-300 focus-visible:text-ink", active ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {o.icon}
            {o.label}
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}
