-- Hide sources that were disabled (removed from the registry or edge: false) from the health panel.
create or replace view public.source_health with (security_invoker = true) as
select distinct on (r.source) r.source, r.started_at, r.finished_at, r.ok, r.events, r.min_events, r.error
from public.source_runs r
where not exists (select 1 from public.sources s where s.name = r.source and not s.enabled)
order by r.source, r.started_at desc;
