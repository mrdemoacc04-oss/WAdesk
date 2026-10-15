import { api } from "@/lib/server/http";
import { syncTemplates } from "@/lib/server/services/templates";

export const maxDuration = 60;

export const POST = api(async (ctx) => syncTemplates(ctx), { minRole: "admin" });
