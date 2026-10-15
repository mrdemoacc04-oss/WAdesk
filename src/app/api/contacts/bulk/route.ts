import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { bulkAction } from "@/lib/server/services/contacts";

export const maxDuration = 60;

const filter = z.object({
  q: z.string().optional(),
  tags: z.array(z.string()).optional(),
  tag_mode: z.enum(["any", "all"]).optional(),
  exclude_tags: z.array(z.string()).optional(),
  opt_in: z.enum(["opted_in", "opted_out", "pending", "all"]).optional(),
  source: z.string().optional(),
  country: z.string().optional(),
  segment_id: z.string().optional(),
  ids: z.array(z.string()).max(100_000).optional(),
});

const schema = z.object({
  filter,
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("add_tags"), tags: z.array(z.string()).min(1) }),
    z.object({ type: z.literal("remove_tags"), tags: z.array(z.string()).min(1) }),
    z.object({ type: z.literal("opt_in") }),
    z.object({ type: z.literal("opt_out") }),
    z.object({ type: z.literal("delete") }),
  ]),
});

export const POST = api(async (ctx, req) => {
  const { filter: f, action } = await body(req, schema);
  return bulkAction(ctx.db, f, action);
});
