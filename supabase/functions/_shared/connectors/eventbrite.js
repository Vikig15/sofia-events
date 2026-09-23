// Eventbrite Sofia: the /d/ discovery pages embed `window.__SERVER_DATA__` with the search results
// (local start_date + start_time + timezone, venue with lat/lon, tags). The JSON-LD ItemList on the
// same page only has dates without times, so it's not used for data. /d/ pages are allowed by robots.txt.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd } from '../lib/html.js';

const BASE = 'https://www.eventbrite.com/d/bulgaria--sofia';
// all-events first. Of ~20 category/keyword slugs tried on 2026-09-23 only performing-arts added
// events (4); free/business/tech/keyword pages were subsets. Keep requests low: Eventbrite returns
// HTTP 429 after ~30 rapid /d/ requests.
const SLUGS = ['all-events', 'performing-arts--events'];
const MAX_PAGES = 5;
const CENTER = { lat: 42.6977, lon: 23.3219 };

export default async function eventbrite() {
  const byId = new Map();
  for (const slug of SLUGS) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      let html;
      try {
        html = await get(`${BASE}/${slug}/?page=${page}`, { as: 'text' });
      } catch (err) {
        if (slug === 'all-events' && page === 1) throw err; // main list failing = real outage
        break;
      }
      const data = serverData(html);
      const events = data?.search_data?.events;
      const results = events?.results ?? [];
      for (const r of results) if (!byId.has(r.id)) byId.set(r.id, fromServer(r));
      if (!data && jsonLd(html).length) {
        // JSON-LD only has dates (no times); rather than emit midnight starts, fail loudly.
        throw new Error('eventbrite: __SERVER_DATA__ missing (page layout changed), JSON-LD has no times');
      }
      const pageCount = events?.pagination?.page_count ?? 1;
      await sleep(600);
      if (page >= pageCount) break;
    }
  }
  const now = Date.now();
  return [...byId.values()].filter((e) => e && !e.online && Date.parse(e.end ?? e.start) >= now);
}

function fromServer(r) {
  if (r.is_cancelled) return null;
  const v = r.primary_venue ?? {};
  const a = v.address ?? {};
  const lat = num(a.latitude);
  const lon = num(a.longitude);
  if (!inSofia(a.city, lat, lon)) return null;
  const tz = r.timezone ?? 'Europe/Sofia';
  if (tz !== 'Europe/Sofia') return null;
  const start = sofiaLocalToIso(`${r.start_date} ${r.start_time ?? '00:00'}`);
  const end = r.end_date ? sofiaLocalToIso(`${r.end_date} ${r.end_time ?? '23:59'}`) : null;
  const tags = r.tags ?? [];
  return makeEvent('eventbrite', r.id, {
    title: r.name,
    start,
    end,
    venue: {
      name: v.name ?? null,
      address: a.localized_address_display ?? a.address_1 ?? null,
      lat,
      lon,
    },
    url: cleanUrl(r.url),
    image: r.image?.url ?? null,
    categories: tags
      .filter((t) => /^Eventbrite(Category|SubCategory|Format)$/.test(t.prefix))
      .map((t) => t.display_name),
    online: !!r.is_online_event,
    description: r.summary,
  });
}

function serverData(html) {
  const i = html.indexOf('window.__SERVER_DATA__');
  if (i < 0) return null;
  const json = balanced(html, html.indexOf('{', i));
  try {
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// Returns the JSON object/array starting at index i (string-aware brace matching).
function balanced(s, i) {
  if (i < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) return s.slice(i, k + 1);
    }
  }
  return null;
}

// Eventbrite links point at eventbrite.be / .co.uk etc. depending on the organiser; normalise.
const cleanUrl = (u) => String(u ?? '').replace(/^https:\/\/www\.eventbrite\.[a-z.]+\//, 'https://www.eventbrite.com/').split('?')[0];

const num = (x) => (x === undefined || x === null || x === '' ? null : Number(x));

function inSofia(city, lat, lon) {
  if (lat !== null && lon !== null && !Number.isNaN(lat)) return km(lat, lon, CENTER.lat, CENTER.lon) <= 25;
  return /sofia|софия/i.test(city ?? '');
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
