import { api, body, query } from "@/lib/server/http";
import { campaignInput } from "@/lib/server/schemas";
import { createCampaign, listCampaigns } from "@/lib/server/services/campaigns";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const q = query(req);
  return listCampaigns(ctx.db, { status: q.str("status"), q: q.str("q"), limit: q.num("limit", 50), offset: q.num("offset", 0) });
});

export const POST = api(async (ctx, req) => createCampaign(ctx, (await body(req, campaignInput)) as any));
