"use client";
import * as React from "react";
import { type VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
import { CircleNotch } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";

export { buttonVariants };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leading?: React.ReactNode;
  /** Rendered inside its own circular island, flush with the right padding — the "button-in-button" arrow. */
  trailing?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, leading, trailing, children, disabled, type = "button", ...props },
  ref,
) {
  const solid = variant === "primary" || variant === "accent" || variant === "danger" || variant === undefined;
  const big = size === "lg";
  return (
    <button ref={ref} type={type} disabled={disabled || loading} className={cn(buttonVariants({ variant, size }), trailing && (big ? "pr-2" : size === "sm" || size === "xs" ? "pr-1" : "pr-1.5"), className)} {...props}>
      {loading ? <CircleNotch className="animate-spin" size={16} /> : leading}
      {children}
      {trailing && (
        <span
          className={cn(
            "grid place-items-center rounded-full transition-transform duration-500 ease-fluid group-hover/btn:-translate-y-px group-hover/btn:translate-x-0.5 group-hover/btn:scale-105",
            big ? "size-9" : size === "sm" || size === "xs" ? "size-6" : "size-7",
            solid ? "bg-bg/15" : "bg-ink/[0.07]",
          )}
        >
          {trailing}
        </span>
      )}
    </button>
  );
});
