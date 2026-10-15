import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { getConversationBundle, patchConversation } from "@/lib/server/services/inbox";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = api<P>(async (ctx, _req, { id }) => getConversationBundle(ctx.db, id));

export const PATCH = api<P>(async (ctx, req, { id }) => {
  const d = await body(req, z.object({ status: z.enum(["open", "resolved"]).optional(), assigned_to: z.string().nullable().optional() }));
  return patchConversation(ctx, id, d);
});
