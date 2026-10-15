import { api } from "@/lib/server/http";
import { processCampaign } from "@/lib/server/services/campaigns";

export const maxDuration = 60;

/** The campaign page nudges this while it's open so sends keep moving between cron ticks. */
export const POST = api<{ id: string }>(async (ctx, _req, { id }) => processCampaign(ctx.ws, id, 40_000));
