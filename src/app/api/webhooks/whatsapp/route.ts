import { after, NextResponse, type NextRequest } from "next/server";
import { rootAdapter } from "@/lib/server/context";
import { decrypt, verifyMetaSignature } from "@/lib/server/crypto";
import { mode } from "@/lib/server/env";
import { findAccountByPhoneNumberId, findAccountByWaba, handleWebhookPayload } from "@/lib/server/services/webhook";
import type { WaAccount } from "@/lib/shared/types";
import type { Secrets } from "@/lib/server/wa";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Meta's one-time subscription handshake. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = sp.get("hub.verify_token");
  if (sp.get("hub.mode") !== "subscribe" || !token) return new NextResponse("Bad request", { status: 400 });
  const root = rootAdapter();
  const [hit] = await root.select<WaAccount>("wa_accounts", { where: { webhook_verify_token: token }, limit: 1 });
  if (!hit && token !== process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad request", { status: 400 });
  }
  const root = rootAdapter();

  // find which workspace this belongs to, then check the signature with that workspace's app secret
  const entry = payload?.entry?.[0];
  const phoneId = entry?.changes?.find((c: any) => c.value?.metadata?.phone_number_id)?.value?.metadata?.phone_number_id;
  const acct = phoneId ? await findAccountByPhoneNumberId(root, phoneId) : entry?.id ? await findAccountByWaba(root, String(entry.id)) : null;
  if (!acct) return NextResponse.json({ ok: true }); // not ours — acknowledge so Meta stops retrying

  const [sec] = await root.select<Secrets>("wa_secrets", { where: { workspace_id: acct.workspace_id }, limit: 1 });
  if (sec?.app_secret_enc) {
    const ok = verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), decrypt(sec.app_secret_enc));
    if (!ok) return new NextResponse("Invalid signature", { status: 401 });
  } else if (mode() === "supabase") {
    // The phone-number ID isn't a secret, so an unsigned webhook could be forged by anyone who knows it — injecting
    // fake customer messages and triggering auto-replies from a real number. Live workspaces must store the app secret.
    return new NextResponse("Webhook signature secret not configured", { status: 401 });
  }

  // acknowledge fast; Meta retries anything slower than a few seconds
  after(async () => {
    try {
      await handleWebhookPayload(root, payload);
    } catch (e) {
      console.error("[webhook]", e);
    }
  });
  return NextResponse.json({ ok: true });
}
