// Begach running club (begach.com, Sofia): the club's own races - Devin Active Friday Night 5k (South
// Park), Sofia Morning Run (Borisova gradina), The Big Tech Run (Sofia Tech Park), Business Run... These
// are mostly NOT on racecalendar.bg. The WordPress /events/ page carries one schema.org Event JSON-LD per
// upcoming race. Quirks: dates are unpadded with a hard-coded "+3:00" even in winter
// ("2026-11-28T09:00+3:00"), so we take the wall-clock part and convert from Sofia local ourselves;
// endDate is always "23:59" (fake) and is dropped. Out-of-town races (Business Run Plovdiv...) are
// filtered by city names in the title/description; races with no city are Sofia (the club's home).
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd, decodeEntities, textOf, pad } from '../lib/html.js';

const LIST = 'https://www.begach.com/events/';
const OTHER_CITY =
  /пловдив|plovdiv|варна|varna|бургас|burgas|русе|ruse|стара загора|велико търново|благоевград|банско|bansko|плевен|габрово|шумен/i;

export default async function begach() {
  const html = await get(LIST, { as: 'text' });
  const now = Date.now();
  const out = new Map();
  for (const e of jsonLd(html)) {
    const m = String(e.startDate ?? '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{2})/);
    if (!m || !e.url) continue;
    const name = decodeEntities(e.name);
    const desc = textOf(e.description);
    const sofia = /софия|sofia|борисова|южен парк|западен парк|tech park/i.test(`${name} ${desc}`);
    if (!sofia && OTHER_CITY.test(`${name} ${desc}`)) continue;
    const start = sofiaLocalToIso(`${m[1]}-${pad(m[2])}-${pad(m[3])} ${pad(m[4])}:${m[5]}`);
    if (Date.parse(start) < now - 2 * 3600_000) continue;
    const slug = e.url.replace(/\/$/, '').split('/').pop();
    out.set(
      slug,
      makeEvent('begach', slug, {
        title: name,
        start,
        venue: { name: venueFrom(desc), address: 'София', lat: null, lon: null },
        url: e.url,
        image: [].concat(e.image ?? [])[0] ?? null,
        categories: ['Бягане', 'Спорт', 'Running'],
        description: desc || null,
      }),
    );
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}

const venueFrom = (desc) =>
  /борисова/i.test(desc) ? 'Борисова градина' : /южен парк/i.test(desc) ? 'Южен парк' : /tech park/i.test(desc) ? 'Sofia Tech Park' : null;
