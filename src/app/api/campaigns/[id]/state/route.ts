import { after } from "next/server";
import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { processCampaign, setCampaignState } from "@/lib/server/services/campaigns";

export const maxDuration = 60;

export const POST = api<{ id: string }>(
  async (ctx, req, { id }) => {
    const { action } = await body(req, z.object({ action: z.enum(["pause", "resume", "cancel", "unschedule"]) }));
    const out = await setCampaignState(ctx, id, action);
    if (action === "resume") after(() => processCampaign(ctx.ws, id, 50_000).catch((e) => console.error("[resume]", e)));
    return out;
  },
  { minRole: "admin" },
);
