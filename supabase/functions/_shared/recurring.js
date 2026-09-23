// Hand-curated weekly events, mostly from organisers who only post on Facebook/Instagram.
// These are often the most social events in the city, so it's worth keeping them here by hand.
// Re-check each one roughly monthly and bump `verified`; the run warns when a rule is >45 days old.
import { makeEvent, sofiaLocalToIso } from './lib/event.js';

export const RULES = [
  { key: '5kmrun-south', title: '5kmrun: free timed 5k (Южен парк)', weekday: 6, time: '09:00', venue: 'Южен парк', link: 'https://5kmrun.bg/5kmrun/events', tags: ['Running', 'Sport'], verified: '2026-09-23' },
  { key: '5kmrun-west', title: '5kmrun: free timed 5k (Западен парк 2)', weekday: 6, time: '09:00', venue: 'Западен парк', link: 'https://5kmrun.bg/5kmrun/events', tags: ['Running', 'Sport'], verified: '2026-09-23' },
  { key: 'practical-philosophy', title: 'Practical Philosophy evening', weekday: 1, time: '19:00', venue: 'бул. Витоша 13', link: 'https://practicalphilosophy.club/sofia', tags: ['Philosophy', 'Talk'], verified: '2026-09-23' },
  { key: 'inside-joke', title: 'Inside Joke: English stand-up open mic', weekday: 1, time: '21:00', venue: 'KEVA, ул. Раковски 114', link: 'https://insidejokestandup.com', tags: ['Comedy', 'Nightlife'], verified: '2026-09-23' },
  { key: 'timeout-salsa', title: 'Time Out Salsa Night', weekday: 2, time: '21:30', venue: 'Time Out', link: 'https://www.partita.bg/en/list/sofia', tags: ['Dance', 'Salsa'], verified: '2026-09-23' },
  { key: 'dance-lake', title: 'Танци до Езерото (social dance)', weekday: 3, time: '20:00', venue: 'Езерото', link: 'https://www.partita.bg/en/list/sofia', tags: ['Dance', 'Bachata'], verified: '2026-09-23' },
  { key: 'timeleft', title: 'Timeleft: dinner with 5 strangers', weekday: 3, time: '20:00', venue: 'Restaurant assigned in app', link: 'https://timeleft.com', tags: ['Dinner', 'Social'], verified: '2026-09-23', note: 'Day and time not confirmed for Sofia; check the app' },
];

const DAYS_AHEAD = 28;

export function expandRules(now = new Date()) {
  const out = [];
  for (const r of RULES) {
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      const localDate = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' }); // YYYY-MM-DD
      const weekday = new Date(`${localDate}T12:00:00Z`).getUTCDay();
      if (weekday !== r.weekday) continue;
      out.push(
        makeEvent('recurring', `${r.key}:${localDate}`, {
          title: r.title,
          start: sofiaLocalToIso(`${localDate} ${r.time}`),
          venue: { name: r.venue, address: null, lat: null, lon: null },
          url: r.link,
          categories: r.tags,
          recurring: true,
          description: r.note ?? null,
        }),
      );
    }
  }
  return out;
}

export function staleRules(now = new Date(), maxAgeDays = 45) {
  return RULES.filter((r) => (now - new Date(r.verified)) / 86_400_000 > maxAgeDays).map((r) => r.key);
}
