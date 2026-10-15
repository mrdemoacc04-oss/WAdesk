import {
  BellRinging,
  BellSlash,
  ChatText,
  CursorClick,
  HandWaving,
  MagnifyingGlass,
  Moon,
  SquaresFour,
  Tag,
  TagSimple,
  UserPlus,
  type Icon,
} from "@phosphor-icons/react";
import { DAYS } from "@/lib/shared/constants";
import { slugify } from "@/lib/shared/utils";
import type { AutomationAction, AutomationRule, AutomationTrigger, BusinessHours, Member, Template } from "@/lib/shared/types";

/* ───────── rule drafts ───────── */

export type RuleDraft = Pick<AutomationRule, "name" | "enabled" | "priority" | "trigger" | "actions">;

export const PRIORITY_VALUE = { first: 1, normal: 10, last: 50 } as const;
export type PriorityKey = keyof typeof PRIORITY_VALUE;
export const priorityKey = (p: number): PriorityKey => (p <= 5 ? "first" : p <= 20 ? "normal" : "last");

export const MAX_ACTIONS = 8;
export const MAX_BUTTONS = 3;
export const BUTTON_TITLE_MAX = 20;

/* ───────── trigger ───────── */

export const TRIGGER_META: Record<AutomationTrigger["type"], { label: string; description: string; icon: Icon }> = {
  keyword: { label: "A message has certain words", description: "Reply when a customer writes one of your keywords", icon: MagnifyingGlass },
  first_message: { label: "First message from a new contact", description: "Greet people the first time they write in", icon: HandWaving },
  outside_hours: { label: "A message arrives outside business hours", description: "Let people know when you will be back", icon: Moon },
};

const MATCH_VERB = { contains: "Message contains", exact: "Message is exactly", starts_with: "Message starts with" } as const;

export function triggerSummary(t: AutomationTrigger): string {
  if (t.type === "keyword") {
    const shown = t.keywords.slice(0, 4).join(", ");
    const more = t.keywords.length - 4;
    return `${MATCH_VERB[t.match]}: ${shown || "no keywords yet"}${more > 0 ? ` +${more} more` : ""}`;
  }
  if (t.type === "first_message") return "First message from a new contact";
  return "Message arrives outside business hours";
}

/* ───────── actions ───────── */

export const ACTION_META: Record<AutomationAction["type"], { label: string; icon: Icon; description: string }> = {
  send_text: { label: "Send a text reply", icon: ChatText, description: "A plain WhatsApp message" },
  send_buttons: { label: "Send a message with buttons", icon: CursorClick, description: "Up to 3 tap-to-reply buttons" },
  send_template: { label: "Send a template", icon: SquaresFour, description: "An approved message template" },
  add_tag: { label: "Add a tag", icon: Tag, description: "Label the contact for later" },
  remove_tag: { label: "Remove a tag", icon: TagSimple, description: "Take a label off the contact" },
  assign: { label: "Assign to a teammate", icon: UserPlus, description: "Hand the chat to someone" },
  opt_out: { label: "Mark as opted out", icon: BellSlash, description: "Stop marketing messages" },
  opt_in: { label: "Mark as opted in", icon: BellRinging, description: "Allow marketing messages" },
};

export const ACTION_ORDER: AutomationAction["type"][] = ["send_text", "send_buttons", "send_template", "add_tag", "remove_tag", "assign", "opt_out", "opt_in"];

export function blankAction(type: AutomationAction["type"]): AutomationAction {
  switch (type) {
    case "send_text":
      return { type, body: "" };
    case "send_buttons":
      return { type, body: "", buttons: [{ id: "", title: "" }] };
    case "send_template":
      return { type, template_id: "" };
    case "add_tag":
    case "remove_tag":
      return { type, tag: "" };
    case "assign":
      return { type, user_id: "" };
    case "opt_out":
    case "opt_in":
      return { type };
  }
}

export function actionChipLabel(a: AutomationAction, ctx: { templates?: Map<string, Pick<Template, "name">>; members?: Map<string, Pick<Member, "name">> }): string {
  switch (a.type) {
    case "send_text":
      return "Text reply";
    case "send_buttons":
      return `Buttons · ${a.buttons.filter((b) => b.title.trim()).map((b) => b.title).join(", ") || "none yet"}`;
    case "send_template":
      return ctx.templates?.get(a.template_id)?.name ? `Template · ${ctx.templates.get(a.template_id)!.name}` : "Template";
    case "add_tag":
      return `Add tag “${a.tag}”`;
    case "remove_tag":
      return `Remove tag “${a.tag}”`;
    case "assign":
      return `Assign to ${ctx.members?.get(a.user_id)?.name ?? "a teammate"}`;
    case "opt_out":
      return "Mark opted out";
    case "opt_in":
      return "Mark opted in";
  }
}

/** The text a customer will see first, for the one-line summary on a rule row. */
export function replyPreview(actions: AutomationAction[]): string | null {
  for (const a of actions) {
    if (a.type === "send_text" || a.type === "send_buttons") return a.body.trim() || null;
  }
  return null;
}

