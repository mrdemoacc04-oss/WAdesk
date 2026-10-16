import { before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/**
 * Runs the real migrations on an in-process Postgres with a small Supabase shim (the three API roles, auth.uid(),
 * Supabase's default grants) and then tries to break every boundary the way a hostile signed-in user would —
 * by talking to the tables directly, which is exactly what the browser's Supabase key allows.
 */

const MIGRATIONS = path.join(process.cwd(), "supabase", "migrations");
const migration = (file: string) => fs.readFileSync(path.join(MIGRATIONS, file), "utf8");

const SHIM = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;  -- the role Supabase Auth inserts new users as (not a superuser)

  create schema extensions;
  create schema auth;
  create schema storage;
  grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role;

  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    encrypted_password text,
    email_confirmed_at timestamptz,
    invited_at timestamptz,
    raw_user_meta_data jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);

  grant usage on schema auth, public to supabase_auth_admin;  -- in Supabase this role owns the auth schema
  grant insert, select on auth.users to supabase_auth_admin;

  -- what Supabase does for every object created in "public": the API roles get everything, RLS is the gate
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

  create extension pg_trgm with schema extensions;
`;

let db: PGlite;
type Row = Record<string, any>;
const q = async (sql: string, params: unknown[] = []) => (await db.query<Row>(sql, params)).rows;

/** Run `fn` as a signed-in user (RLS applies), like a request carrying that user's JWT. */
async function asUser<T>(uid: string, fn: () => Promise<T>): Promise<T> {
  await db.exec("set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}
async function asRole<T>(role: "anon" | "service_role" | "supabase_auth_admin", fn: () => Promise<T>): Promise<T> {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

const denied = /permission denied|row-level security|violates/i;
const U = {
  ownerA: "a0000000-0000-4000-8000-000000000001",
  adminA: "a0000000-0000-4000-8000-000000000002",
  agentA: "a0000000-0000-4000-8000-000000000003",
  ownerB: "b0000000-0000-4000-8000-000000000001",
};
let wsA = "";
let wsB = "";
let contactB = "";
let sendingA = "";
let approvedTplA = "";
let approvedTplB = "";

async function signup(id: string, email: string, opts: { password?: boolean; confirmed?: boolean; meta?: object } = {}) {
  await q(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3, $4, $5)`,
    [id, email, opts.password ? "$2a$10$hash" : "", opts.confirmed ? new Date().toISOString() : null, JSON.stringify(opts.meta ?? {})],
  );
}
const membership = async (id: string) => (await q("select m.role, m.workspace_id, w.name as ws_name, m.name from public.workspace_members m join public.workspaces w on w.id = m.workspace_id where m.user_id = $1", [id]))[0];

before(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SHIM);
  await db.exec(migration("0001_init.sql"));
  await db.exec(migration("0002_production_hardening.sql"));

  // owners come from the signup trigger, exactly like production (confirmation ON: password set, not yet confirmed)
  await signup(U.ownerA, "owner@a.test", { password: true, meta: { workspace_name: "Acme" } });
  await signup(U.ownerB, "owner@b.test", { password: true, meta: { workspace_name: "Beta" } });
  wsA = (await membership(U.ownerA)).workspace_id;
  wsB = (await membership(U.ownerB)).workspace_id;

  // teammates join through server-written invites, like inviteUserByEmail (no password, unconfirmed)
  await q("insert into public.workspace_invites (workspace_id, email, role, name) values ($1,'admin@a.test','admin','Ada'), ($1,'agent@a.test','agent','Ago')", [wsA]);
  await signup(U.adminA, "admin@a.test");
  await signup(U.agentA, "agent@a.test");

  // seed as the server would
  await q("insert into public.contacts (workspace_id, phone, name) values ($1,'+911','A1'), ($1,'+912','A2')", [wsA]);
  contactB = (await q("insert into public.contacts (workspace_id, phone, name) values ($1,'+913','B1') returning id", [wsB]))[0].id;
  await q("insert into public.campaigns (workspace_id, name, status) values ($1,'Draft one','draft')", [wsA]);
  sendingA = (await q("insert into public.campaigns (workspace_id, name, status) values ($1,'Running','sending') returning id", [wsA]))[0].id;
  await q("insert into public.campaign_messages (workspace_id, campaign_id, phone, status) values ($1,$2,'+911','queued'), ($1,$2,'+912','queued'), ($1,$2,'+914','sent')", [wsA, sendingA]);
  await q(`insert into public.templates (workspace_id, name, category, status, content) values ($1,'draft_tpl','MARKETING','DRAFT','{}')`, [wsA]);
  approvedTplA = (await q(`insert into public.templates (workspace_id, name, category, status, content) values ($1,'live_tpl','MARKETING','APPROVED','{}') returning id`, [wsA]))[0].id;
  approvedTplB = (await q(`insert into public.templates (workspace_id, name, category, status, content) values ($1,'b_tpl','MARKETING','APPROVED','{}') returning id`, [wsB]))[0].id;
});

