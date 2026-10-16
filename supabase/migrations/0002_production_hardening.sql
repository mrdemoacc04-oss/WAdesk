-- ════════════════════════════════════════════════════════════════════════════
--  WAdesk — 0002 production hardening
--  Run once, after 0001_init.sql. What it closes:
--    · the browser's anon key can no longer touch any table or helper function
--    · agents can't launch campaigns / approve templates by writing to the database directly
--      (the API already said "admins only"; now the database enforces it too)
--    · an admin can no longer make themselves (or anyone) the owner, remove the owner, or add arbitrary members
--    · a password signup on a project with email confirmation switched OFF can't claim someone else's pending invite
--    · uploads are limited to the file types WhatsApp accepts
--    · missing foreign-key indexes (the performance advisor's list)
--  Every statement is safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- ───────────────────────── 1. nothing is reachable anonymously ─────────────────────────
-- The app talks to these tables as a signed-in user ("authenticated") or as the server ("service_role").
-- The anon key only ever calls the Auth API, so it gets no table privileges at all.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;  -- TRUNCATE ignores RLS

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- ───────────────────────── 2. function grants ─────────────────────────
-- Trigger functions are never meant to be called over the API (/rest/v1/rpc/...).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at()  from public, anon, authenticated;
alter function public.set_updated_at() set search_path = '';

-- The policy helpers run inside RLS expressions as the querying role, so signed-in users need them — anonymous callers don't.
revoke execute on function public.my_workspace_ids()        from public, anon;
revoke execute on function public.is_workspace_admin(uuid)  from public, anon;
grant  execute on function public.my_workspace_ids()        to authenticated, service_role;
grant  execute on function public.is_workspace_admin(uuid)  to authenticated, service_role;

-- ───────────────────────── 3. signup trigger ─────────────────────────
-- A password signup whose email is already marked confirmed means the project auto-confirms (email confirmation is
-- switched off): nobody has proved they own that address, so it must not be able to claim a pending invite.
-- (Invites created by the server arrive without a password and unconfirmed, so they are unaffected.)
-- Invites also expire after 14 days, and a signup's workspace name is length-limited.

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display text := coalesce(nullif(meta->>'full_name', ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'New');
  unverified_claim boolean := new.email_confirmed_at is not null and coalesce(new.encrypted_password, '') <> '';
  inv public.workspace_invites%rowtype;
  ws uuid;
begin
  if not unverified_claim then
    select * into inv from public.workspace_invites
     where lower(email) = lower(new.email) and created_at > now() - interval '14 days'
     order by created_at desc limit 1;
  end if;

  if inv.id is not null then
    insert into public.workspace_members (workspace_id, user_id, role, name, email, color)
    values (inv.workspace_id, new.id, inv.role, coalesce(nullif(inv.name, ''), display), new.email, inv.color);
    delete from public.workspace_invites where lower(email) = lower(new.email);
  else
    insert into public.workspaces (name)
    values (coalesce(left(nullif(btrim(meta->>'workspace_name'), ''), 80), display || '''s workspace'))
    returning id into ws;
    insert into public.workspace_members (workspace_id, user_id, role, name, email)
    values (ws, new.id, 'owner', display, coalesce(new.email, ''));
  end if;
  return new;
end $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ───────────────────────── 4. row level security, by role ─────────────────────────
-- Everyone in a workspace can read it. Writes follow the same rules the API applies:
--   · contacts, tags, segments, conversations, messages, quick replies, automations → any member (unchanged)
--   · campaigns / templates → members may create and edit DRAFTS; only admins launch, schedule, approve, delete
--   · campaign recipients → admins only (they are written when a campaign is launched)
--   · team and workspace settings → admins only; the owner row is untouchable from the client

-- workspaces: admins may rename / change settings, nothing else (and never insert or delete from the client)
revoke insert, delete on public.workspaces from authenticated;
revoke update on public.workspaces from authenticated;
grant  update (name, settings) on public.workspaces to authenticated;

-- workspace_members: no client inserts (members are created by the signup trigger / invites, server-side).
-- Admins may change a non-owner's role to admin|agent, or remove a non-owner. Nobody can create or alter an owner.
drop policy if exists members_write on public.workspace_members;
drop policy if exists members_admin_update on public.workspace_members;
drop policy if exists members_admin_delete on public.workspace_members;

revoke insert on public.workspace_members from authenticated;
revoke update on public.workspace_members from authenticated;
grant  update (role, name, color) on public.workspace_members to authenticated;

create policy members_admin_update on public.workspace_members
  for update to authenticated
  using      (public.is_workspace_admin(workspace_id) and role <> 'owner')
  with check (public.is_workspace_admin(workspace_id) and role in ('admin', 'agent'));

create policy members_admin_delete on public.workspace_members
  for delete to authenticated
  using (public.is_workspace_admin(workspace_id) and role <> 'owner');

-- campaigns
drop policy if exists campaigns_member_all on public.campaigns;
drop policy if exists campaigns_select on public.campaigns;
drop policy if exists campaigns_insert on public.campaigns;
drop policy if exists campaigns_update on public.campaigns;
drop policy if exists campaigns_delete on public.campaigns;

create policy campaigns_select on public.campaigns
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
create policy campaigns_insert on public.campaigns
  for insert to authenticated
  with check (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status = 'draft'));
create policy campaigns_update on public.campaigns
  for update to authenticated
  using      (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status = 'draft'))
  with check (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status = 'draft'));
create policy campaigns_delete on public.campaigns
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- campaign_messages: the recipient list a campaign will send to. Written only when an admin launches or cancels it.
drop policy if exists campaign_messages_member_all on public.campaign_messages;
drop policy if exists campaign_messages_select on public.campaign_messages;
drop policy if exists campaign_messages_insert on public.campaign_messages;
drop policy if exists campaign_messages_update on public.campaign_messages;
drop policy if exists campaign_messages_delete on public.campaign_messages;

create policy campaign_messages_select on public.campaign_messages
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
create policy campaign_messages_insert on public.campaign_messages
  for insert to authenticated with check (public.is_workspace_admin(workspace_id));
create policy campaign_messages_update on public.campaign_messages
  for update to authenticated using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));
create policy campaign_messages_delete on public.campaign_messages
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- templates: members work on drafts; submitting to Meta, syncing and approval status belong to admins / the webhook
drop policy if exists templates_member_all on public.templates;
drop policy if exists templates_select on public.templates;
drop policy if exists templates_insert on public.templates;
drop policy if exists templates_update on public.templates;
drop policy if exists templates_delete on public.templates;

create policy templates_select on public.templates
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
create policy templates_insert on public.templates
  for insert to authenticated
  with check (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status = 'DRAFT'));
create policy templates_update on public.templates
  for update to authenticated
  using      (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status in ('DRAFT', 'REJECTED')))
  with check (public.is_workspace_admin(workspace_id) or (workspace_id in (select public.my_workspace_ids()) and status = 'DRAFT'));
create policy templates_delete on public.templates
  for delete to authenticated using (public.is_workspace_admin(workspace_id));

-- connection data is written only by the server (service role); defence in depth on top of "no policy"
revoke insert, update, delete on public.wa_accounts from authenticated;
revoke all on public.wa_secrets, public.workspace_invites from anon, authenticated;

-- ───────────────────────── 5. storage ─────────────────────────
-- The signed upload URL doesn't check the file type the browser claimed, so the bucket does: only what WhatsApp accepts.
update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp',
         'video/mp4', 'video/3gpp',
         'audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg',
         'application/pdf', 'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint', 'text/plain',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation'
       ]
 where id = 'media';

-- ───────────────────────── 6. indexes (foreign keys without a covering index) ─────────────────────────
create index if not exists campaigns_template_idx          on public.campaigns (template_id);
create index if not exists conversations_contact_idx       on public.conversations (contact_id);
create index if not exists messages_contact_idx            on public.messages (contact_id);
create index if not exists messages_workspace_idx          on public.messages (workspace_id);
create index if not exists segments_workspace_idx          on public.segments (workspace_id);
create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id);
