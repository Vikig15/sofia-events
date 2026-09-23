// Comedy Club Sofia (Комеди Клуб, ul. Malko Tarnovo 2; Ivan Kirkov's stand-up club, also at thecomedyclub.bg):
// stand-up shows most nights, a free Tuesday open mic, and big "Comedy Fest" nights at NDK.
// Not on Facebook-only after all: https://comedyclub.bg/program/ is a WordPress page with one table per city,
// each under an <h2> "Програма на Комеди Клуб София ..." / "... Пловдив ...". We only read tables under a
// heading that mentions София. Rows: [date cell, show cell, place cell]:
//   "<strong>24 септември,</strong><br>четвъртък,<br><strong>19:30 часа<br>21:30 часа</strong>" | show | place
// Dates have no year (inferYear). Several times in one row ("19:30 или 21:30") = separate shows, one event each.
// The page only covers ~1-2 weeks ahead; reservations are by phone/online form, tickets 15/17 EUR at the door.
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, inferYear, pad } from '../lib/html.js';

const URL = 'https://comedyclub.bg/program/';
const CLUB = { name: 'Комеди Клуб София', address: 'ул. Малко Търново 2, 1000 София', lat: 42.6966, lon: 23.3258 };
const NDK = { name: 'НДК, Зала 1', address: 'пл. България 1, 1463 София', lat: 42.6847, lon: 23.319 };

export default async function comedyclub() {
  const html = await get(URL, { as: 'text' });
  const now = Date.now();
  const out = new Map();
  for (const section of html.split(/<h2[^>]*>/i).slice(1)) {
    const heading = textOf(section.split(/<\/h2>/i)[0]);
    if (!/софия|sofia/i.test(heading)) continue;
    for (const row of section.split(/<tr[^>]*>/i).slice(1)) {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
      if (cells.length < 3) continue;
      const dateText = textOf(cells[0]);
      const dm = dateText.match(/(\d{1,2})\s+([а-я]+)/i);
      const month = dm && monthIndex(dm[2]);
      if (!month) continue; // header row ("Дата | Програма | Зала")
      const day = Number(dm[1]);
      const year = inferYear(month, day);
      const times = [...dateText.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)].map((m) => `${pad(m[1])}:${m[2]}`);
      if (!times.length) continue; // no invented midnight
      const show = textOf(cells[1]).replace(/\s*🎤|🎉/gu, '').trim();
      const free = /вход свободен|free entry/i.test(show);
      const title = show.replace(/\s*вход свободен\s*/i, ' ').replace(/\s+/g, ' ').trim();
      const place = textOf(cells[2]).replace(/\s*(РЕЗЕРВАЦИИ|БИЛЕТИ|SOLD OUT!?)\s*/gi, ' ').replace(/[,\s]+$/, '').trim();
      const venue = /НДК/i.test(place) ? NDK : CLUB;
      const link = cells[1].match(/href="([^"]+)"/)?.[1];
      const date = `${year}-${pad(month)}-${pad(day)}`;
      for (const time of [...new Set(times)]) {
        const start = sofiaLocalToIso(`${date} ${time}`);
        if (Date.parse(start) < now - 2 * 3600_000) continue;
        const key = `${date}T${time}${venue === NDK ? '-ndk' : ''}`;
        out.set(
          key,
          makeEvent('comedyclub', key, {
            title,
            start,
            venue,
            url: link ? decodeEntities(link) : URL,
            price: free ? { min: 0, currency: 'EUR', free: true } : venue === CLUB ? { min: 15, currency: 'EUR', free: false } : null,
            categories: ['stand-up comedy', /open mic/i.test(title) ? 'open mic' : null].filter(Boolean),
            description: `${title}. ${place}`,
          }),
        );
      }
    }
  }
  return [...out.values()];
}
