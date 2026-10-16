import { cache } from "react";
import { flushLocal, LocalAdapter, localStore } from "./db/local";
import { Db } from "./db/scoped";
import { SupabaseAdapter } from "./db/supabase";
import type { Adapter } from "./db/types";
import { demoAllowed, mode, type Mode } from "./env";
import { seedLocal } from "./seed";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Member, Role } from "@/lib/shared/types";

export interface Ctx {
  mode: Mode;
  db: Db;
  ws: string;
  root: Adapter;
  user: { id: string; name: string; email: string; role: Role; color: string };
}

const g = globalThis as unknown as { __wadeskLocal?: LocalAdapter; __wadeskSbRoot?: SupabaseAdapter };

export function ensureSeeded() {
  const store = localStore();
  if (store.seeded) return;
  seedLocal(store.tables);
  store.seeded = true;
  flushLocal(store);
}

/** Unscoped adapter with full privileges — only for webhooks, the dispatcher and cron. */
export function rootAdapter(): Adapter {
  if (mode() === "local") {
    // Backstop behind the proxy: never serve the unauthenticated demo store outside development.
    if (!demoAllowed()) {
      throw new Error(
        "Supabase isn't configured on this deployment. Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in your hosting environment variables (set WADESK_DEMO=1 only for a deliberate local demo).",
      );
    }
    ensureSeeded();
    return (g.__wadeskLocal ??= new LocalAdapter());
  }
  return (g.__wadeskSbRoot ??= new SupabaseAdapter(supabaseAdmin()));
}

export function dbFor(workspaceId: string): Db {
  return new Db(rootAdapter(), workspaceId);
}

export const getCtx = cache(async (): Promise<Ctx> => {
  if (mode() === "local") {
    const root = rootAdapter();
    const [ws] = await root.select<{ id: string }>("workspaces", { limit: 1 });
    const db = new Db(root, ws.id);
    const owner = await db.one<Member>("workspace_members", { role: "owner" });
    return {
      mode: "local",
      db,
      ws: ws.id,
      root,
      user: {
        id: owner!.user_id,
        name: owner!.name,
        email: owner!.email,
        role: "owner",
        color: owner!.color,
      },
    };
  }

  const { HttpError } = await import("./http");
  const { supabaseServer } = await import("@/lib/supabase/server");
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in");

  const userAdapter = new SupabaseAdapter(sb);
  const members = await userAdapter.select<Member>("workspace_members", {
    where: { user_id: user.id },
    order: [["created_at", "asc"]],
    limit: 1,
  });
  const me = members[0];
  if (!me) throw new HttpError(403, "NO_WORKSPACE", "Your account isn't part of a workspace yet");

  return {
    mode: "supabase",
    db: new Db(userAdapter, me.workspace_id),
    ws: me.workspace_id,
    root: rootAdapter(),
    user: { id: user.id, name: me.name, email: me.email, role: me.role, color: me.color },
  };
});
