import fs from "node:fs";
import path from "node:path";
import type { Adapter, Cond, CondOps, Query, TableName, Where } from "./types";

/* File-backed store used when Supabase isn't configured (local demo mode).
   One JSON document, loaded once into memory, flushed on a short debounce. */

const FILE = path.join(process.cwd(), ".data", "db.json");
const TIMESTAMPED = new Set<TableName>(["contacts", "templates", "campaigns"]);

type Tables = Record<string, any[]>;

interface Store {
  tables: Tables;
  timer: NodeJS.Timeout | null;
  seeded: boolean;
}

const g = globalThis as unknown as { __wadeskStore?: Store };

function emptyTables(): Tables {
  const names: TableName[] = [
    "workspaces", "workspace_members", "workspace_invites", "wa_accounts", "wa_secrets", "contacts", "tags", "segments", "templates",
    "campaigns", "campaign_messages", "conversations", "messages", "quick_replies", "automation_rules", "sim_events",
  ];
  return Object.fromEntries(names.map((n) => [n, []]));
}

export function localStore(): Store {
  if (g.__wadeskStore) return g.__wadeskStore;
  const store: Store = { tables: emptyTables(), timer: null, seeded: false };
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
      store.tables = { ...emptyTables(), ...raw.tables };
      store.seeded = true;
    }
  } catch (e) {
    console.error("[wadesk] could not read .data/db.json, starting empty:", e);
  }
  g.__wadeskStore = store;
  return store;
}

export function flushLocal(store = localStore()) {
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify({ tables: store.tables }));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error("[wadesk] could not persist local store:", e);
  }
}

function scheduleFlush(store: Store) {
  if (store.timer) return;
  store.timer = setTimeout(() => {
    store.timer = null;
    flushLocal(store);
  }, 200);
}

export function resetLocalStore() {
  const store = localStore();
  store.tables = emptyTables();
  store.seeded = false;
  try {
    if (fs.existsSync(FILE)) fs.unlinkSync(FILE);
  } catch {}
}

/* ───────── matching ───────── */

function getVal(row: any, col: string): any {
  if (!col.includes(".")) return row[col];
  const [head, ...rest] = col.split(".");
  let v = row[head];
  for (const k of rest) v = v?.[k];
  return v;
}

function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a) < String(b) ? -1 : 1;
}

function matchCond(v: any, cond: Cond): boolean {
  if (cond === null || typeof cond !== "object") {
    if (cond === null) return v === null || v === undefined;
    return v === cond;
  }
  const c = cond as CondOps;
  const isNil = v === null || v === undefined;
  if (c.eq !== undefined && !(c.eq === null ? isNil : v === c.eq)) return false;
  // SQL semantics: NULL <> x is not true
  if (c.neq !== undefined && (c.neq === null ? !isNil : isNil || v === c.neq)) return false;
  if (c.gt !== undefined && (isNil || !(cmp(v, c.gt) > 0))) return false;
  if (c.gte !== undefined && (isNil || !(cmp(v, c.gte) >= 0))) return false;
  if (c.lt !== undefined && (isNil || !(cmp(v, c.lt) < 0))) return false;
  if (c.lte !== undefined && (isNil || !(cmp(v, c.lte) <= 0))) return false;
  if (c.in !== undefined && !c.in.includes(v)) return false;
  if (c.notIn !== undefined && (isNil || c.notIn.includes(v))) return false;
  if (c.like !== undefined && !String(v ?? "").toLowerCase().includes(c.like.toLowerCase())) return false;
  if (c.isNull !== undefined && c.isNull !== isNil) return false;
  if (c.has !== undefined && !(Array.isArray(v) && c.has.every((x) => v.includes(x)))) return false;
  if (c.hasAny !== undefined && !(Array.isArray(v) && c.hasAny.some((x) => v.includes(x)))) return false;
  if (c.notHas !== undefined && Array.isArray(v) && c.notHas.every((x) => v.includes(x))) return false;
  return true;
}

