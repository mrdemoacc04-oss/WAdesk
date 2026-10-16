import { test } from "node:test";
import assert from "node:assert/strict";
import { planScheduler } from "@/lib/server/scheduler";

/** A healthy production deployment on Vercel; each test changes one thing. */
const prod = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: "0123456789abcdef0123456789abcdef",
  NEXT_PUBLIC_APP_URL: "https://wadesk.example",
};
const skipped = (env: Record<string, string | undefined>) => {
  const p = planScheduler(env);
  assert.equal(p.action, "skip");
  return (p as { reason: string }).reason;
};

test("a healthy production deployment registers the timer at its own public address", () => {
  const p = planScheduler(prod);
  assert.deepEqual(p, { action: "register", url: "https://wadesk.example/api/cron/dispatch", secret: prod.CRON_SECRET });
});

test("a trailing slash on the public address doesn't double up", () => {
  assert.equal((planScheduler({ ...prod, NEXT_PUBLIC_APP_URL: "https://wadesk.example/" }) as { url: string }).url, "https://wadesk.example/api/cron/dispatch");
});

test("without NEXT_PUBLIC_APP_URL it falls back to the production domain Vercel provides", () => {
  const p = planScheduler({ ...prod, NEXT_PUBLIC_APP_URL: undefined, VERCEL_PROJECT_PRODUCTION_URL: "w-adesk.vercel.app" }) as { url: string };
  assert.equal(p.url, "https://w-adesk.vercel.app/api/cron/dispatch");
});

test("a preview deployment never takes over production's timer", () => {
  assert.match(skipped({ ...prod, VERCEL_ENV: "preview" }), /preview/);
  assert.match(skipped({ ...prod, VERCEL_ENV: "development" }), /preview/);
});

test("it does nothing while building, in development, or in local demo mode", () => {
  assert.match(skipped({ ...prod, NEXT_PHASE: "phase-production-build" }), /build/);
  assert.match(skipped({ ...prod, NODE_ENV: "development" }), /production/);
  assert.match(skipped({ ...prod, NEXT_PUBLIC_SUPABASE_URL: undefined }), /demo/);
});

test("it does nothing when someone runs their own scheduler", () => {
  assert.match(skipped({ ...prod, WADESK_SCHEDULER: "external" }), /externally/);
});

test("it won't register with a missing or weak secret, no service key, or an address it can't trust", () => {
  assert.match(skipped({ ...prod, CRON_SECRET: undefined }), /CRON_SECRET/);
  assert.match(skipped({ ...prod, CRON_SECRET: "short" }), /CRON_SECRET/);
  assert.match(skipped({ ...prod, SUPABASE_SERVICE_ROLE_KEY: undefined }), /SERVICE_ROLE/);
  assert.match(skipped({ ...prod, NEXT_PUBLIC_APP_URL: undefined }), /public address/);
  assert.match(skipped({ ...prod, NEXT_PUBLIC_APP_URL: "http://wadesk.example" }), /https/);
});

test("a self-hosted production server (not on Vercel) registers too", () => {
  const { VERCEL: _v, VERCEL_ENV: _e, ...selfHosted } = prod;
  assert.equal(planScheduler(selfHosted).action, "register");
});