/* ───────── signup trigger ───────── */

test("signup creates a workspace with the user as owner, named from the metadata", async () => {
  const m = await membership(U.ownerA);
  assert.equal(m.role, "owner");
  assert.equal(m.ws_name, "Acme");
  assert.equal(m.name, "owner");
});

test("a very long workspace name is cut to 80 characters", async () => {
  const id = "c0000000-0000-4000-8000-000000000001";
  await signup(id, "long@c.test", { password: true, meta: { workspace_name: "x".repeat(300) } });
  assert.equal((await membership(id)).ws_name.length, 80);
});

test("a server-written invite joins the invitee to that workspace with the invited role", async () => {
  const a = await membership(U.adminA);
  assert.equal(a.workspace_id, wsA);
  assert.equal(a.role, "admin");
  assert.equal(a.name, "Ada");
  assert.equal((await membership(U.agentA)).role, "agent");
  assert.equal((await q("select count(*)::int as n from public.workspace_invites where workspace_id = $1", [wsA]))[0].n, 0, "used invites are consumed");
});

test("a password signup on a project with email confirmation OFF cannot claim someone else's pending invite", async () => {
  await q("insert into public.workspace_invites (workspace_id, email, role) values ($1,'victim@a.test','admin')", [wsA]);
  const attacker = "c0000000-0000-4000-8000-000000000002";
  // auto-confirm: the password signup arrives already marked confirmed, though nobody proved they own the address
  await signup(attacker, "victim@a.test", { password: true, confirmed: true });
  const m = await membership(attacker);
  assert.notEqual(m.workspace_id, wsA, "must not land in the inviting workspace");
  assert.equal(m.role, "owner", "gets a workspace of their own instead");
  assert.equal((await q("select count(*)::int as n from public.workspace_invites where email = 'victim@a.test'"))[0].n, 1, "the invite is still waiting for the real person");
});

test("a password signup with email confirmation ON still honours an invite (no session until the email is confirmed)", async () => {
  await q("insert into public.workspace_invites (workspace_id, email, role) values ($1,'late@a.test','agent')", [wsA]);
  const id = "c0000000-0000-4000-8000-000000000003";
  await signup(id, "late@a.test", { password: true, confirmed: false });
  assert.equal((await membership(id)).workspace_id, wsA);
});

test("an invite older than 14 days is ignored", async () => {
  await q("insert into public.workspace_invites (workspace_id, email, role, created_at) values ($1,'old@a.test','admin', now() - interval '15 days')", [wsA]);
  const id = "c0000000-0000-4000-8000-000000000004";
  await signup(id, "old@a.test");
  assert.notEqual((await membership(id)).workspace_id, wsA);
});

