import { api, query } from "@/lib/server/http";
import { dashboardData } from "@/lib/server/services/analytics";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const range = Math.min(90, Math.max(7, query(req).num("range", 14)!));
  return dashboardData(ctx, range);
});
