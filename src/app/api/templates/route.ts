import { api, body, query } from "@/lib/server/http";
import { templateInput } from "@/lib/server/schemas";
import { listTemplates, saveTemplate } from "@/lib/server/services/templates";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const q = query(req);
  return listTemplates(ctx.db, { status: q.str("status"), category: q.str("category"), q: q.str("q") });
});

export const POST = api(async (ctx, req) => saveTemplate(ctx.db, (await body(req, templateInput)) as any));
