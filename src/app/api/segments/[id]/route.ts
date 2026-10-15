import { api, body, notFound } from "@/lib/server/http";
import { segmentInput } from "@/lib/server/schemas";
import { segmentToQuery } from "@/lib/server/services/contacts";
import type { Segment } from "@/lib/shared/types";

type P = { id: string };

export const GET = api<P>(async (ctx, _req, { id }) => {
  const seg = await ctx.db.get<Segment>("segments", id);
  if (!seg) throw notFound("Segment not found");
  return { ...seg, count: await ctx.db.count("contacts", { opt_in: "opted_in" }, segmentToQuery(seg)) };
});

export const PATCH = api<P>(async (ctx, req, { id }) => {
  const d = await body(req, segmentInput);
  const out = await ctx.db.updateOne<Segment>("segments", id, d);
  if (!out) throw notFound("Segment not found");
  return out;
});

export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await ctx.db.delete("segments", { id });
  return { ok: true };
});

/** Preview how many people a rule set matches before saving it. */
export const POST = api<P>(async (ctx, req) => {
  const d = await body(req, segmentInput);
  const q = segmentToQuery(d);
  const [all, opted] = await Promise.all([ctx.db.count("contacts", {}, q), ctx.db.count("contacts", { opt_in: "opted_in" }, q)]);
  return { total: all, opted_in: opted };
});
