// NBL (Bulgarian basketball league, nbl.basketball.bg): home games of the Sofia teams (Левски at
// "Триадица", ЦСКА at "IZZI Арена", occasionally other Sofia halls) plus any Supercup/cup game played in
// Sofia. One server-rendered page (/games) lists the whole season's programme: each `<div class="tr">`
// row has home/away team names, "10-10-2026 <span>19:00</span>" (Sofia wall-clock) and
// "НБЛ | Редовен сезон<br>Hall (Town)". We keep rows whose town is "София". Spectator event, not
// participatory; the league often confirms/shifts tip-off times ~2 weeks ahead, so far-future times
// are provisional (the daily refresh picks up changes; ids are the stable game ids).
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf } from '../lib/html.js';

const BASE = 'https://nbl.basketball.bg';

export default async function nbl() {
  const html = await get(`${BASE}/games`, { as: 'text' });
  const now = Date.now();
  const out = new Map();
  for (const row of html.split(/<div class="tr">/).slice(1)) {
    const id = row.match(/href="game-(\d+)"/)?.[1];
    const names = [...row.matchAll(/class="td td_name"><a[^>]*>([\s\S]*?)<\/a>/g)].map((m) => textOf(m[1]));
    const d = row.match(/class="date">\s*(\d{2})-(\d{2})-(\d{4})\s*<span>\s*(\d{1,2}):(\d{2})/);
    const champ = row.match(/class="td champ">([\s\S]*?)<\/div>/)?.[1] ?? '';
    const [comp, hallRaw] = champ.split(/<br\s*\/?>/i).map(textOf);
    const town = hallRaw?.match(/\(([^()]+)\)\s*$/)?.[1] ?? '';
    if (!id || names.length < 2 || !d || !/софия/i.test(town)) continue;
    const start = sofiaLocalToIso(`${d[3]}-${d[2]}-${d[1]} ${d[4].padStart(2, '0')}:${d[5]}`);
    if (Date.parse(start) < now - 2 * 3600_000) continue;
    const hall = hallRaw.replace(/\s*\([^()]+\)\s*$/, '');
    out.set(
      id,
      makeEvent('nbl', id, {
        title: `Баскетбол: ${names[0]} - ${names[1]}`,
        start,
        end: new Date(Date.parse(start) + 2 * 3600_000).toISOString(),
        venue: { name: hall, address: 'София', lat: null, lon: null },
        url: `${BASE}/game-${id}`,
        categories: ['Sport', 'Basketball', 'Spectator', comp].filter(Boolean),
        description: `${comp || 'НБЛ'}: ${names[0]} (домакин) срещу ${names[1]}.`,
      }),
    );
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}
