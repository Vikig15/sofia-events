// efbet Лига (Bulgarian First League football, efbetleague.com, the league's official site): matches
// played at Sofia stadiums (Левски, ЦСКА, ЦСКА 1948, Славия, Локомотив София, Септември София home games).
// /matches is a Next.js page whose React Server Component payload (`self.__next_f.push([1,"..."])`)
// embeds the whole season: each match object has kickoffTime (UTC, "$D2026-11-08T15:00:00.000Z"),
// competitorOne (home) / competitorTwo, venue.name and fansUnitedMatchId ("fb:m:534541" -> /match/fb-m-534541).
// Kick-off times are fixed by the BFU ~3-4 weeks ahead; until then every match of a round carries the
// same placeholder (Saturday 19:00/20:00). Rounds where >= 4 matches share one kickoff are treated as
// unconfirmed and skipped: they appear once the real dates are published. Spectator event.
import { get } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const BASE = 'https://efbetleague.com';
// Venue names as the site spells them; "Витоша", Бистрица (ЦСКА 1948) is inside Sofia municipality.
const SOFIA_VENUES = /Българска армия|Георги Аспарухов|Васил Левски|Шаламанов|Локомотив", София|Витоша", Бистрица|Академик|Славия|София/;
const SOFIA_HOME = /^(Левски|ЦСКА|ЦСКА 1948|Славия|Локомотив \(София\)|Септември \(София\))$/;

export default async function efbetleague() {
  const html = await get(`${BASE}/matches`, { as: 'text' });
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)) {
    try {
      const chunk = JSON.parse(m[1]);
      if (typeof chunk[1] === 'string') flight += chunk[1];
    } catch {
      /* non-string chunks */
    }
  }
  const matches = new Map();
  for (const p of flight.split(/(?=\{"id":"\d+","slug":"[^"]+","sport":"football")/).slice(1)) {
    const id = p.match(/^\{"id":"(\d+)"/)[1];
    const status = p.match(/"status":\{"code":"([^"]+)"/)?.[1];
    const kickoff = p.match(/"kickoffTime":"\$D([^"]+)"/)?.[1];
    const home = p.match(/"competitorOne":\{"id":"\d+","name":"([^"]+)"/)?.[1];
    const away = p.match(/"competitorTwo":\{"id":"\d+","name":"([^"]+)"/)?.[1];
    if (!kickoff || !home || !away || status !== 'not_started') continue;
    const venueRaw = p.match(/"venue":\{"id":"\d+","name":"((?:[^"\\]|\\.)*)"/)?.[1];
    matches.set(id, {
      id,
      kickoff,
      home,
      away,
      venue: venueRaw ? venueRaw.replace(/\\"/g, '"') : null,
      round: p.match(/"round":\{"id":"\d+","key":"([^"]+)"/)?.[1] ?? '?',
      comp: p.match(/"competition":\{"id":"\d+","name":"([^"]+)"/)?.[1] ?? 'efbet Лига',
      fu: p.match(/"fansUnitedMatchId":"fb:m:(\d+)"/)?.[1],
    });
  }
  if (!matches.size) throw new Error('efbetleague: no matches found in /matches payload');

  // Placeholder detection: count identical kickoffs per round.
  const perSlot = new Map();
  for (const m of matches.values()) perSlot.set(`${m.round}|${m.kickoff}`, (perSlot.get(`${m.round}|${m.kickoff}`) ?? 0) + 1);

  const now = Date.now();
  return [...matches.values()]
    .filter((m) => (m.venue ? SOFIA_VENUES.test(m.venue) : SOFIA_HOME.test(m.home)))
    .filter((m) => perSlot.get(`${m.round}|${m.kickoff}`) < 4)
    .filter((m) => Date.parse(m.kickoff) > now - 2 * 3600_000)
    .map((m) => {
      const venue = m.venue ?? `стадион на ${m.home}`;
      return makeEvent('efbetleague', m.id, {
        title: `Футбол: ${m.home} - ${m.away}`,
        start: m.kickoff,
        end: new Date(Date.parse(m.kickoff) + 2 * 3600_000).toISOString(),
        venue: { name: `Стадион ${venue}`.replace(/Стадион Стадион/, 'Стадион'), address: 'София', lat: null, lon: null },
        url: m.fu ? `${BASE}/match/fb-m-${m.fu}` : `${BASE}/matches`,
        categories: ['Sport', 'Football', 'Spectator', m.comp],
        description: `${m.comp}, кръг ${m.round}: ${m.home} (домакин) срещу ${m.away}.`,
      });
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}
