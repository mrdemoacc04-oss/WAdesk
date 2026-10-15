import { api, body, query } from "@/lib/server/http";
import { z } from "zod";
import { listConversations, openConversationFor } from "@/lib/server/services/inbox";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const q = query(req);
  return listConversations(ctx, { tab: q.str("tab"), q: q.str("q"), limit: q.num("limit", 40), offset: q.num("offset", 0) });
});

/** Open (or create) the thread for a contact. */
export const POST = api(async (ctx, req) => {
  const { contact_id } = await body(req, z.object({ contact_id: z.string() }));
  return openConversationFor(ctx.db, contact_id);
});
