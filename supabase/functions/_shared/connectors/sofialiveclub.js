// Sofia Live Club (NDK underpass): server-rendered monthly programme at /events/YYYYMM.
// Each card has day-of-month, title and "врати - 19:30, начало - 20:30"; no detail pages worth fetching.
// CAVEAT: the server only offers TLS 1.2 CBC suites (ECDHE-RSA-AES256-SHA384). Node works, but Deno's
// rustls refuses them ("connection reset"), so this source fails inside Supabase Edge Functions.
// Most of its shows are also on Eventim/SofiaStage, so run it from the Node ingest only.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf } from '../lib/html.js';

const BASE = 'https://www.sofialiveclub.com';
const VENUE = { name: 'Sofia Live Club', address: 'пл. България 1, НДК (подлеза с фонтаните), София', lat: 42.6862, lon: 23.3192 };

function parseMonth(html, ym) {
  const out = [];
  const y = ym.slice(0, 4);
  const mo = ym.slice(4, 6);
  for (const block of html.split('id="calendar"').slice(1)) {
    const day = block.match(/class="colored-bg">\s*(\d{1,2})\s*</)?.[1];
    const title = block.match(/<b>([\s\S]*?)<\/b>/)?.[1];
    if (!day || !title) continue;
    const t = textOf(title.replace(/<br\s*\/?>/gi, ' / ')).replace(/\s*\/\s*$/, '');
    if (/private party|частно|затворено/i.test(t)) continue;
    const start = block.match(/начало\s*-\s*(\d{1,2}):(\d{2})/);
    const hhmm = start && !(start[1] === '00' && start[2] === '00') ? `${start[1].padStart(2, '0')}:${start[2]}` : '21:00';
    const reserveId = block.match(/href="\/events\/(\d+)\/stage"/)?.[1];
    const ticket = [...block.matchAll(/<a href="(https?:\/\/[^"]+)"[^>]*>\s*<button class="ticket"/g)].map((m) => m[1])[0];
    out.push({ day: day.padStart(2, '0'), title: t, local: `${y}-${mo}-${day.padStart(2, '0')} ${hhmm}`, reserveId, ticket });
  }
  return out;
}

export default async function sofialiveclub() {
  const first = await get(`${BASE}/events/`, { as: 'text' });
  const months = [...new Set([...first.matchAll(/<option value="(\d{6})"/g)].map((m) => m[1]))];
  const out = [];
  const now = Date.now();
  for (const [i, ym] of months.slice(0, 6).entries()) {
    const html = i === 0 && first.includes(`value="${ym}" selected`) ? first : await get(`${BASE}/events/${ym}`, { as: 'text' });
    for (const e of parseMonth(html, ym)) {
      const start = sofiaLocalToIso(e.local);
      if (new Date(start).getTime() < now - 3 * 3_600_000) continue;
      out.push(
        makeEvent('sofialiveclub', e.reserveId ?? `${ym}${e.day}-${e.title.slice(0, 40)}`, {
          title: e.title,
          start,
          venue: VENUE,
          url: e.ticket && !/sofialivefest\.com\/events\/?$/.test(e.ticket) ? e.ticket : `${BASE}/events/${ym}`,
          categories: ['Nightlife', 'Live music', 'Club'],
          description: e.ticket ? `Tickets: ${e.ticket}` : null,
        }),
      );
    }
    await sleep(400);
  }
  return out;
}
