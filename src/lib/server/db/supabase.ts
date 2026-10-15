import type { SupabaseClient } from "@supabase/supabase-js";
import { chunk } from "@/lib/shared/utils";
import { DbError, type Adapter, type Cond, type CondOps, type Query, type TableName, type Where } from "./types";

/* PostgREST adapter. Works with the service-role client (webhooks, dispatcher)
   and with the cookie-bound user client (RLS applies). */

const IN_CHUNK = 100;
const WRITE_CHUNK = 500;

/** `attributes.city` → `attributes->>city` */
function col(c: string): string {
  if (!c.includes(".")) return c;
  const [head, ...rest] = c.split(".");
  return rest.length === 1 ? `${head}->>${rest[0]}` : `${head}->${rest.slice(0, -1).join("->")}->>${rest[rest.length - 1]}`;
}

/** Quote a value for use inside a PostgREST filter string (`or=(…)` / `in.(…)`). */
function lit(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  const s = String(v);
  return /[,()":.\\\s*%]/.test(s) || s === "" ? `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : s;
}
function arr(vs: string[]): string {
  return `{${vs.map((v) => (/[,{}"\\\s]/.test(v) || v === "" ? `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : v)).join(",")}}`;
}

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, (m) => "\\" + m);
}

/** One condition as a PostgREST string (used inside or/and groups). */
function condStrings(column: string, cond: Cond): string[] {
  const c = col(column);
  if (cond === null) return [`${c}.is.null`];
  if (typeof cond !== "object") return [`${c}.eq.${lit(cond)}`];
  const o = cond as CondOps;
  const out: string[] = [];
  if (o.eq !== undefined) out.push(o.eq === null ? `${c}.is.null` : `${c}.eq.${lit(o.eq)}`);
  if (o.neq !== undefined) out.push(o.neq === null ? `${c}.not.is.null` : `${c}.neq.${lit(o.neq)}`);
  if (o.gt !== undefined) out.push(`${c}.gt.${lit(o.gt)}`);
  if (o.gte !== undefined) out.push(`${c}.gte.${lit(o.gte)}`);
  if (o.lt !== undefined) out.push(`${c}.lt.${lit(o.lt)}`);
  if (o.lte !== undefined) out.push(`${c}.lte.${lit(o.lte)}`);
  if (o.in !== undefined) out.push(`${c}.in.(${o.in.map(lit).join(",")})`);
  if (o.notIn !== undefined) out.push(`${c}.not.in.(${o.notIn.map(lit).join(",")})`);
  if (o.like !== undefined) out.push(`${c}.ilike.*${escapeLike(o.like).replace(/\*/g, "")}*`);
  if (o.isNull !== undefined) out.push(o.isNull ? `${c}.is.null` : `${c}.not.is.null`);
  if (o.has !== undefined) out.push(`${c}.cs.${arr(o.has)}`);
  if (o.hasAny !== undefined) out.push(`${c}.ov.${arr(o.hasAny)}`);
  if (o.notHas !== undefined) out.push(`${c}.not.cs.${arr(o.notHas)}`);
  return out;
}

function whereGroup(w: Where): string {
  const parts = Object.entries(w).flatMap(([c, cond]) => (cond === undefined ? [] : condStrings(c, cond)));
  return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
}

function applyWhere<B extends { [k: string]: any }>(qb: B, where?: Where): B {
  if (!where) return qb;
  let b: any = qb;
  for (const [column, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    const c = col(column);
    if (cond === null) {
      b = b.is(c, null);
      continue;
    }
    if (typeof cond !== "object") {
      b = b.eq(c, cond);
      continue;
    }
    const o = cond as CondOps;
    if (o.eq !== undefined) b = o.eq === null ? b.is(c, null) : b.eq(c, o.eq);
    if (o.neq !== undefined) b = o.neq === null ? b.not(c, "is", null) : b.neq(c, o.neq);
    if (o.gt !== undefined) b = b.gt(c, o.gt);
    if (o.gte !== undefined) b = b.gte(c, o.gte);
    if (o.lt !== undefined) b = b.lt(c, o.lt);
    if (o.lte !== undefined) b = b.lte(c, o.lte);
    if (o.in !== undefined) b = b.in(c, o.in);
    if (o.notIn !== undefined) b = b.not(c, "in", `(${o.notIn.map(lit).join(",")})`);
    if (o.like !== undefined) b = b.ilike(c, `%${escapeLike(o.like)}%`);
    if (o.isNull !== undefined) b = o.isNull ? b.is(c, null) : b.not(c, "is", null);
    if (o.has !== undefined) b = b.contains(c, o.has);
    if (o.hasAny !== undefined) b = b.overlaps(c, o.hasAny);
    if (o.notHas !== undefined) b = b.not(c, "cs", arr(o.notHas));
  }
  return b;
}

function applyQuery(qb: any, q?: Query) {
  if (!q) return qb;
  let b = applyWhere(qb, q.where);
  for (const w of q.and ?? []) b = applyWhere(b, w);
  if (q.or?.length) b = b.or(q.or.map(whereGroup).join(","));
  if (q.orAlso?.length) b = b.or(q.orAlso.map(whereGroup).join(","));
  if (q.search?.term) {
    const t = escapeLike(q.search.term.replace(/[,()*"]/g, " ").trim());
    if (t) b = b.or(q.search.cols.map((c) => `${col(c)}.ilike.*${t}*`).join(","));
  }
  return b;
}

function applyOrder(qb: any, q?: Query) {
  let b = qb;
  for (const [c, dir] of q?.order ?? []) b = b.order(col(c), { ascending: dir === "asc", nullsFirst: false });
  return b;
}

/** Split an oversized `in` list into several requests so URLs stay small. */
function splitLargeIn(q: Query | undefined): Query[] {
  if (!q?.where) return [q ?? {}];
  for (const [c, cond] of Object.entries(q.where)) {
    if (cond && typeof cond === "object" && (cond as CondOps).in && (cond as CondOps).in!.length > IN_CHUNK) {
      return chunk((cond as CondOps).in!, IN_CHUNK).flatMap((part) =>
        splitLargeIn({ ...q, where: { ...q.where, [c]: { ...(cond as CondOps), in: part } } }),
      );
    }
  }
  return [q];
}

function fail(error: { message: string; code?: string } | null, what: string): never {
  throw new DbError(`${what}: ${error?.message ?? "unknown error"}`, error?.code);
}

export class SupabaseAdapter implements Adapter {
  constructor(private sb: SupabaseClient) {}

  async select<T>(table: TableName, q?: Query): Promise<T[]> {
    const parts = splitLargeIn(q);
    const out: T[] = [];
    for (const part of parts) {
      let qb: any = this.sb.from(table).select(part.columns ?? "*");
      qb = applyOrder(applyQuery(qb, part), part);
      if (part.limit !== undefined) {
        const from = part.offset ?? 0;
        qb = qb.range(from, from + part.limit - 1);
      } else if (part.offset) {
        qb = qb.range(part.offset, part.offset + 999);
      }
      const { data, error } = await qb;
      if (error) fail(error, `select ${table}`);
      out.push(...((data ?? []) as T[]));
    }
    return out;
  }

  async selectPage<T>(table: TableName, q: Query) {
    let qb: any = this.sb.from(table).select("*", { count: "exact" });
    qb = applyOrder(applyQuery(qb, q), q);
    const from = q.offset ?? 0;
    qb = qb.range(from, from + (q.limit ?? 50) - 1);
    const { data, count, error } = await qb;
    if (error) fail(error, `select ${table}`);
    return { rows: (data ?? []) as T[], total: count ?? 0 };
  }

  async count(table: TableName, q?: Query) {
    const parts = splitLargeIn(q);
    let total = 0;
    for (const part of parts) {
      const qb: any = applyQuery(this.sb.from(table).select("*", { count: "exact", head: true }), part);
      const { count, error } = await qb;
      if (error) fail(error, `count ${table}`);
      total += count ?? 0;
    }
    return total;
  }

  async insert<T>(table: TableName, rows: any[]): Promise<T[]> {
    const out: T[] = [];
    for (const part of chunk(rows, WRITE_CHUNK)) {
      const { data, error } = await this.sb.from(table).insert(part).select();
      if (error) fail(error, `insert ${table}`);
      out.push(...((data ?? []) as T[]));
    }
    return out;
  }

  async upsert<T>(table: TableName, rows: any[], onConflict: string[], ignoreDuplicates = false): Promise<T[]> {
    const out: T[] = [];
    for (const part of chunk(rows, WRITE_CHUNK)) {
      const { data, error } = await this.sb
        .from(table)
        .upsert(part, { onConflict: onConflict.join(","), ignoreDuplicates })
        .select();
      if (error) fail(error, `upsert ${table}`);
      out.push(...((data ?? []) as T[]));
    }
    return out;
  }

  async update<T>(table: TableName, q: Query, patch: Record<string, any>): Promise<T[]> {
    const out: T[] = [];
    for (const part of splitLargeIn(q)) {
      const qb: any = applyQuery(this.sb.from(table).update(patch), part);
      const { data, error } = await qb.select();
      if (error) fail(error, `update ${table}`);
      out.push(...((data ?? []) as T[]));
    }
    return out;
  }

  async delete(table: TableName, q: Query) {
    let total = 0;
    for (const part of splitLargeIn(q)) {
      const qb: any = applyQuery(this.sb.from(table).delete({ count: "exact" }), part);
      const { count, error } = await qb;
      if (error) fail(error, `delete ${table}`);
      total += count ?? 0;
    }
    return total;
  }

  async claimQueued<T>(workspaceId: string, campaignId: string, limit: number, staleSeconds: number): Promise<T[]> {
    const { data, error } = await this.sb.rpc("claim_campaign_messages", {
      p_workspace: workspaceId,
      p_campaign: campaignId,
      p_limit: limit,
      p_stale_seconds: staleSeconds,
    });
    if (error) fail(error, "claim_campaign_messages");
    return (data ?? []) as T[];
  }
}
