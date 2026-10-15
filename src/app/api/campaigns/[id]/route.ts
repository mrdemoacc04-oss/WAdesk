import { api, body } from "@/lib/server/http";
import { campaignInput } from "@/lib/server/schemas";
import { campaignDetail, deleteCampaign, updateCampaign } from "@/lib/server/services/campaigns";

export const dynamic = "force-dynamic";

type P = { id: string };

export const GET = api<P>(async (ctx, _req, { id }) => campaignDetail(ctx.db, id));

export const PATCH = api<P>(async (ctx, req, { id }) => updateCampaign(ctx, id, (await body(req, campaignInput.partial())) as any));

export const DELETE = api<P>(async (ctx, _req, { id }) => {
  await deleteCampaign(ctx, id);
  return { ok: true };
}, { minRole: "admin" });
