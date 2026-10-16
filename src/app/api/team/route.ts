import { z } from "zod";
import { api, body, HttpError } from "@/lib/server/http";
import { mode, publicUrl } from "@/lib/server/env";
import { listMembers } from "@/lib/server/services/workspace";
import type { Member } from "@/lib/shared/types";

export const dynamic = "force-dynamic";

const COLORS = ["#0e8a52", "#6b5bd6", "#c2693a", "#2a62c9", "#b4417c", "#2f8f8a"];

export const GET = api(async (ctx) => listMembers(ctx.db));

const invite = z.object({ email: z.string().email().max(200), name: z.string().max(120).optional(), role: z.enum(["admin", "agent"]) });

export const POST = api(
  async (ctx, req) => {
    const d = await body(req, invite);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const name = d.name?.trim() || d.email.split("@")[0];
    if (mode() === "local") {
      return ctx.db.insertOne<Member>("workspace_members", { user_id: crypto.randomUUID(), role: d.role, name, email: d.email, color });
    }
    // The invite row (server-side only) is what the signup trigger reads — never user-supplied metadata.
    const { dbFor } = await import("@/lib/server/context");
    const { supabaseAdmin } = await import("@/lib/supabase/admin");
    const root = dbFor(ctx.ws);
    await root.delete("workspace_invites", { email: d.email.toLowerCase() });
    await root.insertOne("workspace_invites", { email: d.email.toLowerCase(), role: d.role, name, color });
    // The invite link signs the person in at /auth/callback, then sends them to choose a password.
    const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(d.email, {
      redirectTo: `${publicUrl(req)}/auth/callback?next=/reset-password`,
    });
    if (error) {
      await root.delete("workspace_invites", { email: d.email.toLowerCase() });
      throw new HttpError(422, "INVITE_FAILED", error.message);
    }
    return { ok: true, invited: d.email };
  },
  { minRole: "admin" },
);

