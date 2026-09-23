-- Daily refresh at 05:00 Sofia (02:00 UTC in summer / 03:00 in winter; cron runs in UTC).
-- Needs a Vault secret named 'project_url' = https://<ref>.supabase.co (set once after linking).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.trigger_ingest()
returns bigint
language sql
security definer
set search_path = public, extensions, vault
as $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest',
    body    := '{}'::jsonb,
    headers := '{"content-type":"application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
$$;

revoke all on function public.trigger_ingest() from public, anon, authenticated;

select cron.schedule('daily-ingest', '0 2 * * *', $$select public.trigger_ingest()$$);

-- Keep the run log small.
select cron.schedule('prune-source-runs', '30 2 * * 0', $$delete from public.source_runs where started_at < now() - interval '30 days'$$);
