// Allevents.in Sofia: catch-all aggregator, largely events that originate on Facebook.
// 1) The /sofia/all list is paginated (?page=N; <link rel="next"> stops at 10 but pages go on: 17 x 45
//    on 2026-09-23 = ~740 events up to mid-2027, vs 45 on page 1), and category pages
//    (/sofia/<category>) add a few more. They embed `events_data = [...]` with start/end times, venue and
//    lat/lon, so most events need no detail fetch. CAUTION: their unix `start_time` is Sofia
//    wall-clock time encoded as if it were UTC (Deep Purple 18:00 local -> 18:00Z), so we re-read it
//    as Sofia local time.
// 2) The RSS feed (/sofia/RSS, ~95 items, no dates) adds events missing from those pages; for those
//    we fetch the event page and read its JSON-LD (correct ISO offset), one per second (robots.txt
//    asks for a crawl delay) until the time budget runs out.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd, decodeEntities } from '../lib/html.js';

const BASE = 'https://allevents.in/sofia';
const MAX_ALL_PAGES = 25;
// Page 1 of each category. The first 15 were in use before pagination was found (they are mostly
// subsets of the paginated "all" list now, but still tag events); the rest each added 2-5 events not
// on any "all" page on 2026-09-23. Tried, no unique events: music, concerts, performances,
// performing-arts, live-music, fashion, this-weekend, today, tomorrow, free (-> free-events), film
// (-> acting); empty: literary-art, fine-arts, networking, volunteering. 'kids' is deliberately skipped.
const CATEGORIES = [
  'meetups', 'workshops', 'health-wellness', 'sports', 'business', 'art', 'dance', 'festivals',
  'theatre', 'food-drinks', 'entertainment', 'comedy', 'parties', 'exhibitions', 'fitness',
  'yoga', 'running', 'hiking', 'photography', 'books', 'language', 'cooking', 'crafts', 'gaming',
];
const BUDGET_MS = 80_000; // whole connector, keeps us under the 90 s limit
const LIST_BUDGET_MS = 60_000; // list/category pages; the rest is for RSS-only detail pages
const MAX_DETAILS = 80;
const MAX_SPAN_DAYS = 31; // skip "vouchers" / season-long listings
const CENTER = { lat: 42.6977, lon: 23.3219 };

export default async function allevents() {
  const t0 = Date.now();
  const byId = new Map();

  const add = (html, cat) => {
    const events = embeddedEvents(html);
    for (const e of events) {
      if (!byId.has(e.event_id)) byId.set(e.event_id, fromEmbedded(e, cat));
      else if (byId.get(e.event_id)) byId.get(e.event_id).categories.push(cat);
    }
    return events.length;
  };

  for (let page = 1; page <= MAX_ALL_PAGES; page++) {
    const html = await get(`${BASE}/all${page > 1 ? `?page=${page}` : ''}`, { as: 'text' }).catch((err) => {
      if (page === 1) throw err;
      return '';
    });
    const before = byId.size;
    const n = add(html, 'all');
    await sleep(1000);
    // No rel=next check on purpose (it's missing from page 10 on); stop at an empty/repeating page.
    if (!n || byId.size === before || Date.now() - t0 > LIST_BUDGET_MS * 0.6) break;
  }

  for (const cat of CATEGORIES) {
    if (Date.now() - t0 > LIST_BUDGET_MS) break;
    try {
      add(await get(`${BASE}/${cat}`, { as: 'text' }), cat);
    } catch {
      continue;
    }
    await sleep(1000);
  }

  // RSS items not seen on any category page -> detail page JSON-LD.
  let rssMissing = [];
  try {
    const rss = await get(`${BASE}/RSS`, { as: 'text' });
    const links = [...rss.matchAll(/<link><!\[CDATA\[([^\]]+)\]\]><\/link>/g)].map((m) => m[1].trim());
    rssMissing = links.filter((u) => {
      const id = u.match(/\/(\d{6,})\/?$/)?.[1];
      return id && !byId.has(id);
    });
  } catch {
    /* category pages alone are still fine */
  }
  let fetched = 0;
  for (const url of rssMissing.slice(0, MAX_DETAILS)) {
    if (Date.now() - t0 > BUDGET_MS) break;
    await sleep(1000);
    const id = url.match(/\/(\d{6,})\/?$/)[1];
    try {
      const html = await get(url, { as: 'text' });
      fetched++;
      const ld = jsonLd(html).find((e) => e.startDate);
      byId.set(id, ld ? fromJsonLd(id, ld, url) : null);
    } catch {
      /* skip */
    }
  }
  if (rssMissing.length > fetched) {
    console.log(`[allevents] ${rssMissing.length - fetched} RSS-only events not fetched (time budget)`);
  }

  const now = Date.now();
  return [...byId.values()].filter(
    (e) =>
      e &&
      !e.online &&
      !isKids(e.title) &&
      Date.parse(e.end ?? e.start) >= now &&
      (!e.end || Date.parse(e.end) - Date.parse(e.start) <= MAX_SPAN_DAYS * 86_400_000),
  );
}

