import { api } from "@/lib/server/http";
import { duplicateTemplate } from "@/lib/server/services/templates";

export const POST = api<{ id: string }>(async (ctx, _req, { id }) => duplicateTemplate(ctx.db, id));
