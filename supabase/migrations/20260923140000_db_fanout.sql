-- Fan-out moved into Postgres. An Edge Function calling itself ~30 times per invocation hits a
-- platform limit (the last calls silently never arrive), so the function now just syncs the
-- source list here and asks Postgres to send one async pg_net request per source.

create table public.sources (
  name       text primary key,
  enabled    boolean     not null default true,
  updated_at timestamptz not null default now()
);

alter table public.sources enable row level security;
create policy "public read sources" on public.sources for select to anon, authenticated using (true);

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
  where s.enabled
  order by s.name;
$$;

revoke all on function public.dispatch_ingest() from public, anon, authenticated;
