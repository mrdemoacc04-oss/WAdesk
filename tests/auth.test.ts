import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { demoAllowed, setupProblem } from "@/lib/server/env";
import { safeNext } from "@/lib/shared/safe-next";

const env = process.env as Record<string, string | undefined>;
const KEYS = ["NODE_ENV", "VERCEL", "WADESK_DEMO", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];

/** Run `fn` with exactly these environment variables set (everything else in KEYS unset), then restore. */
async function withEnv<T>(vars: Record<string, string>, fn: () => T | Promise<T>): Promise<T> {
  const saved = Object.fromEntries(KEYS.map((k) => [k, env[k]]));
  for (const k of KEYS) delete env[k];
  Object.assign(env, vars);
  try {
    return await fn();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  }
}
const req = (path: string) => new NextRequest(new URL(path, "https://wadesk.example"));
const SUPABASE = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon", SUPABASE_SERVICE_ROLE_KEY: "service" };

/* ───────── safe redirect target ───────── */

test("safeNext only lets same-site paths through", () => {
  assert.equal(safeNext("/campaigns/new?x=1"), "/campaigns/new?x=1");
  assert.equal(safeNext("/"), "/");
  for (const evil of ["https://evil.example", "http://evil.example/x", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example", "/ok\nSet-Cookie: a=b", "/a\\b", ""]) {
    assert.equal(safeNext(evil), "/", `should reject ${JSON.stringify(evil)}`);
  }
  assert.equal(safeNext(null), "/");
  assert.equal(safeNext(undefined, "/inbox"), "/inbox");
});

/* ───────── demo mode / readiness ───────── */

test("demo mode (no login) is for development only", async () => {
  assert.equal(await withEnv({ NODE_ENV: "development" }, demoAllowed), true);
  assert.equal(await withEnv({ NODE_ENV: "test" }, demoAllowed), true);
  assert.equal(await withEnv({ NODE_ENV: "production" }, demoAllowed), false, "a production build must not open the unauthenticated demo");
  assert.equal(await withEnv({ NODE_ENV: "production", WADESK_DEMO: "1" }, demoAllowed), true, "unless someone opts in on purpose");
  assert.equal(await withEnv({ NODE_ENV: "production", VERCEL: "1", WADESK_DEMO: "1" }, demoAllowed), false, "never on Vercel, even with the flag");
  assert.equal(await withEnv({ NODE_ENV: "development", VERCEL: "1" }, demoAllowed), false);
});

test("a deployment missing its Supabase variables reports exactly what's missing", async () => {
  assert.equal(await withEnv({ NODE_ENV: "development" }, setupProblem), null, "local development just works");
  assert.deepEqual((await withEnv({ NODE_ENV: "production" }, setupProblem))?.missing, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  assert.deepEqual((await withEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" }, setupProblem))?.missing, ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  assert.equal(await withEnv({ NODE_ENV: "production", ...SUPABASE }, setupProblem), null);
});

/* ───────── the proxy fails closed ───────── */

test("PROXY: an unconfigured production deployment serves a 503 setup page — never the app", async () => {
  await withEnv({ NODE_ENV: "production", VERCEL: "1" }, async () => {
    for (const path of ["/", "/inbox", "/campaigns/abc", "/login", "/signup", "/settings"]) {
      const res = await proxy(req(path));
      assert.equal(res.status, 503, `${path} must not render`);
      assert.match(res.headers.get("x-middleware-rewrite") ?? "", /\/setup-required$/, `${path} is rewritten to the setup page`);
    }
  });
});

test("PROXY: an unconfigured deployment answers API calls with a 503 JSON error and leaks no data", async () => {
  await withEnv({ NODE_ENV: "production", VERCEL: "1" }, async () => {
    const res = await proxy(req("/api/contacts"));
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error.code, "NOT_CONFIGURED");
  });
});

test("PROXY: the health check stays reachable on a broken deployment so it can be diagnosed", async () => {
  await withEnv({ NODE_ENV: "production", VERCEL: "1" }, async () => {
    const res = await proxy(req("/api/health"));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("PROXY: half-configured Supabase (URL but no service key) is closed too", async () => {
  await withEnv({ NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" }, async () => {
    assert.equal((await proxy(req("/"))).status, 503);
  });
});

test("PROXY: local development (demo mode) is untouched", async () => {
  await withEnv({ NODE_ENV: "development" }, async () => {
    const res = await proxy(req("/inbox"));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

/* ───────── the proxy gates pages when Supabase is configured ───────── */

test("PROXY: a signed-out visitor to any app page is sent to /login, remembering where they were going", async () => {
  await withEnv({ NODE_ENV: "production", ...SUPABASE }, async () => {
    for (const [path, next] of [["/", null], ["/campaigns", "/campaigns"], ["/inbox?c=1", "/inbox?c=1"], ["/settings", "/settings"]] as const) {
      const res = await proxy(req(path));
      assert.equal(res.status, 307, path);
      const to = new URL(res.headers.get("location")!);
      assert.equal(to.pathname, "/login", path);
      assert.equal(to.searchParams.get("next"), next, path);
    }
  });
});

test("PROXY: sign-in, sign-up, password reset and the email-link landing page stay reachable while signed out", async () => {
  await withEnv({ NODE_ENV: "production", ...SUPABASE }, async () => {
    for (const path of ["/login", "/signup", "/forgot-password", "/auth/callback"]) {
      const res = await proxy(req(path));
      assert.equal(res.headers.get("x-middleware-next"), "1", `${path} should render`);
    }
  });
});

test("PROXY: the privacy policy is public — reachable signed out, and without hijacking a signed-in session", async () => {
  await withEnv({ NODE_ENV: "production", ...SUPABASE }, async () => {
    const res = await proxy(req("/privacy"));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});

test("PROXY: the set-new-password page needs a session (it's reached after the email link signs you in)", async () => {
  await withEnv({ NODE_ENV: "production", ...SUPABASE }, async () => {
    const res = await proxy(req("/reset-password"));
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/login");
  });
});

test("PROXY: API calls pass through to their own 401 check — they don't get an HTML redirect", async () => {
  await withEnv({ NODE_ENV: "production", ...SUPABASE }, async () => {
    const res = await proxy(req("/api/contacts"));
    assert.equal(res.headers.get("x-middleware-next"), "1");
  });
});
