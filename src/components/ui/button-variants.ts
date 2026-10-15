import { cva } from "class-variance-authority";

/* Plain module (no "use client") so server components can style links as buttons. */
export const buttonVariants = cva(
  "group/btn relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium outline-none transition-[background-color,color,box-shadow,transform,opacity] duration-300 ease-fluid active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
  {
    variants: {
      variant: {
        primary: "bg-ink text-bg shadow-btn hover:bg-ink/85",
        accent: "bg-accent text-white shadow-btn hover:brightness-110",
        secondary: "bg-surface text-ink hairline hover:bg-surface-2",
        soft: "bg-accent-soft text-accent-ink hover:bg-accent-line/70",
        ghost: "text-ink-2 hover:bg-ink/[0.06] hover:text-ink",
        danger: "bg-danger text-white shadow-btn hover:brightness-110",
        "danger-soft": "bg-danger-soft text-danger hover:bg-danger/20",
      },
      size: {
        xs: "h-7 rounded-full px-3 text-xs",
        sm: "h-8 rounded-full px-3.5 text-[13px]",
        md: "h-10 rounded-full px-5 text-sm",
        lg: "h-12 rounded-full px-6 text-[15px]",
        icon: "size-10 rounded-full",
        "icon-sm": "size-8 rounded-full",
        "icon-xs": "size-7 rounded-full",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);