/** Give every button a stable id (the id is what comes back when a customer taps it). */
export function withButtonIds(actions: AutomationAction[]): AutomationAction[] {
  return actions.map((a) => {
    if (a.type !== "send_buttons") return a;
    const used = new Set<string>();
    const buttons = a.buttons
      .filter((b) => b.title.trim())
      .slice(0, MAX_BUTTONS)
      .map((b, i) => {
        let id = b.id?.trim() || slugify(b.title) || `btn_${i + 1}`;
        while (used.has(id)) id = `${id}_${i + 1}`;
        used.add(id);
        return { id, title: b.title.trim().slice(0, BUTTON_TITLE_MAX) };
      });
    return { ...a, body: a.body.trim(), buttons };
  });
}

/* ───────── hours helpers ───────── */

const to12 = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/** "Mon–Fri 9:30 AM–6:30 PM, Sat 10 AM–2 PM" from the configured days. */
export function describeHours(h: BusinessHours): string {
  const groups: { from: string; to: string; open: string; close: string }[] = [];
  for (const d of DAYS) {
    const day = h.days[d.key];
    if (!day?.enabled) continue;
    const last = groups[groups.length - 1];
    const prevIdx = last ? DAYS.findIndex((x) => x.short === last.to) : -2;
    const idx = DAYS.findIndex((x) => x.key === d.key);
    if (last && last.open === day.open && last.close === day.close && prevIdx === idx - 1) last.to = d.short;
    else groups.push({ from: d.short, to: d.short, open: day.open, close: day.close });
  }
  if (!groups.length) return "";
  return groups.map((g) => `${g.from === g.to ? g.from : `${g.from}–${g.to}`} ${to12(g.open)}–${to12(g.close)}`).join(", ");
}

/** Is the business open right now in the given timezone? (Mirrors the server check.) */
export function isOpenNow(h: BusinessHours, now = new Date()): boolean {
  if (!h.enabled) return true;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: h.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const dayKey = DAYS.find((d) => d.short.toLowerCase() === get("weekday").toLowerCase().slice(0, 3))?.key;
    if (!dayKey) return true;
    const day = h.days[dayKey];
    if (!day?.enabled) return false;
    const cur = `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
    return cur >= day.open && cur <= day.close;
  } catch {
    return true;
  }
}

export function nowInZone(tz: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(now);
  } catch {
    return "";
  }
}

/* ───────── starters ───────── */

export interface Starter {
  id: string;
  title: string;
  description: string;
  icon: Icon;
  rule: RuleDraft;
}

export const DEFAULT_WELCOME = (workspace: string) =>
  `Hi {{first_name}}, thanks for messaging ${workspace}. A teammate will reply shortly. Tell us what you're looking for in the meantime.`;

export const DEFAULT_AWAY = (hours: string) =>
  `Thanks for writing in. We're away right now and will reply when we're back${hours ? ` (${hours})` : ""}.`;

export function starterRules(workspace: string, hours: BusinessHours): Starter[] {
  const h = describeHours(hours);
  return [
    {
      id: "pricing",
      title: "Pricing questions",
      description: "Answer “price” and “cost” with buttons, and tag the contact as a lead.",
      icon: MagnifyingGlass,
      rule: {
        name: "Pricing questions",
        enabled: true,
        priority: PRIORITY_VALUE.first,
        trigger: { type: "keyword", match: "contains", keywords: ["price", "pricing", "cost", "rates", "quote"] },
        actions: [
          {
            type: "send_buttons",
            body: "Thanks for your interest. Our team will share the latest pricing with you shortly. How would you like to continue?",
            buttons: [
              { id: "send_details", title: "Send details here" },
              { id: "call_me", title: "Call me back" },
            ],
          },
          { type: "add_tag", tag: "lead" },
        ],
      },
    },
    {
      id: "hours",
      title: "Opening hours",
      description: "Reply with your working hours whenever someone asks about timings.",
      icon: Moon,
      rule: {
        name: "Opening hours",
        enabled: true,
        priority: PRIORITY_VALUE.normal,
        trigger: { type: "keyword", match: "contains", keywords: ["hours", "timing", "timings", "opening hours"] },
        actions: [{ type: "send_text", body: h ? `We're available ${h}.` : "We're available during business hours. Leave a message and we'll reply as soon as we can." }],
      },
    },
    {
      id: "welcome",
      title: "Welcome message",
      description: "Greet every new contact by name the first time they write in.",
      icon: HandWaving,
      rule: {
        name: "Welcome new chats",
        enabled: true,
        priority: PRIORITY_VALUE.normal,
        trigger: { type: "first_message" },
        actions: [{ type: "send_text", body: DEFAULT_WELCOME(workspace) }],
      },
    },
  ];
}

/** Sample customer name used wherever the editor previews {{name}} and {{first_name}}. */
export const SAMPLE_NAME = "Aarav Mehta";
export const fillSample = (text: string) =>
  text
    .replace(/\{\{\s*name\s*\}\}/gi, SAMPLE_NAME)
    .replace(/\{\{\s*first_name\s*\}\}/gi, SAMPLE_NAME.split(" ")[0])
    .replace(/\{\{\s*phone\s*\}\}/gi, "+91 98765 43210");
