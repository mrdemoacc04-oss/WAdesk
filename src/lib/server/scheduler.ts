import { mode } from "./env";

/* Scheduled campaigns need a timer that calls /api/cron/dispatch every minute.
   In production WAdesk sets that timer up by itself (Postgres pg_cron → pg_net, see migration 0003) the first time the
   server starts, so whoever deploys it never has to paste SQL or know a scheduler exists. */

export const DISPATCH_PATH = "/api/cron/dispatch";

type Env = Record<string, string | undefined>;

export type SchedulerPlan = { action: "register"; url: string; secret: string } | { action: "skip"; reason: string };

const skip = (reason: string): SchedulerPlan => ({ action: "skip", reason });

/** PostgREST says "Could not find the function …" (PGRST202) when migration 0003 hasn't been run. */
const functionMissing = (e: { message?: string; code?: string }) => /could not find the function|PGRST202|does not exist/i.test(`${e.code ?? ""} ${e.message ?? ""}`);

/** Decide, from the environment alone, whether this process should register the production timer. */
export function planScheduler(env: Env = process.env): SchedulerPlan {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) return skip("local demo mode runs its own in-process worker");
  if (env.NEXT_PHASE === "phase-production-build") return skip("this is the build, not a running server");
  if (env.NODE_ENV !== "production") return skip("not a production server");
  // A preview deployment must never take over the timer that belongs to production.
  if (env.VERCEL && env.VERCEL_ENV !== "production") return skip("preview deployments don't own the scheduler");
  // Escape hatch for anyone who runs their own scheduler (e.g. a Vercel Pro cron in vercel.json).
  if (env.WADESK_SCHEDULER === "external") return skip("the scheduler is managed externally");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return skip("SUPABASE_SERVICE_ROLE_KEY is not set");
  const secret = env.CRON_SECRET ?? "";
  if (secret.length < 16) return skip("CRON_SECRET is missing or shorter than 16 characters");
  const base = (env.NEXT_PUBLIC_APP_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")).replace(/\/+$/, "");
  if (!base) return skip("no public address (set NEXT_PUBLIC_APP_URL)");
  if (!/^https:\/\//i.test(base)) return skip("the public address must be https");
  return { action: "register", url: base + DISPATCH_PATH, secret };
}

/** Called once when a production server starts. Never throws and never blocks startup for long. */
export async function registerScheduler(): Promise<void> {
  const plan = planScheduler();
  if (plan.action === "skip") {
    if (mode() === "supabase" && process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn(`[wadesk] scheduler not registered: ${plan.reason}`);
    }
    return;
  }
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin().rpc("wadesk_register_scheduler", { p_url: plan.url, p_secret: plan.secret });
    if (error) console.error(`[wadesk] scheduler registration failed: ${error.message}${functionMissing(error) ? " — run migration 0003_scheduler.sql" : ""}`);
    else console.log(`[wadesk] scheduler ${data} for ${new URL(plan.url).host}`);
  } catch (e) {
    console.error("[wadesk] scheduler registration failed:", e instanceof Error ? e.message : e);
  }
}

/** Is there a working timer? Used to refuse a schedule the server couldn't honour, and by /api/health. */
export async function schedulerStatus(): Promise<{ ok: boolean; reason?: string }> {
  if (mode() === "local") return { ok: true }; // demo mode ticks in-process
  if (process.env.WADESK_SCHEDULER === "external") return { ok: true };
  try {
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const { data, error } = await supabaseAdmin().rpc("wadesk_scheduler_status");
    if (error) return { ok: false, reason: functionMissing(error) ? "the scheduler functions are missing — run migration 0003_scheduler.sql" : `couldn't check the scheduler (${error.message})` };
    if (!data?.available) return { ok: false, reason: "pg_cron isn't available on this database" };
    if (!data.registered) return { ok: false, reason: "the timer isn't registered yet — it registers when the server starts (check CRON_SECRET and NEXT_PUBLIC_APP_URL)" };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "could not reach the database" };
  }
}
