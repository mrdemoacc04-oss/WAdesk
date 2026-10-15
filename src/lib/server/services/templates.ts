import fs from "node:fs/promises";
import path from "node:path";
import { dbFor, type Ctx } from "../context";
import type { Db } from "../db/scoped";
import { mode } from "../env";
import { HttpError } from "../http";
import { getProvider, providerMode } from "../wa";
import { asWaError } from "../wa/errors";
import { fromMetaComponents, toMetaComponents, validateTemplate } from "@/lib/shared/template";
import { nowIso } from "@/lib/shared/utils";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Campaign, Template, TemplateCategory, TemplateContent, TemplateStatus } from "@/lib/shared/types";

export type TemplateWithUsage = Template & { usage: { campaigns: number; sent: number; delivered: number; read: number } };

export async function listTemplates(db: Db, f: { status?: string; category?: string; q?: string } = {}): Promise<TemplateWithUsage[]> {
  const where: Record<string, any> = {};
  if (f.status && f.status !== "all") where.status = f.status;
  if (f.category && f.category !== "all") where.category = f.category;
  const rows = await db.select<Template>("templates", {
    where,
    search: f.q?.trim() ? { cols: ["name"], term: f.q.trim() } : undefined,
    order: [["updated_at", "desc"]],
    limit: 500,
  });
  const camps = await db.select<Campaign>("campaigns", { where: { template_id: { in: rows.map((r) => r.id) } }, limit: 2000 });
  const usage = new Map<string, TemplateWithUsage["usage"]>();
  for (const c of camps) {
    if (!c.template_id) continue;
    const u = usage.get(c.template_id) ?? { campaigns: 0, sent: 0, delivered: 0, read: 0 };
    u.campaigns++;
    u.sent += c.sent;
    u.delivered += c.delivered;
    u.read += c.read;
    usage.set(c.template_id, u);
  }
  return rows.map((t) => ({ ...t, usage: usage.get(t.id) ?? { campaigns: 0, sent: 0, delivered: 0, read: 0 } }));
}

export interface TemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  content: TemplateContent;
}

function kindOf(c: TemplateContent): "standard" | "carousel" {
  return c.cards?.length ? "carousel" : "standard";
}

export async function saveTemplate(db: Db, input: TemplateInput, id?: string): Promise<Template> {
  const name = input.name.trim();
  const dupe = await db.one<Template>("templates", { name, language: input.language });
  if (dupe && dupe.id !== id) throw new HttpError(409, "DUPLICATE", `A template named “${name}” already exists in this language.`);
  const base = { name, language: input.language, category: input.category, content: input.content, kind: kindOf(input.content) };
  if (id) {
    const cur = await db.get<Template>("templates", id);
    if (!cur) throw new HttpError(404, "NOT_FOUND", "Template not found");
    if (!["DRAFT", "REJECTED"].includes(cur.status))
      throw new HttpError(409, "LOCKED", "Approved and pending templates can't be edited — duplicate it to make changes.");
    return (await db.updateOne<Template>("templates", id, { ...base, status: "DRAFT", rejection_reason: null }))!;
  }
  return db.insertOne<Template>("templates", {
    ...base,
    status: "DRAFT",
    rejection_reason: null,
    meta_template_id: null,
    quality: null,
    submitted_at: null,
  });
}

/* ───────── media bytes (for template samples & live sends) ───────── */

const LOCAL_PREFIX = "/api/media/file/";

export function uploadsDir() {
  return path.join(process.cwd(), ".data", "uploads");
}

