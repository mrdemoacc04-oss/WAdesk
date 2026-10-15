export type Mode = "local" | "supabase";

export const appName = process.env.NEXT_PUBLIC_APP_NAME || "WAdesk";
export const graphVersion = process.env.META_GRAPH_VERSION || "v23.0";

export function mode(): Mode {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ? "supabase" : "local";
}

export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) throw new Error("Supabase is half-configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return { url, anon, service };
}

export function requireServiceKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required on the server (webhooks, sending, settings).");
  return k;
}

/** Public base URL, used to show the webhook address and build absolute links. */
export function publicUrl(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  if (env) return env.replace(/\/$/, "");
  if (req) {
    const u = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
    return `${proto}://${host}`;
  }
  return "http://localhost:4600";
}
