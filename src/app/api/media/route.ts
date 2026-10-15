import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { api, HttpError } from "@/lib/server/http";
import { mode } from "@/lib/server/env";
import { MEDIA_LIMITS, mediaKindForMime, mimeFromName, uploadsDir } from "@/lib/server/services/templates";
import { randomToken, slugify } from "@/lib/shared/utils";

export const maxDuration = 60;

/** Local-mode upload target. */
export const POST = api(async (_ctx, req) => {
  if (mode() !== "local") throw new HttpError(404, "NOT_FOUND", "Use /api/media/sign");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(422, "VALIDATION", "No file received");
  const mime = file.type || mimeFromName(file.name);
  const kind = mediaKindForMime(mime);
  if (!kind) throw new HttpError(422, "UNSUPPORTED", `${mime} isn't supported by WhatsApp.`);
  if (file.size > MEDIA_LIMITS[kind].max) throw new HttpError(422, "TOO_LARGE", "File is too large for WhatsApp.");

  const ext = file.name.includes(".") ? "." + file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const name = `${Date.now().toString(36)}-${randomToken(6)}-${slugify(file.name.replace(/\.[^.]+$/, "")) || "file"}${ext}`;
  await fs.mkdir(uploadsDir(), { recursive: true });
  await fs.writeFile(path.join(uploadsDir(), name), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/api/media/file/${name}`, mime, filename: file.name, size: file.size, kind });
});
