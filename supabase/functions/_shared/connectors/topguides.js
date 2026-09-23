// Top Guides (topguides.bg, Sofia-based licensed mountain guides): guided group hikes and the club's
// social evenings (e.g. "Арменска вечер с представяне на Календар 2027" at the Czech Cultural Centre).
// /bg/kalendar/ is server-rendered WooCommerce HTML: one `.calendar-item` per departure with the date in
// the product link (`?id=43846&date=23.09.2026`), duration ("1 Ден"), mountain ("Преходи в Пирин"),
// free places and price.
// Scope decisions:
//   - One-day hikes in Bulgaria are kept: they are organised from Sofia (programmes start "Трансфер
//     София-Карлово – 2 часа", shared car transport arranged among participants). Multi-day and abroad
//     trips are dropped (travel packages, not Sofia events).
//   - Items without a mountain (evenings, talks) get their detail page fetched for "Час: 18.30" and
//     "Място: ..."; kept only when a time is found and the place is not online.
// Times: the calendar has dates only. Day hikes use a documented 07:00 convention (typical Sofia
// departure; the exact meeting time is sent to registered participants). Titles get "(от София)".
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const LIST = 'https://topguides.bg/bg/kalendar/';
const HIKE_TIME = '07:00';
const ABROAD = /Македония|Гърция|Испания|Кавказ|Киргизстан|Черна гора|Сърбия|Румъния|Италия|Етна|Пинд|Тимфи|Андите|Кораб|Турция|Албания|Босна/i;

export default async function topguides() {
  const html = await get(LIST, { as: 'text' });
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const out = new Map();
  for (const c of html.split(/class="row g-0 calendar-item"/).slice(1)) {
    const href = decodeEntities(c.match(/href="(https:\/\/topguides\.bg\/bg\/produkt\/[^"]+)"/)?.[1] ?? '');
    const q = href.match(/[?&]id=(\d+)&date=(\d{2})\.(\d{2})\.(\d{4})/);
    if (!q) continue;
    const date = `${q[4]}-${q[3]}-${q[2]}`;
    if (date < today) continue;
    const title = textOf(c.match(/woocommerce-loop-product__link">([\s\S]*?)<\/a>/)?.[1]);
    const mountain = textOf(c.match(/class="mountain">([\s\S]*?)<\/a>/)?.[1]);
    const days = Number(c.match(/aria-label="Продължителност">\s*(\d+)/)?.[1] ?? 1);
    const places = c.match(/class="attribute">\s*(\d+)\s*Места/)?.[1];
    const price = c.match(/amount">\s*([\d.,]+)/)?.[1];
    const image = c.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
    const summary = textOf(c.match(/product-short-description">([\s\S]*?)<\/div>/)?.[1]);
    const id = `${q[1]}-${date}`;
    const common = {
      url: href,
      image,
      price: price ? { min: Number(price.replace(',', '.')), currency: 'EUR', free: false } : null,
    };

    if (mountain) {
      if (days !== 1 || ABROAD.test(`${mountain} ${title}`)) continue;
      out.set(
        id,
        makeEvent('topguides', id, {
          ...common,
          title: `${title} (от София)`,
          start: sofiaLocalToIso(`${date} ${HIKE_TIME}`),
          venue: { name: mountain.replace(/^Преходи (в|на|във|из)\s+/i, ''), address: null, lat: null, lon: null },
          categories: ['Hiking', 'Outdoors', 'Планински преход', 'Day trip from Sofia'],
          description: [summary, 'Еднодневен преход с водач, тръгване от София (споделен транспорт).', places != null ? `Свободни места: ${places}.` : '']
            .filter(Boolean)
            .join(' '),
        }),
      );
      continue;
    }

    // Non-hike item: read the detail page for the time and place.
    await sleep(500);
    const page = await get(href, { as: 'text' }).catch(() => '');
    const text = textOf(page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' '));
    const t = text.match(/Час:\s*(\d{1,2})[.:](\d{2})/);
    const place = text.match(/Място:\s*(.{3,120}?)(?=\s+[А-ЯA-Z][а-яa-z]+\s+[а-яa-z]|\s{2}|$)/)?.[1]?.trim();
    if (!t || /онлайн|online|zoom/i.test(`${title} ${place ?? ''}`)) continue;
    const start = sofiaLocalToIso(`${date} ${pad(t[1])}:${t[2]}`);
    const end = text.match(/Час:\s*\d{1,2}[.:]\d{2}\s*-\s*(\d{1,2})(?:[.:](\d{2}))?/);
    out.set(
      id,
      makeEvent('topguides', id, {
        ...common,
        title,
        start,
        end: end ? sofiaLocalToIso(`${date} ${pad(end[1])}:${end[2] ?? '00'}`) : null,
        venue: { name: place ?? null, address: 'София', lat: null, lon: null },
        categories: ['Outdoors', 'Travel talk', 'Social'],
        description: summary || null,
      }),
    );
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}
