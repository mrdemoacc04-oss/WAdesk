import type { Ctx } from "../context";
import type { Db } from "../db/scoped";
import type { Where } from "../db/types";
import { HttpError } from "../http";
import { getProvider, providerMode } from "../wa";
import { asWaError } from "../wa/errors";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import { previewText, templateSlots } from "@/lib/shared/template";
import type {
  Contact,
  Conversation,
  ConversationListItem,
  Interactive,
  Message,
  MessagePayload,
  MessageType,
  Page,
  QuickReply,
  Template,
} from "@/lib/shared/types";
import { ensureConversations, recordOutbound } from "./conversations";
import { resolveMedia, sendTemplateMessage } from "./sending";

const DAY = 24 * 3600_000;

export function windowOpen(lastInboundAt: string | null): boolean {
  return !!lastInboundAt && Date.now() - Date.parse(lastInboundAt) < DAY;
}

export async function listConversations(
  ctx: Ctx,
  f: { tab?: string; q?: string; limit?: number; offset?: number },
): Promise<Page<ConversationListItem>> {
  const where: Where = {};
  switch (f.tab) {
    case "unread":
      where.unread_count = { gt: 0 };
      where.status = "open";
      break;
    case "mine":
      where.assigned_to = ctx.user.id;
      where.status = "open";
      break;
    case "unassigned":
      where.assigned_to = null;
      where.status = "open";
      break;
    case "resolved":
      where.status = "resolved";
      break;
    default:
      where.status = "open";
  }
  // conversations that have never had traffic (just created by a lookup) stay hidden
  where.last_message_at = { isNull: false };

  let or: Where[] | undefined;
  if (f.q?.trim()) {
    const hits = await ctx.db.select<Contact>("contacts", {
      search: { cols: ["name", "phone"], term: f.q.trim() },
      limit: 80,
    });
    or = [{ last_message_preview: { like: f.q.trim() } }];
    if (hits.length) or.push({ contact_id: { in: hits.map((h) => h.id) } });
  }

  const page = await ctx.db.selectPage<Conversation>("conversations", {
    where,
    or,
    order: [["last_message_at", "desc"]],
    limit: f.limit ?? 40,
    offset: f.offset ?? 0,
  });
  const contacts = new Map<string, Contact>();
  if (page.rows.length) {
    for (const c of await ctx.db.select<Contact>("contacts", { where: { id: { in: page.rows.map((r) => r.contact_id) } } })) contacts.set(c.id, c);
  }
  const rows: ConversationListItem[] = page.rows.flatMap((conv) => {
    const c = contacts.get(conv.contact_id);
    if (!c) return [];
    return [{ ...conv, contact: { id: c.id, name: c.name, phone: c.phone, tags: c.tags, opt_in: c.opt_in, country: c.country } }];
  });
  return { rows, total: page.total };
}

export async function unreadCount(db: Db): Promise<number> {
  return db.count("conversations", { unread_count: { gt: 0 }, status: "open" });
}

export async function getConversationBundle(db: Db, id: string) {
  const conv = await db.get<Conversation>("conversations", id);
  if (!conv) throw new HttpError(404, "NOT_FOUND", "Conversation not found");
  const contact = await db.get<Contact>("contacts", conv.contact_id);
  if (!contact) throw new HttpError(404, "NOT_FOUND", "Contact not found");
  return { conversation: conv, contact, window_open: windowOpen(conv.last_inbound_at), window_expires_at: conv.last_inbound_at ? new Date(Date.parse(conv.last_inbound_at) + DAY).toISOString() : null };
}

/** Newest-last page; pass `before` (ISO created_at of the oldest loaded message) to go back in time. */
export async function listMessages(db: Db, conversationId: string, f: { before?: string; limit?: number }) {
  const limit = f.limit ?? 60;
  const where: Where = { conversation_id: conversationId };
  if (f.before) where.created_at = { lt: f.before };
  const rows = await db.select<Message>("messages", { where, order: [["created_at", "desc"], ["id", "desc"]], limit: limit + 1 });
  const more = rows.length > limit;
  return { messages: rows.slice(0, limit).reverse(), has_more: more };
}

export async function markConversationRead(ctx: Ctx, id: string) {
  const conv = await ctx.db.get<Conversation>("conversations", id);
  if (!conv || conv.unread_count === 0) return conv;
  const updated = await ctx.db.updateOne<Conversation>("conversations", id, { unread_count: 0 });
  // tell WhatsApp (blue ticks for the customer) — best effort
  try {
    if ((await providerMode(ctx.ws)) === "live") {
      const last = await ctx.db.select<Message>("messages", { where: { conversation_id: id, direction: "in" }, order: [["created_at", "desc"]], limit: 1 });
      if (last[0]?.wa_message_id) await (await getProvider(ctx.ws)).markRead(last[0].wa_message_id);
    }
  } catch {}
  return updated;
}

export async function patchConversation(ctx: Ctx, id: string, patch: { status?: "open" | "resolved"; assigned_to?: string | null }) {
  const upd: Record<string, any> = {};
  if (patch.status) upd.status = patch.status;
  if (patch.assigned_to !== undefined) upd.assigned_to = patch.assigned_to;
  const out = await ctx.db.updateOne<Conversation>("conversations", id, upd);
  if (!out) throw new HttpError(404, "NOT_FOUND", "Conversation not found");
  return out;
}

