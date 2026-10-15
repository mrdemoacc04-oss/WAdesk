import { dbFor } from "../context";
import type { Db } from "../db/scoped";
import { getProvider } from "../wa";
import { asWaError } from "../wa/errors";
import { DAYS } from "@/lib/shared/constants";
import { firstName, nowIso } from "@/lib/shared/utils";
import type {
  AutomationAction,
  AutomationRule,
  BusinessHours,
  Contact,
  Conversation,
  Message,
  Template,
} from "@/lib/shared/types";
import { ensureTags, normTags, setOptStatus } from "./contacts";
import { recordOutbound } from "./conversations";
import { sendTemplateMessage } from "./sending";
import { getWorkspace } from "./workspace";

export interface InboundEvent {
  ws: string;
  contact: Contact;
  conversation: Conversation;
  message: Message;
  text: string;
  isFirstMessage: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

export function keywordMatches(text: string, trigger: { match: string; keywords: string[] }): boolean {
  const t = norm(text);
  if (!t) return false;
  return trigger.keywords.some((k) => {
    const kw = norm(k);
    if (!kw) return false;
    if (trigger.match === "exact") return t === kw;
    if (trigger.match === "starts_with") return t.startsWith(kw);
    return ` ${t} `.includes(` ${kw} `);
  });
}

/** Is `now` inside the configured working hours (in the workspace timezone)? */
export function withinBusinessHours(h: BusinessHours, now = new Date()): boolean {
  if (!h.enabled) return true;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: h.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dayKey = DAYS.find((d) => d.short.toLowerCase() === get("weekday").toLowerCase().slice(0, 3))?.key;
  if (!dayKey) return true;
  const day = h.days[dayKey];
  if (!day?.enabled) return false;
  const cur = `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
  return cur >= day.open && cur <= day.close;
}

function fill(text: string, c: Contact): string {
  return text
    .replace(/\{\{\s*name\s*\}\}/gi, c.name ?? "there")
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName(c.name) || "there")
    .replace(/\{\{\s*phone\s*\}\}/gi, c.phone);
}

async function sendAuto(db: Db, ev: InboundEvent, ruleId: string, action: Extract<AutomationAction, { type: "send_text" | "send_buttons" | "send_template" }>) {
  const provider = await getProvider(ev.ws);
  const author = { id: `auto:${ruleId}`, name: "Automation" };
  try {
    if (action.type === "send_text") {
      const body = fill(action.body, ev.contact);
      const res = await provider.sendText(ev.contact.phone, body, { auto: true });
      await recordOutbound(db, [{ contact_id: ev.contact.id, type: "text", body, payload: { author }, status: "sent", wa_message_id: res.id }]);
    } else if (action.type === "send_buttons") {
      const interactive = {
        kind: "buttons" as const,
        body: fill(action.body, ev.contact),
        buttons: action.buttons.filter((b) => b.title.trim()).slice(0, 3).map((b, i) => ({ id: b.id || `btn_${i + 1}`, title: b.title.slice(0, 20) })),
      };
      const res = await provider.sendInteractive(ev.contact.phone, interactive, { auto: true });
      await recordOutbound(db, [{ contact_id: ev.contact.id, type: "interactive", body: interactive.body, payload: { author, interactive }, status: "sent", wa_message_id: res.id }]);
    } else {
      const tpl = await db.get<Template>("templates", action.template_id);
      if (!tpl || tpl.status !== "APPROVED") return;
      const values: Record<string, string> = {};
      const res = await sendTemplateMessage(provider, ev.contact.phone, tpl, values, `a:${ruleId.slice(0, 8)}`);
      await recordOutbound(db, [{ contact_id: ev.contact.id, type: "template", body: tpl.content.body, payload: { author, template: { id: tpl.id, name: tpl.name, language: tpl.language, values } }, status: "sent", wa_message_id: res.id }]);
    }
  } catch (e) {
    console.warn("[automation] send failed:", asWaError(e).message);
  }
}

async function runActions(db: Db, ev: InboundEvent, rule: Pick<AutomationRule, "id">, actions: AutomationAction[]) {
  for (const a of actions) {
    switch (a.type) {
      case "send_text":
      case "send_buttons":
      case "send_template":
        await sendAuto(db, ev, rule.id, a);
        break;
      case "add_tag": {
        const tags = normTags([...ev.contact.tags, a.tag]);
        await ensureTags(db, tags);
        await db.updateOne("contacts", ev.contact.id, { tags });
        ev.contact.tags = tags;
        break;
      }
      case "remove_tag": {
        const tags = ev.contact.tags.filter((t) => !normTags([a.tag]).includes(t));
        await db.updateOne("contacts", ev.contact.id, { tags });
        ev.contact.tags = tags;
        break;
      }
      case "assign":
        await db.updateOne("conversations", ev.conversation.id, { assigned_to: a.user_id });
        ev.conversation.assigned_to = a.user_id;
        break;
      case "opt_out":
        await setOptStatus(db, ev.contact.id, "opted_out", "automation");
        break;
      case "opt_in":
        await setOptStatus(db, ev.contact.id, "opted_in", "automation");
        break;
    }
  }
}

export async function runAutomations(ev: InboundEvent): Promise<void> {
  const db = dbFor(ev.ws);
  const ws = await getWorkspace(db);
  const c = ws.settings.compliance;
  const t = norm(ev.text);

  /* 1 · compliance keywords always win */
  if (t && c.optout_keywords.some((k) => norm(k) === t)) {
    if (ev.contact.opt_in !== "opted_out") {
      await setOptStatus(db, ev.contact.id, "opted_out", "whatsapp_keyword");
      await sendAuto(db, ev, "compliance", { type: "send_text", body: c.optout_reply });
    }
    return;
  }
  if (t && c.optin_keywords.some((k) => norm(k) === t) && ev.contact.opt_in !== "opted_in") {
    await setOptStatus(db, ev.contact.id, "opted_in", "whatsapp_keyword");
    await sendAuto(db, ev, "compliance", { type: "send_text", body: c.optin_reply });
    return;
  }

  const rules = (await db.select<AutomationRule>("automation_rules", { where: { enabled: true }, order: [["priority", "asc"], ["created_at", "asc"]], limit: 200 }));
  const fire = async (rule: AutomationRule) => {
    await runActions(db, ev, rule, rule.actions);
    await db.updateOne("automation_rules", rule.id, { triggered_count: rule.triggered_count + 1, last_triggered_at: nowIso() });
  };

  /* 2 · first keyword rule that matches */
  const kw = rules.find((r) => r.trigger.type === "keyword" && ev.text && keywordMatches(ev.text, r.trigger));
  if (kw) return fire(kw);

  /* 3 · away / welcome only when no human has picked the chat up */
  if (ev.conversation.assigned_to) return;

  const away = rules.find((r) => r.trigger.type === "outside_hours");
  if (away && !withinBusinessHours(ws.settings.business_hours)) {
    const recent = await db.count("messages", {
      conversation_id: ev.conversation.id,
      "payload.author.id": `auto:${away.id}`,
      created_at: { gt: new Date(Date.now() - 12 * 3600_000).toISOString() },
    });
    if (!recent) return fire(away);
    return;
  }

  const welcome = rules.find((r) => r.trigger.type === "first_message");
  if (welcome && ev.isFirstMessage) return fire(welcome);
}
