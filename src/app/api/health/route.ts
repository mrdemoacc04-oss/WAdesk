import { NextResponse } from "next/server";
import { demoAllowed, mode, setupProblem } from "@/lib/server/env";

export const dynamic = "force-dynamic";

/** Deployment self-check: reports which pieces are configured — never their values. */
export async function GET() {
  const supabase = mode() === "supabase";
  const checks = {
    mode: mode(),
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    encryptionKey: !!process.env.APP_ENCRYPTION_KEY,
    cronSecret: !!process.env.CRON_SECRET,
    appUrl: !!process.env.NEXT_PUBLIC_APP_URL,
  };
  const problems: string[] = [];
  const setup = setupProblem();
  if (setup) {
    problems.push(
      !supabase && !demoAllowed()
        ? `Supabase isn't configured, and demo mode is disabled outside development — the app is closed until you set: ${setup.missing.join(", ")}`
        : `Not ready to serve — missing: ${setup.missing.join(", ")}`,
    );
  }
  if (supabase) {
    if (!checks.supabaseAnonKey) problems.push("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing");
    if (!checks.supabaseServiceRole) problems.push("SUPABASE_SERVICE_ROLE_KEY is missing");
    if (!checks.encryptionKey) problems.push("APP_ENCRYPTION_KEY is not set (falling back to a key derived from the service role key)");
    if (!checks.cronSecret) problems.push("CRON_SECRET is not set — /api/cron/dispatch will refuse requests");
    if (!checks.appUrl) problems.push("NEXT_PUBLIC_APP_URL is not set — webhook URL shown in Settings may be wrong behind a proxy");
  }
  return NextResponse.json({ ok: problems.length === 0, checks, problems, time: new Date().toISOString() });
}
