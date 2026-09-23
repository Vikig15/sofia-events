// National Theatre "Ivan Vazov" (nationaltheatre.bg). /bg/programa?day=&month=MM&year=YYYY is server-rendered;
// each performance is a <div class="show ..."> with title, author, stage, hour, and a ticket link
// ".../predstavlenie/<slug>/2026-09-23|19:00:00" that carries the exact local date and time.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const BASE = 'https://www.nationaltheatre.bg';
const MONTHS_AHEAD = 3;

export default async function nationaltheatre() {
  const now = Date.now();
  const out = new Map();
  const d0 = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1));
    const y = d.getUTCFullYear();
    const m = pad(d.getUTCMonth() + 1);
    let html;
    try {
      html = await get(`${BASE}/bg/programa?day=&month=${m}&year=${y}`, { as: 'text' });
    } catch (err) {
      if (i === 0) throw err;
      continue; // later months are often not published yet
    }
    for (const item of html.split(/<div class="item[ "]/).slice(1)) {
      const day = item.match(/class="number">\s*(\d{1,2})/)?.[1];
      for (const show of item.split(/<div class="show\s/).slice(1)) {
        const link = show.match(/<h2><a href="([^"]+)">([\s\S]*?)<\/a>/);
        if (!link) continue;
        const when = show.match(/predstavlenie\/[^"/]+\/(\d{4}-\d{2}-\d{2})\|(\d{2}:\d{2})/);
        const hour = show.match(/class="hour">\s*(\d{1,2}:\d{2})/)?.[1];
        const date = when?.[1] ?? (day ? `${y}-${m}-${pad(day)}` : null);
        const time = when?.[2] ?? hour ?? '19:00';
        if (!date || !date.startsWith(`${y}-${m}`)) continue;
        const start = sofiaLocalToIso(`${date} ${time}`);
        if (Date.parse(start) < now - 3 * 3600_000) continue;
        const stage = textOf(show.match(/class="stage">([\s\S]*?)<\/span>/)?.[1] ?? '');
        const author = textOf(show.match(/class="author">([\s\S]*?)<\/div>/)?.[1] ?? '');
        const url = decodeEntities(link[1]);
        const slug = url.split('/predstavlenie/')[1] ?? url;
        const img = show.match(/<img src="([^"]+)"/)?.[1];
        const id = `${slug}@${date}T${time}`;
        out.set(
          id,
          makeEvent('nationaltheatre', id, {
            title: textOf(link[2]),
            start,
            venue: {
              name: stage ? `Народен театър „Иван Вазов“, ${stage}` : 'Народен театър „Иван Вазов“',
              address: 'ул. Дякон Игнатий 5, София',
              lat: 42.6944,
              lon: 23.3261,
            },
            url,
            image: img ? new URL(img, BASE).href : null,
            categories: ['Театър'],
            description: author || null,
          }),
        );
      }
    }
    await sleep(600);
  }
  return [...out.values()];
}
