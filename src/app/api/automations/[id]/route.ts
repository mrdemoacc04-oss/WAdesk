import { api, body, notFound } from "@/lib/server/http";
import { automationInput } from "@/lib/server/schemas";
import type { AutomationRule } from "@/lib/shared/types";

type P = { id: string };

export const PATCH = api<P>(async (ctx, req, { id }) => {
  const d = await body(req, automationInput.partial());
  const out = await ctx.db.updateOne<AutomationRule>("automation_rules", id, d);
  if (!out) throw notFound("Automation not found");
  return out;
});

export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await ctx.db.delete("automation_rules", { id });
  return { ok: true };
});
