-- ════════════════════════════════════════════════════════════════════════════
--  WAdesk — 0003 automatic scheduler
--  Run once, after 0002. Scheduled campaigns need a timer that calls /api/cron/dispatch every minute.
--  Instead of asking whoever deploys WAdesk to paste SQL, the app registers its own timer the first time it
--  starts in production (src/lib/server/scheduler.ts), using these two functions. Nothing to configure by hand.
--
--  How it works: pg_cron fires every minute → pg_net calls the app's dispatch endpoint with the CRON_SECRET bearer.
--  If pg_cron / pg_net can't be enabled (not Supabase, or a plan without them) this migration still succeeds and the
--  app simply reports that scheduling is unavailable — it never silently accepts a schedule it can't honour.
-- ════════════════════════════════════════════════════════════════════════════

do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron could not be enabled (%): scheduled sending will be reported as unavailable', sqlerrm;
end $$;

do $$ begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net could not be enabled (%): scheduled sending will be reported as unavailable', sqlerrm;
end $$;

-- Create or update the once-a-minute job. Idempotent: calling it again with a new address replaces the old job.
-- Server-only (service role): the address is restricted to the dispatch path and the secret is checked for length.
create or replace function public.wadesk_register_scheduler(p_url text, p_secret text)
returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_url is null or p_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/api/cron/dispatch$' then
    raise exception 'invalid scheduler url';
  end if;
  if coalesce(length(p_secret), 0) < 16 then
    raise exception 'scheduler secret is too short';
  end if;
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    return 'unavailable';
  end if;

  perform cron.schedule(
    'wadesk-dispatch',
    '* * * * *',
    format(
      'select net.http_get(url := %L, headers := jsonb_build_object(''Authorization'', %L), timeout_milliseconds := 55000)',
      p_url,
      'Bearer ' || p_secret
    )
  );
  return 'scheduled';
end $$;

-- Is the timer there, and did it run lately? Never returns the address or the secret.
create or replace function public.wadesk_scheduler_status()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  is_registered boolean := false;
  last_run record;
begin
  if to_regnamespace('cron') is null then
    return jsonb_build_object('available', false, 'registered', false);
  end if;
  execute 'select exists (select 1 from cron.job where jobname = $1 and active)' into is_registered using 'wadesk-dispatch';
  execute 'select status, start_time from cron.job_run_details
            where jobid = (select jobid from cron.job where jobname = $1)
            order by start_time desc limit 1' into last_run using 'wadesk-dispatch';
  return jsonb_build_object('available', true, 'registered', is_registered, 'last_status', last_run.status, 'last_run', last_run.start_time);
exception when others then
  return jsonb_build_object('available', false, 'registered', false);
end $$;

revoke all on function public.wadesk_register_scheduler(text, text) from public, anon, authenticated;
revoke all on function public.wadesk_scheduler_status()             from public, anon, authenticated;
grant  execute on function public.wadesk_register_scheduler(text, text) to service_role;
grant  execute on function public.wadesk_scheduler_status()             to service_role;
