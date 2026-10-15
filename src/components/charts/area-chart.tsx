"use client";
import * as React from "react";
import { cn, fmtCompact, fmtNum } from "@/lib/shared/utils";
import { monotonePath, niceMax, useWidth } from "./use-size";

export interface Series {
  key: string;
  label: string;
  /** CSS colour, e.g. "var(--viz-1)" */
  color: string;
}

/**
 * Multi-series area/line chart. 2px lines, 10% area wash, hairline grid, crosshair + tooltip,
 * legend for 2+ series, and a table view (relief for sub-3:1 hues).
 */
export function AreaChart<T extends Record<string, any>>({
  data,
  series,
  xKey = "date",
  height = 260,
  formatX = (v) => String(v),
  formatTick,
  className,
  stacked = false,
}: {
  data: T[];
  series: Series[];
  xKey?: string;
  height?: number;
  formatX?: (v: any) => string;
  formatTick?: (v: number) => string;
  className?: string;
  stacked?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"chart" | "table">("chart");

  const pad = { l: 38, r: 14, t: 14, b: 26 };
  const w = Math.max(width, 240);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const n = data.length;

  const totals = data.map((d) => (stacked ? series.reduce((s, k) => s + (Number(d[k.key]) || 0), 0) : Math.max(...series.map((k) => Number(d[k.key]) || 0))));
  const maxV = niceMax(Math.max(1, ...totals));
  const x = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / maxV) * ih;
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxV / 4) * i);
  const tick = formatTick ?? ((v: number) => (v >= 1000 ? fmtCompact(v) : String(Math.round(v * 10) / 10)));

  const lines = series.map((s) => {
    const pts: [number, number][] = data.map((d, i) => [x(i), y(Number(d[s.key]) || 0)]);
    const line = monotonePath(pts);
    const area = pts.length ? `${line} L${pts[pts.length - 1][0]},${y(0)} L${pts[0][0]},${y(0)} Z` : "";
    return { s, pts, line, area };
  });

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const i = Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const hd = hover !== null ? data[hover] : null;
  const tipLeft = hover !== null ? Math.min(Math.max(x(hover) + 14, 8), w - 190) : 0;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        {series.length > 1 ? (
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
                {s.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setView(view === "chart" ? "table" : "chart")}
          className="rounded-full px-2.5 py-1 text-xs text-ink-3 transition-colors hover:bg-ink/[0.06] hover:text-ink"
        >
          {view === "chart" ? "View as table" : "View as chart"}
        </button>
      </div>

      {view === "table" ? (
        <div className="max-h-[320px] overflow-auto rounded-2xl hairline">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-3">
              <tr>
                <th className="px-4 py-2 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.key} className="px-4 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {data.map((d, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-1.5 text-ink-2">{formatX(d[xKey])}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-4 py-1.5 text-right">
                      {fmtNum(Number(d[s.key]) || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative" style={{ height }}>
          {width > 0 && (
            <svg width={w} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-pan-y overflow-visible" role="img" aria-label={`Chart of ${series.map((s) => s.label).join(", ")}`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                  <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" className="tabular">
                    {tick(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) =>
                i % labelEvery === 0 ? (
                  <text key={i} x={x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize={11} fill="var(--ink-3)">
                    {formatX(d[xKey])}
                  </text>
                ) : null,
              )}
              {lines.map(({ s, area }) => (
                <path key={`a-${s.key}`} d={area} fill={s.color} opacity={0.1} />
              ))}
              {lines.map(({ s, line }) => (
                <path key={`l-${s.key}`} d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              ))}
              {hover !== null && (
                <>
                  <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--line-strong)" strokeWidth={1} />
                  {lines.map(({ s, pts }) => (
                    <circle key={s.key} cx={pts[hover][0]} cy={pts[hover][1]} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  ))}
                </>
              )}
            </svg>
          )}
          {hd && hover !== null && (
            <div className="pointer-events-none absolute top-2 z-10 min-w-[168px] rounded-2xl bg-surface p-3 text-[13px] shadow-pop hairline" style={{ left: tipLeft }}>
              <p className="mb-1.5 font-medium">{formatX(hd[xKey])}</p>
              <ul className="space-y-1">
                {series.map((s) => (
                  <li key={s.key} className="flex items-center justify-between gap-5">
                    <span className="flex items-center gap-2 text-ink-2">
                      <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="tabular font-medium">{fmtNum(Number(hd[s.key]) || 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
