// POST /functions/v1/ingest                 -> fan out: one invocation per source (returns immediately)
// POST /functions/v1/ingest {"source":"x"}  -> run one source, upsert its events, log the run
//
// Called by the Refresh button and by the daily pg_cron job. Each source runs in its own
// invocation so it gets its own wall-clock budget. A 10-minute cooldown per source makes
// repeated clicks harmless (and keeps us polite to the sites we read).
// Timestamps from Postgres contain '+', so they must be URL-encoded in filters.
// Talks to PostgREST directly (no supabase-js) so the deployed bundle stays small.
import { runSource, sourceNames } from '../_shared/pipeline.js';

const COOLDOWN_MIN = 10;
const URL_ = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

async function rest(path: string, init: RequestInit & { prefer?: string } = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      authorization: `Bearer ${KEY}`,
      'content-type': 'application/json',
      ...(init.prefer ? { prefer: init.prefer } : {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const source: string | undefined = body.source ?? new URL(req.url).searchParams.get('source') ?? undefined;

  if (!source) {
    // Children answer 202 immediately (their work continues in the background), so these calls are
    // quick. Staggered + one retry: with 30+ simultaneous calls a few occasionally never arrive.
    const self = `${URL_}/functions/v1/ingest`;
    const names = sourceNames();
    const dispatch = async (name: string, i: number) => {
      await new Promise((r) => setTimeout(r, i * 150));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(self, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: name }) });
          await res.body?.cancel();
          if (res.ok) return null;
        } catch { /* retry */ }
      }
      return name;
    };
    const failed = (await Promise.all(names.map(dispatch))).filter(Boolean);
    return json({ started: names.filter((n) => !failed.includes(n)), failed }, 202);
  }

  if (!sourceNames().includes(source)) return json({ error: `unknown source ${source}` }, 400);

  const since = new Date(Date.now() - COOLDOWN_MIN * 60_000).toISOString();
  const recent = await rest(
    `source_runs?select=id&source=eq.${encodeURIComponent(source)}&started_at=gte.${since}&or=(ok.eq.true,finished_at.is.null)&limit=1`,
  );
  if (recent?.length) return json({ source, skipped: 'ran recently or still running' });

  const [run] = await rest('source_runs?select=id,started_at', { method: 'POST', body: JSON.stringify({ source }), prefer: 'return=representation' });
  const finish = (patch: Record<string, unknown>) =>
    rest(`source_runs?id=eq.${run.id}`, { method: 'PATCH', body: JSON.stringify({ finished_at: new Date().toISOString(), ...patch }) });

  const work = async () => {
    try {
      const { rows, minEvents } = await runSource(source);
      const seenAt = new Date().toISOString();
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map((r: Record<string, unknown>) => ({ ...r, last_seen: seenAt }));
        await rest('events?on_conflict=id', { method: 'POST', body: JSON.stringify(chunk), prefer: 'resolution=merge-duplicates,return=minimal' });
      }
      const ok = rows.length >= minEvents;
      // Future events this source no longer lists were cancelled or moved. Only prune on a healthy run,
      // so a broken scraper never wipes good data.
      if (ok) {
        await rest(`events?source=eq.${encodeURIComponent(source)}&last_seen=lt.${encodeURIComponent(run.started_at)}&start_at=gt.${seenAt}`, { method: 'DELETE' });
      }
      await finish({ ok, events: rows.length, min_events: minEvents });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await finish({ ok: false, error: message.slice(0, 500) }).catch(() => {});
    }
  };
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  EdgeRuntime.waitUntil(work());
  return json({ source, started: true }, 202);
});
