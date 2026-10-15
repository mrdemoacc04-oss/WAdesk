import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { importContacts } from "@/lib/server/services/contacts";

export const maxDuration = 60;

const schema = z.object({
  rows: z
    .array(
      z.object({
        phone: z.any(),
        name: z.string().max(200).nullable().optional(),
        email: z.string().max(200).nullable().optional(),
        tags: z.array(z.string()).optional(),
        attributes: z.record(z.string(), z.string()).optional(),
      }),
    )
    .max(5000),
  tags: z.array(z.string().max(40)).max(30),
  consent: z.boolean(),
  duplicates: z.enum(["update", "skip"]),
  default_country: z.string().length(2),
});

export const POST = api(async (ctx, req) => {
  const d = await body(req, schema);
  return importContacts(ctx.db, d.rows.map((r) => ({ ...r, phone: String(r.phone ?? "") })), {
    tags: d.tags,
    consent: d.consent,
    duplicates: d.duplicates,
    default_country: d.default_country,
    source: "import",
  });
});
