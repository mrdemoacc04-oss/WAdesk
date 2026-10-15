import type { Db } from "../db/scoped";
import { chunk, nowIso, uniq } from "@/lib/shared/utils";
import { previewText } from "@/lib/shared/template";
import type { Contact, Conversation, Message, MessagePayload, MessageStatus, MessageType } from "@/lib/shared/types";

/** One-line summary for conversation lists. Text only — the UI adds the icon. */
export function previewFor(type: MessageType, body: string | null, payload: MessagePayload): string {
  switch (type) {
    case "text":
    case "note":
    case "system":
      return body ?? "";
    case "image":
      return body ? `Photo · ${body}` : "Photo";
    case "video":
      return body ? `Video · ${body}` : "Video";
    case "audio":
      return "Voice message";
    case "document":
      return payload.media?.filename ? `Document · ${payload.media.filename}` : "Document";
    case "sticker":
      return "Sticker";
    case "location":
      return "Location";
    case "contacts":
      return "Contact card";
    case "reaction":
      return `Reacted ${payload.reaction?.emoji ?? ""}`.trim();
    case "button":
      return body ?? payload.reply?.title ?? "Button reply";
    case "interactive":
      return body ?? payload.interactive?.body ?? "Interactive message";
    case "template": {
      const t = payload.template;
      if (!t) return body ?? "Template";
      const content = t.content;
      if (!content) return body ?? t.name;
      const vals = t.values ?? {};
      return previewText(content.body, (n) => vals[`body.${n}`] ?? content.body_examples[n - 1] ?? "").replace(/\s+/g, " ");
    }
    default:
      return body ?? "Message";
  }
}

export async function ensureConversations(db: Db, contactIds: string[]): Promise<Map<string, Conversation>> {
  const ids = uniq(contactIds);
  const map = new Map<string, Conversation>();
  for (const part of chunk(ids, 100)) {
    for (const c of await db.select<Conversation>("conversations", { where: { contact_id: { in: part } } })) map.set(c.contact_id, c);
  }
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) {
    const created = await db.upsert<Conversation>(
      "conversations",
      missing.map((contact_id) => ({
        contact_id,
        status: "open",
        assigned_to: null,
        unread_count: 0,
        last_message_at: null,
        last_message_preview: null,
        last_message_direction: null,
        last_message_status: null,
        last_inbound_at: null,
      })),
      ["workspace_id", "contact_id"],
    );
    for (const c of created) map.set(c.contact_id, c);
  }
  return map;
}

export interface OutboundItem {
  contact_id: string;
  type: MessageType;
  body: string | null;
  payload: MessagePayload;
  status: MessageStatus;
  wa_message_id: string | null;
  campaign_id?: string | null;
  sent_by?: string | null;
  error_code?: string | null;
  error_message?: string | null;
}

/** Persist outbound messages and refresh their conversations in bulk. */
export async function recordOutbound(db: Db, items: OutboundItem[]): Promise<Message[]> {
  if (!items.length) return [];
  const now = nowIso();
  const convs = await ensureConversations(db, items.map((i) => i.contact_id));

  const messages = await db.insert<Message>(
    "messages",
    items.map((i) => ({
      conversation_id: convs.get(i.contact_id)!.id,
      contact_id: i.contact_id,
      direction: "out",
      type: i.type,
      body: i.body,
      payload: i.payload,
      status: i.status,
      wa_message_id: i.wa_message_id,
      error_code: i.error_code ?? null,
      error_message: i.error_message ?? null,
      campaign_id: i.campaign_id ?? null,
      sent_by: i.sent_by ?? null,
      created_at: now,
      sent_at: i.status === "sent" ? now : null,
      delivered_at: null,
      read_at: null,
    })),
  );

  // last write per contact wins the preview
  const last = new Map<string, OutboundItem>();
  for (const i of items) if (i.type !== "note") last.set(i.contact_id, i);
  const updates = [...last.entries()].map(([contactId, i]) => ({
    ...convs.get(contactId)!,
    last_message_at: now,
    last_message_preview: previewFor(i.type, i.body, i.payload).slice(0, 200),
    last_message_direction: "out" as const,
    last_message_status: i.status,
  }));
  if (updates.length) await db.upsert("conversations", updates, ["workspace_id", "contact_id"]);

  const ids = uniq(items.filter((i) => i.type !== "note").map((i) => i.contact_id));
  for (const part of chunk(ids, 100)) await db.update("contacts", { id: { in: part } }, { last_outbound_at: now });
  return messages;
}

export interface InboundInput {
  contact: Contact;
  type: MessageType;
  body: string | null;
  payload: MessagePayload;
  wa_message_id: string;
  at: string;
}

export async function recordInbound(db: Db, i: InboundInput): Promise<{ message: Message; conversation: Conversation; isNewConversation: boolean; duplicate: boolean }> {
  const existing = await db.one<Conversation>("conversations", { contact_id: i.contact.id });
  const [conv] = existing ? [existing] : [...(await ensureConversations(db, [i.contact.id])).values()];
  const isNew = !existing || (!existing.last_inbound_at && !existing.last_message_at);

  const dupe = await db.one<Message>("messages", { wa_message_id: i.wa_message_id });
  if (dupe) return { message: dupe, conversation: conv, isNewConversation: false, duplicate: true }; // Meta retries webhooks

  const message = await db.insertOne<Message>("messages", {
    conversation_id: conv.id,
    contact_id: i.contact.id,
    direction: "in",
    type: i.type,
    body: i.body,
    payload: i.payload,
    status: "received",
    wa_message_id: i.wa_message_id,
    error_code: null,
    error_message: null,
    campaign_id: null,
    sent_by: null,
    created_at: i.at,
    sent_at: i.at,
    delivered_at: null,
    read_at: null,
  });

  const updated = await db.updateOne<Conversation>("conversations", conv.id, {
    status: "open",
    unread_count: conv.unread_count + (i.type === "reaction" ? 0 : 1),
    last_message_at: i.at,
    last_message_preview: previewFor(i.type, i.body, i.payload).slice(0, 200),
    last_message_direction: "in",
    last_message_status: "received",
    last_inbound_at: i.at,
  });
  await db.update("contacts", { id: i.contact.id }, { last_inbound_at: i.at });
  return { message, conversation: updated ?? conv, isNewConversation: isNew, duplicate: false };
}
