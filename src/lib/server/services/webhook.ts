import type { Adapter } from "../db/types";
import { dbFor } from "../context";
import type { Db } from "../db/scoped";
import { fromWaId, normalizePhone } from "@/lib/shared/phone";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import type {
  Campaign,
  CampaignMessage,
  Conversation,
  Message,
  MessagePayload,
  MessageStatus,
  MessageType,
  Template,
  TemplateStatus,
  WaAccount,
} from "@/lib/shared/types";
import { setOptStatus, upsertInboundContact } from "./contacts";
import { refreshStats } from "./campaigns";
import { recordInbound } from "./conversations";
import { runAutomations } from "./automation";

const RANK: Record<string, number> = { queued: 0, sending: 1, sent: 2, delivered: 3, read: 4 };
const iso = (unix: string | number) => new Date(Number(unix) * 1000).toISOString();

export interface WebhookResult {
  statuses: number;
  messages: number;
  templates: number;
}

export async function findAccountByPhoneNumberId(root: Adapter, phoneNumberId: string) {
  const [a] = await root.select<WaAccount>("wa_accounts", { where: { phone_number_id: phoneNumberId }, limit: 1 });
  return a ?? null;
}

export async function findAccountByWaba(root: Adapter, wabaId: string) {
  const [a] = await root.select<WaAccount>("wa_accounts", { where: { waba_id: wabaId }, limit: 1 });
  return a ?? null;
}

export async function handleWebhookPayload(root: Adapter, payload: any): Promise<WebhookResult> {
  const out: WebhookResult = { statuses: 0, messages: 0, templates: 0 };
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      try {
        if (change.field === "messages") {
          const acct = await findAccountByPhoneNumberId(root, v.metadata?.phone_number_id);
          if (!acct) continue;
          const db = dbFor(acct.workspace_id);
          if (v.statuses?.length) {
            await applyStatuses(db, v.statuses);
            out.statuses += v.statuses.length;
          }
          for (const m of v.messages ?? []) {
            await handleInbound(db, acct.workspace_id, m, v.contacts ?? []);
            out.messages++;
          }
        } else if (change.field === "message_template_status_update" || change.field === "message_template_quality_update") {
          const acct = await findAccountByWaba(root, String(entry.id));
          if (!acct) continue;
          await applyTemplateUpdate(dbFor(acct.workspace_id), change.field, v);
          out.templates++;
        } else if (change.field === "phone_number_quality_update") {
          const acct = (await findAccountByWaba(root, String(entry.id))) ?? null;
          if (!acct) continue;
          const tier = v.current_limit ?? null;
          const rating = v.event === "DOWNGRADE" ? "YELLOW" : v.event === "FLAGGED" ? "RED" : acct.quality_rating;
          await dbFor(acct.workspace_id).updateOne("wa_accounts", acct.id, { messaging_limit_tier: tier ?? acct.messaging_limit_tier, quality_rating: rating });
        }
      } catch (e) {
        // never fail the whole webhook — Meta would retry the entire batch
        console.error(`[webhook] ${change.field}:`, e);
      }
    }
  }
  return out;
}

/* ───────── delivery receipts ───────── */

async function applyStatuses(db: Db, statuses: any[]) {
  const touched = new Set<string>();
  for (const s of statuses) {
    const wamid: string = s.id;
    const status: string = s.status;
    if (!wamid || !(status in RANK || status === "failed")) continue;
    const at = iso(s.timestamp ?? Date.now() / 1000);
    const err = s.errors?.[0];

    const [cm, msg] = await Promise.all([
      db.one<CampaignMessage>("campaign_messages", { wa_message_id: wamid }),
      db.one<Message>("messages", { wa_message_id: wamid }),
    ]);

    const stamp = (cur: { sent_at?: string | null; delivered_at?: string | null; read_at?: string | null }) => {
      const p: Record<string, any> = {};
      if (status === "sent" || status === "delivered" || status === "read") p.sent_at = cur.sent_at ?? at;
      if (status === "delivered" || status === "read") p.delivered_at = cur.delivered_at ?? at;
      if (status === "read") p.read_at = cur.read_at ?? at;
      return p;
    };

    if (cm) {
      const curRank = RANK[cm.status] ?? 0;
      const patch: Record<string, any> = {};
      if (status === "failed") {
        if (curRank < RANK.delivered) {
          Object.assign(patch, { status: "failed", failed_at: at, error_code: String(err?.code ?? ""), error_message: err?.error_data?.details ?? err?.message ?? err?.title ?? "Delivery failed" });
        }
      } else {
        Object.assign(patch, stamp(cm));
        if (RANK[status] > curRank || cm.status === "failed") patch.status = status;
      }
      if (Object.keys(patch).length) await db.updateOne("campaign_messages", cm.id, patch);
      touched.add(cm.campaign_id);
    }

    if (msg) {
      const curRank = RANK[msg.status] ?? 0;
      const patch: Record<string, any> = {};
      if (status === "failed") {
        if (curRank < RANK.delivered) Object.assign(patch, { status: "failed", error_code: String(err?.code ?? ""), error_message: err?.error_data?.details ?? err?.message ?? "Delivery failed" });
      } else {
        Object.assign(patch, stamp(msg));
        if (RANK[status] > curRank) patch.status = status;
      }
      if (Object.keys(patch).length) await db.updateOne("messages", msg.id, patch);

      if (patch.status) {
        const conv = await db.one<Conversation>("conversations", { id: msg.conversation_id });
        if (conv && conv.last_message_direction === "out" && conv.last_message_at && msg.created_at >= conv.last_message_at) {
          await db.updateOne("conversations", conv.id, { last_message_status: patch.status as MessageStatus });
        }
      }
    }

    // a recipient who blocked marketing: stop messaging them
    if (status === "failed" && waErrorInfo(err?.code).suppress) {
      const cid = cm?.contact_id ?? msg?.contact_id;
      if (cid) await setOptStatus(db, cid, "opted_out", "meta_block");
    }
  }
  for (const id of touched) await refreshStats(db, id);
}

