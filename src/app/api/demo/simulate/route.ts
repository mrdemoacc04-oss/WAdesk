import { z } from "zod";
import { api, body, HttpError, notFound } from "@/lib/server/http";
import { mode } from "@/lib/server/env";
import { toWaId } from "@/lib/shared/phone";
import { randomToken, nowIso } from "@/lib/shared/utils";
import type { Contact } from "@/lib/shared/types";

/** Inject an inbound message as if the contact had just written (demo mode only). */
export const POST = api(async (ctx, req) => {
  if (mode() !== "local") throw new HttpError(404, "NOT_FOUND", "Demo tools are only available in local mode");
  const d = await body(req, z.object({ contact_id: z.string(), text: z.string().min(1).max(1000) }));
  const c = await ctx.db.get<Contact>("contacts", d.contact_id);
  if (!c) throw notFound("Contact not found");
  const waId = toWaId(c.phone);
  await ctx.db.insert("sim_events", [
    {
      due_at: nowIso(),
      payload: {
        contacts: [{ profile: { name: c.name ?? undefined }, wa_id: waId }],
        messages: [{ from: waId, id: `wamid.MOCKIN${randomToken(20).toUpperCase()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: d.text } }],
      },
    },
  ]);
  return { ok: true };
});
