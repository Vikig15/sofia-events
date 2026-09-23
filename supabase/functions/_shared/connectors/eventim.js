// eventim.bg: the JSON search API its own site uses. Largest catalogue (Arena 8888, NDK, Sofia Live Club...).
// NOTE: public-api.eventim.com robots.txt disallows non-Google bots. Keep to one run per day.
//
// Quirks (verified 2026-09-23): `page` is ignored (always page 1), `top` max is 50, and a short
// User-Agent gets an Akamai HTML block. So we walk date windows and split any window that hits 50.
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const BASE =
  'https://public-api.eventim.com/websearch/search/api/exploration/v1/products?webId=web__eventim-bgr&language=bg&city_ids=7510&top=50&sort=DateAsc';
const CAP = 50;
// Akamai fingerprints the client: from Deno (Supabase Edge) a bare request gets 403, but the same
// headers the eventim.bg page sends get 200. Verified 2026-09-23.
const HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'bg-BG,bg;q=0.9,en;q=0.8',
  origin: 'https://www.eventim.bg',
  referer: 'https://www.eventim.bg/',
  'sec-fetch-site': 'cross-site',
  'sec-fetch-mode': 'cors',
  'sec-fetch-dest': 'empty',
};
const DAY = 86_400_000;
const ymd = (d) => d.toISOString().slice(0, 10);

export default async function eventim({ days = 90 } = {}) {
  const products = new Map();
  const queue = [];
  for (let t = Date.now(); t < Date.now() + days * DAY; t += 14 * DAY) queue.push([t, Math.min(t + 13 * DAY, Date.now() + days * DAY)]);

  while (queue.length) {
    const [from, to] = queue.shift();
    const res = await get(`${BASE}&date_from=${ymd(new Date(from))}&date_to=${ymd(new Date(to))}`, { headers: HEADERS });
    const got = res.products ?? [];
    if (got.length >= CAP && to - from >= DAY) {
      const mid = from + Math.floor((to - from) / DAY / 2) * DAY;
      queue.unshift([from, mid], [mid + DAY, to]);
    } else {
      // A single day with >50 shows would be truncated here; hasn't happened in Sofia so far.
      for (const p of got) products.set(p.productId, p);
    }
    await sleep(600);
  }

  return [...products.values()]
    .filter((p) => p.typeAttributes?.liveEntertainment?.startDate)
    .map((p) => {
      const le = p.typeAttributes.liveEntertainment;
      const loc = le.location ?? {};
      return makeEvent('eventim', p.productId, {
        title: p.name,
        start: le.startDate,
        venue: {
          name: loc.name ?? null,
          address: loc.city ?? null,
          lat: loc.geoLocation?.latitude ?? null,
          lon: loc.geoLocation?.longitude ?? null,
        },
        url: p.link,
        image: p.imageUrl,
        categories: (p.categories ?? []).map((c) => c.name),
      });
    });
}
