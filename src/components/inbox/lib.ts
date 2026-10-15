"use client";
import * as React from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { formatPhone } from "@/lib/shared/phone";
import { previewText } from "@/lib/shared/template";
import type { Contact, Interactive, Member, Message, Template } from "@/lib/shared/types";

/* ───────── send bodies ───────── */

export type SendBody =
  | { type: "text"; body: string }
  | { type: "media"; kind: "image" | "video" | "audio" | "document"; url: string; mime?: string; caption?: string; filename?: string }
  | { type: "interactive"; interactive: Interactive }
  | { type: "template"; template_id: string; values: Record<string, string> }
  | { type: "note"; body: string };

export type Sender = (body: SendBody) => Promise<boolean>;

/* ───────── small formatters ───────── */

export function displayName(c: { name: string | null; phone: string } | null | undefined): string {
  if (!c) return "";
  return c.name?.trim() || formatPhone(c.phone);
}

/** "now", "12m", "3h", "Yesterday", "Tue", "12 Oct" */
export function compactTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  const secs = Math.max(0, (now - t) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  const days = differenceInCalendarDays(new Date(now), new Date(t));
  if (days === 1) return "Yesterday";
  if (days < 7) return format(new Date(t), "EEE");
  return format(new Date(t), "d MMM");
}

export interface WindowInfo {
  open: boolean;
  msLeft: number;
  label: string;
}

export function windowInfo(expiresAt: string | null | undefined, now: number): WindowInfo {
  const msLeft = expiresAt ? Date.parse(expiresAt) - now : 0;
  if (msLeft <= 0) return { open: false, msLeft: 0, label: "" };
  const mins = Math.max(1, Math.ceil(msLeft / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return { open: true, msLeft, label: h > 0 ? `${h}h ${m}m left` : `${m}m left` };
}

export function memberFor(members: Member[] | undefined, userId: string | null | undefined): Member | undefined {
  if (!userId) return undefined;
  return members?.find((m) => m.user_id === userId);
}

/** The server writes "Photo", "Voice message"… as the preview; the list adds a matching icon. */
export function previewKind(preview: string | null | undefined): "image" | "video" | "audio" | "document" | "location" | "sticker" | null {
  if (!preview) return null;
  if (/^Photo\b/.test(preview)) return "image";
  if (/^Video\b/.test(preview)) return "video";
  if (/^Voice message\b/.test(preview)) return "audio";
  if (/^Document\b/.test(preview)) return "document";
  if (/^Location$/.test(preview)) return "location";
  if (/^Sticker$/.test(preview)) return "sticker";
  return null;
}

/* ───────── hooks ───────── */

export function useNow(interval = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function usePageVisible(): boolean {
  const [visible, setVisible] = React.useState(true);
  React.useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    on();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);
  return visible;
}

/* ───────── safe localStorage ───────── */

export function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function lsSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked */
  }
}

const RETRIED_KEY = "wadesk-inbox-retried";
export function loadRetried(): Set<string> {
  try {
    return new Set<string>(JSON.parse(lsGet(RETRIED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
export function saveRetried(ids: Set<string>) {
  lsSet(RETRIED_KEY, JSON.stringify([...ids].slice(-200)));
}

/** Unsent drafts survive switching conversations (not reloads). */
export const drafts = new Map<string, string>();

/* ───────── optimistic messages ───────── */

let tmpCounter = 0;

export function makeOptimistic(args: {
  conversationId: string;
  contactId: string;
  body: SendBody;
  author: { id: string; name: string };
  templates: Map<string, Template>;
}): Message {
  const { body, author } = args;
  const now = new Date().toISOString();
  const base: Message = {
    id: `tmp_${Date.now().toString(36)}_${++tmpCounter}`,
    workspace_id: "",
    conversation_id: args.conversationId,
    contact_id: args.contactId,
    direction: "out",
    type: "text",
    body: null,
    payload: { author },
    status: "queued",
    wa_message_id: null,
    error_code: null,
    error_message: null,
    campaign_id: null,
    sent_by: author.id,
    created_at: now,
    sent_at: null,
    delivered_at: null,
    read_at: null,
  };
  switch (body.type) {
    case "text":
      return { ...base, type: "text", body: body.body };
    case "note":
      return { ...base, type: "note", body: body.body, status: "sent" };
    case "media":
      return {
        ...base,
        type: body.kind,
        body: body.caption ?? null,
        payload: { author, media: { url: body.url, mime: body.mime, filename: body.filename, caption: body.caption } },
      };
    case "interactive":
      return { ...base, type: "interactive", body: body.interactive.body, payload: { author, interactive: body.interactive } };
    case "template": {
      const tpl = args.templates.get(body.template_id);
      return {
        ...base,
        type: "template",
        body: tpl ? previewText(tpl.content.body, (n) => body.values[`body.${n}`] ?? "") : null,
        payload: { author, template: { id: tpl?.id ?? body.template_id, name: tpl?.name ?? "template", language: tpl?.language ?? "en", content: tpl?.content, values: body.values } },
      };
    }
  }
}

/** Rebuild the request for a failed message so Retry resends the very same content. */
export function retryBody(m: Message): SendBody | null {
  const p = m.payload ?? {};
  switch (m.type) {
    case "text":
      return m.body ? { type: "text", body: m.body } : null;
    case "image":
    case "video":
    case "audio":
    case "document":
      return p.media?.url ? { type: "media", kind: m.type, url: p.media.url, mime: p.media.mime, caption: m.body ?? p.media.caption ?? undefined, filename: p.media.filename } : null;
    case "interactive":
      return p.interactive ? { type: "interactive", interactive: p.interactive } : null;
    case "template":
      return p.template?.id ? { type: "template", template_id: p.template.id, values: p.template.values ?? {} } : null;
    default:
      return null;
  }
}

/* ───────── display model: server messages + optimistic ones ───────── */

export interface DisplayItem {
  /** stable React key — an optimistic message keeps its key after the server copy replaces it */
  key: string;
  msg: Message;
}

function signature(m: Message): string {
  const p = m.payload ?? {};
  const core = m.type === "template" ? p.template?.id : p.media?.url ?? m.body;
  return `${m.type}|${core ?? ""}`;
}

export function buildDisplay(server: Message[], pending: Message[], hidden: Set<string>): DisplayItem[] {
  const claimed = new Map<string, string>();
  const matched = new Set<string>();
  for (const p of pending) {
    const sig = signature(p);
    const floor = Date.parse(p.created_at) - 30_000;
    const hit = server.find((s) => s.direction === "out" && !claimed.has(s.id) && signature(s) === sig && Date.parse(s.created_at) >= floor);
    if (hit) {
      claimed.set(hit.id, p.id);
      matched.add(p.id);
    }
  }
  const out: DisplayItem[] = [];
  for (const s of server) {
    if (hidden.has(s.id)) continue;
    out.push({ key: claimed.get(s.id) ?? s.id, msg: s });
  }
  for (const p of pending) if (!matched.has(p.id)) out.push({ key: p.id, msg: p });
  return out;
}

export function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export type ContactLite = Pick<Contact, "id" | "name" | "phone" | "opt_in" | "country">;
