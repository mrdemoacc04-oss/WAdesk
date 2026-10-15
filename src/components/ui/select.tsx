"use client";
import * as React from "react";
import { Select as S } from "radix-ui";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";

export interface Option<T extends string = string> {
  value: T;
  label: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  className,
  size = "md",
  disabled,
  id,
  "aria-label": ariaLabel,
}: {
  value: T | undefined;
  onValueChange: (v: T) => void;
  options: Option<T>[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)} disabled={disabled}>
      <S.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "group flex w-full items-center justify-between gap-2 rounded-xl bg-surface px-3.5 text-left text-[16px] text-ink hairline transition-[box-shadow,background-color] duration-300 ease-fluid hover:bg-surface-2/60 focus:outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--accent)] disabled:opacity-55 data-[placeholder]:text-ink-4 data-[state=open]:shadow-[inset_0_0_0_1.5px_var(--accent)] md:text-sm",
          size === "sm" ? "h-8 text-[13px] md:text-[13px]" : "h-10",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {current?.icon}
          <S.Value placeholder={placeholder}>{current?.label}</S.Value>
        </span>
        <CaretUpDown size={14} className="shrink-0 text-ink-3" />
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={6}
          className="menu z-[60] max-h-[min(340px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-2xl bg-surface p-1 shadow-pop hairline"
        >
          <S.Viewport className="max-h-[320px] overflow-y-auto">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-xl py-2 pl-3 pr-9 text-sm text-ink outline-none transition-colors data-[disabled]:opacity-40 data-[highlighted]:bg-ink/[0.06]"
              >
                {o.icon}
                <span className="flex min-w-0 flex-col">
                  <S.ItemText>{o.label}</S.ItemText>
                  {o.description && <span className="text-xs text-ink-3">{o.description}</span>}
                </span>
                <S.ItemIndicator className="absolute right-3 text-accent">
                  <Check size={15} weight="bold" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
