import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { mode } from "@/lib/server/env";
import { mimeFromName, uploadsDir } from "@/lib/server/services/templates";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (mode() !== "local") return new NextResponse("Not found", { status: 404 });
  const { path: parts } = await params;
  const name = path.basename(parts.join("/")); // no traversal
  try {
    const data = await fs.readFile(path.join(uploadsDir(), name));
    return new NextResponse(new Uint8Array(data), {
      headers: { "Content-Type": mimeFromName(name), "Cache-Control": "private, max-age=3600", "Content-Disposition": `inline; filename="${name}"` },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