test("signup still works when Supabase Auth itself (a non-superuser, with no EXECUTE on the trigger function) inserts the user", async () => {
  const id = "c0000000-0000-4000-8000-000000000005";
  await asRole("supabase_auth_admin", () =>
    q("insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values ($1, 'real@gotrue.test', '$2a$10$hash', $2)", [id, JSON.stringify({ workspace_name: "Via GoTrue" })]),
  );
  const m = await membership(id);
  assert.equal(m.role, "owner");
  assert.equal(m.ws_name, "Via GoTrue");
  assert.equal((await q("select has_function_privilege('supabase_auth_admin', 'public.handle_new_user()', 'execute') as can"))[0].can, false, "and it really has no EXECUTE grant");
});

/* ───────── anonymous access ───────── */

test("the anon key can't read or write any table", async () => {
  for (const t of ["workspaces", "workspace_members", "contacts", "campaigns", "messages", "wa_accounts", "wa_secrets", "workspace_invites", "templates"]) {
    await asRole("anon", async () => {
      await assert.rejects(() => q(`select * from public.${t} limit 1`), denied, `anon select ${t}`);
      await assert.rejects(() => q(`delete from public.${t}`), denied, `anon delete ${t}`);
    });
  }
});

test("the anon key can't call the policy helpers or the sender's claim function", async () => {
  await asRole("anon", async () => {
    await assert.rejects(() => q("select public.my_workspace_ids()"), /permission denied/i);
    await assert.rejects(() => q("select public.is_workspace_admin($1)", [wsA]), /permission denied/i);
    await assert.rejects(() => q("select * from public.claim_campaign_messages($1,$2,10)", [wsA, sendingA]), /permission denied/i);
  });
});

test("signed-in users can't call trigger functions or the claim function directly", async () => {
  await asUser(U.adminA, async () => {
    await assert.rejects(() => q("select public.handle_new_user()"), /permission denied/i);
    await assert.rejects(() => q("select public.set_updated_at()"), /permission denied/i);
    await assert.rejects(() => q("select * from public.claim_campaign_messages($1,$2,10)", [wsA, sendingA]), /permission denied/i);
  });
});

/* ───────── tenant isolation ───────── */

test("a member sees only their own workspace's rows", async () => {
  await asUser(U.agentA, async () => {
    const contacts = await q("select workspace_id from public.contacts");
    assert.ok(contacts.length >= 2);
    assert.ok(contacts.every((c) => c.workspace_id === wsA), "no rows from workspace B");
    assert.equal((await q("select id from public.workspaces")).length, 1);
    assert.equal((await q("select id from public.templates where id = $1", [approvedTplB])).length, 0);
  });
});

test("a member can't write into, change or delete another workspace's data", async () => {
  await asUser(U.adminA, async () => {
    await assert.rejects(() => q("insert into public.contacts (workspace_id, phone) values ($1,'+9199')", [wsB]), denied);
    assert.equal((await q("update public.contacts set name = 'pwned' where id = $1 returning id", [contactB])).length, 0);
    assert.equal((await q("delete from public.contacts where id = $1 returning id", [contactB])).length, 0);
    assert.equal((await q("update public.workspaces set name = 'pwned' where id = $1 returning id", [wsB])).length, 0);
    assert.equal((await q("update public.templates set status = 'DISABLED' where id = $1 returning id", [approvedTplB])).length, 0);
  });
  assert.equal((await q("select name from public.contacts where id = $1", [contactB]))[0].name, "B1");
});

test("a member can't move their own rows into another workspace", async () => {
  await asUser(U.agentA, async () => {
    await assert.rejects(() => q("update public.contacts set workspace_id = $1 where phone = '+911'", [wsB]), denied);
  });
});

/* ───────── agents vs admins ───────── */

