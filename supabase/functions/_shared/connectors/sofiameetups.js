// sofiameetups.com: monthly international mixers with paper icebreakers (1-3 upcoming at a time).
// The homepage links every event as /events/<slug>; each event page has Event JSON-LD with a
// correct +03:00/+02:00 startDate, venue address and a free-ticket offer.
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';
import { jsonLd, decodeEntities } from '../lib/html.js';

const SITE = 'https://sofiameetups.com';

export default async function sofiameetups() {
  const home = await get(SITE, { as: 'text' });
  const slugs = [...new Set([...home.matchAll(/href="(\/events\/[a-z0-9-]+)"/g)].map((m) => m[1]))];
  const out = [];
  const now = Date.now();
  for (const slug of slugs.slice(0, 20)) {
    await sleep(400);
    let html;
    try {
      html = await get(SITE + slug, { as: 'text' });
    } catch {
      continue;
    }
    for (const e of jsonLd(html)) {
      if (!e.startDate || Date.parse(e.endDate ?? e.startDate) < now) continue;
      if (/Cancelled|Postponed/.test(e.eventStatus ?? '')) continue;
      const loc = e.location ?? {};
      const offer = [].concat(e.offers ?? [])[0];
      const price = offer?.price !== undefined ? Number(offer.price) : null;
      const image = [].concat(e.image ?? [])[0] ?? null;
      out.push(
        makeEvent('sofiameetups', slug.replace('/events/', ''), {
          title: `${decodeEntities(e.name)} (Sofia Meetups)`,
          start: e.startDate,
          end: e.endDate ?? null,
          venue: {
            name: loc.name ?? null,
            address: loc.address?.streetAddress ?? null,
            lat: null,
            lon: null,
          },
          url: e.url ?? SITE + slug,
          image: image ? new URL(image, SITE).href : null,
          price: price === null || Number.isNaN(price) ? null : { min: price, currency: offer.priceCurrency ?? null, free: price === 0 },
          categories: ['Social', 'International mixer', 'Expats'],
          online: /Online/.test(e.eventAttendanceMode ?? ''),
          description: e.description,
        }),
      );
    }
  }
  return out;
}
