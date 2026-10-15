import { api, query } from "@/lib/server/http";
import { listRecipients } from "@/lib/server/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = api<{ id: string }>(async (ctx, req, { id }) => {
  const q = query(req);
  return listRecipients(ctx.db, id, { status: q.str("status"), q: q.str("q"), limit: q.num("limit", 50), offset: q.num("offset", 0) });
});
