import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
} from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const nowIso = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

/* ───────── numbers ───────── */

export function fmtNum(n: number | null | undefined): string {
  return new Intl.NumberFormat("en-IN").format(n ?? 0);
}
export function fmtCompact(n: number | null | undefined): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n ?? 0);
}
export function pct(part: number, whole: number, digits = 1): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 10 ** (digits + 2)) / 10 ** digits;
}
export function fmtPct(part: number, whole: number, digits = 1): string {
  return `${pct(part, whole, digits)}%`;
}
export function fmtMoney(n: number, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en", {
      style: "currency",
      currency,
      maximumFractionDigits: n < 100 ? 2 : 0,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/* ───────── dates ───────── */

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const secs = Math.abs(Date.now() - d.getTime()) / 1000;
  if (secs < 45) return "just now";
  return formatDistanceToNowStrict(d, { addSuffix: true });
}
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEEE");
  return format(d, "d MMM yyyy");
}
export function clock(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "h:mm a") : "";
}
export function shortDate(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM, h:mm a") : "—";
}
export function dateOnly(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM yyyy") : "—";
}

/* ───────── strings ───────── */

export function initials(name: string | null | undefined, fallback = "?"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable pastel pair for avatars & tags that works on light and dark canvases. */
export function hueStyle(seed: string): { background: string; color: string } {
  const hue = (hashStr(seed) * 137.508) % 360;
  return {
    background: `hsl(${hue.toFixed(0)} 55% 50% / 0.16)`,
    color: `color-mix(in srgb, hsl(${hue.toFixed(0)} 62% 38%), var(--ink) 30%)`,
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

export function pluralize(n: number, one: string, many = one + "s"): string {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

export function randomToken(len = 24): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, len);
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
