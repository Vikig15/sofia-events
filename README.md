# Sofia Events

Personal aggregator of events in Sofia where you can meet people in real life, as an alternative to dating apps.

- **App:** https://vikig15.github.io/sofia-events/ (Refresh button re-scrapes every source live)
- **Data:** Supabase project "Event App" (`wqbdmcckjbqkfyedpoxb`), refreshed daily at 05:00 Sofia by `pg_cron`
- **Research:** start with [docs/SOURCES.md](docs/SOURCES.md)

## How it fits together

```
web/index.html ──read──▶ Supabase `feed` view (fuzzy-deduped, RLS read-only)
      │                          ▲
      └─Refresh─▶ Edge Function `ingest` ──fan-out, one call per source──▶ 32 connectors ──▶ `events` table
pg_cron 05:00 ──────────────┘                                           (10-min cooldown per source)
```

- `supabase/functions/_shared/connectors/`: one file per source, each returns events in the shape documented in `lib/event.js`. Must run in both Node and Deno (no npm deps, no `node:` imports).
- `supabase/functions/_shared/sources.js`: registry + per-source health threshold (`minEvents`). An unhealthy run never deletes old events.
- `supabase/functions/_shared/lib/score.js`: tags plus the "can I meet people here" and interest scores.
- `supabase/functions/_shared/lib/dedupe.js`: fuzzy cross-source dedupe (mirrored in SQL by the `feed` view).
- `supabase/functions/_shared/recurring.js`: hand-curated weekly events (organisers that only post on Facebook/Instagram).

## Local

```bash
npm run ingest                         # all sources → data/feed.json + health table
node scripts/ingest.js --only luma     # one source
node scripts/serve.js                  # preview at http://127.0.0.1:5173/web/ (set supabaseUrl '' in web/config.js to use local data)
```

## Shipping changes

- **Connectors / scoring:** push to `main`, then redeploy the `ingest` function with the new commit SHA in its import line. The deployed `index.ts` imports `_shared/pipeline.js` from `cdn.jsdelivr.net/gh/Vikig15/sofia-events@<sha>/…`, so deploys don't upload 30+ files. The repo copy of `index.ts` uses a relative import and is otherwise identical.
- **Web page:** `git subtree push --prefix web origin gh-pages`
- **Schema:** add a file to `supabase/migrations/` and apply it to the project.
