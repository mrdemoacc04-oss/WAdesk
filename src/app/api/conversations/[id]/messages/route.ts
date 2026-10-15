import { api, body, query } from "@/lib/server/http";
import { sendInput } from "@/lib/server/schemas";
import { listMessages, sendInConversation } from "@/lib/server/services/inbox";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type P = { id: string };

export const GET = api<P>(async (ctx, req, { id }) => {
  const q = query(req);
  return listMessages(ctx.db, id, { before: q.str("before"), limit: q.num("limit", 60) });
});

export const POST = api<P>(async (ctx, req, { id }) => sendInConversation(ctx, id, (await body(req, sendInput)) as any));
