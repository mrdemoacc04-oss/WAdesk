import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { listQuickReplies, saveQuickReply } from "@/lib/server/services/inbox";

export const dynamic = "force-dynamic";

const schema = z.object({ shortcut: z.string().min(1).max(30), body: z.string().min(1).max(4096) });

export const GET = api(async (ctx) => listQuickReplies(ctx.db));
export const POST = api(async (ctx, req) => saveQuickReply(ctx.db, await body(req, schema)));
