import { z } from "zod";
import { api, body, forbidden, notFound } from "@/lib/server/http";
import type { Member } from "@/lib/shared/types";

type P = { id: string };

export const PATCH = api<P>(
  async (ctx, req, { id }) => {
    const { role } = await body(req, z.object({ role: z.enum(["admin", "agent"]) }));
    const m = await ctx.db.get<Member>("workspace_members", id);
    if (!m) throw notFound("Member not found");
    if (m.role === "owner") throw forbidden("The owner's role can't be changed");
    return ctx.db.updateOne<Member>("workspace_members", id, { role });
  },
  { minRole: "admin" },
);

export const DELETE = api<P>(
  async (ctx, _req, { id }) => {
    const m = await ctx.db.get<Member>("workspace_members", id);
    if (!m) throw notFound("Member not found");
    if (m.role === "owner") throw forbidden("The owner can't be removed");
    await ctx.db.delete("workspace_members", { id });
    return { ok: true };
  },
  { minRole: "admin" },
);
