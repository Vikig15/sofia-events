-- A run the Edge runtime terminates (wall clock / memory) never writes finished_at. Mark those as failed
-- so health is honest and the source isn't treated as "still running".
create or replace function public.mark_killed_runs()
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.source_runs
       set finished_at = now(), ok = false, error = 'terminated by the Edge runtime (time or memory limit)'
     where finished_at is null and started_at < now() - interval '5 minutes'
    returning 1
  )
  select count(*)::int from upd;
$$;

revoke all on function public.mark_killed_runs() from public, anon, authenticated;

select cron.schedule('mark-killed-runs', '*/10 * * * *', $$select public.mark_killed_runs()$$);
