// Sofia University "St. Kliment Ohridski" public calendar (eZ Publish ezagenda): public lectures, conferences,
// concerts and student theatre at the summer stage, exhibitions. ~15-25 entries/month, most are open to all.
// Month view: /index.php/bul/novini/kalendar/(month)/M/(year)/YYYY with one <table class="ezagenda_month_event">
// per event: title link, "01 Сеп 10:00 - 15 Окт 18:00" (no year), venue in .attribute-short.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, pad } from '../lib/html.js';

const BASE = 'https://www.uni-sofia.bg';
const MONTHS_AHEAD = 3;
const NOT_SOFIA = /манастир|пловдив|варна|бургас|благоевград|велико търново|банско|боровец|пампорово|созопол|несебър|шумен|русе|бачково|рилски/i;

export default async function unisofia() {
  const now = Date.now();
  const out = new Map();
  const d0 = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1));
    const pageYear = d.getUTCFullYear();
    const pageMonth = d.getUTCMonth() + 1;
    const html = await get(`${BASE}/index.php/bul/novini/kalendar/(month)/${pageMonth}/(year)/${pageYear}`, { as: 'text' });
    const right = html.split('id="ezagenda_calendar_right"')[1] ?? '';
    for (const t of right.split('<table class="ezagenda_month_event"').slice(1)) {
      const link = t.match(/<h4>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/);
      const when = textOf(t.match(/class="ezagenda_date">([\s\S]*?)<\/span>/)?.[1] ?? '');
      if (!link || !when) continue;
      const parts = [...when.matchAll(/(\d{1,2})\s+([А-Яа-я]+)\.?\s*(\d{1,2}:\d{2})?/g)];
      if (!parts.length) continue;
      const toIso = (p) => {
        const m = monthIndex(p[2]);
        if (!m) return null;
        // year: the page's year, rolling forward for Dec -> Jan spans and back for Jan pages listing Dec
        let y = pageYear;
        if (m < pageMonth - 6) y += 1;
        else if (m > pageMonth + 6) y -= 1;
        return sofiaLocalToIso(`${y}-${pad(m)}-${pad(p[1])} ${p[3] ?? '10:00'}`);
      };
      const start = toIso(parts[0]);
      const end = parts[1] ? toIso(parts[1]) : null;
      if (!start) continue;
      if (Date.parse(end ?? start) < now - 3 * 3600_000) continue;
      const venue = textOf(decodeEntities(t.match(/class="attribute-short">([\s\S]*?)<\/div>/)?.[1] ?? ''));
      if (venue && NOT_SOFIA.test(venue)) continue;
      const url = `${BASE}${decodeEntities(link[1])}`;
      const key = `${link[1].split('/').pop()}@${start.slice(0, 16)}`;
      out.set(
        key,
        makeEvent('unisofia', key, {
          title: textOf(decodeEntities(link[2])),
          start,
          end,
          venue: venue ? { name: venue, address: null, lat: null, lon: null } : { name: 'Софийски университет', address: 'бул. Цар Освободител 15, София', lat: null, lon: null },
          url,
          categories: ['Университет'],
          online: /^online$|онлайн/i.test(venue),
        }),
      );
    }
    await sleep(600);
  }
  return [...out.values()];
}
