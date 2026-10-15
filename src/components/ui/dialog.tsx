"use client";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";

const sizes = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

/** Centered modal in a double-bezel tray. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = "md", className }: BaseProps & { size?: keyof typeof sizes }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="overlay fixed inset-0 z-40 bg-ink/35 backdrop-blur-[3px]" />
        <D.Content
          className={cn("modal fixed left-1/2 top-1/2 z-50 w-[calc(100vw-24px)] -translate-x-1/2 -translate-y-1/2 outline-none", sizes[size])}
          aria-describedby={undefined}
        >
          <div className="bezel max-h-[calc(100dvh-24px)] shadow-pop">
            <div className="bezel-core flex max-h-[calc(100dvh-36px)] flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
                <div className="min-w-0">
                  <D.Title className="text-lg font-medium tracking-tight">{title}</D.Title>
                  {description && <D.Description className="mt-1 text-sm text-ink-3">{description}</D.Description>}
                </div>
                <D.Close className="-mr-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.06] hover:text-ink" aria-label="Close">
                  <X size={18} />
                </D.Close>
              </div>
              <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-5", className)}>{children}</div>
              {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">{footer}</div>}
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Slide-over drawer, floating with a margin like the rest of the shell. */
export function Sheet({ open, onOpenChange, title, description, children, footer, width = 520, className }: BaseProps & { width?: number }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="overlay fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px]" />
        <D.Content
          className="sheet fixed bottom-3 right-3 top-3 z-50 w-[min(var(--w),calc(100vw-24px))] outline-none"
          style={{ ["--w" as string]: `${width}px` }}
          aria-describedby={undefined}
        >
          <div className="bezel h-full shadow-pop">
            <div className="bezel-core flex h-full flex-col overflow-hidden">
              <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
                <div className="min-w-0">
                  <D.Title className="truncate text-lg font-medium tracking-tight">{title}</D.Title>
                  {description && <D.Description className="mt-1 text-sm text-ink-3">{description}</D.Description>}
                </div>
                <D.Close className="-mr-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.06] hover:text-ink" aria-label="Close">
                  <X size={18} />
                </D.Close>
              </div>
              <div className={cn("min-h-0 flex-1 overflow-y-auto px-6 pb-6", className)}>{children}</div>
              {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-6 py-3.5">{footer}</div>}
            </div>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