/* ───────── sending ───────── */

export type SendInput =
  | { type: "text"; body: string; reply_to?: string }
  | { type: "media"; kind: "image" | "video" | "audio" | "document"; url: string; mime?: string; caption?: string; filename?: string }
  | { type: "interactive"; interactive: Interactive }
  | { type: "template"; template_id: string; values: Record<string, string> }
  | { type: "note"; body: string };

export async function sendInConversation(ctx: Ctx, conversationId: string, input: SendInput): Promise<Message> {
  const conv = await ctx.db.get<Conversation>("conversations", conversationId);
  if (!conv) throw new HttpError(404, "NOT_FOUND", "Conversation not found");
  const contact = await ctx.db.get<Contact>("contacts", conv.contact_id);
  if (!contact) throw new HttpError(404, "NOT_FOUND", "Contact not found");

  if (input.type === "note") {
    const [m] = await recordOutbound(ctx.db, [
      { contact_id: contact.id, type: "note", body: input.body, payload: { author: { id: ctx.user.id, name: ctx.user.name } }, status: "sent", wa_message_id: null, sent_by: ctx.user.id },
    ]);
    return m;
  }

  if (input.type !== "template" && !windowOpen(conv.last_inbound_at)) {
    throw new HttpError(422, "WINDOW_CLOSED", "The 24-hour reply window is closed. Send an approved template to restart the conversation.");
  }
  if (input.type === "template" && contact.opt_in === "opted_out") {
    throw new HttpError(422, "OPTED_OUT", "This contact opted out of messages.");
  }

  const provider = await getProvider(ctx.ws);
  const author = { id: ctx.user.id, name: ctx.user.name };
  let type: MessageType = "text";
  let body: string | null = null;
  let payload: MessagePayload = { author };

  try {
    let res: { id: string };
    switch (input.type) {
      case "text":
        res = await provider.sendText(contact.phone, input.body, { replyTo: input.reply_to });
        body = input.body;
        break;
      case "media": {
        const ref = await resolveMedia(provider, input.url);
        res = await provider.sendMedia(contact.phone, {
          kind: input.kind,
          caption: input.caption,
          filename: input.filename,
          ...(ref.startsWith("id:") ? { id: ref.slice(3) } : { link: ref }),
        });
        type = input.kind;
        body = input.caption ?? null;
        payload = { author, media: { url: input.url, mime: input.mime, filename: input.filename, caption: input.caption } };
        break;
      }
      case "interactive":
        res = await provider.sendInteractive(contact.phone, input.interactive);
        type = "interactive";
        body = input.interactive.body;
        payload = { author, interactive: input.interactive };
        break;
      case "template": {
        const tpl = await ctx.db.get<Template>("templates", input.template_id);
        if (!tpl) throw new HttpError(404, "NOT_FOUND", "Template not found");
        if (tpl.status !== "APPROVED") throw new HttpError(422, "NOT_APPROVED", "Only approved templates can be sent.");
        const missing = templateSlots(tpl.content).find((s) => s.kind !== "media" && s.kind !== "code" && !input.values[s.key]?.trim());
        if (missing) throw new HttpError(422, "MISSING_VAR", `Fill in “${missing.label}”.`);
        res = await sendTemplateMessage(provider, contact.phone, tpl, input.values, `t:${tpl.id.slice(0, 8)}`);
        type = "template";
        body = previewText(tpl.content.body, (n) => input.values[`body.${n}`] ?? "");
        payload = { author, template: { id: tpl.id, name: tpl.name, language: tpl.language, content: tpl.content, values: input.values } };
        break;
      }
    }
    const [m] = await recordOutbound(ctx.db, [{ contact_id: contact.id, type, body, payload, status: "sent", wa_message_id: res.id, sent_by: ctx.user.id }]);
    await ctx.db.updateOne("conversations", conv.id, { status: "open" });
    return m;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const w = asWaError(e);
    await recordOutbound(ctx.db, [
      { contact_id: contact.id, type, body, payload, status: "failed", wa_message_id: null, sent_by: ctx.user.id, error_code: w.code, error_message: w.details ?? w.message },
    ]);
    throw new HttpError(422, "SEND_FAILED", `${waErrorInfo(w.code).title}. ${w.details ?? w.message}`, { code: w.code });
  }
}

/** Start a conversation with any contact (creates the thread so templates have somewhere to land). */
export async function openConversationFor(db: Db, contactId: string): Promise<Conversation> {
  const map = await ensureConversations(db, [contactId]);
  return map.get(contactId)!;
}

/* ───────── quick replies ───────── */

export const listQuickReplies = (db: Db) => db.select<QuickReply>("quick_replies", { order: [["shortcut", "asc"]], limit: 200 });

export async function saveQuickReply(db: Db, input: { shortcut: string; body: string }, id?: string) {
  const shortcut = input.shortcut.trim().replace(/^\//, "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!shortcut) throw new HttpError(422, "VALIDATION", "Shortcut can use letters, numbers, - and _");
  const dupe = await db.one<QuickReply>("quick_replies", { shortcut });
  if (dupe && dupe.id !== id) throw new HttpError(409, "DUPLICATE", `/${shortcut} already exists`);
  if (id) return db.updateOne<QuickReply>("quick_replies", id, { shortcut, body: input.body });
  return db.insertOne<QuickReply>("quick_replies", { shortcut, body: input.body });
}

