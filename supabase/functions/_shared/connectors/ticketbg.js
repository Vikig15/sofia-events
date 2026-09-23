// ticket.bg: theatre tours, stand-up, musicals, concerts (~40 productions, many touring the country).
// sitemap.xml lists every production page (/bilet/<slug>). Each page's JSON-LD Product has one Offer per
// performance but no city, so instead we read the Next.js flight payload (self.__next_f), which embeds every
// performance as {"id":1078,...,"venue_name":"...","starts":"2026-09-26 19:30:00" (Sofia local),
// "lat","lng",...,"city_slug":"sofia","min_price":"13.00",...,"name":"..."} and keep city_slug === "sofia".
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd, meta, decodeEntities } from '../lib/html.js';

const BASE = 'https://ticket.bg';
const PAGE_CAP = 70;

// The flight payload is a JS string literal: undo \" and \uXXXX escaping.
const unescapeFlight = (s) =>
  s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\"/g, '"').replace(/\\\\/g, '\\');

function performances(html) {
  const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,"([\s\S]*?)"\]\)<\/script>/g)].map((m) => unescapeFlight(m[1])).join('');
  const out = new Map();
  for (const m of flight.matchAll(/\{"id":(\d+),"schema_id":/g)) {
    const chunk = flight.slice(m.index, m.index + 1500).split('"selling_brand"')[0];
    const f = (k) => chunk.match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)"`))?.[1] ?? null;
    const starts = f('starts');
    if (!starts || out.has(m[1])) continue;
    out.set(m[1], {
      id: m[1],
      venue: f('venue_name'),
      starts,
      ends: f('ends'),
      lat: Number(f('lat')) || null,
      lon: Number(f('lng')) || null,
      city: f('city'),
      citySlug: f('city_slug'),
      minPrice: f('min_price'),
      name: f('name'),
    });
  }
  return [...out.values()];
}

export default async function ticketbg() {
  const now = Date.now();
  const sitemap = await get(`${BASE}/sitemap.xml`, { as: 'text' });
  const slugs = [...new Set([...sitemap.matchAll(/<loc>https:\/\/ticket\.bg\/bilet\/([^<\s]+)<\/loc>/g)].map((m) => m[1]))];
  if (!slugs.length) throw new Error('ticketbg: no /bilet/ URLs in sitemap');

  const out = new Map();
  for (const slug of slugs.slice(0, PAGE_CAP)) {
    let html;
    try {
      html = await get(`${BASE}/bilet/${slug}`, { as: 'text' });
    } catch {
      continue;
    }
    const product = jsonLd(html, ['Product'])[0];
    const title = decodeEntities(product?.name ?? meta(html, 'og:title') ?? slug);
    const image = [].concat(product?.image ?? [])[0] ?? meta(html, 'og:image');
    const category = product?.category ?? null;
    for (const p of performances(html)) {
      if (p.citySlug !== 'sofia' && !/софия/i.test(p.city ?? '')) continue;
      const start = sofiaLocalToIso(p.starts);
      if (Date.parse(start) < now - 3 * 3600_000) continue;
      const min = p.minPrice != null ? Number(p.minPrice) : null;
      out.set(
        p.id,
        makeEvent('ticketbg', p.id, {
          title: p.name ? decodeEntities(p.name) : title,
          start,
          end: p.ends ? sofiaLocalToIso(p.ends) : null,
          venue: { name: p.venue, address: 'София', lat: p.lat, lon: p.lon },
          url: `${BASE}/bilet/${slug}`,
          image,
          price: Number.isFinite(min) ? { min, currency: 'EUR', free: min === 0 } : null,
          categories: [category].filter(Boolean),
          description: product?.description ?? null,
        }),
      );
    }
    await sleep(450);
  }
  return [...out.values()];
}
