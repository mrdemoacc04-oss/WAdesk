import { dbFor } from "../context";
import type { Db } from "../db/scoped";
import { defaultSettings } from "@/lib/shared/constants";
import type { Member, Workspace, WorkspaceSettings, WaAccount } from "@/lib/shared/types";
import type { Secrets } from "../wa";

export function mergeSettings(raw: Partial<WorkspaceSettings> | null | undefined): WorkspaceSettings {
  const d = defaultSettings();
  return {
    ...d,
    ...raw,
    business_hours: { ...d.business_hours, ...raw?.business_hours, days: { ...d.business_hours.days, ...raw?.business_hours?.days } },
    rates: { ...d.rates, ...raw?.rates },
    compliance: { ...d.compliance, ...raw?.compliance },
  };
}

export async function getWorkspace(db: Db): Promise<Workspace> {
  const w = (await db.workspace<Workspace>())!;
  return { ...w, settings: mergeSettings(w.settings) };
}

export async function updateWorkspace(db: Db, patch: { name?: string; settings?: Partial<WorkspaceSettings> }) {
  const cur = await getWorkspace(db);
  const next: Record<string, any> = {};
  if (patch.name) next.name = patch.name.trim();
  if (patch.settings) next.settings = mergeSettings({ ...cur.settings, ...patch.settings });
  await db.updateWorkspace(next);
  return getWorkspace(db);
}

/** Account row for the UI — secrets never leave the server, only whether they exist. */
export async function getAccount(db: Db): Promise<WaAccount | null> {
  const acct = await db.one<WaAccount>("wa_accounts", {});
  if (!acct) return null;
  const sec = await dbFor(db.ws).one<Secrets>("wa_secrets", {});
  return { ...acct, has_token: !!sec?.access_token_enc, has_app_secret: !!sec?.app_secret_enc };
}

export function listMembers(db: Db) {
  return db.select<Member>("workspace_members", { order: [["created_at", "asc"]], limit: 100 });
}
