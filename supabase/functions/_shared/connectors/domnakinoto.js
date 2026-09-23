// Dom na Kinoto (Дом на киното, ul. Ekzarh Yosif 37): Sofia's arthouse cinema and the main venue for
// film festivals (Sofia DocuMental, Kinomania, Pride Film Fest...), retrospectives and screenings with Q&A.
// SofiaStage only lists ~10 of its screenings, so we read the cinema's own ticketing site (softwareforcinema).
//
// 1 request: /movies/index lists every film currently on sale (<div class="smaller-film-box"> with
//   ".../<slug>-movie<ID>.html", title and "Жанр").
// 1 request per film: GET /movies/getMovieInfo?m=<ID> -> JSON used by the site's date picker:
//   { movie: {title, description, logo, duration_in_minutes},
//     movieProgrammings: { "24.09.2026": { "19:00": { hour, hall, proj_id } } } }  (Sofia local time)
// One event per screening (proj_id). Festival screenings carry the festival as a title prefix
// ("Sofia Documental: ..."); description lines like "24.09 19:00 +Q&A" mark talks after the film.
// Children's films (genre "Детски") are skipped.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, pad } from '../lib/html.js';

const BASE = 'https://domnakinoto.com';
const VENUE = { name: 'Дом на киното', address: 'ул. Екзарх Йосиф 37, 1000 София', lat: 42.6993, lon: 23.3268 };
const TIME_BUDGET_MS = 70_000;
const KIDS = /детски|за деца|kids/i;
// "Sofia Documental: ...", "Киномания: ..." but not "Дюн: Част трета"
const FESTIVAL = /fest|фест|documental|докум|kinomania|киномания|pride|прайд|cinelibri|week|седмица|дни на|ретроспектив|retro|панорама|гендов/i;
const TALK =/q\s*&\s*a|q&a|дискуси|среща с|разговор с|представяне|лекция|beseda|беседа/i;

export default async function domnakinoto() {
  const t0 = Date.now();
  const html = await get(`${BASE}/movies/index`, { as: 'text' });
  const films = new Map();
  for (const box of html.split('class="smaller-film-box"').slice(1)) {
    const link = box.match(/href="(https:\/\/domnakinoto\.com\/[^"?#]*-movie(\d+)\.html)"/);
    if (!link || films.has(link[2])) continue;
    const genre = textOf(box.match(/Жанр:<\/span>\s*<span>([\s\S]*?)<\/span>/)?.[1] ?? '');
    films.set(link[2], { url: link[1], genre });
  }

  const now = Date.now();
  const out = [];
  for (const [id, film] of films) {
    if (Date.now() - t0 > TIME_BUDGET_MS) break;
    if (KIDS.test(film.genre)) continue;
    await sleep(400);
    let info;
    try {
      info = await get(`${BASE}/movies/getMovieInfo?m=${id}`, { retries: 1 });
    } catch {
      continue; // one broken film shouldn't sink the source
    }
    const m = info?.movie ?? {};
    const title = decodeEntities(String(m.title ?? '')).replace(/\s+/g, ' ').trim();
    if (!title || KIDS.test(title)) continue;
    const desc = String(m.description ?? '').replace(/\r/g, '');
    const prefix = title.match(/^([^:]{3,40}):\s/)?.[1] ?? '';
    const festival = FESTIVAL.test(prefix) ? prefix.trim() : null;
    const image = m.logo ? `https://softwareforcinema.com/f/${String(m.logo).replace('/o//', '/m/')}` : null;
    const progs = info?.movieProgrammings && typeof info.movieProgrammings === 'object' ? info.movieProgrammings : {};
    for (const [date, slots] of Object.entries(progs)) {
      const d = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!d || !slots || typeof slots !== 'object') continue;
      for (const slot of Object.values(slots)) {
        const hour = String(slot?.hour ?? '').match(/^(\d{1,2}):(\d{2})/);
        if (!hour) continue;
        const start = sofiaLocalToIso(`${d[3]}-${d[2]}-${d[1]} ${pad(hour[1])}:${hour[2]}`);
        if (Date.parse(start) < now - 3600_000) continue;
        // "24.09 19:00 +Q&A" style notes in the description refer to a specific screening
        const dayLine = desc.split('\n').find((l) => l.includes(`${d[1]}.${d[2]}`) && l.includes(`${pad(hour[1])}:${hour[2]}`)) ?? '';
        const talk = TALK.test(dayLine);
        const minutes = Number(m.duration_in_minutes) || null;
        out.push(
          makeEvent('domnakinoto', String(slot.proj_id ?? `${id}@${start.slice(0, 16)}`), {
            title: talk ? `${title} + Q&A` : title,
            start,
            end: minutes ? new Date(Date.parse(start) + minutes * 60_000).toISOString() : null,
            venue: { ...VENUE, name: slot.hall ? `${VENUE.name}, зала ${String(slot.hall).replace(/^№\s*/, '№')}` : VENUE.name },
            url: film.url,
            image,
            categories: ['кино', film.genre, festival, talk ? 'Q&A' : null].filter(Boolean),
            description: desc || null,
          }),
        );
      }
    }
  }
  return out;
}
