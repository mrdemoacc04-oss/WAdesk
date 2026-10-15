import type { Db } from "../db/scoped";
import { toWaId } from "@/lib/shared/phone";
import { hashStr, randomToken } from "@/lib/shared/utils";
import type { Contact } from "@/lib/shared/types";

/* Demo-mode simulator: when the mock provider "sends", it queues the webhook events Meta would
   deliver later (delivered → read → maybe a reply). A worker replays them through the real
   webhook handler, so statuses, replies, automations and counters take the production code path. */

export interface SimHint {
  kind: "template" | "text" | "media" | "interactive";
  text?: string;
  replies?: { payload: string; text: string }[];
  buttons?: { id: string; title: string }[];
  /** 0..1 chance the contact answers */
  replyChance?: number;
}

const GENERAL = [
  "Yes, interested. Please share more details",
  "What's the price?",
  "Thanks! Will check and get back to you",
  "Can you call me?",
  "Please send the catalogue",
  "Not interested right now",
  "Is there any discount available?",
  "Where is your store located?",
  "👍",
  "Ok",
  "Please send the link again",
  "Is this available in other colours?",
];

export function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function smartReply(text: string, r: () => number): string {
  const t = text.toLowerCase();
  if (/price|cost|rate|₹|rs\.?/.test(t)) return pick(["Okay, and is there any discount?", "That works. Can I get it by tomorrow?", "Hmm, a bit high. Any offers running?"], r);
  if (/order|ship|deliver|track/.test(t)) return pick(["Thank you! Please keep me updated", "Great, when will it arrive?", "Got it 👍"], r);
  if (/thank|welcome|glad/.test(t)) return pick(["Thanks to you too!", "Appreciate the quick help 🙏", "👍"], r);
  if (/call|number|contact/.test(t)) return pick(["Please call after 5 PM", "WhatsApp is fine, I'm in a meeting", "Sure, call me tomorrow morning"], r);
  if (/demo|book|slot|time/.test(t)) return pick(["Tomorrow 11 AM works", "Can we do Friday afternoon?", "Yes, please book it"], r);
  return pick(GENERAL, r);
}

const unix = (ms: number) => String(Math.floor(ms / 1000));

export async function scheduleSim(db: Db, wamid: string, to: string, hint: SimHint) {
  const r = rng(hashStr(wamid));
  const waId = toWaId(to);
  const now = Date.now();
  const contact = await db.one<Contact>("contacts", { phone: to });
  const events: { due: number; payload: any }[] = [];

  const status = (status: string, at: number, extra: Record<string, unknown> = {}) => ({
    due: at,
    payload: { statuses: [{ id: wamid, status, timestamp: unix(at), recipient_id: waId, ...extra }] },
  });

  // ~4% of numbers are "not on WhatsApp" — stable per phone so retargeting a failure fails again
  const dead = hashStr(to) % 100 < 4;
  if (dead) {
    events.push(
      status("failed", now + 900 + r() * 1200, {
        errors: [{ code: 131026, title: "Message undeliverable", message: "Message undeliverable", error_data: { details: "Message Undeliverable." } }],
      }),
    );
  } else {
    const sent = now + 250;
    const delivered = now + 1200 + r() * 4500;
    events.push(status("sent", sent), status("delivered", delivered));
    const readP = hint.kind === "template" ? 0.6 : 0.82;
    if (r() < readP) {
      const read = delivered + 2500 + r() * (hint.kind === "template" ? 70000 : 9000);
      events.push(status("read", read));
      const chance = hint.replyChance ?? (hint.kind === "template" ? 0.1 + (hint.replies?.length ? 0.1 : 0) : 0.85);
      if (r() < chance) {
        const at = read + 3000 + r() * (hint.kind === "template" ? 38000 : 9000);
        const profile = { name: contact?.name ?? undefined };
        const base = { from: waId, id: `wamid.MOCKIN${randomToken(20).toUpperCase()}`, timestamp: unix(at) };
        const ctx = { context: { from: waId, id: wamid } };
        let message: any;
        if (hint.replies?.length && r() < 0.8) {
          const q = pick(hint.replies, r);
          message = { ...base, ...ctx, type: "button", button: { payload: q.payload, text: q.text } };
        } else if (hint.buttons?.length && r() < 0.8) {
          const b = pick(hint.buttons, r);
          message = { ...base, ...ctx, type: "interactive", interactive: { type: "button_reply", button_reply: { id: b.id, title: b.title } } };
        } else {
          message = { ...base, type: "text", text: { body: hint.kind === "template" ? pick(GENERAL, r) : smartReply(hint.text ?? "", r) } };
        }
        events.push({ due: at, payload: { contacts: [{ profile, wa_id: waId }], messages: [message] } });
      }
    }
  }

  await db.insert(
    "sim_events",
    events.map((e) => ({ due_at: new Date(e.due).toISOString(), payload: e.payload })),
  );
}
