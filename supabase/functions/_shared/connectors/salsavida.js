// salsavida.com Sofia guide: Event JSON-LD (correct offsets) on the guide, /lessons/ and /festivals/
// pages. Parties/festivals mostly duplicate partita.bg; the class occurrences (salsa/bachata groups at
// Paletro, Ritmo, Latin Force, Salsa Diva, Dance Station, PaLante...) are what partita does not cover.
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';
import { jsonLd, decodeEntities } from '../lib/html.js';

const GUIDE = 'https://www.salsavida.com/guides/bulgaria/sofia/';
// The guide lists parties/festivals; /lessons/ carries JSON-LD for each class occurrence (~1 week ahead).
const PAGES = [GUIDE, `${GUIDE}lessons/`, `${GUIDE}festivals/`];

export default async function salsavida() {
  const found = new Map();
  for (const [i, page] of PAGES.entries()) {
    let html;
    try {
      html = await get(page, { as: 'text' });
    } catch (err) {
      if (i === 0) throw err;
      continue;
    }
    for (const e of jsonLd(html)) {
      if (!e.startDate || !/T\d{2}:\d{2}/.test(e.startDate)) continue;
      const url = e.url ?? page;
      const key = `${slugOf(url)}@${e.startDate.slice(0, 16)}`;
      if (!found.has(key)) found.set(key, { e, url });
    }
    await sleep(700);
  }

  const now = Date.now();
  return [...found.entries()]
    .filter(([, { e }]) => Date.parse(e.endDate ?? e.startDate) >= now)
    .filter(([, { e }]) => !/Cancelled/.test(e.eventStatus ?? ''))
    .map(([key, { e, url }]) => {
      const loc = e.location ?? {};
      const name = decodeEntities(e.name);
      const isClass = /\bclass(es)?\b|beginner|group/i.test(name);
      return makeEvent('salsavida', key, {
        title: name,
        start: e.startDate,
        end: e.endDate ?? null,
        venue: {
          name: decodeEntities(loc.name ?? '') || null,
          address: decodeEntities(loc.address?.streetAddress ?? '') || null,
          lat: loc.geo?.latitude ? Number(loc.geo.latitude) : null,
          lon: loc.geo?.longitude ? Number(loc.geo.longitude) : null,
        },
        url,
        image: [].concat(e.image ?? [])[0] ?? null,
        categories: ['Dance', 'Latin dance', isClass ? 'Dance class' : 'Latin dance social'],
        online: /Online/.test(e.eventAttendanceMode ?? ''),
        description: e.description,
      });
    });
}

const slugOf = (u) => String(u).replace(/\/$/, '').split('/').pop();
