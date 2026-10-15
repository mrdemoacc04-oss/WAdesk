import { z } from "zod";
import { api, body, HttpError } from "@/lib/server/http";
import { mode } from "@/lib/server/env";
import { MEDIA_LIMITS, mediaKindForMime } from "@/lib/server/services/templates";
import { slugify, randomToken } from "@/lib/shared/utils";

/**
 * Uploads on Vercel are capped at ~4.5 MB per request, so with Supabase the browser uploads
 * straight to Storage using a one-time signed URL. Local mode posts to /api/media instead.
 */
export const POST = api(async (ctx, req) => {
  const d = await body(req, z.object({ filename: z.string().min(1).max(200), mime: z.string().min(3).max(120), size: z.number().int().positive() }));
  const kind = mediaKindForMime(d.mime);
  if (!kind) throw new HttpError(422, "UNSUPPORTED", `${d.mime} isn't supported by WhatsApp. Use JPG/PNG/WebP, MP4, MP3/OGG/AAC, or PDF/Office documents.`);
  if (d.size > MEDIA_LIMITS[kind].max) throw new HttpError(422, "TOO_LARGE", `${kind[0].toUpperCase()}${kind.slice(1)} files can be up to ${Math.round(MEDIA_LIMITS[kind].max / 1048576)} MB on WhatsApp.`);

  if (mode() === "local") return { kind: "direct" as const, media: kind };

  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  const ext = d.filename.includes(".") ? d.filename.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  const base = slugify(d.filename.replace(/\.[^.]+$/, "")) || "file";
  const path = `${ctx.ws}/${Date.now().toString(36)}-${randomToken(6)}-${base}${ext ? "." + ext : ""}`;
  const sb = supabaseAdmin();
  const { data, error } = await sb.storage.from("media").createSignedUploadUrl(path);
  if (error || !data) throw new HttpError(500, "STORAGE", error?.message ?? "Could not prepare upload");
  return {
    kind: "signed" as const,
    media: kind,
    bucket: "media",
    path,
    token: data.token,
    public_url: sb.storage.from("media").getPublicUrl(path).data.publicUrl,
  };
});
