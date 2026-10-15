import { api } from "@/lib/server/http";
import { submitTemplate } from "@/lib/server/services/templates";

export const maxDuration = 60;

export const POST = api<{ id: string }>(async (ctx, _req, { id }) => submitTemplate(ctx, id), { minRole: "admin" });