test("agents can work with contacts, drafts and the inbox", async () => {
  await asUser(U.agentA, async () => {
    assert.equal((await q("insert into public.contacts (workspace_id, phone, name) values ($1,'+9111','new') returning id", [wsA])).length, 1);
    assert.equal((await q("update public.contacts set name = 'renamed' where phone = '+9111' returning id")).length, 1);
    assert.equal((await q("delete from public.contacts where phone = '+9111' returning id")).length, 1);
    assert.equal((await q("insert into public.campaigns (workspace_id, name, status) values ($1,'agent draft','draft') returning id", [wsA])).length, 1);
    assert.equal((await q("update public.campaigns set name = 'edited' where name = 'agent draft' returning id")).length, 1);
    assert.equal((await q("insert into public.templates (workspace_id, name, category, status, content) values ($1,'agent_tpl','UTILITY','DRAFT','{}') returning id", [wsA])).length, 1);
  });
});

test("an agent can't launch or schedule a campaign by writing to the database directly", async () => {
  await asUser(U.agentA, async () => {
    const mine = (await q("insert into public.campaigns (workspace_id, name, status) values ($1,'launch attempt','draft') returning id", [wsA]))[0].id;
    await assert.rejects(() => q("insert into public.campaigns (workspace_id, name, status) values ($1,'sneaky','sending')", [wsA]), denied);
    await assert.rejects(() => q("update public.campaigns set status = 'scheduled', scheduled_at = now() where id = $1", [mine]), denied);
    await assert.rejects(() => q("update public.campaigns set status = 'sending' where id = $1", [mine]), denied);
    assert.equal((await q("select status from public.campaigns where id = $1", [mine]))[0].status, "draft", "still a draft");
  });
});

test("an agent can't touch a running campaign, delete a campaign, or edit its recipient list", async () => {
  await asUser(U.agentA, async () => {
    assert.equal((await q("update public.campaigns set status = 'draft' where id = $1 returning id", [sendingA])).length, 0, "can't pull a running campaign back to draft");
    assert.equal((await q("update public.campaigns set name = 'x' where id = $1 returning id", [sendingA])).length, 0);
    assert.equal((await q("delete from public.campaigns where id = $1 returning id", [sendingA])).length, 0);
    assert.ok((await q("select id from public.campaign_messages where campaign_id = $1", [sendingA])).length >= 3, "can read recipients");
    await assert.rejects(() => q("insert into public.campaign_messages (workspace_id, campaign_id, phone) values ($1,$2,'+9000')", [wsA, sendingA]), denied);
    assert.equal((await q("update public.campaign_messages set status = 'queued' where campaign_id = $1 returning id", [sendingA])).length, 0);
    assert.equal((await q("delete from public.campaign_messages where campaign_id = $1 returning id", [sendingA])).length, 0);
  });
});

test("an agent can't approve, submit or delete a template", async () => {
  await asUser(U.agentA, async () => {
    await assert.rejects(() => q("insert into public.templates (workspace_id, name, category, status, content) values ($1,'fake','UTILITY','APPROVED','{}')", [wsA]), denied);
    await assert.rejects(() => q("update public.templates set status = 'APPROVED' where name = 'agent_tpl'"), denied);
    assert.equal((await q("update public.templates set name = 'x' where id = $1 returning id", [approvedTplA])).length, 0, "approved templates are locked");
    assert.equal((await q("delete from public.templates where id = $1 returning id", [approvedTplA])).length, 0);
    assert.equal((await q("delete from public.templates where name = 'agent_tpl' returning id")).length, 0, "only admins delete");
  });
});

test("an admin can launch, manage recipients, approve and delete", async () => {
  await asUser(U.adminA, async () => {
    const c = (await q("insert into public.campaigns (workspace_id, name, status) values ($1,'admin camp','draft') returning id", [wsA]))[0].id;
    assert.equal((await q("update public.campaigns set status = 'sending' where id = $1 returning id", [c])).length, 1);
    assert.equal((await q("insert into public.campaign_messages (workspace_id, campaign_id, phone) values ($1,$2,'+9777') returning id", [wsA, c])).length, 1);
    assert.equal((await q("update public.campaign_messages set status = 'skipped' where campaign_id = $1 returning id", [c])).length, 1);
    assert.equal((await q("delete from public.campaign_messages where campaign_id = $1 returning id", [c])).length, 1);
    assert.equal((await q("delete from public.campaigns where id = $1 returning id", [c])).length, 1);

    const t = (await q("insert into public.templates (workspace_id, name, category, status, content) values ($1,'admin_tpl','UTILITY','DRAFT','{}') returning id", [wsA]))[0].id;
    assert.equal((await q("update public.templates set status = 'PENDING' where id = $1 returning id", [t])).length, 1);
    assert.equal((await q("delete from public.templates where id = $1 returning id", [t])).length, 1);
  });
});

