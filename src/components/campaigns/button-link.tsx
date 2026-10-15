import * as React from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

/** A <Link> that looks like <Button>, including the nested "button-in-button" trailing island. */
export function ButtonLink({
  href,
  variant,
  size,
  leading,
  trailing,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Link>, "href"> &
  VariantProps<typeof buttonVariants> & { href: string; leading?: React.ReactNode; trailing?: React.ReactNode }) {
  const solid = variant === "primary" || variant === "accent" || variant === "danger" || variant === undefined || variant === null;
  const small = size === "sm" || size === "xs";
  return (
    <Link
      href={href}
      className={cn(buttonVariants({ variant, size }), trailing && (size === "lg" ? "pr-2" : small ? "pr-1" : "pr-1.5"), className)}
      {...props}
    >
      {leading}
      {children}
      {trailing && (
        <span
          className={cn(
            "grid place-items-center rounded-full transition-transform duration-500 ease-fluid group-hover/btn:-translate-y-px group-hover/btn:translate-x-0.5 group-hover/btn:scale-105",
            size === "lg" ? "size-9" : small ? "size-6" : "size-7",
            solid ? "bg-bg/15" : "bg-ink/[0.07]",
          )}
        >
          {trailing}
        </span>
      )}
    </Link>
  );
}
