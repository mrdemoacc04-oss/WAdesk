import { api, HttpError } from "@/lib/server/http";
import { mode } from "@/lib/server/env";
import type { TableName } from "@/lib/server/db/types";

/** Remove sample contacts, templates, campaigns and chats — keeps team, settings, connection and automations. */
export const POST = api(async (ctx) => {
  if (mode() !== "local") throw new HttpError(404, "NOT_FOUND", "Demo tools are only available in local mode");
  const tables: TableName[] = ["sim_events", "messages", "conversations", "campaign_messages", "campaigns", "templates", "segments", "contacts", "tags"];
  for (const t of tables) await ctx.db.delete(t, {});
  return { ok: true };
}, { minRole: "admin" });
