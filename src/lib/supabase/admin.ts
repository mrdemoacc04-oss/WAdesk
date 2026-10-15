import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireServiceKey, supabaseEnv } from "@/lib/server/env";

const g = globalThis as unknown as { __wadeskAdmin?: SupabaseClient };

/** Service-role client — bypasses RLS. Server only; always scope by workspace in code. */
export function supabaseAdmin(): SupabaseClient {
  if (g.__wadeskAdmin) return g.__wadeskAdmin;
  const { url } = supabaseEnv();
  g.__wadeskAdmin = createClient(url, requireServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-wadesk": "server" } },
  });
  return g.__wadeskAdmin;
}
