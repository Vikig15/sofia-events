// Go Sofia (go-sofia.com): a Sofia listings site whose venue pages embed schema.org Place JSON-LD
// with an `event` array. robots.txt allows /venues/* (it only blocks paged/filtered /Events queries),
// so we read the bar/club venue pages. Some events have a date but no time; those default to 21:00.
// The site lists bilingual copies of the same show (BG + EN title, same ticket link): keep one.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd } from '../lib/html.js';

const BASE = 'https://www.go-sofia.com/venues/';

// Bar/club venue slugs from https://www.go-sofia.com/sitemap.xml (Mixtape 5 is covered by its own iCal feed).
const VENUES = [
  'carrusel', 'club-asylum', 'club-dom', 'clwd', 'botanico', 'fomo', 'gravity-bar', 'keba', 'kicks',
  'live-and-loud', 'the-steps', 'yalta', 'bar-petak', 'klub-gramofon', 'oblk', 'klub-pave', 'pri-cherepite',
  'klub-stroezha', 'malkata-tekila', 'chistilishteto', 'studio-orfey', '3oz', 'art-bar-158', 'bar-gatto',
  'bar-singles', 'bar-soda', 'barter', 'bunker-club', 'cest-la-vie', 'club-1857', 'grindhouse',
  'gurko-rooftop', 'lete', 'missia-23', 'oscar-club', 'paradise', 'sinatra', 'rocknrolla', 'rooftop59',
  'soho', 'unica', 'la-boheme', 'bobina',
];

const LIVE = /pave|паве|stroezha|строежа|live-and-loud|cherepite|черепите|malkata|tekila/i;

function startOf(sd) {
  if (!sd) return null;
  if (/T\d{2}:\d{2}/.test(sd)) return sd; // already has an offset
  return sofiaLocalToIso(`${sd.slice(0, 10)} 21:00`);
}

export default async function gosofiaNightlife() {
  const out = new Map();
  const seenOffers = new Set();
  const now = Date.now();
  for (const slug of VENUES) {
    let html;
    try {
      html = await get(BASE + slug, { as: 'text', retries: 1 });
    } catch {
      continue; // a single venue page failing shouldn't kill the source
    }
    const places = jsonLd(html, ['Place']).filter((p) => Array.isArray(p.event) || p.event);
    for (const place of places) {
      const addr = place.address?.streetAddress ?? null;
      for (const e of [].concat(place.event ?? [])) {
        const id = String(e.url ?? '').match(/Details\/(\d+)/)?.[1];
        const start = startOf(e.startDate);
        if (!id || !start || out.has(id)) continue;
        if (new Date(start).getTime() < now - 3 * 3_600_000) continue;
        const offer = e.offers?.url;
        const dupKey = offer ? `${offer}|${start}` : null;
        if (dupKey && seenOffers.has(dupKey)) continue;
        if (dupKey) seenOffers.add(dupKey);
        const cats = ['Nightlife', /bar|бар/i.test(`${slug} ${place.name}`) ? 'Bar' : 'Club'];
        if (LIVE.test(slug)) cats.push('Live music');
        if (/party|парти|disco|диско|\bdj\b|rave|techno|house/i.test(e.name)) cats.push('Party');
        if (/stand-?up|стендъп|комеди/i.test(`${e.name} ${e.description ?? ''}`)) cats.push('Comedy');
        out.set(
          id,
          makeEvent('gosofia', id, {
            title: e.name,
            start,
            end: e.endDate ? startOf(e.endDate) : null,
            venue: { name: place.name, address: addr, lat: null, lon: null },
            url: e.url,
            image: e.image ?? null,
            categories: cats,
            description: [e.description, offer && `Tickets: ${offer}`].filter(Boolean).join('\n') || null,
          }),
        );
      }
    }
    await sleep(350);
  }
  return [...out.values()];
}
