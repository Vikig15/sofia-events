// chess-results.com, Bulgarian federation: rapid/blitz opens, kids' tournaments, corporate championships.
// fed.aspx?fed=BUL lists the ~50 most recently updated BUL tournaments (title only; place/date are free text in
// the title). The tournament search is a POST form, so instead we open the detail page (tnrNNN.aspx) of
// candidates, whose info table has "Location" and "Date" ("2026/09/27" or "2026/10/17 to 2026/10/18"),
// and keep Sofia tournaments that haven't ended. No start time is published: we use 10:00 Sofia time.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities } from '../lib/html.js';

const LIST = 'https://s1.chess-results.com/fed.aspx?lan=1&fed=BUL';
const DETAIL_CAP = 30;
const OTHER_TOWN =
  /пловдив|plovdiv|варна|varna|бургас|burgas|русе|ruse|стара загора|сливен|sliven|плевен|добрич|шумен|хасково|враца|ямбол|смолян|кърджали|kardzhali|видин|ловеч|габрово|пазарджик|благоевград|кюстендил|перник|казанлък|карлово|свищов|търново|tarnovo|велинград|асеновград|самоков|сандански|разлог|севлиево|силистра|панагюрище|нова загора|суворово|павликени|златоград|zlatograd|стражица|шабла|монтана|троян|ботевград|дупница|петрич|поморие|созопол|несебър|албена|банско|пещера|търговище|разград|кранево|приморско|китен|чепеларе|пампорово|елена|трявна/i;

export default async function chessresults() {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const html = await get(LIST, { as: 'text' });
  const rows = [];
  for (const r of html.matchAll(/<tr class="CR[^"]*">([\s\S]*?)<\/tr>/g)) {
    const link = r[1].match(/href="(https?:\/\/[^"]*tnr(\d+)\.aspx[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
    if (link) rows.push({ id: link[2], url: `https://chess-results.com/tnr${link[2]}.aspx?lan=1`, title: textOf(decodeEntities(link[3])) });
  }
  if (!rows.length) throw new Error('chessresults: no tournaments parsed');

  // Sofia in the title first, then titles without any other town; skip clearly non-Sofia ones.
  const sofiaFirst = (t) => (/софия|sofia/i.test(t) ? 0 : 1);
  const candidates = rows
    .filter((r) => /софия|sofia/i.test(r.title) || !OTHER_TOWN.test(r.title))
    .sort((a, b) => sofiaFirst(a.title) - sofiaFirst(b.title))
    .slice(0, DETAIL_CAP);

  const out = [];
  for (const c of candidates) {
    let page;
    try {
      page = await get(`${c.url}&turdet=YES`, { as: 'text' }); // details table is hidden without turdet
    } catch {
      continue;
    }
    await sleep(500);
    const info = {};
    for (const m of page.matchAll(/<tr[^>]*>\s*<td class="CR"[^>]*>([\s\S]*?)<\/td>\s*<td class="CR"[^>]*>([\s\S]*?)<\/td>/g)) {
      info[textOf(decodeEntities(m[1]))] = textOf(decodeEntities(m[2]));
    }
    // Location is free text: "гр. София", "Sofia Metropoliten Hotel", or just a hotel + street (city in title).
    const location = info.Location || 'София';
    if (!/софия|sofia/i.test(`${location} ${c.title}`) || OTHER_TOWN.test(location)) continue;
    const dates = [...(info.Date ?? '').matchAll(/(\d{4})\/(\d{2})\/(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
    if (!dates.length) continue;
    const [from, to = from] = dates;
    if (to < today) continue;
    out.push(
      makeEvent('chessresults', c.id, {
        title: c.title,
        start: sofiaLocalToIso(`${from} 10:00`),
        end: to !== from ? sofiaLocalToIso(`${to} 20:00`) : null,
        venue: { name: location, address: null, lat: null, lon: null },
        url: c.url,
        categories: ['Шахмат', info['Time control (Rapid)'] ? 'Rapid' : info['Time control (Blitz)'] ? 'Blitz' : null].filter(Boolean),
        description: [info['Organizer(s)'] && `Organizer: ${info['Organizer(s)']}`, info['Tournament type'], Object.entries(info).find(([k]) => k.startsWith('Time control'))?.join(': ')]
          .filter(Boolean)
          .join('. '),
      }),
    );
  }
  return out;
}
