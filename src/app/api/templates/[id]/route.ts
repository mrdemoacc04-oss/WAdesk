import { api, body, notFound } from "@/lib/server/http";
import { templateInput } from "@/lib/server/schemas";
import { deleteTemplate, saveTemplate } from "@/lib/server/services/templates";
import type { Template } from "@/lib/shared/types";

type P = { id: string };

export const GET = api<P>(async (ctx, _req, { id }) => {
  const t = await ctx.db.get<Template>("templates", id);
  if (!t) throw notFound("Template not found");
  return t;
});

export const PATCH = api<P>(async (ctx, req, { id }) => saveTemplate(ctx.db, (await body(req, templateInput)) as any, id));

export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await deleteTemplate(ctx, id);
  return { ok: true };
}, { minRole: "admin" });
