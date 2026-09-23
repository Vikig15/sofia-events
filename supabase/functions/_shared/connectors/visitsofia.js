// visitsofia.bg: Sofia Municipality's official calendar (Joomla JEvents). Free culture, municipal
// "Столична програма Култура", exhibitions, festivals, business expos, concerts.
//
// Week list pages carry title, date range, category, image and description but no time or venue, so we
// fetch the detail page (time, venue, address) for the events we keep, within a time budget: the site is
// slow (1.5-3.5s per page), so typically only 25-40 details fit. Events without a detail page and without a
// time in the blurb get 00:00 Sofia time (= "time unknown"). iCal export is 403.
// The BG list also contains English-language duplicates (category "Exhibitions", "Business Events"...):
// those are skipped.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, pad } from '../lib/html.js';

const BASE = 'https://www.visitsofia.bg';
const WEEKS = 6;
const DETAIL_CAP = 90;
const TIME_BUDGET_MS = 65_000; // detail pages take 1-3s each server-side; stop fetching them after this
const DAY = 86_400_000;
const LONG_RUN_DAYS = 31; // runs longer than this are only kept if they open in the future (openings are social)

const sofiaToday = () => new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
const dmy = (s) => {
  const m = String(s).match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// "от 19:00 ч.", "Начало: 18.30 ч.", "19:00h" in the list blurb (used when the detail page wasn't fetched)
function timeFromText(html) {
  const m = textOf(html ?? '').match(/(?:от|начало:?|start:?|at)?\s*([01]?\d|2[0-3])[:.]([0-5]\d)\s*(?:ч|h)/i);
  return m ? `${pad(m[1])}:${m[2]}` : null;
}

function parseWeek(html) {
  const out = [];
  for (const row of html.split('class="jev_list_row"').slice(1)) {
    const link = row.match(/<h3 class="jev_list_title">\s*<a href="([^"]*icalrepeat\.detail\/(\d{4})\/(\d{2})\/(\d{2})\/(\d+)\/[^"]*)">([\s\S]*?)<\/a>/);
    if (!link) continue;
    const span = row.match(/jev_list_img[\s\S]*?<span>([^<]*)<\/span>/)?.[1] ?? '';
    const [from, to] = span.split(' - ').map(dmy);
    const category = textOf(row.match(/jev_list_catname[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? '');
    out.push({
      rp: link[5],
      path: decodeEntities(link[1]),
      title: textOf(link[6]),
      from: from ?? `${link[2]}-${link[3]}-${link[4]}`,
      to: to ?? from ?? null,
      category,
      image: row.match(/data-src="([^"]+)"/)?.[1] ?? null,
      desc: row.match(/<div class="jev_list_desc">([\s\S]*?)<\/div>/)?.[1] ?? null,
    });
  }
  return out;
}

async function detail(path) {
  const html = await get(`${BASE}${encodeURI(path)}&tmpl=component`, { as: 'text' });
  const p = (cls) => textOf(html.match(new RegExp(`class="${cls}">[\\s\\S]*?<p>([\\s\\S]*?)<\\/p>`))?.[1] ?? '') || null;
  const when = p('infodate'); // "понеделник 28 септември 2026 19:00" or "... 2026 - ..."
  const time = when?.match(/\d{4}\s+(\d{1,2}:\d{2})/)?.[1] ?? null;
  const dm = when?.match(/(\d{1,2})\s+([а-я]+)\s+(\d{4})/i);
  const date = dm && monthIndex(dm[2]) ? `${dm[3]}-${pad(monthIndex(dm[2]))}-${pad(dm[1])}` : null;
  const locBlock = html.match(/tabs__content-item tabs-features">\s*(?!<div id="jevents-details-gallery")([\s\S]*?)<div id="gmap"/)?.[1];
  const venueName = locBlock ? textOf(locBlock.split(/<br\s*\/?>/i)[0]) : null;
  const lat = Number(html.match(/latitude:\s*'(-?\d+\.\d+)'/)?.[1]);
  const lon = Number(html.match(/longitude:\s*'(-?\d+\.\d+)'/)?.[1]);
  const okPin = lat > 42.5 && lat < 42.9 && lon > 23.0 && lon < 23.6;
  return {
    time: time === '00:00' ? null : time,
    date,
    city: p('infoplace'),
    address: p('infolocation'),
    venueName: venueName && venueName.length < 120 ? venueName : null,
    lat: okPin ? lat : null,
    lon: okPin ? lon : null,
    desc: html.match(/<div class="jevents_text_container">([\s\S]*?)<\/div>/)?.[1] ?? null,
  };
}

export default async function visitsofia() {
  const t0 = Date.now();
  const today = sofiaToday();
  const byRp = new Map();
  let pagesOk = 0;
  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(Date.parse(`${today}T12:00:00Z`) + w * 7 * DAY);
    const url = `${BASE}/bg/component/jevents/week.listevents/${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/-?Itemid=330&tmpl=component`;
    try {
      for (const e of parseWeek(await get(url, { as: 'text' }))) if (!byRp.has(e.rp)) byRp.set(e.rp, e);
      pagesOk++;
    } catch (err) {
      console.warn(`  visitsofia: week ${w} failed: ${err.message}`);
    }
    await sleep(600);
  }
  if (!pagesOk) throw new Error('visitsofia: all week pages failed');

  const keep = [...byRp.values()].filter((e) => {
    if (!/[а-я]/i.test(e.category)) return false; // English duplicate of a BG entry
    const end = e.to ?? e.from;
    if (end < today) return false;
    const runDays = (Date.parse(end) - Date.parse(e.from)) / DAY;
    return e.from >= today || runDays <= LONG_RUN_DAYS;
  });

  // Same event listed twice (e.g. re-posted) -> keep the first rp per title+start.
  const seen = new Set();
  const unique = keep.filter((e) => {
    const k = `${e.title.toLowerCase()}|${e.from}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // Detail pages: soonest first, and those whose blurb has no start time before those that do.
  unique.sort((a, b) => (a.from < b.from ? -1 : 1));
  // Single-day events first (a time matters more for a concert than for a month-long exhibition).
  const rank = (e) => (timeFromText(e.desc) ? 2 : 0) + (e.to && e.to !== e.from ? 1 : 0);
  const queue = [...unique].sort((a, b) => rank(a) - rank(b) || (a.from < b.from ? -1 : 1));
  const details = new Map();
  for (const e of queue.slice(0, DETAIL_CAP)) {
    if (Date.now() - t0 > TIME_BUDGET_MS) break;
    try {
      details.set(e.rp, await detail(e.path));
    } catch {
      /* list data is still usable */
    }
    await sleep(300);
  }

  const out = [];
  for (const e of unique) {
    const d = details.get(e.rp);
    if (d?.city && !/софи|sofia/i.test(d.city)) continue; // a few regional entries exist
    const date = e.from;
    const multiDay = e.to && e.to !== e.from;
    out.push(
      makeEvent('visitsofia', e.rp, {
        title: decodeEntities(e.title),
        start: sofiaLocalToIso(`${date} ${d?.time ?? timeFromText(e.desc) ?? '00:00'}`),
        end: multiDay ? sofiaLocalToIso(`${e.to} 23:59`) : null,
        venue: d?.venueName || d?.address ? { name: d.venueName ?? null, address: d.address ?? null, lat: d.lat, lon: d.lon } : null,
        url: `${BASE}${encodeURI(e.path)}`,
        image: e.image,
        categories: [e.category].filter(Boolean),
        description: d?.desc ?? e.desc,
      }),
    );
  }
  return out;
}