export async function loadMediaBytes(url: string): Promise<{ data: Buffer; mime: string; filename: string }> {
  const filename = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "file");
  if (url.startsWith(LOCAL_PREFIX) || /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    const rel = decodeURIComponent(new URL(url, "http://x").pathname.replace(LOCAL_PREFIX, ""));
    const full = path.join(uploadsDir(), path.basename(rel));
    const data = await fs.readFile(full);
    return { data, mime: mimeFromName(filename), filename };
  }
  if (url.startsWith("/demo/") || url.startsWith("/")) {
    const full = path.join(process.cwd(), "public", url.split("?")[0]);
    const data = await fs.readFile(full);
    return { data, mime: mimeFromName(filename), filename };
  }
  const res = await fetch(url);
  if (!res.ok) throw new HttpError(422, "MEDIA_FETCH", `Couldn't download media (${res.status}): ${url}`);
  return { data: Buffer.from(await res.arrayBuffer()), mime: res.headers.get("content-type")?.split(";")[0] ?? mimeFromName(filename), filename };
}

export function mimeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml",
    mp4: "video/mp4", "3gp": "video/3gpp", mov: "video/quicktime", mp3: "audio/mpeg", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", amr: "audio/amr",
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain",
  };
  return map[ext ?? ""] ?? "application/octet-stream";
}

/** Supabase public URL for a stored object (used by the signed-upload flow). */
export function storagePublicUrl(objectPath: string): string {
  return supabaseAdmin().storage.from("media").getPublicUrl(objectPath).data.publicUrl;
}

