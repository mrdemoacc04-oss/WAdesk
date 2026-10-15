"use client";
import { Check, Checks, Clock, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/shared/utils";
import type { MessageStatus } from "@/lib/shared/types";

export function StatusTicks({ status, className, size = 14 }: { status: MessageStatus | string; className?: string; size?: number }) {
  if (status === "read") return <Checks size={size} weight="bold" className={cn("text-[#3aa6f0]", className)} aria-label="Read" />;
  if (status === "delivered") return <Checks size={size} weight="bold" className={cn("text-ink-3", className)} aria-label="Delivered" />;
  if (status === "sent") return <Check size={size} weight="bold" className={cn("text-ink-3", className)} aria-label="Sent" />;
  if (status === "failed") return <WarningCircle size={size} weight="fill" className={cn("text-danger", className)} aria-label="Failed" />;
  if (status === "queued") return <Clock size={size} className={cn("text-ink-3", className)} aria-label="Sending" />;
  return null;
}
