import { api, body } from "@/lib/server/http";
import { segmentInput } from "@/lib/server/schemas";
import { listSegments } from "@/lib/server/services/contacts";
import type { Segment } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx) => listSegments(ctx.db));

export const POST = api(async (ctx, req) => {
  const d = await body(req, segmentInput);
  return ctx.db.insertOne<Segment>("segments", d);
});
