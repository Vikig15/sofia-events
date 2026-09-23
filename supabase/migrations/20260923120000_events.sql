-- Sofia Events: storage for aggregated events + per-source run log.

create table public.events (
  id             text primary key,             -- "<source>:<sourceId>"
  source         text        not null,
  title          text        not null,
  start_at       timestamptz not null,
  end_at         timestamptz,
  venue_name     text,
  venue_address  text,
  lat            double precision,
  lon            double precision,
  url            text        not null,
  image          text,
  price_min      numeric,
  currency       text,
  is_free        boolean,
  categories     text[]      not null default '{}',
  attendees      integer,
  recurring      boolean     not null default false,
  description    text,
  tags           text[]      not null default '{}',
  social_score   smallint    not null default 0,
  interest_score smallint    not null default 0,
  dedupe_key     text        not null,
  priority       smallint    not null default 6,
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now()
);

create index events_start_idx on public.events (start_at);
create index events_dedupe_idx on public.events (dedupe_key, priority);
create index events_source_idx on public.events (source, last_seen);

create table public.source_runs (
  id          bigint generated always as identity primary key,
  source      text        not null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  ok          boolean,
  events      integer,
  min_events  integer,
  error       text
);

create index source_runs_source_idx on public.source_runs (source, started_at desc);

-- One row per real-world event: the best-priority copy, plus links to the other listings.
create view public.feed with (security_invoker = true) as
with ranked as (
  select e.*,
         row_number() over (partition by dedupe_key order by priority, attendees desc nulls last, id) as rn
  from public.events e
  where coalesce(e.end_at, e.start_at + interval '3 hours') >= now()
)
select r.id, r.source, r.title, r.start_at, r.end_at, r.venue_name, r.venue_address, r.lat, r.lon,
       r.url, r.image, r.price_min, r.currency, r.is_free, r.categories, r.attendees, r.recurring,
       r.description, r.tags, r.social_score, r.interest_score, r.first_seen,
       coalesce((select jsonb_agg(jsonb_build_object('source', o.source, 'url', o.url) order by o.priority)
                 from ranked o where o.dedupe_key = r.dedupe_key and o.rn > 1), '[]'::jsonb) as also_on
from ranked r
where r.rn = 1;

-- Latest run per source, for the health strip in the UI.
create view public.source_health with (security_invoker = true) as
select distinct on (source) source, started_at, finished_at, ok, events, min_events, error
from public.source_runs
order by source, started_at desc;

-- Personal app: anyone with the publishable key may READ; only the service role (Edge Function) writes.
alter table public.events enable row level security;
alter table public.source_runs enable row level security;
create policy "public read events" on public.events for select to anon, authenticated using (true);
create policy "public read runs" on public.source_runs for select to anon, authenticated using (true);

grant select on public.feed, public.source_health to anon, authenticated;
