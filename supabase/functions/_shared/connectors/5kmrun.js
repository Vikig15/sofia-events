// 5kmrun.bg: free timed 5 km runs every Saturday 09:00 (Bulgaria's parkrun equivalent).
// We read the national list (/5kmrun/events): the Sofia-filtered list (/events/664) omits runs whose
// "Град" (city) field is blank, e.g. Западен парк 2. Rows are kept when the city is София, or the
// city is blank and the place is a known Sofia park. Ids are sequential, so ids missing from the
// list are probed (capped) in case a Sofia run is hidden entirely.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, monthIndex, inferYear, pad } from '../lib/html.js';

const ALL_LIST = 'https://5kmrun.bg/5kmrun/events';
const EVENT = (id) => `https://5kmrun.bg/5kmrun/event/${id}`;
const SOFIA_PLACES = /южен\s*парк|западен\s*парк|северен\s*парк|борисова|лозенец|дружба|витоша|софия/i;
const MAX_PROBES = 6;

export default async function fivekmrun() {
  const rows = parseList(await get(ALL_LIST, { as: 'text' }));
  const out = new Map();
  for (const r of rows) if (isSofia(r.city, r.place)) out.set(r.id, r);

  // Probe ids missing from the list (between its lowest and highest id).
  const listed = new Set(rows.map((r) => r.id));
  const ids = rows.map((r) => Number(r.id));
  const gaps = [];
  for (let id = Math.min(...ids); id <= Math.max(...ids); id++) if (!listed.has(String(id))) gaps.push(id);
  for (const id of gaps.slice(0, MAX_PROBES)) {
    await sleep(500);
    const html = await get(EVENT(id), { as: 'text' }).catch(() => '');
    // "Заявили участие за бягане (26/09/2026 - Западен парк 2)"; other cities end in "(Пловдив)".
    const m = html.match(/бягане \((\d{2})\/(\d{2})\/(\d{4}) - ([^)(]+?)\s*(\([^)]*\))?\)/);
    if (!m || m[3] === '1970' || m[5] || !isSofia('', m[4])) continue;
    out.set(String(id), { id: String(id), date: `${m[3]}-${m[2]}-${m[1]}`, time: '09:00', place: m[4].trim() });
  }

  const now = Date.now();
  return [...out.values()]
    .map((r) => {
      const start = sofiaLocalToIso(`${r.date} ${r.time}`);
      return makeEvent('5kmrun', r.id, {
        title: `5kmrun: ${r.place}${r.name ? ` (${r.name})` : ''}`,
        start,
        end: new Date(Date.parse(start) + 3600_000).toISOString(),
        venue: { name: r.place, address: 'София', lat: null, lon: null },
        url: EVENT(r.id),
        image: r.image ?? null,
        price: { min: 0, currency: null, free: true },
        categories: ['Running', 'Sport', '5K'],
        description: 'Free timed 5 km run every Saturday. Register once on 5kmrun.bg to get a barcode.',
      });
    })
    .filter((e) => Date.parse(e.start) >= now - 2 * 3600_000)
    .sort((a, b) => a.start.localeCompare(b.start));
}

const isSofia = (city, place) =>
  /софия/i.test(city) || (!city && !/\(/.test(place) && SOFIA_PLACES.test(place));

// Each event block ends with its "повече" (more) link; blocks contain nested tables, so split on that.
// <time><strong>26</strong><sup>Септември</sup> ... <h2><a>name</a></h2> ... 9:00ч. ... <strong>Южен Парк</strong>
// ... Град</span></td><td>София</td>
function parseList(html) {
  const rows = [];
  for (const chunk of html.split(/<span>повече<\/span>/)) {
    const id = chunk.match(/5kmrun\/event\/(\d+)/)?.[1];
    const d = chunk.match(/<time>\s*<strong>(\d{1,2})<\/strong>\s*<sup>([^<]+)<\/sup>/);
    if (!id || !d) continue;
    const month = monthIndex(d[2]);
    if (!month) continue;
    const day = Number(d[1]);
    const time = chunk.match(/<strong>\s*(\d{1,2}):(\d{2})ч\.?\s*<\/strong>/);
    const place = textOf(chunk.match(/\d{1,2}:\d{2}ч\.?\s*<\/strong>[\s\S]*?<strong>([^<]+)<\/strong>/)?.[1]);
    const city = textOf(chunk.match(/Град<\/span><\/td>\s*<td>([\s\S]*?)<\/td>/)?.[1]);
    const img = chunk.match(/<div class="preview">[\s\S]*?<img src="([^"]+)"/)?.[1];
    rows.push({
      id,
      date: `${inferYear(month, day)}-${pad(month)}-${pad(day)}`,
      time: time ? `${pad(time[1])}:${time[2]}` : '09:00',
      place: place || '?',
      city,
      name: textOf(chunk.match(/<h2><a[^>]*>([\s\S]*?)<\/a><\/h2>/)?.[1]) || null,
      image: img && !/5kmnew\.png/.test(img) ? img : null,
    });
  }
  return rows;
}
