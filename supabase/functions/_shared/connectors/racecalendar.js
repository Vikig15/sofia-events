// racecalendar.bg: running / trail races in and around Sofia (5K fun runs, trail races on Vitosha, relays).
// /sofia has a JSON-LD ItemList of SportsEvent (name, startDate as a date, url, locality); the start time
// ("Начало 27 септември 2026, неделя 08:00" per distance) is only on the race page, fetched for each (~10-20).
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { jsonLd, meta, textOf } from '../lib/html.js';

const BASE = 'https://racecalendar.bg';
const DETAIL_CAP = 30;

export default async function racecalendar() {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const html = await get(`${BASE}/sofia`, { as: 'text' });
  const races = jsonLd(html, ['SportsEvent']).filter((r) => r.url && /^\d{4}-\d{2}-\d{2}/.test(r.startDate ?? ''));
  if (!races.length) throw new Error('racecalendar: no SportsEvent in /sofia JSON-LD');

  const out = [];
  for (const [i, r] of races.entries()) {
    const date = r.startDate.slice(0, 10);
    if (date < today) continue;
    let time = null;
    let details = null;
    let image = null;
    if (i < DETAIL_CAP) {
      try {
        const page = await get(r.url, { as: 'text' });
        const text = textOf(page.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' '));
        const times = [...text.matchAll(/Начало\s+[^0-9]*?\d{1,2}\s+[а-я]+\s+\d{4}[^0-9]{0,20}(\d{1,2}:\d{2})/gi)].map((m) => m[1].padStart(5, '0'));
        time = times.sort()[0] ?? null;
        details = [...text.matchAll(/(\d+(?:\.\d+)?\s*км(?:\s*-\s*\d+\s*D\+)?)\s+Начало/g)].map((m) => m[1]).join(', ') || null;
        image = meta(page, 'og:image');
      } catch {
        /* list data is enough */
      }
      await sleep(400);
    }
    const locality = r.location?.address?.addressLocality ?? r.location?.name ?? 'София';
    const slug = r.url.replace(/\/$/, '').split('/').pop();
    out.push(
      makeEvent('racecalendar', slug, {
        title: r.name,
        start: sofiaLocalToIso(`${date} ${time ?? '09:00'}`),
        venue: { name: locality, address: null, lat: null, lon: null },
        url: r.url,
        image: image && !/og-1200x630/.test(image) ? image : null,
        categories: ['Бягане', 'Спорт'],
        description: details ? `Дистанции: ${details}` : null,
      }),
    );
  }
  return out;
}
