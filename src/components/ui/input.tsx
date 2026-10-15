"use client";
import * as React from "react";
import { cn } from "@/lib/shared/utils";

const field =
  "w-full rounded-xl bg-surface text-[16px] text-ink hairline transition-[box-shadow,background-color] duration-300 ease-fluid placeholder:text-ink-4 hover:bg-surface-2/60 focus:bg-surface focus:outline-none focus:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_4px_color-mix(in_srgb,var(--accent)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-55 md:text-sm";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, leading, trailing, invalid, ...props }, ref) {
  return (
    <div className={cn("relative", className)}>
      {leading && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">{leading}</span>}
      <input
        ref={ref}
        className={cn(field, "h-10", leading ? "pl-10" : "px-3.5", trailing ? "pr-10" : leading ? "pr-3.5" : "", invalid && "shadow-[inset_0_0_0_1.5px_var(--danger)]")}
        {...props}
      />
      {trailing && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3">{trailing}</span>}
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return <textarea ref={ref} className={cn(field, "min-h-24 resize-y px-3.5 py-2.5 leading-relaxed", invalid && "shadow-[inset_0_0_0_1.5px_var(--danger)]", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[13px] font-medium text-ink-2", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
  right,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {(label || right) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && <Label htmlFor={htmlFor}>{label}</Label>}
          {right && <span className="text-xs text-ink-3">{right}</span>}
        </div>
      )}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs leading-relaxed text-ink-3">{hint}</p> : null}
    </div>
  );
}
