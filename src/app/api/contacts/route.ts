import { z } from "zod";
import { api, body, query } from "@/lib/server/http";
import { createContact, listContacts } from "@/lib/server/services/contacts";
import { getWorkspace } from "@/lib/server/services/workspace";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const q = query(req);
  return listContacts(ctx.db, {
    q: q.str("q"),
    tags: q.list("tags"),
    tag_mode: (q.str("tag_mode") as "any" | "all") ?? "any",
    exclude_tags: q.list("exclude_tags"),
    opt_in: (q.str("opt_in") as any) ?? "all",
    source: q.str("source"),
    country: q.str("country"),
    segment_id: q.str("segment_id"),
    sort: q.str("sort"),
    dir: (q.str("dir") as "asc" | "desc") ?? "desc",
    limit: q.num("limit", 50),
    offset: q.num("offset", 0),
  });
});

const input = z.object({
  phone: z.string().min(5).max(30),
  name: z.string().max(120).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(40)).max(50).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  opt_in: z.enum(["opted_in", "opted_out", "pending"]).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = api(async (ctx, req) => {
  const data = await body(req, input);
  const ws = await getWorkspace(ctx.db);
  try {
    return await createContact(ctx.db, { ...data, opt_in_source: data.opt_in === "opted_in" ? "manual" : null, source: "manual" }, ws.settings.default_country);
  } catch (e) {
    const { HttpError } = await import("@/lib/server/http");
    throw new HttpError(422, "VALIDATION", e instanceof Error ? e.message : "Could not add contact");
  }
});
