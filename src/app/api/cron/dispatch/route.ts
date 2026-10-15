import { NextResponse, type NextRequest } from "next/server";
import { rootAdapter } from "@/lib/server/context";
import { mode } from "@/lib/server/env";
import { dispatchTick } from "@/lib/server/services/campaigns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduler heartbeat — starts due campaigns and keeps running ones moving.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; Supabase pg_cron can do the same via pg_net.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (mode() === "supabase") {
    if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await dispatchTick(rootAdapter(), 50_000);
  return NextResponse.json({ ok: true, ...result });
}

export const POST = GET;
