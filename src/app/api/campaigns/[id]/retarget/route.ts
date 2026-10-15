import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { retargetCampaign } from "@/lib/server/services/campaigns";

export const POST = api<{ id: string }>(async (ctx, req, { id }) => {
  const { retarget } = await body(req, z.object({ retarget: z.enum(["not_read", "not_delivered", "failed", "read_no_reply"]) }));
  return retargetCampaign(ctx, id, retarget);
});
