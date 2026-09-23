// bilet.bg: public Laravel JSON API, no auth. Strong on parties, workshops, theatre.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';

const BASE =
  'https://panel.bilet.bg/api/v1/events?per_page=100&filter[city]=Sofia&include=venue,categories,activePriceCategoriesInfo';

export default async function bilet() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const res = await get(`${BASE}&page=${page}`);
    for (const e of res.data ?? []) {
      if (e.finished) continue;
      const prices = (e.price_categories ?? []).flatMap((c) => c.prices ?? []).map((p) => Number(p.price));
      const min = prices.length ? Math.min(...prices) : null;
      out.push(
        makeEvent('bilet', e.id, {
          title: e.name,
          start: sofiaLocalToIso(e.start_date),
          end: e.end_date ? sofiaLocalToIso(e.end_date) : null,
          venue: e.venue ? { name: e.venue.name, address: e.venue.address, lat: null, lon: null } : null,
          url: `https://bilet.bg/bg/events/${e.slug}`,
          image: e.image,
          price: min === null ? null : { min, currency: 'EUR', free: min === 0 },
          categories: (e.categories ?? []).map((c) => c.name),
          description: e.m_description,
        }),
      );
    }
    if (!res.next_page_url) break;
    await sleep(500);
  }
  return out;
}
