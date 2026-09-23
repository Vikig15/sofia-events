// Entase (entase.com): Bulgarian ticketing/culture portal used by Theatre Vazrazhdane, Théatro,
// Carrusel, DECODE (Club PAVE), Kutiata (concerts), Bonini, Viva Arte and touring theatres.
// Two public JSON endpoints its own explore page calls (no auth, form-encoded POST):
//   1. /api/upcoming/productions  citySlug=bg/sofia, skip/limit paging -> productions (~65), each with
//      upcomingEvents[] = {eventID, location} but NO dates.
//   2. /api/embed/getevents        obj=Production:<id> -> events with dateStart "YYYY-MM-DD HH:MM"
//      (local time of location.timezone, Europe/Sofia), price range, capacity/sold stats.
// Productions are Sofia-first but may also tour elsewhere; we keep events whose location is София.
// Kids: `minAgeRestriction` 1-6 (e.g. "Трите прасенца" = 2), or under 12 with a fairy-tale title -> skipped
// ("Страшни приказки" is 18+ stand-up, so the title rule needs the age guard).
// ~1 + 65 requests, 300 ms apart, ~30 s.
import { sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';

const BASE = 'https://www.entase.com';
const HEADERS = {
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
  accept: 'application/json',
};
const KIDS_TITLE = /за деца|детск|приказк(?!и за възрастни)|шапчица|прасенца|джуджета|котаракът|питка|ряпа|мориц|бременските|бибиян/i;
const BUDGET_MS = 75_000;

const form = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

async function api(path, params) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      ...HEADERS,
    },
    body: form(params),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${BASE}${path}`);
  const j = await res.json();
  if (j.status !== 'ok') throw new Error(`entase ${path}: ${j.msg ?? j.status}`);
  return j;
}

export default async function entase() {
  const t0 = Date.now();
  const productions = [];
  for (let skip = 0; skip < 1000; skip += 50) {
    const j = await api('/api/upcoming/productions', { upcoming: 'true', nearest: 'true', citySlug: 'bg/sofia', skip, limit: 50 });
    productions.push(...(j.productions ?? []));
    if ((j.productions ?? []).length < 50) break;
    await sleep(300);
  }

  const out = [];
  const now = Date.now();
  for (const p of productions) {
    if (Date.now() - t0 > BUDGET_MS) {
      console.log(`[entase] time budget hit after ${out.length} events`);
      break;
    }
    const age = Number(p.minAgeRestriction ?? 0);
    if ((age > 0 && age <= 6) || (age < 12 && KIDS_TITLE.test(p.title ?? ''))) continue;
    if (!(p.upcomingEvents ?? []).some((e) => /софия|sofia/i.test(e.location?.cityName ?? ''))) continue;

    await sleep(300);
    let events;
    try {
      events = (await api('/api/embed/getevents', { obj: `Production:${p.id}`, skip: 0, limit: 50 })).events ?? [];
    } catch {
      continue;
    }
    const people = (p.tagRefs ?? []).filter((t) => t.type === 0).map((t) => t.alias).slice(0, 4);
    const photo = p.photos?.poster?.large ?? p.photos?.poster?.medium ?? null;
    for (const e of events) {
      const loc = e.location ?? {};
      if (!e.dateStart || !/софия|sofia/i.test(loc.cityName ?? '')) continue;
      if (loc.timezone && loc.timezone !== 'Europe/Sofia') continue;
      const start = sofiaLocalToIso(e.dateStart);
      if (Date.parse(start) < now - 3 * 3_600_000) continue;
      const end = p.length ? new Date(Date.parse(start) + p.length * 60_000).toISOString() : null;
      const pr = e.priceRange;
      out.push(
        makeEvent('entase', e.id, {
          title: p.title,
          start,
          end,
          venue: {
            name: (loc.placeName ?? '').trim() || null,
            address: [loc.address, loc.cityName].filter(Boolean).join(', ') || null,
            lat: loc.lat ?? null,
            lon: loc.lng ?? null,
          },
          url: `${BASE}${p.url}`,
          image: photo,
          price: e.isFree ? { min: 0, currency: null, free: true } : pr ? { min: pr.min, currency: (e.currency ?? 'eur').toUpperCase(), free: false } : null,
          categories: categorise(p, loc.placeName),
          description: [people.length && `With: ${people.join(', ')}`, age >= 12 && `${age}+`].filter(Boolean).join('\n') || null,
        }),
      );
    }
  }
  return out;
}

function categorise(p, place) {
  const s = `${p.title} ${place} ${p.url}`;
  if (/theat|театър|театр|сцена|theatro|bonini|vivaarte/i.test(s)) return ['Theatre'];
  if (/stand-?up|комеди/i.test(s)) return ['Comedy'];
  if (/club|клуб|pave|carrusel|dj|pres\./i.test(s)) return ['Nightlife', 'Music'];
  if (/expo|изложен|работилн|workshop/i.test(s)) return ['Workshop/Talk'];
  return [];
}
