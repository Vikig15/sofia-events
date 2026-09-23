// CLWD (ex-EXE Club, ul. Shipka 6): Framer site with a server-rendered calendar.
// The list gives title, date and time; each detail page adds the line-up, price and description.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const BASE = 'https://www.clwd-space.com';
const VENUE = { name: 'CLWD', address: 'ул. Шипка 6, 1504 София', lat: 42.6947, lon: 23.3345 };
const MAX_DETAILS = 30;

// "11:00 PM" -> "23:00"
function to24h(t) {
  const m = String(t).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toUpperCase();
  if (ap === 'AM' && h === 12) h = 0;
  if (ap === 'PM' && h !== 12) h += 12;
  return `${pad(h)}:${m[2]}`;
}

function parseList(html) {
  const out = new Map();
  const parts = html.split(/data-framer-name="Calendar_new"/).slice(1);
  for (const part of parts) {
    const href = part.match(/href="\.?\/?calendar\/([^"]+)"/);
    if (!href || out.has(href[1])) continue;
    const texts = [...part.slice(0, 12000).matchAll(/<p class="framer-text"[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
    const title = texts[0];
    const date = texts.find((t) => /^\d{2}\/\d{2}\/\d{4}$/.test(t));
    const time = texts.find((t) => /^\d{1,2}:\d{2}\s*(AM|PM)?$/i.test(t));
    const img = part.match(/<img[^>]+src="([^"]+)"/);
    if (!title || !date) continue;
    const [d, mo, y] = date.split('/');
    out.set(href[1], {
      slug: href[1],
      title,
      local: `${y}-${mo}-${d} ${to24h(time ?? '11:00 PM') ?? '23:00'}`,
      image: img ? decodeEntities(img[1]).split('?')[0] : null,
    });
  }
  return [...out.values()];
}

function parseDetail(html) {
  const text = textOf(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''));
  const price = text.match(/Online Tickets\s*([\d]+(?:[.,]\d+)?)/i) ?? text.match(/Door\s*([\d]+(?:[.,]\d+)?)/i);
  const lineup = text.match(/Music by:\s*(.*?)\s*(?:Door|Online Tickets|Free|$)/i);
  // Free-text blurb sits between the date/time line and the second "Door"/"Event" block.
  const blurb = text.match(/\d{4}\s+\d{1,2}:\d{2}\s*(?:AM|PM)\s+(.*?)\s+(?:Door\s+[\d,.]+|Event Buy Tickets|Previous Event)/i);
  const tickets = html.match(/href="(https:\/\/(?:bilet\.bg|web\.fourvenues\.com|www\.eventim\.bg|epaygo\.bg)[^"]*)"/i);
  return {
    price: price ? Number(price[1].replace(',', '.')) : null,
    lineup: lineup?.[1]?.trim() || null,
    blurb: blurb?.[1]?.trim() || null,
    tickets: tickets?.[1] ?? null,
  };
}

export default async function clwd() {
  const html = await get(`${BASE}/calendar`, { as: 'text' });
  const now = Date.now();
  const items = parseList(html)
    .map((i) => ({ ...i, start: sofiaLocalToIso(i.local) }))
    .filter((i) => new Date(i.start).getTime() >= now - 6 * 3_600_000)
    .sort((a, b) => a.start.localeCompare(b.start));

  const out = [];
  for (const [idx, it] of items.entries()) {
    let det = {};
    if (idx < MAX_DETAILS) {
      try {
        det = parseDetail(await get(`${BASE}/calendar/${it.slug}`, { as: 'text' }));
      } catch {
        /* list data is enough */
      }
      await sleep(400);
    }
    const desc = [det.lineup && `Line-up: ${det.lineup}`, det.blurb, det.tickets && `Tickets: ${det.tickets}`].filter(Boolean).join('\n');
    out.push(
      makeEvent('clwd', it.slug, {
        title: it.title,
        start: it.start,
        venue: VENUE,
        url: `${BASE}/calendar/${it.slug}`,
        image: it.image,
        price: det.price != null ? { min: det.price, currency: 'EUR', free: det.price === 0 } : null,
        categories: ['Nightlife', 'Club', 'Party'],
        description: desc || null,
      }),
    );
  }
  return out;
}
