import { api, body } from "@/lib/server/http";
import { settingsPatch } from "@/lib/server/schemas";
import { getWorkspace, updateWorkspace } from "@/lib/server/services/workspace";

export const GET = api(async (ctx) => getWorkspace(ctx.db));

export const PATCH = api(
  async (ctx, req) => {
    const patch = await body(req, settingsPatch);
    return updateWorkspace(ctx.db, patch as any);
  },
  { minRole: "admin" },
);
