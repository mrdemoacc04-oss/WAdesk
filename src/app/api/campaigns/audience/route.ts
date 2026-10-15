import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { audience } from "@/lib/server/schemas";
import { audienceSample, audienceStats } from "@/lib/server/services/campaigns";

export const POST = api(async (ctx, req) => {
  const { audience: a } = await body(req, z.object({ audience }));
  const [stats, sample] = await Promise.all([audienceStats(ctx.db, a as any), audienceSample(ctx.db, a as any, 6)]);
  return { ...stats, sample: sample.map((c) => ({ id: c.id, name: c.name, phone: c.phone })) };
});
