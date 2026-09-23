-- Sources that can't run on Supabase (Instagram 429s datacenter IPs, TimeHeroes/EPAYGO block them) run on
-- the user's Mac (`npm run push`) and upload through this token-protected RPC. The token lives in Vault
-- ('local_ingest_token') and in the git-ignored .env.local on the Mac, nowhere else.

alter table public.sources add column runner text not null default 'edge' check (runner in ('edge', 'local'));

-- Only edge sources are dispatched to the Edge Function.
create or replace function public.dispatch_ingest()
returns setof text
language sql
security definer
set search_path = public, extensions, vault
as $$
  select s.name
  from public.sources s,
       lateral (
         select net.http_post(
           url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/ingest',
           body    := jsonb_build_object('source', s.name),
           headers := '{"content-type":"application/json"}'::jsonb,
           timeout_milliseconds := 5000
         )
       ) r
  where s.enabled and s.runner = 'edge'
  order by s.name;
$$;
revoke all on function public.dispatch_ingest() from public, anon, authenticated;

-- Called in chunks (the anon role has a short statement timeout): each chunk upserts rows; the final call
-- (p_final) prunes this source's future events not seen since p_since, logs the run and refreshes feed_mv.
create or replace function public.ingest_rows(
  p_source text, p_rows jsonb, p_min_events integer, p_token text,
  p_final boolean default true, p_since timestamptz default now(), p_total integer default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer := coalesce(p_total, jsonb_array_length(p_rows), 0);
  v_ok boolean;
begin
  if p_token is null or p_token is distinct from (select decrypted_secret from vault.decrypted_secrets where name = 'local_ingest_token') then
    raise exception 'invalid token';
  end if;
  if p_source !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'invalid source name';
  end if;

  insert into public.events (id, source, title, start_at, end_at, venue_name, venue_address, lat, lon, url, image,
                             price_min, currency, is_free, categories, attendees, recurring, description, tags,
                             social_score, interest_score, dedupe_key, priority, title_tokens, slot, last_seen)
  select r.id, p_source, r.title, r.start_at, r.end_at, r.venue_name, r.venue_address, r.lat, r.lon, r.url, r.image,
         r.price_min, r.currency, r.is_free, coalesce(r.categories, '{}'), r.attendees, coalesce(r.recurring, false),
         r.description, coalesce(r.tags, '{}'), coalesce(r.social_score, 0), coalesce(r.interest_score, 0),
         r.dedupe_key, coalesce(r.priority, 6), coalesce(r.title_tokens, '{}'), r.slot, now()
  from jsonb_populate_recordset(null::public.events, coalesce(p_rows, '[]'::jsonb)) r
  where r.source = p_source
  on conflict (id) do update set
    title = excluded.title, start_at = excluded.start_at, end_at = excluded.end_at, venue_name = excluded.venue_name,
    venue_address = excluded.venue_address, lat = excluded.lat, lon = excluded.lon, url = excluded.url,
    image = excluded.image, price_min = excluded.price_min, currency = excluded.currency, is_free = excluded.is_free,
    categories = excluded.categories, attendees = excluded.attendees, recurring = excluded.recurring,
    description = excluded.description, tags = excluded.tags, social_score = excluded.social_score,
    interest_score = excluded.interest_score, dedupe_key = excluded.dedupe_key, priority = excluded.priority,
    title_tokens = excluded.title_tokens, slot = excluded.slot, last_seen = excluded.last_seen;

  if not p_final then
    return jsonb_build_object('source', p_source, 'chunk', jsonb_array_length(p_rows));
  end if;

  insert into public.sources (name, enabled, runner, updated_at) values (p_source, true, 'local', now())
  on conflict (name) do update set enabled = true, runner = 'local', updated_at = now();

  v_ok := v_n >= p_min_events;
  if v_ok then
    delete from public.events where source = p_source and last_seen < p_since and start_at > now();
  end if;
  insert into public.source_runs (source, started_at, finished_at, ok, events, min_events)
  values (p_source, p_since, now(), v_ok, v_n, p_min_events);
  update public.feed_state set dirty = true where id; -- table created in 20260923190000_feed_dirty_flag.sql
  return jsonb_build_object('source', p_source, 'ok', v_ok, 'events', v_n);
end;
$$;

revoke all on function public.ingest_rows(text, jsonb, integer, text, boolean, timestamptz, integer) from public, authenticated;
grant execute on function public.ingest_rows(text, jsonb, integer, text, boolean, timestamptz, integer) to anon;
