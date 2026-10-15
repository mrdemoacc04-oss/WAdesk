import { NextResponse } from "next/server";
import { api } from "@/lib/server/http";
import { getProvider } from "@/lib/server/wa";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Proxy for customer media: Meta's URLs expire in minutes and need the bearer token. */
export const GET = api<{ id: string }>(async (ctx, _req, { id }) => {
  const provider = await getProvider(ctx.ws);
  const { data, mime } = await provider.downloadMedia(id);
  return new NextResponse(data, { headers: { "Content-Type": mime, "Cache-Control": "private, max-age=86400" } });
});