/* ───────── team + workspace ───────── */

test("an admin can't create members, make anyone an owner, or touch the owner", async () => {
  await asUser(U.adminA, async () => {
    await assert.rejects(() => q("insert into public.workspace_members (workspace_id, user_id, role) values ($1,$2,'owner')", [wsA, U.ownerB]), /permission denied/i, "no client inserts");
    await assert.rejects(() => q("update public.workspace_members set role = 'owner' where user_id = $1", [U.adminA]), denied, "no self-promotion to owner");
    await assert.rejects(() => q("update public.workspace_members set role = 'owner' where user_id = $1", [U.agentA]), denied, "no promoting others to owner");
    assert.equal((await q("update public.workspace_members set role = 'agent' where user_id = $1 returning id", [U.ownerA])).length, 0, "can't demote the owner");
    assert.equal((await q("delete from public.workspace_members where user_id = $1 returning id", [U.ownerA])).length, 0, "can't remove the owner");
  });
  assert.equal((await membership(U.ownerA)).role, "owner");
});

test("nobody can change a member's identity columns (user, workspace, email)", async () => {
  await asUser(U.adminA, async () => {
    await assert.rejects(() => q("update public.workspace_members set email = 'x@y.z' where user_id = $1", [U.agentA]), /permission denied/i);
    await assert.rejects(() => q("update public.workspace_members set user_id = $1 where user_id = $2", [U.ownerB, U.agentA]), /permission denied/i);
    await assert.rejects(() => q("update public.workspace_members set workspace_id = $1 where user_id = $2", [wsB, U.agentA]), /permission denied/i);
  });
});

test("an admin can change an agent's role and remove them; an agent can't manage the team", async () => {
  await asUser(U.agentA, async () => {
    assert.equal((await q("update public.workspace_members set role = 'admin' where user_id = $1 returning id", [U.agentA])).length, 0, "no self-promotion");
    assert.equal((await q("delete from public.workspace_members where user_id = $1 returning id", [U.adminA])).length, 0);
  });
  const temp = "c0000000-0000-4000-8000-000000000009";
  await q("insert into public.workspace_invites (workspace_id, email, role) values ($1,'temp@a.test','agent')", [wsA]);
  await signup(temp, "temp@a.test");
  await asUser(U.adminA, async () => {
    assert.equal((await q("update public.workspace_members set role = 'admin' where user_id = $1 returning id", [temp])).length, 1);
    assert.equal((await q("delete from public.workspace_members where user_id = $1 returning id", [temp])).length, 1);
  });
});

test("workspace settings: admins may rename, agents may not, and nobody can delete or re-key a workspace", async () => {
  await asUser(U.adminA, async () => {
    assert.equal((await q("update public.workspaces set name = 'Acme Ltd', settings = '{\"currency\":\"INR\"}' where id = $1 returning id", [wsA])).length, 1);
    await assert.rejects(() => q("update public.workspaces set id = gen_random_uuid() where id = $1", [wsA]), /permission denied/i);
    await assert.rejects(() => q("delete from public.workspaces where id = $1", [wsA]), /permission denied/i);
    await assert.rejects(() => q("insert into public.workspaces (name) values ('rogue')"), /permission denied/i);
  });
  await asUser(U.agentA, async () => {
    assert.equal((await q("update public.workspaces set name = 'x' where id = $1 returning id", [wsA])).length, 0);
  });
});

/* ───────── secrets + server-only paths ───────── */

