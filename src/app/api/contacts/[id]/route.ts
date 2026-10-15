import { z } from "zod";
import { api, body, notFound } from "@/lib/server/http";
import { updateContact } from "@/lib/server/services/contacts";
import type { Campaign, CampaignMessage, Contact, Conversation } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = api<P>(async (ctx, _req, { id }) => {
  const contact = await ctx.db.get<Contact>("contacts", id);
  if (!contact) throw notFound("Contact not found");
  const [conversation, sends] = await Promise.all([
    ctx.db.one<Conversation>("conversations", { contact_id: id }),
    ctx.db.select<CampaignMessage>("campaign_messages", { where: { contact_id: id }, order: [["created_at", "desc"]], limit: 20 }),
  ]);
  const camps = sends.length ? await ctx.db.select<Campaign>("campaigns", { where: { id: { in: [...new Set(sends.map((s) => s.campaign_id))] } } }) : [];
  const byId = new Map(camps.map((c) => [c.id, c]));
  return {
    contact,
    conversation,
    history: sends.map((s) => ({ ...s, campaign_name: byId.get(s.campaign_id)?.name ?? "Campaign" })),
  };
});

const patch = z.object({
  name: z.string().max(120).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  notes: z.string().max(2000).nullable().optional(),
  opt_in: z.enum(["opted_in", "opted_out", "pending"]).optional(),
});

export const PATCH = api<P>(async (ctx, req, { id }) => {
  const data = await body(req, patch);
  const out = await updateContact(ctx.db, id, data);
  if (!out) throw notFound("Contact not found");
  return out;
});

export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await ctx.db.delete("conversations", { contact_id: id });
  await ctx.db.delete("contacts", { id });
  return { ok: true };
});
