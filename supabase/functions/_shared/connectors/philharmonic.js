// Sofia Philharmonic / Bulgaria Hall complex (sofiaphilharmonic.com): symphonic, chamber, jazz, kids concerts.
// The Next.js programme page is SSR and takes ?month=YYYY-MM. Each <article> row has
// <time dateTime="2026-10-01T19:00:00.000Z"> which is actually Sofia *local* time mislabelled as Z
// (the row also shows "19:00"), so we rebuild the instant from date + displayed time.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const BASE = 'https://sofiaphilharmonic.com';
const MONTHS_AHEAD = 3;

export default async function philharmonic() {
  const now = Date.now();
  const out = new Map();
  const d0 = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1));
    const html = await get(`${BASE}/programa?month=${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`, { as: 'text' });
    for (const art of html.split('<article').slice(1)) {
      const a = art.split('</article>')[0];
      const date = a.match(/dateTime="(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      const link = a.match(/<h2><a href="([^"]+)">([\s\S]*?)<\/a><\/h2>/);
      if (!date || !link) continue;
      const facts = [...(a.match(/eventFacts">([\s\S]*?)<\/div>/)?.[1] ?? '').matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
      const time = facts.find((f) => /^\d{1,2}:\d{2}$/.test(f)) ?? date[2];
      const hall = facts.find((f) => !/^\d{1,2}:\d{2}$/.test(f)) ?? null;
      const start = sofiaLocalToIso(`${date[1]} ${time}`);
      if (Date.parse(start) < now - 3 * 3600_000) continue;
      const type = textOf(a.match(/eventType">([\s\S]*?)<\/p>/)?.[1] ?? '');
      const ensemble = textOf(a.match(/eventEnsemble">([\s\S]*?)<\/p>/)?.[1] ?? '');
      const img = a.match(/src="\/_next\/image\?url=([^&"]+)/)?.[1];
      const path = decodeEntities(link[1]);
      out.set(
        `${path}@${start}`,
        makeEvent('philharmonic', `${decodeURIComponent(path).replace(/^\/sabitia\//, '')}@${date[1]}T${time}`, {
          title: textOf(link[2]).replace(/^SOLD OUT:\s*/i, ''),
          start,
          venue: { name: hall ?? 'Зала „България“', address: !hall || /България|Камерна|Студио/.test(hall) ? 'ул. Аксаков 1, София' : null, lat: null, lon: null },
          url: `${BASE}${path}`,
          image: img ? decodeURIComponent(img) : null,
          categories: [type].filter(Boolean),
          description: ensemble || null,
        }),
      );
    }
    await sleep(600);
  }
  return [...out.values()];
}
