// POST /functions/v1/ingest                 -> fan out: one invocation per source (returns immediately)
// POST /functions/v1/ingest {"source":"x"}  -> run one source, upsert its events, log the run
//
// Called by the Refresh button and by the daily pg_cron job. Each source runs in its own
// invocation so it gets its own wall-clock budget. A 10-minute cooldown per source makes
// repeated clicks harmless (and keeps us polite to the sites we read).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { runSource, sourceNames } from '../_shared/pipeline.js';

const COOLDOWN_MIN = 10;
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const source: string | undefined = body.source ?? new URL(req.url).searchParams.get('source') ?? undefined;

  if (!source) {
    const self = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ingest`;
    const names = sourceNames();
    const calls = names.map((name) =>
      fetch(self, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: name }) }),
    );
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(Promise.allSettled(calls));
    return json({ started: names }, 202);
  }

  if (!sourceNames().includes(source)) return json({ error: `unknown source ${source}` }, 400);

  const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
  const { data: recent } = await db
    .from('source_runs')
    .select('id, ok, finished_at')
    .eq('source', source)
    .gte('started_at', since)
    .or('ok.eq.true,finished_at.is.null')
    .limit(1);
  if (recent?.length) return json({ source, skipped: 'ran recently or still running' });

  const { data: run } = await db.from('source_runs').insert({ source }).select('id, started_at').single();
  try {
    const { rows, minEvents } = await runSource(source);
    const seenAt = new Date().toISOString();
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, last_seen: seenAt }));
      const { error } = await db.from('events').upsert(chunk, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
    const ok = rows.length >= minEvents;
    // Future events this source no longer lists were cancelled or moved. Only prune on a healthy run,
    // so a broken scraper never wipes good data.
    if (ok) {
      await db.from('events').delete().eq('source', source).lt('last_seen', run!.started_at).gt('start_at', seenAt);
    }
    await db
      .from('source_runs')
      .update({ finished_at: new Date().toISOString(), ok, events: rows.length, min_events: minEvents })
      .eq('id', run!.id);
    return json({ source, ok, events: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('source_runs').update({ finished_at: new Date().toISOString(), ok: false, error: message.slice(0, 500) }).eq('id', run!.id);
    return json({ source, ok: false, error: message }, 500);
  }
});
