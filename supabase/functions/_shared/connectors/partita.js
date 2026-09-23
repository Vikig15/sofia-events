// partita.bg: every salsa/bachata/kizomba social in Sofia (~4 weeks ahead). The list page is
// server-rendered HTML grouped by day; each party's detail page has SocialEvent JSON-LD with the
// venue address and end time. NOTE: the JSON-LD startDate is Sofia wall-clock time mislabelled
// as "+00:00", so we drop the offset and convert from Sofia local ourselves.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd, decodeEntities, textOf, monthIndex, pad } from '../lib/html.js';

const LIST = 'https://www.partita.bg/en/list/sofia';

export default async function partita() {
  const html = await get(LIST, { as: 'text' });
  const cards = parseList(html);
  const out = [];
  const now = Date.now();
  for (const c of cards) {
    let ld = null;
    try {
      const page = await get(c.url, { as: 'text' });
      ld = jsonLd(page).find((e) => e.startDate) ?? null;
    } catch {
      /* fall back to list data */
    }
    await sleep(300);
    const start = ld ? sofiaLocalToIso(wallClock(ld.startDate)) : c.start;
    const end = ld?.endDate ? sofiaLocalToIso(wallClock(ld.endDate)) : null;
    if (Date.parse(end ?? start) < now - 3 * 3600_000) continue;
    const loc = ld?.location ?? {};
    out.push(
      makeEvent('partita', c.id, {
        title: decodeEntities(ld?.name ?? c.title),
        start,
        end,
        venue: {
          name: placeholder(decodeEntities(loc.name ?? c.venue ?? '')),
          address: placeholder(decodeEntities(loc.address?.streetAddress ?? '')),
          lat: null,
          lon: null,
        },
        url: c.url,
        image: [].concat(ld?.image ?? c.image ?? [])[0] ?? null,
        categories: ['Dance', 'Latin dance social'],
        description: ld?.description ?? null,
      }),
    );
  }
  return out;
}

// Day headers ("Saturday, 26th September 2026") carry the year; cards carry "26th September, 22:30".
function parseList(html) {
  const cards = [];
  const re =
    /(?:<div class="text-lg font-semibold text-gray-900">\s*([^<]+?)\s*<\/div>)|(?:<a href="(https:\/\/www\.partita\.bg\/en\/p\/(\d+)\/[^"]*)"[\s\S]*?<\/a>)/g;
  let year = new Date().getFullYear();
  for (const m of html.matchAll(re)) {
    if (m[1]) {
      const y = m[1].match(/(\d{4})/);
      if (y) year = Number(y[1]);
      continue;
    }
    const block = m[0];
    const when = textOf(block.match(/text-pink-700">([^<]+)</)?.[1]); // "26th September, 22:30"
    const d = when.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{1,2}):(\d{2})/);
    if (!d) continue;
    const month = monthIndex(d[2]);
    if (!month) continue;
    const divs = [...block.matchAll(/<div class="mt-2[^"]*">\s*([\s\S]*?)\s*<\/div>/g)].map((x) => textOf(x[1]));
    cards.push({
      id: m[3],
      url: m[2],
      start: sofiaLocalToIso(`${year}-${pad(month)}-${pad(d[1])} ${pad(d[3])}:${d[4]}`),
      title: divs[0] ?? '',
      venue: divs[1] ?? null,
      image: block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
    });
  }
  return cards;
}

// "(oshte nyama lokatsiya)" = "no location yet"; "--" = empty address.
const placeholder = (s) => (!s || /nyama lokatsiya|няма локация|^[-\s]*$/i.test(s) ? null : s);

// "2026-09-26T22:30:00+00:00" -> "2026-09-26 22:30" (the offset is wrong, the clock time is right).
const wallClock = (iso) => String(iso).replace('T', ' ').slice(0, 16);