export const MEDIA_LIMITS = {
  image: { mimes: ["image/jpeg", "image/png", "image/webp"], max: 5 * 1024 * 1024 },
  video: { mimes: ["video/mp4", "video/3gpp"], max: 16 * 1024 * 1024 },
  audio: { mimes: ["audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg"], max: 16 * 1024 * 1024 },
  document: {
    mimes: [
      "application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "text/plain",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
    max: 100 * 1024 * 1024,
  },
} as const;

export function mediaKindForMime(mime: string): keyof typeof MEDIA_LIMITS | null {
  for (const [k, v] of Object.entries(MEDIA_LIMITS)) if ((v.mimes as readonly string[]).includes(mime)) return k as keyof typeof MEDIA_LIMITS;
  return null;
}

/* ───────── submit to Meta ───────── */

async function withHandles(provider: Awaited<ReturnType<typeof getProvider>>, content: TemplateContent): Promise<TemplateContent> {
  const next: TemplateContent = structuredClone(content);
  const getHandle = async (url?: string, existing?: string) => {
    if (existing) return existing;
    if (!url) return undefined;
    const f = await loadMediaBytes(url);
    return provider.uploadTemplateSample(f.data, f.mime, f.filename);
  };
  if (next.header && next.header.format !== "TEXT") next.header.handle = await getHandle(next.header.media_url, next.header.handle);
  for (const c of next.cards ?? []) c.handle = await getHandle(c.media_url, c.handle);
  return next;
}

export async function submitTemplate(ctx: Ctx, id: string): Promise<Template> {
  const t = await ctx.db.get<Template>("templates", id);
  if (!t) throw new HttpError(404, "NOT_FOUND", "Template not found");
  if (!["DRAFT", "REJECTED"].includes(t.status)) throw new HttpError(409, "LOCKED", "This template was already submitted.");
  const issues = validateTemplate(t).filter((i) => i.level === "error");
  if (issues.length) throw new HttpError(422, "INVALID_TEMPLATE", issues[0].message, issues);

  const provider = await getProvider(ctx.ws);
  try {
    const content = await withHandles(provider, t.content);
    const res = await provider.createTemplate({
      name: t.name,
      language: t.language,
      category: t.category,
      components: toMetaComponents(content),
    });
    const status = (["APPROVED", "REJECTED"].includes(res.status) ? res.status : "PENDING") as TemplateStatus;
    const updated = await ctx.db.updateOne<Template>("templates", id, {
      status,
      meta_template_id: res.id,
      submitted_at: nowIso(),
      rejection_reason: null,
    });
    if (provider.mode === "mock") await simulateReview(ctx.ws, id, t.name);
    return updated!;
  } catch (e) {
    const w = asWaError(e);
    throw new HttpError(422, "META_REJECTED", w.details ? `${w.message} — ${w.details}` : w.message, { code: w.code });
  }
}

/** Demo mode: approve (or occasionally reject) a submitted template after a short "review". */
async function simulateReview(ws: string, templateId: string, name: string) {
  const db = dbFor(ws);
  const reject = /spam|win|lottery|free_money/i.test(name);
  await db.insert("sim_events", [
    {
      due_at: new Date(Date.now() + 12_000 + Math.random() * 18_000).toISOString(),
      payload: { template_status: { template_id: templateId, event: reject ? "REJECTED" : "APPROVED", reason: reject ? "INVALID_FORMAT" : null } },
    },
  ]);
}

export async function deleteTemplate(ctx: Ctx, id: string) {
  const t = await ctx.db.get<Template>("templates", id);
  if (!t) throw new HttpError(404, "NOT_FOUND", "Template not found");
  if (t.meta_template_id && (await providerMode(ctx.ws)) === "live") {
    try {
      const provider = await getProvider(ctx.ws);
      await provider.deleteTemplate(t.name);
    } catch (e) {
      const w = asWaError(e);
      // a template that already vanished on Meta's side shouldn't block local cleanup
      if (!["100", "132001"].includes(w.code)) throw new HttpError(422, "META_ERROR", w.message);
    }
  }
  await ctx.db.delete("templates", { id });
}

export async function duplicateTemplate(db: Db, id: string): Promise<Template> {
  const t = await db.get<Template>("templates", id);
  if (!t) throw new HttpError(404, "NOT_FOUND", "Template not found");
  let n = 2;
  let name = `${t.name}_v${n}`;
  while (await db.one<Template>("templates", { name, language: t.language })) name = `${t.name}_v${++n}`;
  return saveTemplate(db, { name, language: t.language, category: t.category, content: t.content });
}

/* ───────── sync from Meta ───────── */

export async function syncTemplates(ctx: Ctx): Promise<{ imported: number; updated: number; mode: "mock" | "live" }> {
  const provider = await getProvider(ctx.ws);
  if (provider.mode === "mock") return { imported: 0, updated: 0, mode: "mock" };
  const remote = await provider.listTemplates();
  let imported = 0;
  let updated = 0;
  for (const m of remote) {
    const { content, kind } = fromMetaComponents(m.components);
    const row = {
      name: m.name,
      language: m.language,
      category: (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(m.category) ? m.category : "MARKETING") as TemplateCategory,
      status: (["APPROVED", "PENDING", "REJECTED", "PAUSED", "DISABLED"].includes(m.status) ? m.status : "PENDING") as TemplateStatus,
      kind,
      content,
      rejection_reason: m.rejected_reason && m.rejected_reason !== "NONE" ? m.rejected_reason : null,
      meta_template_id: m.id,
      quality: m.quality_score?.score ?? null,
      submitted_at: nowIso(),
    };
    const cur = await ctx.db.one<Template>("templates", { name: m.name, language: m.language });
    if (cur) {
      // keep sample media the user uploaded locally; Meta only returns opaque handles
      const merged = { ...row, content: mergeMedia(cur.content, content) };
      await ctx.db.updateOne("templates", cur.id, merged);
      updated++;
    } else {
      await ctx.db.insert("templates", row);
      imported++;
    }
  }
  return { imported, updated, mode: "live" };
}

function mergeMedia(local: TemplateContent, remote: TemplateContent): TemplateContent {
  const out = structuredClone(remote);
  if (out.header && out.header.format !== "TEXT" && local.header && local.header.format !== "TEXT" && !out.header.media_url)
    out.header.media_url = local.header.media_url;
  out.cards?.forEach((c, i) => {
    if (!c.media_url && local.cards?.[i]?.media_url) c.media_url = local.cards[i].media_url;
  });
  return out;
}

export function isLocalUploads() {
  return mode() === "local";
}
