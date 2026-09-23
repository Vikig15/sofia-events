// Toplocentrala (РСЦИ „Топлоцентрала“, arts centre in Lozenets): theatre, dance, talks, concerts.
// Month pages /program/performance/YYYY/MM carry schema.org *microdata* (not JSON-LD):
// <li itemtype="https://schema.org/Event"> with itemprop url / startDate content="2026-10-01T19:00" (Sofia local)
// and a Place with the hall name. Exhibitions (/program/visual) have no startDate, so they're skipped.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const BASE = 'https://toplocentrala.bg';
const MONTHS_AHEAD = 3; // current + next 2
const VENUE = { name: 'Топлоцентрала', address: 'ул. Емил Берсински 5, 1408 София', lat: 42.6798144, lon: 23.3133128 };

export default async function toplocentrala() {
  const now = Date.now();
  const byKey = new Map();
  const d0 = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1));
    const html = await get(`${BASE}/program/performance/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}`, { as: 'text' });
    for (const li of html.split(/<li [^>]*itemtype="https:\/\/schema\.org\/Event"/).slice(1)) {
      const item = li.split('</li>')[0];
      const url = item.match(/href="([^"]+)"\s+itemprop="url"/)?.[1];
      const startLocal = item.match(/itemprop="startDate"\s+content="([^"]+)"/)?.[1];
      if (!url || !startLocal) continue;
      const titleBlock = item.match(/class="program-title[^"]*">([\s\S]*?)<\/div>\s*(?:<div class="program-type|<\/div>)/)?.[1] ?? '';
      const title = textOf(titleBlock.match(/<div>([\s\S]*?)<\/div>/)?.[1] ?? titleBlock);
      if (!title) continue;
      const artist = textOf(titleBlock.match(/class="artist-name">([\s\S]*?)<\/span>/)?.[1] ?? '');
      const type = textOf(item.match(/class="program-type[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? '');
      const hall = textOf(item.match(/itemprop="name">([\s\S]*?)<\/div>/)?.[1] ?? '');
      const start = sofiaLocalToIso(startLocal.replace('T', ' '));
      if (Date.parse(start) < now - 3 * 3600_000) continue;
      const slug = url.replace(/^.*\/program\/performance\//, '').replace(/[?#].*$/, '');
      const key = `${slug}@${startLocal}`;
      byKey.set(
        key,
        makeEvent('toplocentrala', key, {
          title: decodeEntities(title),
          start,
          venue: { ...VENUE, name: hall ? `${VENUE.name}, ${hall}` : VENUE.name },
          url: decodeEntities(url),
          categories: [type].filter((t) => t && t.length < 40),
          description: [artist.replace(/[,.\s]+$/, ''), type].filter(Boolean).join('. ') || null,
        }),
      );
    }
    await sleep(500);
  }
  return [...byKey.values()];
}
