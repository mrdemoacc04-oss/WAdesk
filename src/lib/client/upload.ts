"use client";
import { api, ApiError } from "./api";
import { supabaseBrowser } from "@/lib/supabase/browser";

export interface Uploaded {
  url: string;
  mime: string;
  filename: string;
  size: number;
  kind: "image" | "video" | "audio" | "document";
}

/**
 * Local mode posts the file to the app; with Supabase the browser uploads straight to Storage
 * through a one-time signed URL (Vercel functions cap request bodies at ~4.5 MB).
 */
export async function uploadFile(file: File, onProgress?: (pct: number) => void): Promise<Uploaded> {
  const mime = file.type || "application/octet-stream";
  const sign = await api<any>("/api/media/sign", { body: { filename: file.name, mime, size: file.size } });
  onProgress?.(8);

  if (sign.kind === "signed") {
    const sb = supabaseBrowser();
    const { error } = await sb.storage.from(sign.bucket).uploadToSignedUrl(sign.path, sign.token, file, { contentType: mime });
    if (error) throw new ApiError(500, "UPLOAD", error.message);
    onProgress?.(100);
    return { url: sign.public_url, mime, filename: file.name, size: file.size, kind: sign.media };
  }

  // local: XHR so we can report progress
  return new Promise<Uploaded>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.max(8, Math.round((e.loaded / e.total) * 100)));
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve({ url: data.url, mime: data.mime, filename: data.filename, size: data.size, kind: data.kind });
        else reject(new ApiError(xhr.status, data?.error?.code ?? "UPLOAD", data?.error?.message ?? "Upload failed"));
      } catch {
        reject(new ApiError(xhr.status, "UPLOAD", "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", "Network error during upload"));
    const form = new FormData();
    form.set("file", file);
    xhr.send(form);
  });
}

export function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export const ACCEPT = {
  IMAGE: "image/jpeg,image/png,image/webp",
  VIDEO: "video/mp4,video/3gpp",
  DOCUMENT: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf",
  AUDIO: "audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg",
} as const;
