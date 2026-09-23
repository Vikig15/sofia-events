// Sofia Opera and Ballet (operasofia.bg). /repertoire lists productions with "dd.mm" ranges (no year, no time),
// but /calendar/YYYY-MM lists every performance per day with start time, stage and address, so we use that.
// The calendar shows adult performances by default; kids' shows need ?categories[]=5, so we fetch both.
// Guest performances in other towns ("Гостуване в ... Стара Загора") are dropped by the address check.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, inferYear, pad } from '../lib/html.js';

const BASE = 'https://www.operasofia.bg';
const MONTHS_AHEAD = 3;

export default async function opera() {
  const now = Date.now();
  const out = new Map();
  const d0 = new Date();
  for (let i = 0; i < MONTHS_AHEAD; i++) {
    const d = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + i, 1));
    const y = d.getUTCFullYear();
    for (const kidsList of [false, true]) {
      const html = await get(`${BASE}/calendar/${y}-${pad(d.getUTCMonth() + 1)}${kidsList ? '?categories[]=5' : ''}`, { as: 'text' });
      for (const section of html.split('<div class="section">').slice(1)) {
        const day = section.match(/class="day-number">\s*(\d{1,2})/)?.[1];
        const monthName = section.match(/class="week">\s*([^<\s]+)/)?.[1];
        const month = monthName ? monthIndex(monthName) : null;
        if (!day || !month) continue;
        const year = month === d.getUTCMonth() + 1 ? y : inferYear(month, Number(day));
        for (const art of section.split('<article class="item">').slice(1)) {
          const link = art.match(/href="(https:\/\/www\.operasofia\.bg\/repertoire\/[^"]+)"/)?.[1];
          const title = textOf(art.match(/item__description__name">([\s\S]*?)<\/h2>/)?.[1] ?? '');
          if (!link || !title) continue;
          const time = art.match(/start-time__hour">\s*(\d{1,2}:\d{2})/)?.[1] ?? '19:00';
          const stage = textOf(art.match(/item__location__scene[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
          const address = textOf(art.match(/item__location__address">([\s\S]*?)<\/p>/)?.[1] ?? '');
          if (address && !/софия|sofia/i.test(address)) continue;
          const author = textOf(art.match(/item__description__author">([\s\S]*?)<\/p>/)?.[1] ?? '');
          if (/гостуван/i.test(author) && !/софия/i.test(author)) continue;
          const start = sofiaLocalToIso(`${year}-${pad(month)}-${pad(day)} ${time}`);
          if (Date.parse(start) < now - 3 * 3600_000) continue;
          const kids = kidsList || /icon-performance-children|за деца/i.test(art);
          const inHouse = !stage || /зала|сцена/i.test(stage) && !/дворец|ндк/i.test(stage);
          const venueName = inHouse ? `Софийска опера и балет${stage ? `, ${stage}` : ''}` : stage.split(/\s*(?:пл\.|ул\.|бул\.)/)[0];
          const ticket = art.match(/buy-tickets\/(\d+)/)?.[1];
          const id = ticket ?? `${link.split('/').pop()}@${start.slice(0, 16)}`;
          out.set(
            id,
            makeEvent('opera', id, {
              title: decodeEntities(title),
              start,
              venue: {
                name: venueName,
                address: address || (inHouse ? 'ул. Врабча 1, София' : null),
                lat: null,
                lon: null,
              },
              url: link,
              categories: ['Опера и балет', ...(kids ? ['За деца'] : [])],
              description: author || null,
            }),
          );
        }
      }
      await sleep(600);
    }
  }
  return [...out.values()];
}
