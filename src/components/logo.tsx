import { cn } from "@/lib/shared/utils";

export function LogoMark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className={cn("shrink-0", className)} aria-hidden>
      <rect width="28" height="28" rx="9" fill="var(--ink)" />
      <path
        d="M8 11.5A4.5 4.5 0 0 1 12.5 7h3a4.5 4.5 0 0 1 4.5 4.5V13a4.5 4.5 0 0 1-4.5 4.5H13l-3.2 2.6c-.4.3-.8 0-.8-.4V16.6A4.5 4.5 0 0 1 8 13z"
        fill="var(--bg)"
      />
      <circle cx="14" cy="12.3" r="1.8" fill="#25d366" />
    </svg>
  );
}

export function Wordmark({ name = "WAdesk", className }: { name?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[17px] font-medium tracking-[-0.03em]">{name}</span>
    </span>
  );
}
