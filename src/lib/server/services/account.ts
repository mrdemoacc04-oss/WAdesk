import { dbFor, type Ctx } from "../context";
import { encrypt } from "../crypto";
import { mode } from "../env";
import { HttpError } from "../http";
import { CloudProvider } from "../wa/cloud";
import { asWaError } from "../wa/errors";
import { randomToken, nowIso } from "@/lib/shared/utils";
import { waErrorInfo } from "@/lib/shared/wa-errors";
import type { WaAccount } from "@/lib/shared/types";
import type { Secrets } from "../wa";
import { getAccount } from "./workspace";

export interface ConnectInput {
  phone_number_id: string;
  waba_id: string;
  access_token?: string;
  app_id?: string;
  app_secret?: string;
}

/** Validate credentials against Meta before saving, then store the token encrypted. */
export async function connectAccount(ctx: Ctx, input: ConnectInput): Promise<WaAccount> {
  const root = dbFor(ctx.ws);
  const existing = await root.one<WaAccount>("wa_accounts", {});
  const existingSecrets = existing ? await root.one<Secrets>("wa_secrets", {}) : null;

  const token = input.access_token?.trim();
  if (!token && !existingSecrets?.access_token_enc) throw new HttpError(422, "VALIDATION", "Paste your access token.");
  // Webhooks are only accepted when their signature can be checked, so a live workspace must store the app secret.
  if (mode() === "supabase" && !input.app_secret?.trim() && !existingSecrets?.app_secret_enc)
    throw new HttpError(422, "VALIDATION", "Paste your app secret — WAdesk needs it to verify that webhook calls really come from Meta.");

  let tokenPlain = token;
  if (!tokenPlain && existingSecrets?.access_token_enc) {
    const { decrypt } = await import("../crypto");
    tokenPlain = decrypt(existingSecrets.access_token_enc);
  }

  const probe = new CloudProvider({
    phoneNumberId: input.phone_number_id.trim(),
    wabaId: input.waba_id.trim(),
    appId: input.app_id?.trim() || existing?.app_id || null,
    token: tokenPlain!,
  });

  let info;
  try {
    info = await probe.phoneInfo();
  } catch (e) {
    const w = asWaError(e);
    throw new HttpError(422, "META_ERROR", `${waErrorInfo(w.code).title}: ${w.message}`, { code: w.code });
  }

  const row = {
    phone_number_id: input.phone_number_id.trim(),
    waba_id: input.waba_id.trim(),
    app_id: input.app_id?.trim() || existing?.app_id || null,
    display_phone_number: info.display_phone_number,
    verified_name: info.verified_name,
    quality_rating: info.quality_rating,
    messaging_limit_tier: info.messaging_limit_tier,
    status: "connected" as const,
    status_message: null,
    webhook_verify_token: existing?.webhook_verify_token ?? `wadesk_${randomToken(20)}`,
    last_checked_at: nowIso(),
  };
  if (existing) await root.updateOne("wa_accounts", existing.id, row);
  else await root.insertOne("wa_accounts", row);

  const secretRow = {
    access_token_enc: token ? encrypt(token) : existingSecrets?.access_token_enc ?? null,
    app_secret_enc: input.app_secret?.trim() ? encrypt(input.app_secret.trim()) : existingSecrets?.app_secret_enc ?? null,
  };
  await root.upsert("wa_secrets", secretRow, ["workspace_id"]);

  // best effort: make sure the app is subscribed to this WABA's webhooks
  try {
    await probe.subscribeWebhooks();
  } catch {}

  return (await getAccount(ctx.db))!;
}

export async function disconnectAccount(ctx: Ctx) {
  const root = dbFor(ctx.ws);
  await root.delete("wa_secrets", {});
  const acct = await root.one<WaAccount>("wa_accounts", {});
  if (acct) await root.updateOne("wa_accounts", acct.id, { status: "disconnected", quality_rating: null, messaging_limit_tier: null, status_message: "Disconnected" });
}

/** Re-read the number's health from Meta. */
export async function refreshAccount(ctx: Ctx): Promise<WaAccount | null> {
  const acct = await ctx.db.one<WaAccount>("wa_accounts", {});
  if (!acct) return null;
  const { getProvider } = await import("../wa");
  const provider = await getProvider(ctx.ws);
  if (provider.mode === "mock") return getAccount(ctx.db);
  try {
    const info = await provider.phoneInfo();
    await dbFor(ctx.ws).updateOne("wa_accounts", acct.id, {
      display_phone_number: info.display_phone_number,
      verified_name: info.verified_name,
      quality_rating: info.quality_rating,
      messaging_limit_tier: info.messaging_limit_tier,
      status: "connected",
      status_message: null,
      last_checked_at: nowIso(),
    });
  } catch (e) {
    const w = asWaError(e);
    await dbFor(ctx.ws).updateOne("wa_accounts", acct.id, { status: "error", status_message: `${waErrorInfo(w.code).title}: ${w.message}`, last_checked_at: nowIso() });
  }
  return getAccount(ctx.db);
}
