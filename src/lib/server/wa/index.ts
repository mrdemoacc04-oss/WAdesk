import { dbFor } from "../context";
import { decrypt } from "../crypto";
import { mode } from "../env";
import type { WaAccount } from "@/lib/shared/types";
import { CloudProvider } from "./cloud";
import { WaError } from "./errors";
import { MockProvider } from "./mock";
import type { Provider } from "./types";

export interface Secrets {
  id: string;
  workspace_id: string;
  access_token_enc: string | null;
  app_secret_enc: string | null;
}

/** Resolves the sender for a workspace. Uses the service-role Db because wa_secrets is not user-readable. */
export async function getProvider(ws: string): Promise<Provider> {
  const db = dbFor(ws);
  const acct = await db.one<WaAccount>("wa_accounts", {});
  const sec = acct ? await db.one<Secrets>("wa_secrets", {}) : null;
  if (acct && sec?.access_token_enc) {
    return new CloudProvider({
      phoneNumberId: acct.phone_number_id,
      wabaId: acct.waba_id,
      appId: acct.app_id,
      token: decrypt(sec.access_token_enc),
    });
  }
  if (mode() === "local") return new MockProvider(db);
  throw new WaError("NO_CONNECTION", "WhatsApp isn't connected. Add your Cloud API credentials in Settings → WhatsApp.", 400);
}

export async function providerMode(ws: string): Promise<"mock" | "live" | "none"> {
  const db = dbFor(ws);
  const acct = await db.one<WaAccount>("wa_accounts", {});
  const sec = acct ? await db.one<Secrets>("wa_secrets", {}) : null;
  if (acct && sec?.access_token_enc) return "live";
  return mode() === "local" ? "mock" : "none";
}

export { WaError } from "./errors";
export type { Provider } from "./types";
