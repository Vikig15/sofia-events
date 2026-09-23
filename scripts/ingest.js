// Local run of the same pipeline the Edge Function uses. Writes data/feed.json in the shape of the
// `feed` view, so web/index.html can be previewed without Supabase.
//   node scripts/ingest.js                 all sources
//   node scripts/ingest.js --only luma     one source
import { writeFile, mkdir } from 'node:fs/promises';
import { runSource, sourceNames } from '../supabase/functions/_shared/pipeline.js';

const onlyIdx = process.argv.indexOf('--only');
const names = onlyIdx > -1 ? [process.argv[onlyIdx + 1]] : sourceNames();

// Run sources concurrently (like the Edge Function fan-out), but each source stays sequential inside.
const results = await Promise.all(
  names.map(async (name) => {
    const t0 = Date.now();
    try {
      const { rows, minEvents } = await runSource(name);
      return { name, rows, health: { source: name, ok: rows.length >= minEvents, events: rows.length, min: minEvents, sec: ((Date.now() - t0) / 1000).toFixed(1), error: '' } };
    } catch (err) {
      return { name, rows: [], health: { source: name, ok: false, events: 0, min: '', sec: ((Date.now() - t0) / 1000).toFixed(1), error: err.message.slice(0, 70) } };
    }
  }),
);

// Same dedupe rule as the `feed` view: best priority, then most attendees.
const groups = new Map();
for (const r of results.flatMap((x) => x.rows)) {
  const g = groups.get(r.dedupe_key) ?? [];
  g.push(r);
  groups.set(r.dedupe_key, g);
}
const feed = [...groups.values()].map((g) => {
  g.sort((a, b) => a.priority - b.priority || (b.attendees ?? -1) - (a.attendees ?? -1) || a.id.localeCompare(b.id));
  const [best, ...rest] = g;
  return { ...best, first_seen: new Date().toISOString(), also_on: rest.map((o) => ({ source: o.source, url: o.url })) };
});
feed.sort((a, b) => a.start_at.localeCompare(b.start_at));

const health = results.map((x) => x.health);
await mkdir('data', { recursive: true });
await writeFile('data/feed.json', JSON.stringify({ generatedAt: new Date().toISOString(), health, events: feed }));

console.table(health.map((h) => ({ ...h, ok: h.ok ? '✓' : '✗' })));
const total = results.reduce((s, x) => s + x.rows.length, 0);
console.log(`${feed.length} unique in-person events (${total - feed.length} duplicates merged) → data/feed.json`);
