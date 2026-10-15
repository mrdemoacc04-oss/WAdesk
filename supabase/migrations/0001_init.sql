-- ════════════════════════════════════════════════════════════════════════════
--  WAdesk — initial schema
--  Run once in the Supabase SQL editor (or `supabase db push`).
--  Multi-tenant by workspace; Row Level Security on every table.
--  The Next.js server uses the service-role key for webhooks, sending and secrets;
--  everything a signed-in user does runs as that user, under RLS.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────── core tenancy ─────────────────────────

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('owner','admin','agent')),
  name          text not null default '',
  email         text not null default '',
  color         text not null default '#0e8a52',
  created_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- Invites are written by the server (service role) only, so a user can't talk their way into someone else's workspace
-- by putting a workspace id in their signup metadata.
create table public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('admin','agent')),
  name          text not null default '',
  color         text not null default '#2a62c9',
  created_at    timestamptz not null default now()
);
create index workspace_invites_email_idx on public.workspace_invites (lower(email));

-- helpers used by policies (security definer → no recursion through workspace_members' own policy)
create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;

create or replace function public.is_workspace_admin(ws uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = ws and user_id = auth.uid() and role in ('owner','admin')
  )
$$;

-- ───────────────────────── WhatsApp connection ─────────────────────────

create table public.wa_accounts (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null unique references public.workspaces(id) on delete cascade,
  phone_number_id       text not null,
  waba_id               text not null,
  app_id                text,
  display_phone_number  text,
  verified_name         text,
  quality_rating        text,
  messaging_limit_tier  text,
  status                text not null default 'connected' check (status in ('connected','error','disconnected')),
  status_message        text,
  webhook_verify_token  text not null,
  last_checked_at       timestamptz,
  created_at            timestamptz not null default now()
);
create index wa_accounts_phone_idx on public.wa_accounts (phone_number_id);
create index wa_accounts_waba_idx on public.wa_accounts (waba_id);
create unique index wa_accounts_verify_idx on public.wa_accounts (webhook_verify_token);

-- Encrypted credentials. RLS is on with NO policies: only the service role can touch this table.
create table public.wa_secrets (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null unique references public.workspaces(id) on delete cascade,
  access_token_enc   text,
  app_secret_enc     text,
  created_at         timestamptz not null default now()
);

-- ───────────────────────── contacts ─────────────────────────

create table public.contacts (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  phone             text not null,
  wa_id             text,
  name              text,
  email             text,
  country           text,
  tags              text[] not null default '{}',
  attributes        jsonb not null default '{}'::jsonb,
  opt_in            text not null default 'pending' check (opt_in in ('opted_in','opted_out','pending')),
  opt_in_source     text,
  opted_in_at       timestamptz,
  opted_out_at      timestamptz,
  source            text not null default 'manual' check (source in ('manual','import','inbound','api','link','demo')),
  notes             text,
  last_inbound_at   timestamptz,
  last_outbound_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (workspace_id, phone)
);
create index contacts_ws_created_idx on public.contacts (workspace_id, created_at desc);
create index contacts_ws_optin_idx on public.contacts (workspace_id, opt_in);
create index contacts_tags_idx on public.contacts using gin (tags);
create index contacts_name_trgm_idx on public.contacts using gin (name extensions.gin_trgm_ops);
create index contacts_phone_trgm_idx on public.contacts using gin (phone extensions.gin_trgm_ops);
create index contacts_email_trgm_idx on public.contacts using gin (email extensions.gin_trgm_ops);

create table public.tags (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name)
);

create table public.segments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  name          text not null,
  match         text not null default 'all' check (match in ('all','any')),
  rules         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── templates ─────────────────────────

