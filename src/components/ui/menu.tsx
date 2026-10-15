"use client";
import * as React from "react";
import { DropdownMenu as M, Popover as P, Tooltip as T } from "radix-ui";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";

const panel = "menu z-[60] min-w-[200px] overflow-hidden rounded-2xl bg-surface p-1.5 shadow-pop hairline";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ className, align = "end", ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={8} className={cn(panel, className)} {...props} />
    </M.Portal>
  );
}

export function MenuItem({
  icon,
  danger,
  className,
  children,
  shortcut,
  ...props
}: React.ComponentProps<typeof M.Item> & { icon?: React.ReactNode; danger?: boolean; shortcut?: React.ReactNode }) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        danger ? "text-danger data-[highlighted]:bg-danger-soft" : "text-ink data-[highlighted]:bg-ink/[0.06]",
        className,
      )}
      {...props}
    >
      {icon && <span className={cn("shrink-0", danger ? "" : "text-ink-3")}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="text-xs text-ink-4">{shortcut}</span>}
    </M.Item>
  );
}

export function MenuCheckItem({ className, children, ...props }: React.ComponentProps<typeof M.CheckboxItem>) {
  return (
    <M.CheckboxItem
      className={cn("relative flex cursor-pointer select-none items-center rounded-xl py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-ink/[0.06]", className)}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2.5 text-accent">
        <Check size={14} weight="bold" />
      </M.ItemIndicator>
      {children}
    </M.CheckboxItem>
  );
}

export const MenuSeparator = ({ className }: { className?: string }) => <M.Separator className={cn("-mx-1.5 my-1.5 h-px bg-line", className)} />;
export const MenuLabel = ({ children }: { children: React.ReactNode }) => <M.Label className="px-2.5 pb-1 pt-1.5 text-xs text-ink-3">{children}</M.Label>;

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, align = "start", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={8} className={cn(panel, "p-3 outline-none", className)} {...props} />
    </P.Portal>
  );
}

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactElement; side?: "top" | "right" | "bottom" | "left" }) {
  if (!content) return children;
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={8} className="menu z-50 max-w-xs rounded-xl bg-ink px-2.5 py-1.5 text-xs font-medium text-bg shadow-pop">
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
