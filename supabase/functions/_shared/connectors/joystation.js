// Joy Station (Studentski grad): concerts, tribute nights, stand-up, bowling-bar events. ~10 upcoming.
// /all-events/ cards have title, link, image, "dd-mm-yyyy" date and a blurb; the start time is only on the
// event page (<div class="event-date"><p>25-09-2026</p><p>21:00</p>), so we fetch each (few pages).
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities } from '../lib/html.js';

const BASE = 'https://www.joystation.bg';
const VENUE = { name: 'Joy Station', address: 'ул. Акад. Стефан Младенов 3, Студентски град, София', lat: null, lon: null };
const DETAIL_CAP = 30;

export default async function joystation() {
  const now = Date.now();
  const html = await get(`${BASE}/all-events/`, { as: 'text' });
  const cards = [];
  for (const item of html.split('<div class="masonry-item').slice(1)) {
    const link = item.match(/class="entry-title[^"]*">\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
    const date = item.match(/fa-calendar-o"><\/i>\s*(\d{2})-(\d{2})-(\d{4})/);
    if (!link || !date) continue;
    cards.push({
      url: decodeEntities(link[1]),
      title: textOf(link[2]),
      date: `${date[3]}-${date[2]}-${date[1]}`,
      image: item.match(/<img class="img-fluid" src="([^"]+)"/)?.[1] ?? null,
      blurb: item.match(/class="entry-content">\s*<p>([\s\S]*?)<\/p>/)?.[1] ?? null,
    });
  }

  const out = [];
  for (const [i, c] of cards.entries()) {
    if (Date.parse(`${c.date}T23:59:59Z`) < now - 86_400_000) continue;
    let time = null;
    let desc = c.blurb;
    if (i < DETAIL_CAP) {
      try {
        const page = await get(c.url, { as: 'text' });
        const block = page.match(/class="event-date">([\s\S]*?)<\/div>/)?.[1] ?? '';
        time = block.match(/<p>\s*(\d{1,2}:\d{2})\s*<\/p>/)?.[1] ?? null;
        desc = page.match(/class="event-date">[\s\S]*?<\/div>([\s\S]*?)<div class="event-price/)?.[1] ?? desc;
      } catch {
        /* keep list data */
      }
      await sleep(400);
    }
    const start = sofiaLocalToIso(`${c.date} ${time ?? '20:00'}`);
    if (Date.parse(start) < now - 3 * 3600_000) continue;
    const slug = c.url.replace(/\/$/, '').split('/').pop();
    out.push(
      makeEvent('joystation', slug, {
        title: c.title.replace(/\s+в Joy Station$/i, ''),
        start,
        venue: VENUE,
        url: c.url,
        image: c.image,
        categories: ['Концерт / шоу'],
        description: desc,
      }),
    );
  }
  return out;
}
