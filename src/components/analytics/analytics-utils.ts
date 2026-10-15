import type { DayPoint } from "@/lib/shared/analytics";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-16" → "16 Sep" without going through Date (no timezone shifts). */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${Number(d)} ${MONTHS[mi]}` : iso;
}

export function longDay(iso: string): string {
  const [y, m, d] = iso.split("-");
  const mi = Number(m) - 1;
  return mi >= 0 && mi < 12 ? `${Number(d)} ${MONTHS[mi]} ${y}` : iso;
}

export const pctOf = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

export interface Sums {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
}

export function sumSeries(points: DayPoint[]): Sums {
  return points.reduce<Sums>(
    (a, p) => ({ sent: a.sent + p.sent, delivered: a.delivered + p.delivered, read: a.read + p.read, replied: a.replied + p.replied, failed: a.failed + p.failed }),
    { sent: 0, delivered: 0, read: 0, replied: 0, failed: 0 },
  );
}

/** Trailing 7-day rate per day, so sparklines show a trend instead of daily noise. */
export function rollingRate(points: DayPoint[], num: (p: DayPoint) => number, den: (p: DayPoint) => number, window = 7): number[] {
  return points.map((_, i) => {
    const slice = points.slice(Math.max(0, i - window + 1), i + 1);
    const n = slice.reduce((s, p) => s + num(p), 0);
    const d = slice.reduce((s, p) => s + den(p), 0);
    return d ? (n / d) * 100 : 0;
  });
}

/* ───────── best time to send ───────── */

const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function hour12(h: number): { n: number; ap: "AM" | "PM" } {
  const hh = ((h % 24) + 24) % 24;
  return { n: hh % 12 === 0 ? 12 : hh % 12, ap: hh < 12 ? "AM" : "PM" };
}

export function hourRange(start: number, end: number): string {
  const a = hour12(start);
  const b = hour12(end);
  return a.ap === b.ap ? `${a.n}–${b.n} ${b.ap}` : `${a.n} ${a.ap}–${b.n} ${b.ap}`;
}

export interface BestTime {
  day: string;
  dayLong: string;
  window: string;
  reads: number;
  total: number;
  share: number;
  /** a second, different suggestion */
  next: { day: string; window: string } | null;
}

/** Find the busiest two-hour window of any weekday from a [weekday][hour] grid of read events. */
export function bestTime(grid: number[][]): BestTime | null {
  const total = grid.flat().reduce((s, v) => s + v, 0);
  if (total < 8) return null;
  const windows: { d: number; h: number; v: number }[] = [];
  for (let d = 0; d < grid.length; d++) {
    for (let h = 0; h < 23; h++) windows.push({ d, h, v: (grid[d][h] ?? 0) + (grid[d][h + 1] ?? 0) });
  }
  windows.sort((a, b) => b.v - a.v || a.d - b.d || a.h - b.h);
  const best = windows[0];
  if (!best || best.v === 0) return null;
  const second = windows.find((w) => w.d !== best.d && w.v > 0 && w.v >= best.v * 0.6) ?? null;
  return {
    day: DAY_SHORT[best.d],
    dayLong: DAY_LONG[best.d],
    window: hourRange(best.h, best.h + 2),
    reads: best.v,
    total,
    share: pctOf(best.v, total),
    next: second ? { day: DAY_SHORT[second.d], window: hourRange(second.h, second.h + 2) } : null,
  };
}

/* ───────── csv ───────── */

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
