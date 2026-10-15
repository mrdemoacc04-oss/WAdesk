import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { varSource } from "@/lib/server/schemas";
import { sendTestMessage } from "@/lib/server/services/campaigns";

export const maxDuration = 60;

export const POST = api(async (ctx, req) => {
  const d = await body(
    req,
    z.object({ template_id: z.string(), phone: z.string().min(5), variable_map: z.record(z.string(), varSource), media_map: z.record(z.string(), z.string()) }),
  );
  return sendTestMessage(ctx, d as any);
});
