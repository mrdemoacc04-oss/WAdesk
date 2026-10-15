import type { Adapter, Query, TableName, Where } from "./types";

export type Extra = Pick<Query, "and" | "or" | "orAlso" | "search">;

/**
 * A workspace-scoped view over an Adapter. Every read is filtered and every write is
 * stamped with the workspace id, so a handler can't reach across tenants by accident —
 * Postgres RLS (Supabase) enforces the same boundary one layer further down.
 */
export class Db {
  constructor(
    readonly adapter: Adapter,
    readonly ws: string,
  ) {}

  private scope(q?: Query): Query {
    return { ...q, where: { ...(q?.where ?? {}), workspace_id: this.ws } };
  }

  select<T>(table: TableName, q?: Query) {
    return this.adapter.select<T>(table, this.scope(q));
  }
  selectPage<T>(table: TableName, q: Query) {
    return this.adapter.selectPage<T>(table, this.scope(q));
  }
  count(table: TableName, where?: Where, extra?: Extra) {
    return this.adapter.count(table, this.scope({ ...extra, where }));
  }
  async one<T>(table: TableName, where: Where): Promise<T | null> {
    const rows = await this.adapter.select<T>(table, this.scope({ where, limit: 1 }));
    return rows[0] ?? null;
  }
  get<T>(table: TableName, id: string) {
    return this.one<T>(table, { id });
  }
  insert<T>(table: TableName, rows: any | any[]) {
    const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r, workspace_id: this.ws }));
    return this.adapter.insert<T>(table, list);
  }
  async insertOne<T>(table: TableName, row: any): Promise<T> {
    const [r] = await this.insert<T>(table, row);
    return r;
  }
  upsert<T>(table: TableName, rows: any | any[], onConflict: string[], ignoreDuplicates = false) {
    const list = (Array.isArray(rows) ? rows : [rows]).map((r) => ({ ...r, workspace_id: this.ws }));
    return this.adapter.upsert<T>(table, list, onConflict, ignoreDuplicates);
  }
  update<T>(table: TableName, where: Where, patch: Record<string, any>, extra?: Extra) {
    return this.adapter.update<T>(table, this.scope({ ...extra, where }), patch);
  }
  async updateOne<T>(table: TableName, id: string, patch: Record<string, any>): Promise<T | null> {
    const rows = await this.update<T>(table, { id }, patch);
    return rows[0] ?? null;
  }
  delete(table: TableName, where: Where, extra?: Extra) {
    return this.adapter.delete(table, this.scope({ ...extra, where }));
  }
  claimQueued<T>(campaignId: string, limit: number, staleSeconds = 120) {
    return this.adapter.claimQueued<T>(this.ws, campaignId, limit, staleSeconds);
  }

  /* workspaces table is keyed by id, not workspace_id */
  async workspace<T>(): Promise<T | null> {
    const rows = await this.adapter.select<T>("workspaces", { where: { id: this.ws }, limit: 1 });
    return rows[0] ?? null;
  }
  async updateWorkspace<T>(patch: Record<string, any>): Promise<T | null> {
    const rows = await this.adapter.update<T>("workspaces", { where: { id: this.ws } }, patch);
    return rows[0] ?? null;
  }
}
