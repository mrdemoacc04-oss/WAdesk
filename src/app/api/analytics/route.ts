import { api, query } from "@/lib/server/http";
import { analyticsData } from "@/lib/server/services/analytics";

export const dynamic = "force-dynamic";

export const GET = api(async (ctx, req) => {
  const range = Math.min(90, Math.max(7, query(req).num("range", 30)!));
  return analyticsData(ctx, range);
});
