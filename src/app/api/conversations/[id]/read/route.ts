import { api } from "@/lib/server/http";
import { markConversationRead } from "@/lib/server/services/inbox";

export const POST = api<{ id: string }>(async (ctx, _req, { id }) => markConversationRead(ctx, id) ?? { ok: true });
