// Runs the sources that can't run on Supabase (edge: false: Instagram, TimeHeroes, EPAYGO, Sofia Live Club)
// on this Mac and uploads them to the live app through the token-protected public.ingest_rows RPC.
//   npm run push                 all local-only sources
//   npm run push -- instagram    just one
// Needs .env.local (git-ignored): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, LOCAL_INGEST_TOKEN.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runSource, localOnlySources, minEventsFor } from '../supabase/functions/_shared/pipeline.js';

const envPath = fileURLToPath(new URL('../.env.local', import.meta.url));
const env = Object.fromEntries(
  (await readFile(envPath, 'utf8'))
    .split('\n')
    .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
for (const k of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'LOCAL_INGEST_TOKEN']) {
  if (!env[k]) throw new Error(`${k} missing in .env.local`);
}

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : localOnlySources();

// The public role has a short statement timeout, so rows go up in chunks; the final call prunes events
// this source no longer lists (not seen since `since`), logs the run and refreshes the feed.
const CHUNK = 200;
async function rpc(args) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/ingest_rows`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...args, p_token: env.LOCAL_INGEST_TOKEN }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${body.slice(0, 200)}`);
  return body;
}

for (const name of names) {
  const t0 = Date.now();
  try {
    const since = new Date().toISOString();
    const { rows } = await runSource(name);
    const base = { p_source: name, p_min_events: minEventsFor(name) };
    for (let i = 0; i < rows.length; i += CHUNK) {
      await rpc({ ...base, p_rows: rows.slice(i, i + CHUNK), p_final: false });
    }
    const body = await rpc({ ...base, p_rows: [], p_final: true, p_since: since, p_total: rows.length });
    console.log(`✓ ${name.padEnd(14)} ${body}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.log(`✗ ${name.padEnd(14)} ${err.message}`);
    process.exitCode = 1;
  }
}
