import { api } from "@/lib/server/http";
import { duplicateCampaign } from "@/lib/server/services/campaigns";

export const POST = api<{ id: string }>(async (ctx, _req, { id }) => duplicateCampaign(ctx, id));
