import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { saveQuickReply } from "@/lib/server/services/inbox";

type P = { id: string };
const schema = z.object({ shortcut: z.string().min(1).max(30), body: z.string().min(1).max(4096) });

export const PATCH = api<P>(async (ctx, req, { id }) => saveQuickReply(ctx.db, await body(req, schema), id));
export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await ctx.db.delete("quick_replies", { id });
  return { ok: true };
});