create table public.templates (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  name               text not null,
  language           text not null default 'en',
  category           text not null check (category in ('MARKETING','UTILITY','AUTHENTICATION')),
  status             text not null default 'DRAFT' check (status in ('DRAFT','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  kind               text not null default 'standard' check (kind in ('standard','carousel')),
  content            jsonb not null,
  rejection_reason   text,
  meta_template_id   text,
  quality            text,
  submitted_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, name, language)
);
create index templates_ws_status_idx on public.templates (workspace_id, status);
create index templates_meta_idx on public.templates (meta_template_id);

-- ───────────────────────── campaigns ─────────────────────────

create table public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  name                text not null,
  status              text not null default 'draft' check (status in ('draft','scheduled','sending','paused','completed','failed','cancelled')),
  template_id         uuid references public.templates(id) on delete set null,
  template_name       text,
  template_language   text,
  template_category   text,
  template_snapshot   jsonb,
  audience            jsonb not null default '{}'::jsonb,
  variable_map        jsonb not null default '{}'::jsonb,
  media_map           jsonb not null default '{}'::jsonb,
  scheduled_at        timestamptz,
  started_at          timestamptz,
  completed_at        timestamptz,
  throttle_per_min    int not null default 600,
  total               int not null default 0,
  sent                int not null default 0,
  delivered           int not null default 0,
  read                int not null default 0,
  replied             int not null default 0,
  failed              int not null default 0,
  clicked             int not null default 0,
  cost_estimate       numeric(12,2) not null default 0,
  last_error          text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index campaigns_ws_created_idx on public.campaigns (workspace_id, created_at desc);
create index campaigns_dispatch_idx on public.campaigns (status, scheduled_at) where status in ('scheduled','sending');

create table public.campaign_messages (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  campaign_id      uuid not null references public.campaigns(id) on delete cascade,
  contact_id       uuid references public.contacts(id) on delete set null,
  phone            text not null,
  contact_name     text,
  status           text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','skipped')),
  wa_message_id    text,
  error_code       text,
  error_message    text,
  claimed_at       timestamptz,
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz,
  replied_at       timestamptz,
  failed_at        timestamptz,
  created_at       timestamptz not null default now()
);
create index cm_campaign_status_idx on public.campaign_messages (campaign_id, status);
create index cm_campaign_created_idx on public.campaign_messages (campaign_id, created_at, id);
create index cm_wamid_idx on public.campaign_messages (wa_message_id) where wa_message_id is not null;
create index cm_ws_sent_idx on public.campaign_messages (workspace_id, sent_at desc) where sent_at is not null;
create index cm_contact_idx on public.campaign_messages (contact_id, sent_at desc);

-- ───────────────────────── inbox ─────────────────────────

create table public.conversations (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  contact_id               uuid not null references public.contacts(id) on delete cascade,
  status                   text not null default 'open' check (status in ('open','resolved')),
  assigned_to              uuid,
  unread_count             int not null default 0,
  last_message_at          timestamptz,
  last_message_preview     text,
  last_message_direction   text check (last_message_direction in ('in','out')),
  last_message_status      text,
  last_inbound_at          timestamptz,
  created_at               timestamptz not null default now(),
  unique (workspace_id, contact_id)
);
create index conversations_inbox_idx on public.conversations (workspace_id, status, last_message_at desc);
create index conversations_unread_idx on public.conversations (workspace_id) where unread_count > 0;

create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces(id) on delete cascade,
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  contact_id       uuid not null references public.contacts(id) on delete cascade,
  direction        text not null check (direction in ('in','out')),
  type             text not null,
  body             text,
  payload          jsonb not null default '{}'::jsonb,
  status           text not null default 'sent',
  wa_message_id    text,
  error_code       text,
  error_message    text,
  campaign_id      uuid references public.campaigns(id) on delete set null,
  sent_by          uuid,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz,
  delivered_at     timestamptz,
  read_at          timestamptz
);
create index messages_thread_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_wamid_idx on public.messages (wa_message_id) where wa_message_id is not null;
create index messages_campaign_idx on public.messages (campaign_id) where campaign_id is not null;

create table public.quick_replies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  shortcut      text not null,
  body          text not null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, shortcut)
);

-- ───────────────────────── automations ─────────────────────────

