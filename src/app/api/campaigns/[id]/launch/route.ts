import { after } from "next/server";
import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { launchCampaign, processCampaign } from "@/lib/server/services/campaigns";

export const maxDuration = 60;

export const POST = api<{ id: string }>(
  async (ctx, req, { id }) => {
    const { when } = await body(req, z.object({ when: z.enum(["now", "schedule"]) }));
    const campaign = await launchCampaign(ctx, id, when);
    if (when === "now") after(() => processCampaign(ctx.ws, id, 50_000).catch((e) => console.error("[launch]", e)));
    return campaign;
  },
  { minRole: "admin" },
);