function matchWhere(row: any, where?: Where): boolean {
  if (!where) return true;
  for (const [col, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (!matchCond(getVal(row, col), cond)) return false;
  }
  return true;
}

function matches(row: any, q?: Query): boolean {
  if (!q) return true;
  if (!matchWhere(row, q.where)) return false;
  if (q.and?.length && !q.and.every((w) => matchWhere(row, w))) return false;
  if (q.or?.length && !q.or.some((w) => matchWhere(row, w))) return false;
  if (q.orAlso?.length && !q.orAlso.some((w) => matchWhere(row, w))) return false;
  if (q.search?.term) {
    const t = q.search.term.toLowerCase();
    if (!q.search.cols.some((c) => String(getVal(row, c) ?? "").toLowerCase().includes(t))) return false;
  }
  return true;
}

function sortRows(rows: any[], order?: Query["order"]) {
  if (!order?.length) return rows;
  return rows.sort((a, b) => {
    for (const [col, dir] of order) {
      const av = getVal(a, col);
      const bv = getVal(b, col);
      const an = av === null || av === undefined;
      const bn = bv === null || bv === undefined;
      if (an && bn) continue;
      if (an) return 1; // nulls always last, matching the Postgres adapter
      if (bn) return -1;
      const d = cmp(av, bv);
      if (d !== 0) return dir === "asc" ? d : -d;
    }
    return 0;
  });
}

const clone = <T>(x: T): T => structuredClone(x);

export class LocalAdapter implements Adapter {
  private store = localStore();

  private t(table: TableName): any[] {
    return (this.store.tables[table] ??= []);
  }

  async select<T>(table: TableName, q?: Query): Promise<T[]> {
    let rows = this.t(table).filter((r) => matches(r, q));
    rows = sortRows(rows, q?.order);
    if (q?.offset) rows = rows.slice(q.offset);
    if (q?.limit !== undefined) rows = rows.slice(0, q.limit);
    if (q?.columns && q.columns !== "*") {
      const cols = q.columns.split(",").map((c) => c.trim());
      return rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) as T[];
    }
    return rows.map(clone) as T[];
  }

  async selectPage<T>(table: TableName, q: Query) {
    const all = sortRows(this.t(table).filter((r) => matches(r, q)), q.order);
    const start = q.offset ?? 0;
    const rows = all.slice(start, start + (q.limit ?? 50));
    return { rows: rows.map(clone) as T[], total: all.length };
  }

  async count(table: TableName, q?: Query) {
    return this.t(table).filter((r) => matches(r, q)).length;
  }

  async insert<T>(table: TableName, rows: any[]): Promise<T[]> {
    const now = new Date().toISOString();
    const out = rows.map((r) => {
      const row = clone(r);
      row.id ??= crypto.randomUUID();
      row.created_at ??= now;
      if (TIMESTAMPED.has(table)) row.updated_at ??= now;
      return row;
    });
    this.t(table).push(...out);
    scheduleFlush(this.store);
    return out.map(clone) as T[];
  }

  async upsert<T>(table: TableName, rows: any[], onConflict: string[], ignoreDuplicates = false): Promise<T[]> {
    const arr = this.t(table);
    const now = new Date().toISOString();
    const out: any[] = [];
    // index for speed on large imports
    const keyOf = (r: any) => onConflict.map((c) => String(r[c] ?? "")).join("\u0000");
    const index = new Map<string, any>();
    for (const r of arr) index.set(keyOf(r), r);
    for (const input of rows) {
      const k = keyOf(input);
      const existing = index.get(k);
      if (existing) {
        if (ignoreDuplicates) continue;
        const { id: _ignore, created_at: _c, ...patch } = clone(input);
        Object.assign(existing, patch);
        if (TIMESTAMPED.has(table)) existing.updated_at = now;
        out.push(existing);
      } else {
        const row = clone(input);
        row.id ??= crypto.randomUUID();
        row.created_at ??= now;
        if (TIMESTAMPED.has(table)) row.updated_at ??= now;
        arr.push(row);
        index.set(k, row);
        out.push(row);
      }
    }
    scheduleFlush(this.store);
    return out.map(clone) as T[];
  }

  async update<T>(table: TableName, q: Query, patch: Record<string, any>): Promise<T[]> {
    const now = new Date().toISOString();
    const hit = this.t(table).filter((r) => matches(r, q));
    for (const r of hit) {
      Object.assign(r, clone(patch));
      if (TIMESTAMPED.has(table) && !("updated_at" in patch)) r.updated_at = now;
    }
    if (hit.length) scheduleFlush(this.store);
    return hit.map(clone) as T[];
  }

  async delete(table: TableName, q: Query) {
    const arr = this.t(table);
    const keep = arr.filter((r) => !matches(r, q));
    const removed = arr.length - keep.length;
    if (removed) {
      this.store.tables[table] = keep;
      scheduleFlush(this.store);
    }
    return removed;
  }

  async claimQueued<T>(workspaceId: string, campaignId: string, limit: number, staleSeconds: number): Promise<T[]> {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const picked: any[] = [];
    for (const r of this.t("campaign_messages")) {
      if (picked.length >= limit) break;
      if (r.workspace_id !== workspaceId || r.campaign_id !== campaignId) continue;
      const stale = r.status === "sending" && r.claimed_at && now - Date.parse(r.claimed_at) > staleSeconds * 1000;
      if (r.status === "queued" || stale) {
        r.status = "sending";
        r.claimed_at = nowIso;
        picked.push(r);
      }
    }
    if (picked.length) scheduleFlush(this.store);
    return picked.map(clone) as T[];
  }
}
