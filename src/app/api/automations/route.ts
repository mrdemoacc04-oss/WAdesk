import { api, body } from "@/lib/server/http";
import { automationInput } from "@/lib/server/schemas";
import type { AutomationRule } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => ctx.db.select<AutomationRule>("automation_rules", { order: [["priority", "asc"], ["created_at", "asc"]], limit: 200 }));

export const POST = api(async (ctx, req) => {
  const d = await body(req, automationInput);
  return ctx.db.insertOne<AutomationRule>("automation_rules", { ...d, triggered_count: 0, last_triggered_at: null });
});
