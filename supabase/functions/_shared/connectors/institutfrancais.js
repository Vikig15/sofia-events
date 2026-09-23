// Institut français de Bulgarie (Френски институт, pl. Slaveykov 3): talks and debates, film screenings with
// discussion, literary meetings, a monthly French-language board-game night, a readers' club, concerts.
// The homepage calendar (Vue) loads ALL events ever (~470, ~300 KB) in one call:
//   GET /wp-admin/admin-ajax.php?action=calendar_events_posts&lang=bg  (the site POSTs; GET works too)
//   -> [{ id, title, url: "/?post_type=post&p=ID", date: "DD-MM-YYYY", last_date: "DD-MM-YYYY"|false, place }]
// There is no time field (the detail page's add-to-calendar button has startDate only), but titles almost always
// carry it: "... – петък, 12 юни, от 18:00 до 20:00 ч.", "... 16 април, 18:30 ч., зала „Славейков“",
// "... от 18 часа". If the title has no time we look in the detail page text; still nothing -> skipped.
// All times are Sofia local. Multi-day items (series, retrospectives, exhibitions) become one event at the first
// date with `end` = last date, and are dropped once they have started. Online events, events in other towns and
// children's slots ("Час на приказката", "Кино-събота", "за деца") are skipped.
// The programme is published in batches: between seasons (e.g. late summer) there can be 0 upcoming events.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, meta, pad } from '../lib/html.js';

const BASE = 'https://institutfrancais.bg';
const HOME = { name: 'Френски институт', address: 'пл. Славейков 3, 1000 София', lat: 42.6934, lon: 23.3218 };
const DETAIL_CAP = 25;
const KIDS = /за деца|детск|час на приказката|кино-събот|kids|enfants/i;
const ADULTS = /за възрастни/i;
const ELSEWHERE = /онлайн|online|русе|бургас|пловдив|варна|стара загора|велико търново|благоевград|шумен|плевен/i;

const dmyToIso = (s) => {
  const m = String(s || '').match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
};

// First clock time in a text: "18:30 ч.", "от 18:00 до 20:00", "от 18 часа", "19:30, Топлоцентрала".
function findTime(text) {
  const t = String(text ?? '');
  const from = t.match(/(?:(?:^|[\s(,])от|начало(?: в)?:?)\s+([01]?\d|2[0-3])[:.]([0-5]\d)(?![.\d])/i);
  if (from) return `${pad(from[1])}:${from[2]}`;
  // "18.30 ч." is a time, "10.06 - 11.07" is a date range: dots only count when followed by "ч"
  const hm = t.match(/(?:^|[^\d.:])([01]?\d|2[0-3])(?::([0-5]\d)|\.([0-5]\d)(?=\s*ч))/);
  if (hm) return `${pad(hm[1])}:${hm[2] ?? hm[3]}`;
  const h = t.match(/(?:^|[\s(,])от\s+([01]?\d|2[0-3])\s*(?:ч\.|часа)/i);
  return h ? `${pad(h[1])}:00` : null;
}

function venueFor(place) {
  const p = decodeEntities(place ?? '').replace(/\.+$/, '').trim();
  if (!p || /френски институт/i.test(p)) return HOME;
  if (/славейков/i.test(p)) return { ...HOME, name: 'Френски институт, зала „Славейков“' };
  if (/медиатека/i.test(p)) return { ...HOME, name: 'Френски институт, медиатека' };
  return { name: p, address: null, lat: null, lon: null };
}

export default async function institutfrancais(nowMs = Date.now()) {
  const all = await get(`${BASE}/wp-admin/admin-ajax.php?action=calendar_events_posts&lang=bg`, { as: 'json' });
  const todayIso = new Date(nowMs).toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const upcoming = (Array.isArray(all) ? all : [])
    .map((e) => ({ ...e, title: decodeEntities(e.title).replace(/\s+/g, ' ').trim(), from: dmyToIso(e.date), to: dmyToIso(e.last_date) }))
    .filter((e) => e.from && e.from >= todayIso)
    .filter((e) => !ELSEWHERE.test(`${e.title} ${e.place ?? ''}`))
    .filter((e) => !KIDS.test(e.title) || ADULTS.test(e.title))
    .sort((a, b) => a.from.localeCompare(b.from));

  const out = [];
  let details = 0;
  for (const e of upcoming) {
    let time = findTime(e.title);
    let url = decodeEntities(e.url);
    let description = null;
    let image = null;
    if (details < DETAIL_CAP) {
      details++;
      await sleep(400);
      try {
        const html = await get(url, { as: 'text', retries: 1 });
        url = meta(html, 'og:url') || url;
        image = meta(html, 'og:image');
        const body = textOf(html.match(/<article class="single__article[^>]*>([\s\S]*?)<\/article>/)?.[1] ?? '');
        description = body || meta(html, 'og:description');
        if (KIDS.test(description?.slice(0, 300) ?? '') && !ADULTS.test(description ?? '')) continue;
        time ??= findTime(body.slice(0, 1500));
      } catch {
        /* keep the list data */
      }
    }
    if (!time) continue; // never invent a midnight
    const start = sofiaLocalToIso(`${e.from} ${time}`);
    if (Date.parse(start) < nowMs - 3 * 3600_000) continue;
    const multi = e.to && e.to > e.from;
    out.push(
      makeEvent('institutfrancais', String(e.id), {
        title: e.title,
        start,
        end: multi ? sofiaLocalToIso(`${e.to} ${time}`) : null,
        venue: venueFor(e.place),
        url,
        image,
        categories: ['Френски институт', multi ? 'series' : null].filter(Boolean),
        description,
      }),
    );
  }
  return out;
}
