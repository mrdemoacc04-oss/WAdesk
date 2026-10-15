import { api, notFound } from "@/lib/server/http";
import { checkCampaign } from "@/lib/server/services/campaigns";
import type { Campaign } from "@/lib/shared/types";

export const POST = api<{ id: string }>(async (ctx, _req, { id }) => {
  const c = await ctx.db.get<Campaign>("campaigns", id);
  if (!c) throw notFound("Campaign not found");
  return checkCampaign(ctx, c);
});
