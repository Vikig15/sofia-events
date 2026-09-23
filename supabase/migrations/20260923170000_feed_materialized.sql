-- The fuzzy-dedupe view costs ~0.5s per query; precompute it. Refreshed after every source run
-- (the ingest function calls refresh_feed) and hourly by cron. Ended events linger until the next
-- refresh; the web page filters those out client-side.
create materialized view public.feed_mv as select * from public.feed;
create unique index feed_mv_id_idx on public.feed_mv (id);
create index feed_mv_start_idx on public.feed_mv (start_at);
grant select on public.feed_mv to anon, authenticated;

create or replace function public.refresh_feed()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently public.feed_mv;
$$;

revoke all on function public.refresh_feed() from public, anon, authenticated;

select cron.schedule('refresh-feed', '7 * * * *', $$select public.refresh_feed()$$);