create table public.automation_rules (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  name               text not null,
  enabled            boolean not null default true,
  trigger            jsonb not null,
  actions            jsonb not null default '[]'::jsonb,
  priority           int not null default 10,
  triggered_count    int not null default 0,
  last_triggered_at  timestamptz,
  created_at         timestamptz not null default now()
);
create index automation_rules_ws_idx on public.automation_rules (workspace_id, enabled, priority);

-- ───────────────────────── triggers ─────────────────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger templates_updated_at before update on public.templates for each row execute function public.set_updated_at();
create trigger campaigns_updated_at before update on public.campaigns for each row execute function public.set_updated_at();

-- A new auth user either accepts a pending invite (server-created) or starts their own workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display text := coalesce(nullif(meta->>'full_name', ''), split_part(new.email, '@', 1));
  inv public.workspace_invites%rowtype;
  ws uuid;
begin
  select * into inv from public.workspace_invites where lower(email) = lower(new.email) order by created_at desc limit 1;
  if found then
    insert into public.workspace_members (workspace_id, user_id, role, name, email, color)
    values (inv.workspace_id, new.id, inv.role, coalesce(nullif(inv.name, ''), display), new.email, inv.color);
    delete from public.workspace_invites where lower(email) = lower(new.email);
  else
    insert into public.workspaces (name)
    values (coalesce(nullif(meta->>'workspace_name', ''), display || '''s workspace'))
    returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role, name, email)
    values (ws, new.id, 'owner', display, new.email);
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically hand a batch of queued recipients to ONE dispatcher (safe with parallel cron/after() runs).
-- Rows stuck in "sending" past the stale window (a crashed worker) are picked up again.
create or replace function public.claim_campaign_messages(
  p_workspace uuid,
  p_campaign uuid,
  p_limit int,
  p_stale_seconds int default 120
)
returns setof public.campaign_messages
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.campaign_messages
    where workspace_id = p_workspace
      and campaign_id = p_campaign
      and (status = 'queued'
           or (status = 'sending' and claimed_at < now() - make_interval(secs => p_stale_seconds)))
    order by created_at, id
    limit p_limit
    for update skip locked
  )
  update public.campaign_messages cm
     set status = 'sending', claimed_at = now()
    from picked
   where cm.id = picked.id
  returning cm.*;
end $$;

revoke all on function public.claim_campaign_messages(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.claim_campaign_messages(uuid, uuid, int, int) to service_role;

-- ───────────────────────── row level security ─────────────────────────

alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.workspace_invites  enable row level security;  -- no policies: service role only
alter table public.wa_accounts        enable row level security;
alter table public.wa_secrets         enable row level security;  -- no policies: service role only

create policy workspaces_select on public.workspaces
  for select to authenticated using (id in (select public.my_workspace_ids()));
create policy workspaces_update on public.workspaces
  for update to authenticated using (public.is_workspace_admin(id)) with check (public.is_workspace_admin(id));

create policy members_select on public.workspace_members
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
create policy members_write on public.workspace_members
  for all to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy wa_accounts_select on public.wa_accounts
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));

do $$
declare t text;
begin
  foreach t in array array[
    'contacts','tags','segments','templates','campaigns','campaign_messages',
    'conversations','messages','quick_replies','automation_rules'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (workspace_id in (select public.my_workspace_ids()))
         with check (workspace_id in (select public.my_workspace_ids()))',
      t || '_member_all', t);
  end loop;
end $$;

-- ───────────────────────── storage ─────────────────────────
-- Public bucket for template samples and outbound media. Uploads happen through server-issued signed URLs.

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 104857600)
on conflict (id) do nothing;

-- ───────────────────────── optional extras ─────────────────────────
-- Realtime inbox (the app polls by default; enable this to subscribe instead):
--   alter publication supabase_realtime add table public.messages, public.conversations;
--
-- Run the scheduler from Postgres instead of Vercel Cron (free plans only allow daily Vercel crons):
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('wadesk-dispatch', '* * * * *', $$
--     select net.http_get(
--       url     := 'https://YOUR-APP.vercel.app/api/cron/dispatch',
--       headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
--     );
--   $$);
