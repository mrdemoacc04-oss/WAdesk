import { NextResponse } from "next/server";
import { api, query } from "@/lib/server/http";
import { exportContactsCsv } from "@/lib/server/services/contacts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = api(async (ctx, req) => {
  const q = query(req);
  const csv = await exportContactsCsv(ctx.db, {
    q: q.str("q"),
    tags: q.list("tags"),
    tag_mode: (q.str("tag_mode") as "any" | "all") ?? "any",
    opt_in: (q.str("opt_in") as any) ?? "all",
    segment_id: q.str("segment_id"),
    source: q.str("source"),
    country: q.str("country"),
    exclude_tags: q.list("exclude_tags"),
    ids: q.list("ids"),
  });
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