/* ───────── inbound messages ───────── */

function parseInbound(m: any): { type: MessageType; body: string | null; payload: MessagePayload } {
  const payload: MessagePayload = {};
  if (m.context?.id) payload.context = { message_id: m.context.id };
  const media = (kind: "image" | "video" | "audio" | "document" | "sticker") => {
    const x = m[kind] ?? {};
    payload.media = { id: x.id, url: x.id ? `/api/wa-media/${x.id}` : undefined, mime: x.mime_type, filename: x.filename, caption: x.caption };
    return { type: kind as MessageType, body: x.caption ?? null, payload };
  };
  switch (m.type) {
    case "text":
      return { type: "text", body: m.text?.body ?? "", payload };
    case "image":
    case "video":
    case "audio":
    case "document":
    case "sticker":
      return media(m.type);
    case "location":
      payload.location = { lat: m.location?.latitude, lng: m.location?.longitude, name: m.location?.name, address: m.location?.address };
      return { type: "location", body: m.location?.name ?? null, payload };
    case "contacts":
      return { type: "contacts", body: m.contacts?.[0]?.name?.formatted_name ?? null, payload };
    case "reaction":
      payload.reaction = { emoji: m.reaction?.emoji ?? "", message_id: m.reaction?.message_id };
      return { type: "reaction", body: m.reaction?.emoji ?? null, payload };
    case "button":
      payload.reply = { id: m.button?.payload ?? "", title: m.button?.text ?? "", kind: "button" };
      return { type: "button", body: m.button?.text ?? null, payload };
    case "interactive": {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      payload.reply = { id: r?.id ?? "", title: r?.title ?? "", kind: m.interactive?.button_reply ? "button" : "list" };
      return { type: "button", body: r?.title ?? null, payload };
    }
    default:
      return { type: "unsupported", body: null, payload };
  }
}

async function handleInbound(db: Db, ws: string, m: any, contacts: any[]) {
  const phone = fromWaId(String(m.from));
  const norm = normalizePhone(phone);
  const profile = contacts.find((c: any) => c.wa_id === m.from)?.profile?.name as string | undefined;
  const contact = await upsertInboundContact(db, norm.ok ? norm.e164 : phone, profile, norm.ok ? norm.country : null);

  const { type, body, payload } = parseInbound(m);
  const at = iso(m.timestamp ?? Date.now() / 1000);
  const { message, conversation, isNewConversation, duplicate } = await recordInbound(db, { contact, type, body, payload, wa_message_id: m.id, at });
  if (duplicate) return;

  // did this answer a broadcast? prefer the exact message they replied to
  let cm: CampaignMessage | null = null;
  if (m.context?.id) cm = await db.one<CampaignMessage>("campaign_messages", { wa_message_id: m.context.id });
  if (!cm) {
    const rows = await db.select<CampaignMessage>("campaign_messages", {
      where: { contact_id: contact.id, replied_at: { isNull: true }, sent_at: { gt: new Date(Date.parse(at) - 72 * 3600_000).toISOString() } },
      order: [["sent_at", "desc"]],
      limit: 1,
    });
    cm = rows[0] ?? null;
  }
  if (cm && !cm.replied_at && type !== "reaction") {
    await db.updateOne("campaign_messages", cm.id, { replied_at: at, sent_at: cm.sent_at ?? at, delivered_at: cm.delivered_at ?? at, read_at: cm.read_at ?? at, status: "read" });
    await refreshStats(db, cm.campaign_id);
  }

  if (type !== "reaction") {
    await runAutomations({ ws, contact, conversation, message, text: body ?? "", isFirstMessage: isNewConversation });
  }
}

/* ───────── template review results ───────── */

async function applyTemplateUpdate(db: Db, field: string, v: any) {
  const metaId = v.message_template_id ? String(v.message_template_id) : null;
  const tpl =
    (metaId ? await db.one<Template>("templates", { meta_template_id: metaId }) : null) ??
    (v.message_template_name ? await db.one<Template>("templates", { name: v.message_template_name, language: v.message_template_language ?? "en" }) : null);
  if (!tpl) return;
  if (field === "message_template_quality_update") {
    await db.updateOne("templates", tpl.id, { quality: String(v.new_quality_score ?? "").toUpperCase() || null });
    return;
  }
  const map: Record<string, TemplateStatus> = { APPROVED: "APPROVED", REJECTED: "REJECTED", PENDING: "PENDING", PAUSED: "PAUSED", DISABLED: "DISABLED", FLAGGED: "APPROVED", REINSTATED: "APPROVED" };
  const status = map[String(v.event).toUpperCase()];
  if (!status) return;
  await db.updateOne("templates", tpl.id, {
    status,
    rejection_reason: status === "REJECTED" ? (v.reason && v.reason !== "NONE" ? String(v.reason).replace(/_/g, " ").toLowerCase() : "Rejected by Meta") : null,
  });
}

export type { Campaign };
