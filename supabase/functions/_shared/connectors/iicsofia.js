// Istituto Italiano di Cultura di Sofia (Италиански културен институт, iicsofia.esteri.it): concerts, book
// presentations, film screenings, talks, exhibitions and festivals (Cameralia, Night of Literature...).
// Standard Italian foreign-ministry WordPress theme ("sedi-tema"), no events API. The Bulgarian list
// /bg/gli_eventi/?date-init=YYYY-MM-DD&date-end=YYYY-MM-DD shows 10 cards per page and ignores /page/N,
// so we walk forward: after a full page, restart the window from the last card's date.
// Card dates have no time, so every kept event gets its detail page, whose meta list says
//   "Дата на събитието: От октомври 01 2026, 10:00 До октомври 03 2026, 19:00 (Ora locale)"  "Къде: Брацигово"
// (Sofia local time). Events without a time are skipped (no invented midnights). The institute also works
// outside Sofia: "Къде" naming another town drops the event. Exhibitions/runs longer than 3 days are only kept
// while their opening is still ahead.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, meta, pad } from '../lib/html.js';

const BASE = 'https://iicsofia.esteri.it';
const DAYS_AHEAD = 120;
const MAX_LIST_PAGES = 6;
const DETAIL_CAP = 40;
const TIME_BUDGET_MS = 70_000;
const NOT_SOFIA =
  /пловдив|варна|бургас|русе|стара загора|плевен|велико търново|шумен|благоевград|брацигово|габрово|хасково|сливен|добрич|перник|ямбол|пазарджик|враца|кърджали|видин|монтана|ловеч|силистра|търговище|разград|смолян|кюстендил|банско|созопол|несебър|казанлък|самоков|plovdiv|varna|burgas|ruse|онлайн|online/i;
const KIDS = /за деца|детск|for children|per bambini|kids/i;

const ymd = (d) => d.toISOString().slice(0, 10);
// "От октомври 01 2026, 10:00" -> { date: '2026-10-01', time: '10:00' | null }
function parseWhen(s) {
  const m = String(s ?? '').match(/([а-яa-z]+)\.?\s+(\d{1,2})\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2}))?/i);
  const month = m && monthIndex(m[1]);
  if (!month) return null;
  return { date: `${m[3]}-${pad(month)}-${pad(m[2])}`, time: m[4] ? `${pad(m[4])}:${m[5]}` : null };
}

async function listWindow(from, to) {
  const html = await get(`${BASE}/bg/gli_eventi/?date-init=${from}&date-end=${to}&searchText=`, { as: 'text' });
  const cards = [];
  for (const card of html.split('class="card-title big-heading').slice(1)) {
    const link = card.match(/href="(https:\/\/iicsofia\.esteri\.it\/bg\/gli_eventi\/calendario\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (link) cards.push({ url: decodeEntities(link[1]), title: textOf(link[2]) });
  }
  // card dates sit before the title: "</svg> чт окт. 01 2026<svg ...>...</svg>чт окт. 03 2026"
  const dates = [...html.matchAll(/<\/svg>\s*[а-я]{2}\s+([а-я]+)\.?\s+(\d{1,2})\s+(\d{4})/gi)]
    .map((m) => (monthIndex(m[1]) ? `${m[3]}-${pad(monthIndex(m[1]))}-${pad(m[2])}` : null))
    .filter(Boolean);
  return { cards, lastDate: dates.at(-1) ?? null };
}

export default async function iicsofia() {
  const t0 = Date.now();
  const today = new Date();
  const end = ymd(new Date(today.getTime() + DAYS_AHEAD * 86_400_000));
  const seen = new Map();
  let from = ymd(today);
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const { cards, lastDate } = await listWindow(from, end);
    for (const c of cards) if (!seen.has(c.url)) seen.set(c.url, c);
    if (cards.length < 10 || !lastDate || lastDate <= from) break;
    from = lastDate; // overlapping day is fine, we dedupe by URL
    await sleep(500);
  }

  const now = Date.now();
  const out = [];
  let details = 0;
  for (const card of seen.values()) {
    if (details >= DETAIL_CAP || Date.now() - t0 > TIME_BUDGET_MS) break;
    if (KIDS.test(card.title)) continue;
    await sleep(400);
    details++;
    let html;
    try {
      html = await get(card.url, { as: 'text', retries: 1 });
    } catch {
      continue;
    }
    const field = (label) => textOf(html.match(new RegExp(`<b>${label}:?<\\/b>([\\s\\S]*?)<\\/small>`))?.[1] ?? '') || null;
    const when = field('Дата на събитието') ?? '';
    const [fromPart, toPart] = when.split(/\sДо\s/);
    const s = parseWhen(fromPart);
    if (!s?.time) continue;
    const e = parseWhen(toPart);
    const place = field('Къде');
    const paid = field('Срещу заплащане');
    const body = textOf(html.match(/<div class="entry-content">([\s\S]*?)<\/div><!-- \.entry-content/)?.[1] ?? '');
    if (place ? NOT_SOFIA.test(place) : !/софия|sofia/i.test(body)) continue;
    if (KIDS.test(body.slice(0, 300))) continue;
    const start = sofiaLocalToIso(`${s.date} ${s.time}`);
    const endIso = e ? sofiaLocalToIso(`${e.date} ${e.time ?? '23:59'}`) : null;
    const multiDay = e && (Date.parse(endIso) - Date.parse(start)) / 86_400_000 > 3;
    if (Date.parse(start) < now - 3 * 3600_000 && (multiDay || !endIso || Date.parse(endIso) < now)) continue;
    const slug = card.url.replace(/\/$/, '').split('/').pop();
    out.push(
      makeEvent('iicsofia', decodeURIComponent(slug).slice(0, 80), {
        title: card.title,
        start,
        end: endIso,
        venue: place ? { name: place, address: null, lat: null, lon: null } : null,
        url: card.url,
        image: meta(html, 'og:image'),
        price: paid && /^не$/i.test(paid) ? { min: 0, currency: 'EUR', free: true } : null,
        categories: ['Италиански културен институт', multiDay ? 'festival/exhibition' : null].filter(Boolean),
        description: body || null,
      }),
    );
  }
  return out;
}
