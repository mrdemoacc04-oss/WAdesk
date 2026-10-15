import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, hueStyle, initials } from "@/lib/shared/utils";

/* ───────── badge ───────── */

const badge = cva("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-medium", {
  variants: {
    tone: {
      neutral: "bg-ink/[0.07] text-ink-2",
      accent: "bg-accent-soft text-accent-ink",
      warn: "bg-warn-soft text-warn",
      danger: "bg-danger-soft text-danger",
      info: "bg-info-soft text-info",
      violet: "bg-violet-soft text-violet",
    },
    size: { sm: "h-5 px-2 text-[11px]", md: "h-6 px-2.5 text-xs" },
  },
  defaultVariants: { tone: "neutral", size: "md" },
});

export function Badge({ className, tone, size, dot, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge> & { dot?: boolean }) {
  return (
    <span className={cn(badge({ tone, size }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ───────── avatar ───────── */

export function Avatar({ name, seed, size = 36, className, ring }: { name?: string | null; seed?: string; size?: number; className?: string; ring?: boolean }) {
  const st = hueStyle(seed ?? name ?? "?");
  return (
    <span
      className={cn("inline-grid shrink-0 select-none place-items-center rounded-full font-medium", ring && "ring-2 ring-surface", className)}
      style={{ ...st, width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ───────── skeleton / spinner / kbd ───────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} aria-hidden />;
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-grid h-5 min-w-5 place-items-center rounded-md bg-ink/[0.07] px-1.5 font-mono text-[11px] font-medium text-ink-3", className)}>
      {children}
    </kbd>
  );
}

/* ───────── card (double-bezel) ───────── */

export function Card({
  children,
  className,
  coreClassName,
  padded = true,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { padded?: boolean; coreClassName?: string; as?: React.ElementType }) {
  return (
    <Tag className={cn("bezel", className)} {...props}>
      <div className={cn("bezel-core", padded && "p-5", coreClassName)}>{children}</div>
    </Tag>
  );
}

/** Flat inset area inside a card core. */
export function Inset({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-2xl bg-surface-2 p-4 hairline", className)}>{children}</div>;
}

export function CardHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-tight">{title}</h3>
        {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* ───────── progress ───────── */

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "warn" | "danger" | "info" }) {
  const color = { accent: "bg-accent", warn: "bg-warn", danger: "bg-danger", info: "bg-info" }[tone];
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-fluid", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/* ───────── empty state ───────── */

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="bezel-sm mb-5">
          <div className="bezel-core grid size-14 place-items-center text-ink-2 [&_svg]:size-6">{icon}</div>
        </div>
      )}
      <h3 className="text-base font-medium tracking-tight">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-3">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ───────── page header ───────── */

export function PageHeader({
  title,
  accent,
  description,
  actions,
  back,
  className,
}: {
  title: React.ReactNode;
  /** a word set in the serif italic, trailing the title */
  accent?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        {back && <div className="mb-3">{back}</div>}
        <h1 className="text-[28px] font-medium leading-[1.1] tracking-[-0.03em] sm:text-[34px]">
          {title}
          {accent && <> <span className="font-serif font-normal italic tracking-[-0.01em] text-ink-2">{accent}</span></>}
        </h1>
        {description && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ───────── key/value row ───────── */

export function KV({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2 text-sm", className)}>
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{children}</dd>
    </div>
  );
}
