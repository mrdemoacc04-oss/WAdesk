import type { Db } from "../db/scoped";
import type { Query, Where } from "../db/types";
import { normalizePhone } from "@/lib/shared/phone";
import { chunk, nowIso, uniq } from "@/lib/shared/utils";
import type { Contact, ContactSource, OptIn, Page, Segment, SegmentRule, Tag } from "@/lib/shared/types";

/* ───────── tags ───────── */

export function normTag(t: string): string {
  return t
    .toLowerCase()
    .replace(/[,"{}\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 32);
}
export function normTags(list: unknown): string[] {
  const arr = Array.isArray(list) ? list : typeof list === "string" ? list.split(/[,;|]/) : [];
  return uniq(arr.map((t) => normTag(String(t))).filter(Boolean));
}

export async function ensureTags(db: Db, names: string[]) {
  const clean = uniq(names.map(normTag).filter(Boolean));
  if (!clean.length) return;
  await db.upsert<Tag>(
    "tags",
    clean.map((name) => ({ name })),
    ["workspace_id", "name"],
    true,
  );
}

export async function listTags(db: Db): Promise<(Tag & { count: number })[]> {
  const tags = await db.select<Tag>("tags", { order: [["name", "asc"]], limit: 500 });
  const counts = await Promise.all(tags.map((t) => db.count("contacts", { tags: { has: [t.name] } })));
  return tags.map((t, i) => ({ ...t, count: counts[i] }));
}

/* ───────── segments ───────── */

function relDate(value: string): string {
  const m = /^(\d+)\s*d$/i.exec(value.trim());
  if (m) return new Date(Date.now() - Number(m[1]) * 86400000).toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function ruleToWhere(rule: SegmentRule): Where {
  const v = rule.value ?? "";
  switch (rule.field) {
    case "tag": {
      const t = normTag(v);
      return rule.op === "has_not" ? { tags: { notHas: [t] } } : { tags: { has: [t] } };
    }
    case "opt_in":
    case "country":
    case "source": {
      const val = rule.field === "country" ? v.toUpperCase() : v;
      return rule.op === "is_not" ? { [rule.field]: { neq: val } } : { [rule.field]: val };
    }
    case "name":
    case "phone":
      return rule.op === "is" ? { [rule.field]: v } : { [rule.field]: { like: v } };
    case "attribute": {
      const col = `attributes.${rule.key ?? ""}`;
      if (rule.op === "exists") return { [col]: { isNull: false } };
      if (rule.op === "not_exists") return { [col]: { isNull: true } };
      if (rule.op === "is_not") return { [col]: { neq: v } };
      if (rule.op === "contains") return { [col]: { like: v } };
      return { [col]: v };
    }
    case "created_at":
    case "last_inbound_at": {
      if (rule.op === "not_exists") return { [rule.field]: { isNull: true } };
      if (rule.op === "exists") return { [rule.field]: { isNull: false } };
      return rule.op === "after" ? { [rule.field]: { gte: relDate(v) } } : { [rule.field]: { lt: relDate(v) } };
    }
  }
}

export function segmentToQuery(seg: Pick<Segment, "match" | "rules">): Pick<Query, "and" | "or"> {
  const wheres = seg.rules.filter((r) => r.field).map(ruleToWhere);
  if (!wheres.length) return {};
  return seg.match === "any" ? { or: wheres } : { and: wheres };
}

export async function listSegments(db: Db): Promise<Segment[]> {
  const segs = await db.select<Segment>("segments", { order: [["created_at", "desc"]], limit: 200 });
  const counts = await Promise.all(
    segs.map((s) => db.count("contacts", { opt_in: "opted_in" }, segmentToQuery(s))),
  );
  return segs.map((s, i) => ({ ...s, count: counts[i] }));
}

/* ───────── list / filter ───────── */

export interface ContactFilter {
  q?: string;
  tags?: string[];
  tag_mode?: "any" | "all";
  exclude_tags?: string[];
  opt_in?: OptIn | "all";
  source?: string;
  country?: string;
  segment_id?: string;
  ids?: string[];
}

export async function filterToQuery(db: Db, f: ContactFilter): Promise<Query> {
  const where: Where = {};
  const and: Where[] = [];
  let or: Where[] | undefined;
  if (f.opt_in && f.opt_in !== "all") where.opt_in = f.opt_in;
  if (f.source) where.source = f.source;
  if (f.country) where.country = f.country.toUpperCase();
  if (f.ids?.length) where.id = { in: f.ids };
  if (f.tags?.length) {
    const t = f.tags.map(normTag);
    where.tags = f.tag_mode === "all" ? { has: t } : { hasAny: t };
  }
  for (const t of f.exclude_tags ?? []) and.push({ tags: { notHas: [normTag(t)] } });
  if (f.segment_id) {
    const seg = await db.get<Segment>("segments", f.segment_id);
    if (seg) {
      const sq = segmentToQuery(seg);
      and.push(...(sq.and ?? []));
      or = sq.or;
    }
  }
  return {
    where,
    and: and.length ? and : undefined,
    or,
    search: f.q?.trim() ? { cols: ["name", "phone", "email"], term: f.q.trim() } : undefined,
  };
}

export async function listContacts(
  db: Db,
  f: ContactFilter & { sort?: string; dir?: "asc" | "desc"; limit?: number; offset?: number },
): Promise<Page<Contact>> {
  const q = await filterToQuery(db, f);
  const sortable = new Set(["name", "created_at", "last_inbound_at", "phone", "opt_in"]);
  const sort = f.sort && sortable.has(f.sort) ? f.sort : "created_at";
  return db.selectPage<Contact>("contacts", {
    ...q,
    order: [[sort, f.dir ?? "desc"], ["id", "asc"]],
    limit: Math.min(f.limit ?? 50, 200),
    offset: f.offset ?? 0,
  });
}

/** Every contact matching a query, streamed in pages (for campaigns, bulk actions, export). */
export async function* iterateContacts(db: Db, q: Query, pageSize = 1000): AsyncGenerator<Contact[]> {
  let offset = 0;
  for (;;) {
    const rows = await db.select<Contact>("contacts", {
      ...q,
      order: [["created_at", "asc"], ["id", "asc"]],
      limit: pageSize,
      offset,
    });
    if (!rows.length) return;
    yield rows;
    if (rows.length < pageSize) return;
    offset += pageSize;
  }
}

/* ───────── single-contact CRUD ───────── */

export interface ContactInput {
  phone: string;
  name?: string | null;
  email?: string | null;
  tags?: string[];
  attributes?: Record<string, string>;
  notes?: string | null;
  opt_in?: OptIn;
  opt_in_source?: string | null;
  source?: ContactSource;
}

export function contactRow(input: {
  phone: string;
  country?: string | null;
  name?: string | null;
  email?: string | null;
  tags?: string[];
  attributes?: Record<string, string>;
  notes?: string | null;
  opt_in?: OptIn;
  opt_in_source?: string | null;
  source?: ContactSource;
}) {
  const now = nowIso();
  const opt: OptIn = input.opt_in ?? "pending";
  return {
    phone: input.phone,
    wa_id: null,
    name: input.name?.trim() || null,
    email: input.email?.trim() || null,
    country: input.country ?? null,
    tags: normTags(input.tags ?? []),
    attributes: input.attributes ?? {},
    opt_in: opt,
    opt_in_source: input.opt_in_source ?? null,
    opted_in_at: opt === "opted_in" ? now : null,
    opted_out_at: opt === "opted_out" ? now : null,
    source: input.source ?? "manual",
    notes: input.notes ?? null,
    last_inbound_at: null,
    last_outbound_at: null,
  };
}

export async function createContact(db: Db, input: ContactInput, defaultCountry: string): Promise<Contact> {
  const p = normalizePhone(input.phone, defaultCountry);
  if (!p.ok) throw new Error(`Phone: ${p.reason}`);
  const existing = await db.one<Contact>("contacts", { phone: p.e164 });
  if (existing) throw new Error("A contact with this number already exists");
  const row = contactRow({ ...input, phone: p.e164, country: p.country });
  await ensureTags(db, row.tags);
  return db.insertOne<Contact>("contacts", row);
}

export async function updateContact(
  db: Db,
  id: string,
  patch: Partial<Pick<Contact, "name" | "email" | "tags" | "attributes" | "notes" | "opt_in">>,
): Promise<Contact | null> {
  const upd: Record<string, any> = {};
  if (patch.name !== undefined) upd.name = patch.name?.trim() || null;
  if (patch.email !== undefined) upd.email = patch.email?.trim() || null;
  if (patch.notes !== undefined) upd.notes = patch.notes;
  if (patch.attributes !== undefined) upd.attributes = patch.attributes;
  if (patch.tags !== undefined) {
    upd.tags = normTags(patch.tags);
    await ensureTags(db, upd.tags);
  }
  if (patch.opt_in !== undefined) {
    upd.opt_in = patch.opt_in;
    if (patch.opt_in === "opted_in") Object.assign(upd, { opted_in_at: nowIso(), opt_in_source: "manual" });
    if (patch.opt_in === "opted_out") Object.assign(upd, { opted_out_at: nowIso(), opt_in_source: "manual" });
  }
  return db.updateOne<Contact>("contacts", id, upd);
}

export async function setOptStatus(db: Db, contactId: string, opt: "opted_in" | "opted_out", source: string) {
  const patch: Record<string, any> = { opt_in: opt, opt_in_source: source };
  patch[opt === "opted_in" ? "opted_in_at" : "opted_out_at"] = nowIso();
  return db.updateOne<Contact>("contacts", contactId, patch);
}

/* ───────── import ───────── */

export interface ImportRow {
  phone: string;
  name?: string | null;
  email?: string | null;
  tags?: string[];
  attributes?: Record<string, string>;
}

export interface ImportOptions {
  tags: string[];
  /** the uploader confirms these people agreed to receive WhatsApp messages */
  consent: boolean;
  duplicates: "update" | "skip";
  default_country: string;
  source?: ContactSource;
}

export interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  invalid: { row: number; phone: string; reason: string }[];
}

export async function importContacts(db: Db, rows: ImportRow[], opts: ImportOptions): Promise<ImportResult> {
  const result: ImportResult = { total: rows.length, created: 0, updated: 0, skipped: 0, invalid: [] };
  const byPhone = new Map<string, ImportRow & { country: string | null }>();

  rows.forEach((r, i) => {
    const p = normalizePhone(r.phone, opts.default_country);
    if (!p.ok) {
      result.invalid.push({ row: i + 1, phone: String(r.phone ?? ""), reason: p.reason });
      return;
    }
    const prev = byPhone.get(p.e164);
    if (prev) {
      // same number twice in one file: merge, later non-empty values win
      prev.name = r.name || prev.name;
      prev.email = r.email || prev.email;
      prev.tags = uniq([...(prev.tags ?? []), ...(r.tags ?? [])]);
      prev.attributes = { ...prev.attributes, ...r.attributes };
      result.skipped++;
    } else {
      byPhone.set(p.e164, { ...r, phone: p.e164, country: p.country });
    }
  });

  const phones = [...byPhone.keys()];
  const allTags = uniq([...opts.tags, ...[...byPhone.values()].flatMap((r) => r.tags ?? [])].map(normTag).filter(Boolean));
  await ensureTags(db, allTags);

  const existing = new Map<string, Contact>();
  for (const part of chunk(phones, 100)) {
    for (const c of await db.select<Contact>("contacts", { where: { phone: { in: part } } })) existing.set(c.phone, c);
  }

  const toInsert: any[] = [];
  const toUpdate: any[] = [];
  const now = nowIso();
  for (const [phone, r] of byPhone) {
    const tags = normTags([...(r.tags ?? []), ...opts.tags]);
    const cur = existing.get(phone);
    if (cur) {
      if (opts.duplicates === "skip") {
        result.skipped++;
        continue;
      }
      // never silently re-subscribe someone who opted out
      const optIn: OptIn = cur.opt_in === "opted_out" ? "opted_out" : opts.consent ? "opted_in" : cur.opt_in;
      toUpdate.push({
        ...cur,
        name: r.name?.trim() || cur.name,
        email: r.email?.trim() || cur.email,
        tags: uniq([...cur.tags, ...tags]),
        attributes: { ...cur.attributes, ...(r.attributes ?? {}) },
        opt_in: optIn,
        opted_in_at: optIn === "opted_in" && cur.opt_in !== "opted_in" ? now : cur.opted_in_at,
        opt_in_source: optIn === "opted_in" && cur.opt_in !== "opted_in" ? "import" : cur.opt_in_source,
        updated_at: now,
      });
    } else {
      toInsert.push(
        contactRow({
          phone,
          country: r.country,
          name: r.name,
          email: r.email,
          tags,
          attributes: r.attributes,
          opt_in: opts.consent ? "opted_in" : "pending",
          opt_in_source: opts.consent ? "import" : null,
          source: opts.source ?? "import",
        }),
      );
    }
  }

  if (toInsert.length) {
    await db.upsert<Contact>("contacts", toInsert, ["workspace_id", "phone"], true);
    result.created = toInsert.length;
  }
  if (toUpdate.length) {
    await db.upsert<Contact>("contacts", toUpdate, ["workspace_id", "phone"]);
    result.updated = toUpdate.length;
  }
  return result;
}

/* ───────── bulk actions ───────── */

export type BulkAction =
  | { type: "add_tags"; tags: string[] }
  | { type: "remove_tags"; tags: string[] }
  | { type: "opt_in" }
  | { type: "opt_out" }
  | { type: "delete" };

export async function bulkAction(db: Db, f: ContactFilter, action: BulkAction): Promise<{ affected: number; skipped?: number }> {
  const q = await filterToQuery(db, f);
  // Snapshot the matching set first: the action itself can change what the filter matches.
  const all: Contact[] = [];
  for await (const rows of iterateContacts(db, q)) {
    all.push(...rows);
    if (all.length >= 200_000) break;
  }

  if (action.type === "delete") {
    for (const part of chunk(all, 200)) {
      const ids = part.map((r) => r.id);
      await db.delete("conversations", { contact_id: { in: ids } });
      await db.delete("contacts", { id: { in: ids } });
    }
    return { affected: all.length };
  }

  const tags = action.type === "add_tags" || action.type === "remove_tags" ? normTags(action.tags) : [];
  if (tags.length && action.type === "add_tags") await ensureTags(db, tags);
  const now = nowIso();

  // A bulk action must never quietly re-subscribe someone who opted out; that takes the person's own
  // "START" message or a deliberate change on their contact card.
  let skipped = 0;
  if (action.type === "opt_in") {
    const keep = all.filter((c) => c.opt_in !== "opted_out");
    skipped = all.length - keep.length;
    all.length = 0;
    all.push(...keep);
  }

  for (const part of chunk(all, 500)) {
    const updated = part.map((c) => {
      const next: Contact = { ...c, updated_at: now };
      if (action.type === "add_tags") next.tags = uniq([...c.tags, ...tags]);
      if (action.type === "remove_tags") next.tags = c.tags.filter((t) => !tags.includes(t));
      if (action.type === "opt_in") Object.assign(next, { opt_in: "opted_in", opted_in_at: now, opt_in_source: "manual" });
      if (action.type === "opt_out") Object.assign(next, { opt_in: "opted_out", opted_out_at: now, opt_in_source: "manual" });
      return next;
    });
    await db.upsert<Contact>("contacts", updated, ["workspace_id", "phone"]);
  }
  return { affected: all.length, ...(skipped ? { skipped } : {}) };
}

/* ───────── export ───────── */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export async function exportContactsCsv(db: Db, f: ContactFilter): Promise<string> {
  const q = await filterToQuery(db, f);
  const attrKeys = new Set<string>();
  const all: Contact[] = [];
  for await (const rows of iterateContacts(db, q)) {
    for (const r of rows) {
      all.push(r);
      Object.keys(r.attributes ?? {}).forEach((k) => attrKeys.add(k));
    }
  }
  const keys = [...attrKeys].sort();
  const head = ["name", "phone", "email", "country", "tags", "opt_in", "source", "created_at", ...keys];
  const lines = [head.join(",")];
  for (const c of all) {
    lines.push(
      [c.name, c.phone, c.email, c.country, c.tags.join("; "), c.opt_in, c.source, c.created_at, ...keys.map((k) => c.attributes?.[k] ?? "")]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/* ───────── inbound helper ───────── */

export async function upsertInboundContact(db: Db, phone: string, profileName: string | undefined, country: string | null) {
  const found = await db.one<Contact>("contacts", { phone });
  if (found) {
    if (profileName && !found.name) return (await db.updateOne<Contact>("contacts", found.id, { name: profileName })) ?? found;
    return found;
  }
  return db.insertOne<Contact>(
    "contacts",
    contactRow({ phone, country, name: profileName, source: "inbound", opt_in: "pending" }),
  );
}
