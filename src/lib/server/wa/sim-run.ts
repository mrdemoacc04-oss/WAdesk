import type { Adapter } from "../db/types";
import { Db } from "../db/scoped";
import { handleWebhookPayload } from "../services/webhook";
import { nowIso, randomToken } from "@/lib/shared/utils";
import type { Contact, Conversation, Template, Workspace, WaAccount } from "@/lib/shared/types";
import { pick, rng, scheduleSim } from "./sim-schedule";

interface SimEventRow {
  id: string;
  workspace_id: string;
  due_at: string;
  payload: any;
}

/** Replay due simulator events through the real webhook handler. */
export async function processSimEvents(root: Adapter, limit = 80): Promise<number> {
  const due = await root.select<SimEventRow>("sim_events", { where: { due_at: { lte: nowIso() } }, order: [["due_at", "asc"]], limit });
  if (!due.length) return 0;
  await root.delete("sim_events", { where: { id: { in: due.map((d) => d.id) } } });

  for (const ev of due) {
    const db = new Db(root, ev.workspace_id);
    const acct = await db.one<WaAccount>("wa_accounts", {});
    if (!acct) continue;
    const metadata = { display_phone_number: (acct.display_phone_number ?? "").replace(/[^\d]/g, ""), phone_number_id: acct.phone_number_id };

    if (ev.payload.template_status) {
      const { template_id, event, reason } = ev.payload.template_status;
      const tpl = await db.get<Template>("templates", template_id);
      if (!tpl) continue;
      await handleWebhookPayload(root, {
        object: "whatsapp_business_account",
        entry: [{ id: acct.waba_id, changes: [{ field: "message_template_status_update", value: { event, message_template_id: tpl.meta_template_id, message_template_name: tpl.name, message_template_language: tpl.language, reason } }] }],
      });
      continue;
    }

    await handleWebhookPayload(root, {
      object: "whatsapp_business_account",
      entry: [{ id: acct.waba_id, changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata, ...ev.payload } }] }],
    });
  }
  return due.length;
}

/** Occasionally have a known contact message first, so the inbox feels alive in demo mode. */
const OPENERS = [
  "Hi, do you have this in stock?",
  "Hello! Can someone share the price list?",
  "I saw your offer, how do I claim it?",
  "What are your delivery charges to Pune?",
  "Need help with my last order",
  "Is the webinar recording available?",
  "Can I get a bulk discount for 50 units?",
  "Namaste, please call me back",
];

export async function maybeAmbient(root: Adapter): Promise<boolean> {
  const workspaces = await root.select<Workspace>("workspaces", { limit: 5 });
  for (const w of workspaces) {
    if (w.settings?.sim_ambient === false) continue;
    const db = new Db(root, w.id);
    const r = rng(Date.now() ^ 0x9e3779b9);
    if (r() > 0.55) continue;
    // keep the demo lively but bounded: a server left running for hours must not pile up hundreds of unread chats
    if ((await db.count("conversations", { unread_count: { gt: 0 }, status: "open" })) >= 10) continue;
    const all = await db.select<Conversation>("conversations", { where: { last_message_at: { isNull: false } }, order: [["last_message_at", "desc"]], limit: 30 });
    const convs = all.filter((c) => c.unread_count < 3);
    if (!convs.length) continue;
    const conv = pick(convs, r);
    const contact = await db.get<Contact>("contacts", conv.contact_id);
    if (!contact || contact.opt_in === "opted_out") continue;
    const waId = contact.phone.replace(/[^\d]/g, "");
    const ts = String(Math.floor(Date.now() / 1000));
    await db.insert("sim_events", [
      {
        due_at: nowIso(),
        payload: {
          contacts: [{ profile: { name: contact.name ?? undefined }, wa_id: waId }],
          messages: [{ from: waId, id: `wamid.MOCKIN${randomToken(20).toUpperCase()}`, timestamp: ts, type: "text", text: { body: pick(OPENERS, r) } }],
        },
      },
    ]);
    return true;
  }
  return false;
}

export { scheduleSim };