// Kids-only events. Title-based: allevents' own 'kids' category also tags "90's kids" parties and runs.
const KIDS = /за деца|за най-малките|детск[аио]? (театър|представлени|работилниц|парти|празни|шоу|спектакъл|концерт|лагер|кино|програм)|детски театър|куклен|бебе|малчугани|\b(for|with) (kids|children)\b|\bkids'? (workshop|class|party|camp|club|theat)|\bchildren'?s (workshop|theat|class)|\b[0-9]\+|\b[0-9]-1[0-2] (г|год|years)/i;
const ADULT_OVERRIDE = /за възрастни|деца и възрастни|18\+|adults/i;
const isKids = (title) => KIDS.test(title) && !ADULT_OVERRIDE.test(title);

function embeddedEvents(html) {
  const out = [];
  for (const m of html.matchAll(/events_data\s*=\s*\[/g)) {
    const json = balanced(html, m.index + m[0].length - 1);
    try {
      out.push(...JSON.parse(json));
    } catch {
      /* ignore */
    }
  }
  return out;
}

function fromEmbedded(e, cat) {
  const v = e.venue ?? {};
  const lat = num(v.latitude);
  const lon = num(v.longitude);
  if (!inSofia(v.city, lat, lon)) return null;
  if (/online|онлайн/i.test(`${e.location ?? ''}`) && !lat) return null;
  const start = wallClock(e.start_time);
  if (!start) return null;
  const endLocal = wallClock(e.end_time);
  return makeEvent('allevents', e.event_id, {
    title: decodeEntities(e.eventname_raw ?? e.eventname),
    start,
    end: endLocal && endLocal !== start ? endLocal : null,
    venue: {
      name: decodeEntities(e.location ?? '') || null,
      address: decodeEntities(v.full_address ?? v.street ?? '') || null,
      lat,
      lon,
    },
    url: e.event_url,
    image: e.banner_url ?? e.thumb_url ?? null,
    categories: [...new Set([...(e.categories ?? []), ...(e.custom_params?.x_interest ?? []), cat])],
    attendees: e.custom_params?.total_interested_count ?? null, // "interested", not "going"
    description: e.short_description,
  });
}

function fromJsonLd(id, e, url) {
  const loc = [].concat(e.location ?? [])[0] ?? {};
  const lat = num(loc.geo?.latitude);
  const lon = num(loc.geo?.longitude);
  if (/Online/.test(e.eventAttendanceMode ?? '') && !lat) return null;
  if (!inSofia(loc.address?.addressLocality, lat, lon)) return null;
  // Date-only startDate would be midnight; skip rather than invent a time.
  if (!/T\d{2}:\d{2}/.test(e.startDate)) return null;
  return makeEvent('allevents', id, {
    title: decodeEntities(e.name),
    start: e.startDate,
    end: e.endDate && e.endDate !== e.startDate && /T\d{2}:\d{2}/.test(e.endDate) ? e.endDate : null,
    venue: {
      name: decodeEntities(loc.name ?? '') || null,
      address: decodeEntities(loc.address?.streetAddress ?? '') || null,
      lat,
      lon,
    },
    url: e.url ?? url,
    image: [].concat(e.image ?? [])[0] ?? null,
    categories: [e['@type']].filter(Boolean),
    description: e.description,
  });
}

// Allevents' unix seconds are Sofia wall-clock time pretending to be UTC.
function wallClock(unix) {
  const n = Number(unix);
  if (!n) return null;
  const local = new Date(n * 1000).toISOString().slice(0, 16).replace('T', ' ');
  return sofiaLocalToIso(local);
}

function balanced(s, i) {
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

const num = (x) => (x === undefined || x === null || x === '' ? null : Number(x));

function inSofia(city, lat, lon) {
  if (lat && lon && !Number.isNaN(lat)) return km(lat, lon, CENTER.lat, CENTER.lon) <= 25;
  return /sofia|софия/i.test(city ?? '');
}

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
