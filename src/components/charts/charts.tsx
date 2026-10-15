"use client";
import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react";
import { cn, fmtNum } from "@/lib/shared/utils";
import { monotonePath } from "./use-size";
import { Tooltip } from "@/components/ui/menu";

/* ───────── sparkline ───────── */

export function Sparkline({ values, width = 96, height = 30, color = "var(--viz-1)", className }: { values: number[]; width?: number; height?: number; color?: string; className?: string }) {
  if (values.length < 2) return <svg width={width} height={height} className={className} aria-hidden />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const pad = 4;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / (max - min || 1)) * (height - pad * 2);
  const pts = values.map((v, i) => [x(i), y(v)] as [number, number]);
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={monotonePath(pts)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/* ───────── delta ───────── */

/** Signed change vs the previous period. Direction is shown by icon + sign, never colour alone. */
export function Delta({ value, previous, goodWhenUp = true, suffix = "%", points = false, className }: { value: number; previous: number; goodWhenUp?: boolean; suffix?: string; points?: boolean; className?: string }) {
  let change: number;
  if (points) change = Math.round((value - previous) * 10) / 10;
  else change = previous ? Math.round(((value - previous) / previous) * 1000) / 10 : value ? 100 : 0;
  const flat = Math.abs(change) < 0.05;
  const up = change > 0;
  const good = flat ? null : up === goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-medium tabular",
        good === null ? "bg-ink/[0.07] text-ink-3" : good ? "bg-accent-soft text-accent-ink" : "bg-danger-soft text-danger",
        className,
      )}
      title="vs previous period"
    >
      <Icon size={12} weight="bold" />
      {flat ? "0" : `${up ? "+" : ""}${change}`}
      {points ? " pts" : suffix}
    </span>
  );
}

/* ───────── horizontal bars (nominal categories → one hue) ───────── */

export function HBarList({
  items,
  format = (v) => fmtNum(v),
  color = "var(--viz-1)",
  max,
  empty = "No data yet",
}: {
  items: { label: React.ReactNode; value: number; sub?: React.ReactNode; hint?: React.ReactNode }[];
  format?: (v: number) => string;
  color?: string;
  max?: number;
  empty?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-sm text-ink-3">{empty}</p>;
  const top = max ?? Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3.5">
      {items.map((it, i) => (
        <li key={i}>
          <Tooltip content={it.hint} side="top">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                <span className="min-w-0 truncate text-ink-2">{it.label}</span>
                <span className="tabular shrink-0 font-medium">
                  {format(it.value)}
                  {it.sub && <span className="ml-1.5 font-normal text-ink-3">{it.sub}</span>}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-ink/[0.06]">
                <div className="h-full rounded-r-[4px] rounded-l-[2px] transition-[width] duration-700 ease-fluid" style={{ width: `${Math.max(2, (it.value / top) * 100)}%`, background: color }} />
              </div>
            </div>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

/* ───────── segmented composition bar ───────── */

export function StackedBar({ segments, height = 10 }: { segments: { label: string; value: number; color: string }[]; height?: number }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div>
      <div className="flex w-full gap-[2px]" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(", ")}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <Tooltip key={s.label} content={`${s.label}: ${fmtNum(s.value)} (${Math.round((s.value / total) * 100)}%)`}>
              <div className="rounded-[4px] first:rounded-l-full last:rounded-r-full transition-[flex-grow] duration-700 ease-fluid" style={{ flexGrow: s.value, flexBasis: 0, background: s.color }} />
            </Tooltip>
          ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-[13px] text-ink-2">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="tabular font-medium text-ink">{fmtNum(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── funnel (ordinal stages → one-hue ramp) ───────── */

export function Funnel({ stages }: { stages: { label: string; value: number; hint?: string }[] }) {
  const base = Math.max(stages[0]?.value ?? 0, 1);
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => {
        const pct = (s.value / base) * 100;
        const prev = i ? stages[i - 1].value : null;
        const step = prev ? Math.round((s.value / prev) * 1000) / 10 : null;
        return (
          <li key={s.label}>
            <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
              <span className="text-ink-2">{s.label}</span>
              <span className="tabular">
                <span className="font-medium">{fmtNum(s.value)}</span>
                <span className="ml-2 text-ink-3">{i === 0 ? "100%" : `${Math.round(pct * 10) / 10}%`}</span>
                {step !== null && i > 1 && <span className="ml-2 text-xs text-ink-4">{step}% of previous</span>}
              </span>
            </div>
            <div className="h-7 w-full rounded-lg bg-ink/[0.05]">
              <div className="h-full rounded-r-md rounded-l-[3px] transition-[width] duration-700 ease-fluid" style={{ width: `${Math.max(1.5, pct)}%`, background: `var(--ord-${Math.min(i + 1, 4)})` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ───────── heatmap (sequential, one hue) ───────── */

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

export function Heatmap({ grid, rows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], unit = "reads" }: { grid: number[][]; rows?: string[]; unit?: string }) {
  const max = Math.max(1, ...grid.flat());
  const shade = (v: number) => {
    if (!v) return "var(--surface-3)";
    const t = Math.min(1, v / max);
    const step = [0.16, 0.32, 0.52, 0.76, 1][Math.min(4, Math.floor(t * 5))];
    return `color-mix(in srgb, var(--viz-1) ${Math.round(step * 100)}%, var(--surface))`;
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px]">
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: "34px repeat(24, minmax(0, 1fr))" }}>
          <span />
          {HOURS.map((h) => (
            <span key={h} className="text-center text-[10px] text-ink-3">
              {h % 3 === 0 ? hourLabel(h) : ""}
            </span>
          ))}
          {grid.map((row, d) => (
            <React.Fragment key={d}>
              <span className="self-center text-xs text-ink-3">{rows[d]}</span>
              {row.map((v, h) => (
                <Tooltip key={h} content={`${rows[d]} ${hourLabel(h)} · ${fmtNum(v)} ${unit}`}>
                  <div className="aspect-square rounded-[5px] transition-transform duration-200 hover:scale-110" style={{ background: shade(v) }} />
                </Tooltip>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-2 text-xs text-ink-3">
          Fewer
          {[0.16, 0.32, 0.52, 0.76, 1].map((t) => (
            <span key={t} className="size-3.5 rounded-[4px]" style={{ background: `color-mix(in srgb, var(--viz-1) ${t * 100}%, var(--surface))` }} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

/* ───────── stat tile ───────── */

export function StatTile({
  label,
  value,
  delta,
  spark,
  sparkColor,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: React.ReactNode;
  spark?: number[];
  sparkColor?: string;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col justify-between gap-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-ink-3">{label}</p>
        {delta}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[34px] font-medium leading-none tracking-[-0.04em]">{value}</p>
          {hint && <p className="mt-2 text-xs text-ink-3">{hint}</p>}
        </div>
        {spark && <Sparkline values={spark} color={sparkColor} />}
      </div>
    </div>
  );
}
