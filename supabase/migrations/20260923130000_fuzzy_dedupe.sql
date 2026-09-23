-- Fuzzy cross-source dedupe. Mirrors collapse() in supabase/functions/_shared/lib/dedupe.js:
-- same Sofia-local start hour (slot) + title tokens overlapping >= 60% of the shorter title
-- (at least one shared token of 4+ chars). Same-source rows only merge on identical tokens.

alter table public.events
  add column title_tokens text[] not null default '{}',
  add column slot text;

create index events_slot_idx on public.events (slot);

create or replace function public.titles_match(a text[], b text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when least(cardinality(a), cardinality(b)) = 0 then false
    else (select count(*) from unnest(a) x where x = any(b))::float / least(cardinality(a), cardinality(b)) >= 0.6
         and exists (select 1 from unnest(a) x where x = any(b) and length(x) >= 4)
  end
$$;

drop view if exists public.feed;

create view public.feed with (security_invoker = true) as
with live as (
  select * from public.events
  where coalesce(end_at, start_at + interval '3 hours') >= now()
),
-- (loser, winner) pairs: winner ranks better (priority, then more attendees, then id).
dup as (
  select l.id as loser, w.id as winner
  from live l
  join live w on w.slot = l.slot and w.id <> l.id
  where (w.priority, -coalesce(w.attendees, -1), w.id) < (l.priority, -coalesce(l.attendees, -1), l.id)
    and case when w.source = l.source then w.title_tokens = l.title_tokens
             else public.titles_match(w.title_tokens, l.title_tokens) end
)
select e.id, e.source, e.title, e.start_at, e.end_at, e.venue_name, e.venue_address, e.lat, e.lon,
       e.url, e.image, e.price_min, e.currency, e.is_free, e.categories, e.attendees, e.recurring,
       e.description, e.tags, e.social_score, e.interest_score, e.first_seen,
       coalesce((select jsonb_agg(jsonb_build_object('source', o.source, 'url', o.url) order by o.priority)
                 from dup d join live o on o.id = d.loser
                 where d.winner = e.id), '[]'::jsonb) as also_on
from live e
where not exists (select 1 from dup d where d.loser = e.id);

grant select on public.feed to anon, authenticated;
