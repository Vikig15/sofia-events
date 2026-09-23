// ТрекМания (trek-mania.com): guided one-day mountain hikes run from Sofia - an organised bus leaves
// from the parking lot at the National Stadium "Васил Левски" ("Транспорт от и до град София" is in the
// price), so each hike is a Sofia departure where you meet a group. Rails site, server-rendered.
//   - list: /categories/ednodnevni-prehodi (one-day programmes only; weekend/abroad trips are other
//     categories and are skipped) - `.box_grid` cards with title, mountain, date "27.09.2026 (нед)",
//     "1 ден", price "65 €", and a "Потвърдена" (confirmed) badge.
//   - detail: `<p class='departure'>Заминаване от <a>Паркинга пред Национален стадион ...</a> в
//     <span class='badge-departure'>06:15</span>` gives the real departure time and place, so start =
//     departure from Sofia. If a page lacks it we fall back to 06:30 (their usual departure) and say so.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, meta } from '../lib/html.js';

const BASE = 'https://trek-mania.com';
const LIST = `${BASE}/categories/ednodnevni-prehodi`;
const FALLBACK_TIME = '06:30';
const DETAIL_CAP = 30;

export default async function trekmania() {
  const html = await get(LIST, { as: 'text' });
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const cards = [];
  for (const c of html.split(/class='box_grid'/).slice(1)) {
    const href = c.match(/<h3><a href="([^"]+\/programs\/[^"]+)"/)?.[1];
    const d = c.match(/(\d{2})\.(\d{2})\.(\d{4})\s*\(/);
    if (!href || !d) continue;
    const days = Number(c.match(/class='program'>\s*(\d+)\s*д/)?.[1] ?? 1);
    const date = `${d[3]}-${d[2]}-${d[1]}`;
    if (days !== 1 || date < today) continue;
    const field = (label) => textOf(c.match(new RegExp(`<strong>${label}:</strong>([\\s\\S]*?)</(?:span|div)>`))?.[1]);
    cards.push({
      slug: href.split('/programs/')[1],
      date,
      title: textOf(c.match(/<h3><a[^>]*>([\s\S]*?)<\/a>/)?.[1]),
      mountain: field('Планина'),
      difficulty: field('Трудност'),
      distance: field('Разстояние'),
      price: c.match(/>\s*(\d+(?:[.,]\d+)?)\s*€\s*\|/)?.[1], // not the "Капаро" (deposit) tooltip
      confirmed: /Потвърдена/.test(c),
      image: c.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
    });
  }
  if (!cards.length && !/box_grid/.test(html)) throw new Error('trekmania: list markup changed');

  const out = [];
  for (const [i, c] of cards.entries()) {
    const url = `${BASE}/programs/${c.slug}`;
    let time = null;
    let place = null;
    let image = null;
    if (i < DETAIL_CAP) {
      await sleep(500);
      try {
        const page = await get(url, { as: 'text' });
        const dep = page.match(/class='departure'>([\s\S]*?)<\/p>/)?.[1] ?? '';
        time = dep.match(/badge-departure'>\s*(\d{1,2}):(\d{2})/)?.slice(1, 3).map((x) => x.padStart(2, '0')).join(':') ?? null;
        place = textOf(dep.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1]) || null;
        image = meta(page, 'og:image')?.replace(/^https:\/\/trek-mania\.com\/(?=https?:)/, '').replace(/^http:/, 'https:') ?? null;
      } catch {
        /* list data is enough */
      }
    }
    out.push(
      makeEvent('trekmania', c.slug, {
        title: `${c.title} (преход от София)`,
        start: sofiaLocalToIso(`${c.date} ${time ?? FALLBACK_TIME}`),
        venue: { name: place ?? 'София (място на тръгване)', address: 'София', lat: null, lon: null },
        url,
        image: image ?? (c.image ? new URL(c.image, BASE).href : null),
        price: c.price ? { min: Number(c.price.replace(',', '.')), currency: 'EUR', free: false } : null,
        categories: ['Hiking', 'Outdoors', 'Планински преход', 'Day trip from Sofia'],
        description: [
          `Еднодневен преход${c.mountain ? ` в ${c.mountain}` : ''} с водач и организиран транспорт от София.`,
          c.difficulty && `Трудност: ${c.difficulty}.`,
          c.distance && `Разстояние: ${c.distance}`,
          c.confirmed ? 'Потвърдена група.' : null,
          time ? null : `Час на тръгване: не е обявен (${FALLBACK_TIME} по подразбиране).`,
        ]
          .filter(Boolean)
          .join(' '),
      }),
    );
  }
  return out;
}
