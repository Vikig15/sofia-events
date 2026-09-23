// Runs every source, normalizes, deduplicates and writes data/events.json plus a health report.
//   node scripts/ingest.js            all sources
//   node scripts/ingest.js --only luma
import { writeFile, mkdir } from 'node:fs/promises';
import { SOURCES } from '../supabase/functions/_shared/sources.js';
import { expandRules, staleRules } from '../supabase/functions/_shared/recurring.js';
import { dedupe } from '../supabase/functions/_shared/lib/dedupe.js';

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx > -1 ? process.argv[onlyIdx + 1] : null;

const now = new Date();
const horizon = new Date(now.getTime() + 90 * 86_400_000);
const health = [];
let all = [];

for (const src of SOURCES.filter((s) => !only || s.name === only)) {
  const t0 = Date.now();
  process.stdout.write(`→ ${src.name}\n`);
  try {
    const events = (await src.run()).filter((e) => {
      const d = new Date(e.end ?? e.start);
      return d >= now && new Date(e.start) <= horizon;
    });
    const inPerson = events.filter((e) => !e.online).length;
    health.push({ source: src.name, ok: events.length >= src.minEvents, events: events.length, inPerson, ms: Date.now() - t0 });
    all.push(...events);
  } catch (err) {
    health.push({ source: src.name, ok: false, events: 0, inPerson: 0, error: err.message, ms: Date.now() - t0 });
  }
}

if (!only) all.push(...expandRules(now));

const { events, merged } = dedupe(all.filter((e) => !e.online));
events.sort((a, b) => a.start.localeCompare(b.start));

await mkdir('data', { recursive: true });
await writeFile('data/events.json', JSON.stringify({ generatedAt: now.toISOString(), health, events }, null, 2));

console.log('\nSource health');
console.table(health.map(({ source, ok, events, inPerson, ms, error }) => ({ source, ok: ok ? '✓' : '✗', events, inPerson, sec: (ms / 1000).toFixed(1), error: error?.slice(0, 60) ?? '' })));
const stale = staleRules(now);
if (stale.length) console.warn(`Recurring rules due for re-verification: ${stale.join(', ')}`);
console.log(`\n${events.length} unique in-person events in the next 90 days (${merged} duplicates merged) → data/events.json`);
