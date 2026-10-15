import { z } from "zod";
import { api, body } from "@/lib/server/http";
import { publicUrl } from "@/lib/server/env";
import { connectAccount, disconnectAccount } from "@/lib/server/services/account";
import { getAccount } from "@/lib/server/services/workspace";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = api(async (ctx, req) => {
  const account = await getAccount(ctx.db);
  return { account, webhook_url: `${publicUrl(req)}/api/webhooks/whatsapp`, verify_token: account?.webhook_verify_token ?? null };
});

const schema = z.object({
  phone_number_id: z.string().min(5).max(40).regex(/^\d+$/, "Phone number ID is numeric"),
  waba_id: z.string().min(5).max(40).regex(/^\d+$/, "WhatsApp Business Account ID is numeric"),
  access_token: z.string().max(1000).optional(),
  app_id: z.string().max(40).optional(),
  app_secret: z.string().max(200).optional(),
});

export const POST = api(async (ctx, req) => connectAccount(ctx, await body(req, schema)), { minRole: "admin" });

export const DELETE = api(async (ctx) => {
  await disconnectAccount(ctx);
  return { ok: true };
}, { minRole: "admin" });
