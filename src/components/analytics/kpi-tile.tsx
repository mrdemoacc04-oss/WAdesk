"use client";
import * as React from "react";
import { Card } from "@/components/ui/display";
import { Sparkline } from "@/components/charts/charts";
import { useWidth } from "@/components/charts/use-size";
import { cn } from "@/lib/shared/utils";

/**
 * KPI tile sized for five across: label, value, change + context, then a full-width sparkline.
 * (StatTile puts the sparkline beside the value, which overflows at five columns.)
 */
export function KpiTile({
  label,
  value,
  delta,
  hint,
  spark,
  color = "var(--viz-1)",
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  hint?: React.ReactNode;
  spark?: number[];
  color?: string;
  className?: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  return (
    <Card padded={false} className={cn("h-full", className)} coreClassName="flex h-full flex-col gap-3 p-4 sm:p-5">
      <p className="text-[13px] text-ink-3">{label}</p>
      <p className="tabular text-[28px] font-medium leading-none tracking-[-0.04em]">{value}</p>
      <div className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
        {delta}
        {hint && <span className="text-xs leading-tight text-ink-3">{hint}</span>}
      </div>
      <div ref={ref} className="mt-auto h-9 w-full">
        {spark && w > 0 && <Sparkline values={spark} width={w} height={36} color={color} />}
      </div>
    </Card>
  );
}
