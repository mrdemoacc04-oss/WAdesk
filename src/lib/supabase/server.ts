import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "@/lib/server/env";

/** Cookie-bound client: queries run as the signed-in user, so RLS applies. */
export async function supabaseServer() {
  const { url, anon } = supabaseEnv();
  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component — the proxy refreshes the session instead
        }
      },
    },
  });
}
