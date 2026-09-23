// In The Mood Jazz Club (ul. Pozitano 52): jazz concerts most nights, jam sessions, "Analog Room" listening
// sessions and screenings. Not on SofiaStage at the time of writing.
// One request: the programme page https://inthemood.bg/events/ embeds the whole calendar as JSON in the
// data-events attribute of <div data-itm-calendar> (HTML-entity encoded):
//   [{ event_id, title, permalink, date: "2026-09-26", start: "19:00", end: "20:45", doors: "18:00",
//      price_from: "40" | "", free_entry: false, thumbnail, types: ["ЕКСКЛУЗИВНО СЪБИТИЕ", ...] }]
// Times are Sofia local. The same event_id can appear twice on one day (two sets, 19:00 and 21:30), so the
// id is event_id + date + start. The calendar includes the current month's past days; we drop them.
// Prices: the site's ticket shop is in euro (Bulgaria's currency since 2026).
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { decodeEntities } from '../lib/html.js';

const URL = 'https://inthemood.bg/events/';
const VENUE = { name: 'In The Mood Jazz Club', address: 'ул. Позитано 52, 1303 София', lat: 42.6953, lon: 23.3149 };

export default async function inthemood() {
  const html = await get(URL, { as: 'text' });
  const raw = html.match(/data-itm-calendar[\s\S]*?data-events="([^"]*)"/)?.[1];
  if (!raw) throw new Error('inthemood: data-events attribute not found (layout changed?)');
  const list = JSON.parse(decodeEntities(raw));
  const now = Date.now();
  const out = new Map();
  for (const e of Array.isArray(list) ? list : []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '') || !/^\d{1,2}:\d{2}$/.test(e.start ?? '')) continue;
    const start = sofiaLocalToIso(`${e.date} ${e.start}`);
    if (Date.parse(start) < now - 3 * 3600_000) continue;
    let end = null;
    if (/^\d{1,2}:\d{2}$/.test(e.end ?? '')) {
      end = sofiaLocalToIso(`${e.date} ${e.end}`);
      if (Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(end) + 86_400_000).toISOString(); // past midnight
    }
    const key = `${e.event_id}@${e.date}T${e.start}`;
    const price = Number(e.price_from);
    out.set(
      key,
      makeEvent('inthemood', key, {
        title: decodeEntities(e.title),
        start,
        end,
        venue: VENUE,
        url: e.permalink,
        image: e.thumbnail ? String(e.thumbnail).replace(/-\d+x\d+(\.\w+)$/, '$1') : null,
        price: e.free_entry ? { min: 0, currency: 'EUR', free: true } : price > 0 ? { min: price, currency: 'EUR', free: false } : null,
        categories: ['jazz', ...(Array.isArray(e.types) ? e.types : [])],
        description: e.doors ? `Врати: ${e.doors}` : null,
      }),
    );
  }
  return [...out.values()];
}