test("credentials and invites are unreachable from the client, in any role", async () => {
  await q("insert into public.wa_secrets (workspace_id, access_token_enc) values ($1,'v1:secret')", [wsA]);
  await asUser(U.ownerA, async () => {
    await assert.rejects(() => q("select * from public.wa_secrets"), /permission denied/i);
    await assert.rejects(() => q("select * from public.workspace_invites"), /permission denied/i);
    await assert.rejects(() => q("insert into public.wa_secrets (workspace_id, access_token_enc) values ($1,'x')", [wsB]), /permission denied/i);
  });
  assert.equal((await asRole("service_role", () => q("select access_token_enc from public.wa_secrets")))[0].access_token_enc, "v1:secret", "the server (service role) can");
});

test("connection details are readable by members but only writable by the server", async () => {
  await q("insert into public.wa_accounts (workspace_id, phone_number_id, waba_id, webhook_verify_token) values ($1,'111','222','tok-a')", [wsA]);
  await asUser(U.agentA, async () => {
    assert.equal((await q("select id from public.wa_accounts")).length, 1);
    await assert.rejects(() => q("update public.wa_accounts set status = 'error'"), /permission denied/i);
  });
});

test("the sender's claim function works for the server and hands out each recipient once", async () => {
  const first = await asRole("service_role", () => q("select * from public.claim_campaign_messages($1,$2,10)", [wsA, sendingA]));
  assert.equal(first.length, 2, "the two queued recipients");
  assert.ok(first.every((r) => r.status === "sending" && r.claimed_at));
  const again = await asRole("service_role", () => q("select * from public.claim_campaign_messages($1,$2,10)", [wsA, sendingA]));
  assert.equal(again.length, 0, "already claimed");
});

/* ───────── triggers, storage, re-runs ───────── */

test("updated_at still moves when a signed-in user edits a row (trigger needs no direct EXECUTE grant)", async () => {
  const before = (await q("select updated_at from public.contacts where phone = '+912'"))[0].updated_at;
  await new Promise((r) => setTimeout(r, 15));
  await asUser(U.agentA, async () => {
    await q("update public.contacts set name = 'touched' where phone = '+912'");
  });
  const after = (await q("select updated_at from public.contacts where phone = '+912'"))[0].updated_at;
  assert.ok(new Date(after) > new Date(before));
});

test("the media bucket only accepts what WhatsApp accepts", async () => {
  const b = (await q("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'media'"))[0];
  assert.equal(b.public, true);
  assert.equal(Number(b.file_size_limit), 104857600);
  for (const ok of ["image/jpeg", "image/png", "video/mp4", "audio/ogg", "application/pdf"]) assert.ok(b.allowed_mime_types.includes(ok), ok);
  for (const bad of ["text/html", "image/svg+xml", "application/javascript", "application/x-msdownload"]) assert.ok(!b.allowed_mime_types.includes(bad), `${bad} must be rejected`);
});

test("every table has RLS on, and every table other than the server-only ones has at least one policy", async () => {
  const rows = await q(`
    select c.relname, c.relrowsecurity as rls,
           (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'`);
  assert.ok(rows.length >= 15);
  for (const r of rows) {
    assert.equal(r.rls, true, `${r.relname} must have RLS enabled`);
    if (!["wa_secrets", "workspace_invites"].includes(r.relname)) assert.ok(r.policies >= 1, `${r.relname} needs a policy`);
    else assert.equal(r.policies, 0, `${r.relname} is service-role only`);
  }
});

test("the hardening migration is safe to run twice", async () => {
  await db.exec(migration("0002_production_hardening.sql"));
  const draft = (await q("insert into public.campaigns (workspace_id, name, status) values ($1,'rerun draft','draft') returning id", [wsA]))[0].id;
  await asUser(U.agentA, async () => {
    await assert.rejects(() => q("update public.campaigns set status = 'sending' where id = $1", [draft]), denied);
    assert.equal((await q("update public.campaigns set name = 'still editable' where id = $1 returning id", [draft])).length, 1, "drafts remain editable");
  });
});
