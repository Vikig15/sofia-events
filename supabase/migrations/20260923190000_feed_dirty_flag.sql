-- Refreshing feed_mv takes a few seconds as data grows: too long for the anon role's 3s statement timeout
-- (local pushes) and wasteful when 40+ sources finish within a minute. Writers just mark the feed dirty;
-- a per-minute cron refreshes it when needed. ingest_rows (see 20260923180000_local_push.sql) now ends with
-- `update public.feed_state set dirty = true` instead of refreshing inline.
create table public.feed_state (id boolean primary key default true check (id), dirty boolean not null default false);
insert into public.feed_state default values;
alter table public.feed_state enable row level security;

create or replace function public.refresh_feed_if_dirty()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (select dirty from public.feed_state) then return false; end if;
  update public.feed_state set dirty = false where id;
  refresh materialized view concurrently public.feed_mv;
  return true;
end;
$$;
revoke all on function public.refresh_feed_if_dirty() from public, anon, authenticated;
select cron.schedule('refresh-feed-if-dirty', '* * * * *', $$select public.refresh_feed_if_dirty()$$);
