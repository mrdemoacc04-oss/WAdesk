/* Minimal query vocabulary shared by every storage backend. */

export type Scalar = string | number | boolean | null;

export interface CondOps {
  eq?: Scalar;
  neq?: Scalar;
  gt?: Scalar;
  gte?: Scalar;
  lt?: Scalar;
  lte?: Scalar;
  in?: Scalar[];
  notIn?: Scalar[];
  /** case-insensitive substring */
  like?: string;
  isNull?: boolean;
  /** array column contains ALL of these */
  has?: string[];
  /** array column overlaps ANY of these */
  hasAny?: string[];
  /** array column does NOT contain all of these */
  notHas?: string[];
}

export type Cond = Scalar | CondOps;
/** Column → condition. `attributes.city` addresses a jsonb key. */
export type Where = Record<string, Cond>;

export interface Query {
  where?: Where;
  /** Every Where here must match (AND). Lets one column carry several conditions. */
  and?: Where[];
  /** OR-group: the row must match at least one of these. */
  or?: Where[];
  /** A second, independent OR-group (ANDed with `or`). */
  orAlso?: Where[];
  search?: { cols: string[]; term: string };
  order?: [string, "asc" | "desc"][];
  limit?: number;
  offset?: number;
  /** Column projection (comma separated) — for wide scans like analytics. */
  columns?: string;
}

export type TableName =
  | "workspaces"
  | "workspace_members"
  | "workspace_invites"
  | "wa_accounts"
  | "wa_secrets"
  | "contacts"
  | "tags"
  | "segments"
  | "templates"
  | "campaigns"
  | "campaign_messages"
  | "conversations"
  | "messages"
  | "quick_replies"
  | "automation_rules"
  | "sim_events";

export interface Adapter {
  select<T>(table: TableName, q?: Query): Promise<T[]>;
  selectPage<T>(table: TableName, q: Query): Promise<{ rows: T[]; total: number }>;
  count(table: TableName, q?: Query): Promise<number>;
  insert<T>(table: TableName, rows: any[]): Promise<T[]>;
  upsert<T>(table: TableName, rows: any[], onConflict: string[], ignoreDuplicates?: boolean): Promise<T[]>;
  update<T>(table: TableName, q: Query, patch: Record<string, any>): Promise<T[]>;
  delete(table: TableName, q: Query): Promise<number>;
  /** Atomically move queued (and stale in-flight) campaign messages to "sending" and return them. */
  claimQueued<T>(workspaceId: string, campaignId: string, limit: number, staleSeconds: number): Promise<T[]>;
}

export class DbError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DbError";
  }
}
