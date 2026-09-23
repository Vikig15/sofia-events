// NDK (National Palace of Culture): concerts, shows, KinoCult/Lumiere cinema, conferences.
// The programme page loads more cards via GET /bg/programa/ajax?page=N -> JSON {html, hasMore, lastDate}.
// Needs X-Requested-With, otherwise it returns the full HTML page. Big NDK shows are also on Eventim/EPAYGO.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities } from '../lib/html.js';

const BASE = 'https://ndk.bg';
const NDK = { name: 'НДК', address: 'пл. България 1, 1463 София', lat: 42.6847, lon: 23.3190 };

export default async function ndk() {
  const now = Date.now();
  const out = new Map();
  for (let page = 1; page <= 15; page++) {
    const res = await get(`${BASE}/bg/programa/ajax?page=${page}&search=&type=&date=`, {
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    });
    for (const card of String(res.html ?? '').split('class="single_incoming_event').slice(1)) {
      const link = card.match(/href="([^"]+)" class="ie_heading">([\s\S]*?)<\/a>/);
      const date = card.match(/class="ie_date">\s*(\d{2})\.(\d{2})\.(\d{4})/);
      if (!link || !date) continue;
      const hour = card.match(/class="ie_hour">\s*(\d{1,2}:\d{2})/)?.[1] ?? '00:00';
      const hall = textOf(card.match(/class="ie_place">([\s\S]*?)<\/span>/)?.[1] ?? '');
      const program = textOf(card.match(/class="ie_general_place">([\s\S]*?)<\/a>/)?.[1] ?? '');
      const start = sofiaLocalToIso(`${date[3]}-${date[2]}-${date[1]} ${hour}`);
      if (Date.parse(start) < now - 3 * 3600_000) continue;
      const url = decodeEntities(link[1]);
      const slug = url.split('/sabitie/')[1] ?? url;
      out.set(
        `${slug}@${start}`,
        makeEvent('ndk', `${slug}@${start.slice(0, 16)}`, {
          title: textOf(link[2]),
          start,
          venue: { ...NDK, name: hall ? `НДК, ${hall}` : NDK.name },
          url,
          image: card.match(/<img src="([^"]+)"/)?.[1] ?? null,
          categories: [program].filter(Boolean),
          description: null,
        }),
      );
    }
    if (!res.hasMore) break;
    await sleep(500);
  }
  return [...out.values()];
}
