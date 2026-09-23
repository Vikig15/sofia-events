# Sofia Events

Personal aggregator of events in Sofia where you can meet people in real life, as an alternative to dating apps.

```bash
npm run ingest              # all sources → data/events.json + health table
node scripts/ingest.js --only luma # a single source
```

Node ≥ 20, no dependencies.

- `src/connectors/`: one file per source, each returns events in the shape documented in `src/lib/event.js`
- `src/sources.js`: registry + per-source health thresholds
- `src/recurring.js`: hand-curated weekly events (organisers that only post on Facebook/Instagram)
- `src/lib/dedupe.js`: merges the same event seen on several sources
- `docs/SOURCES.md`: **start here**: what sources exist, how each is accessed, backlog, roadmap
