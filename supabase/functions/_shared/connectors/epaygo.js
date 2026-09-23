// EPAYGO (epaygo.bg, ePay's ticketing arm): Arena 8888, National Theatre, Opera, TBA, Satirical Theatre,
// CINELIBRI, stand-up tours, seminars, walking tours. Nationwide catalogue (~850 sales), no JSON-LD.
//
// Cheap path (verified 2026-09-23): every category page (/epaygo/<cat>) embeds the full list for that
// category as `var events_page_tt = [...]` with "SALE.EVENT_DATE" ("dd.mm.yyyy HH:MM") and
// "SALE.EVENT_PLACE" (free-text venue). /events/all embeds `autocomplete_events_tt` (name, host, date
// range) for every sale. /epaygo/city/sofia embeds a Sofia-tagged subset, but the city tag is incomplete
// (e.g. National Theatre shows are missing), so we classify by venue/title/host text instead and only
// fetch detail pages (address + map pin) for the ambiguous remainder, capped.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, pad } from '../lib/html.js';

const BASE = 'https://epaygo.bg';
const CATS = [
  'concerts-and-festivals',
  'theater-and-opera',
  'trainings-and-seminars',
  'sports-and-health',
  'party-and-clubs',
  'comedy-and-show',
  'for-kids',
  'free-events',
];
const CAT_LABEL = {
  'concerts-and-festivals': 'Концерти и фестивали',
  'theater-and-opera': 'Театър, опера и балет',
  'trainings-and-seminars': 'Семинари и обучения',
  'sports-and-health': 'Спорт и здраве',
  'party-and-clubs': 'Парти и клубове',
  'comedy-and-show': 'Комедия и шоу',
  'for-kids': 'За децата',
  'free-events': 'Безплатни',
};
const DETAIL_CAP = 70;
// Detail pages are slow from Supabase's region; stop resolving after this so the run always
// finishes inside the Edge wall-clock limit (unresolved 'unknown' sales are simply skipped).
const DETAIL_BUDGET_MS = 60_000;
const DAY = 86_400_000;

// Venue/title/host text that pins an event to Sofia.
const SOFIA_RE = new RegExp(
  [
    'софи[яй]', 'sofia', 'ндк', 'ndk', 'народен театър', 'народен театър', 'тба', 'театър българска армия',
    'сатиричен', 'сатитиричен', 'happy сатира', 'музикален театър', 'зад канала', 'люмиер', 'влайкова',
    'топлоцентрала', 'toplocentrala', 'arena 8888', 'арена 8888', 'city stage', 'сити марк', 'дом на киното',
    'централни хали', 'централен военен клуб', 'mixtape', 'joy station', 'pirotska', 'пиротска', 'derida', 'дерида',
    'театър о3', 'live & loud', 'live&loud', 'грамофон', 'gramophone', 'club pave', 'клуб "паве"', 'средец',
    'аула на су', 'национална художествена галерия', 'фабрика култура', 'the pit', 'clwd', 'stochna', 'botanico',
    'litex tower', 'цум', 'bee bop', 'yalta', 'carrusel', 'gravity bar', 'allure caribe',
    'мара белчева', 'дом на енергетика', 'laura event', 'holy smokes', 'бохемска', 'кинокулт', 'kinocult',
    'tokino', 'токино', 'банкя', 'гурко', 'сакъзов',
  ].join('|'),
  'i',
);
// Other towns / clearly-not-Sofia markers. Checked on the venue first, then the title.
const OTHER_RE = new RegExp(
  [
    'пловдив', 'plovdiv', 'варна', 'varna', 'бургас', 'burgas', 'русе', 'стара загора', 'сливен', 'плевен',
    'добрич', 'шумен', 'хасково', 'враца', 'ямбол', 'смолян', 'кърджали', 'видин', 'ловеч', 'габрово',
    'пазарджик', 'благоевград', 'кюстендил', 'перник', 'казанлък', 'карлово', 'свищов', 'велико търново',
    'търново', 'горна оряховица', 'велинград', 'асеновград', 'самоков', 'сандански', 'разлог', 'севлиево',
    'каварна', 'лом', 'силистра', 'гоце делчев', 'панагюрище', 'хисаря', 'първомай', 'тетевен', 'етрополе',
    'радомир', 'своге', 'елин пелин', 'димитровград', 'девин', 'рудозем', 'чепеларе', 'момчилград', 'карнобат',
    'монтана', 'троян', 'ботевград', 'дупница', 'петрич', 'нова загора', 'поморие', 'созопол', 'несебър',
    'балчик', 'айтос', 'мездра', 'козлодуй', 'търговище', 'разград', 'попово', 'провадия', 'трявна', 'дряново',
    'берковица', 'белоградчик', 'банско', 'пещера', 'харманли', 'свиленград', 'ихтиман', 'велики преслав',
    'чехия', 'прага', 'ubc sound', 'maestro georgi atanasov', 'bristol', 'midlands', 'southend', 'dumfies', 'brick port', 'vratsa', 'harlem jazz',
    'национално турне', 'турне',
  ]
    .map((w) => (w.length <= 4 ? `(?:^|[^а-яa-z])${w}(?:[^а-яa-z]|$)` : w))
    .join('|'),
  'i',
);
const GR_OTHER_RE = /(?:^|\s)гр\.\s*(?!софия)/i; // "Гр. Русе - ..." but not "гр. София"

const dmyToLocal = (s) => {
  const m = String(s ?? '').match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
  return m ? { date: `${m[3]}-${m[2]}-${m[1]}`, time: m[4] ?? null } : null;
};

function embeddedArray(html, name) {
  const m = html.match(new RegExp(`var ${name}\\s*=\\s*(\\[[\\s\\S]*?\\n\\])\\s*;?`));
  if (!m) return [];
  try {
    return JSON.parse(m[1]);
  } catch {
    return [];
  }
}

const isOther = (s) => OTHER_RE.test(s) || GR_OTHER_RE.test(s);

// venue decides first; then an explicit town in the title ("... в Монтана"); then organiser hints.
function classify(venue, title, host) {
  venue = venue ?? '';
  if (/софи[яй]|sofia/i.test(venue)) return 'sofia';
  if (isOther(venue)) return 'other';
  if (SOFIA_RE.test(venue)) return 'sofia';
  if (/(?:^|[^а-я])(?:в|за|in)\s+(?:софия|sofia)/i.test(title ?? '')) return 'sofia';
  if (isOther(title ?? '')) return 'other';
  const rest = `${title ?? ''} | ${host ?? ''}`;
  if (/софи[яй]|sofia/i.test(rest)) return 'sofia';
  if (isOther(host ?? '')) return 'other';
  if (SOFIA_RE.test(rest)) return 'sofia';
  return 'unknown';
}

async function detail(id) {
  const html = await get(`${BASE}/${id}`, { as: 'text' });
  const block = (re) => {
    const m = html.match(re);
    return m ? textOf(m[1]) : null;
  };
  const venueName = block(/id="address_t"[\s\S]*?<span class="fsmob wrap-text">([\s\S]*?)<\/span>/);
  const address = block(/id="address"[\s\S]*?<span class="fsmob wrap-text">([\s\S]*?)<\/span>/);
  const pin = html.match(/google\.[a-z.]+\/maps\/[^"']*?@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const lat = pin ? Number(pin[1]) : null;
  const lon = pin ? Number(pin[2]) : null;
  const time = html.match(/Начален час:\s*(\d{1,2}:\d{2})/)?.[1] ?? null;
  const hd = html.match(/id="headline_date"[^>]*>\s*<span>(\d{1,2})<\/span>[\s\S]*?<span>([^<\d]+)\s+(\d{4})<\/span>/);
  const date = hd && monthIndex(hd[2].trim()) ? `${hd[3]}-${pad(monthIndex(hd[2].trim()))}-${pad(hd[1])}` : null;
  const desc = html.match(/id="ac-3" class="ac-content">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] ?? null;
  const inSofiaBox = lat !== null && lat > 42.6 && lat < 42.8 && lon > 23.15 && lon < 23.5;
  const inBulgaria = lat !== null && lat > 41.2 && lat < 44.3 && lon > 22.3 && lon < 28.7;
  // the address is the most reliable signal; a map pin outside Sofia overrides venue-name hints
  let city = /софи[яй]|sofia/i.test(address ?? '') ? 'sofia' : isOther(address ?? '') ? 'other' : classify(venueName, '', '');
  if (inSofiaBox) city = 'sofia';
  else if (inBulgaria && city !== 'other') city = /софи[яй]|sofia/i.test(address ?? '') ? 'sofia' : 'other';
  return { venueName, address, lat: inSofiaBox ? lat : null, lon: inSofiaBox ? lon : null, time, date, desc, city };
}

export default async function epaygo() {
  const now = Date.now();
  const byId = new Map(); // PUBLIC_ID -> { name, date, time, place, cats, pic }

  for (const cat of CATS) {
    try {
      const html = await get(`${BASE}/epaygo/${cat}`, { as: 'text' });
      for (const x of embeddedArray(html, 'events_page_tt')) {
        const id = x['SALE.PUBLIC_ID'];
        if (!id) continue;
        const prev = byId.get(id);
        if (prev) {
          prev.cats.add(CAT_LABEL[cat]);
          continue;
        }
        const d = dmyToLocal(x['SALE.EVENT_DATE']);
        byId.set(id, {
          name: decodeEntities(x['SALE.NAME'] ?? '').trim(),
          date: d?.date ?? null,
          time: d?.time ?? x.EVENT_HOUR ?? null,
          place: decodeEntities(x['SALE.EVENT_PLACE'] ?? '').trim(),
          cats: new Set([CAT_LABEL[cat], ...[].concat(x.CAT_NAME ?? [])]),
          pic: x.PIC ?? null,
        });
      }
    } catch (err) {
      console.warn(`  epaygo: category ${cat} failed: ${err.message}`);
    }
    await sleep(400);
  }

  // Names, organiser and date range for every sale (also catches sales not in any category).
  const allHtml = await get(`${BASE}/events/all`, { as: 'text' });
  const ac = new Map(embeddedArray(allHtml, 'autocomplete_events_tt').map((x) => [x.PUBLIC_ID, x]));
  for (const [id, x] of ac) {
    if (byId.has(id)) continue;
    const d = dmyToLocal(x.EVENT_DATE);
    byId.set(id, { name: decodeEntities(x.NAME ?? '').trim(), date: d?.date ?? null, time: null, place: '', cats: new Set(), pic: null });
  }
  if (byId.size < 50) throw new Error(`epaygo: only ${byId.size} sales parsed, page layout changed?`);

  // Sofia-tagged subset: a positive signal only.
  await sleep(400);
  const sofiaTagged = new Set();
  try {
    const cityHtml = await get(`${BASE}/epaygo/city/sofia`, { as: 'text' });
    for (const x of embeddedArray(cityHtml, 'events_page_tt')) sofiaTagged.add(x['SALE.PUBLIC_ID']);
  } catch {
    /* optional */
  }

  const rows = [];
  for (const [id, e] of byId) {
    const meta = ac.get(id);
    const range = String(meta?.EVENT_DATE ?? '').split(' - ');
    const end = range.length > 1 ? dmyToLocal(range[1])?.date : null;
    // upcoming only: start today or later, or a short (<=31 day) run that is still going
    const startMs = e.date ? Date.parse(`${e.date}T23:59:59Z`) : NaN;
    const endMs = end ? Date.parse(`${end}T23:59:59Z`) : NaN;
    const upcoming = startMs >= now - DAY / 2 || (endMs >= now && endMs - startMs <= 31 * DAY);
    if (!e.date || !upcoming) continue;
    const city = sofiaTagged.has(id) ? 'sofia' : classify(e.place, e.name, meta?.EVENT_HOST_NAME);
    if (city === 'other') continue;
    rows.push({ id, e, meta, end, city });
  }

  // Resolve the ambiguous ones (and sales with no time) via detail pages, soonest first.
  const needDetail = rows
    .filter((r) => r.city === 'unknown' || !r.e.time)
    .sort((a, b) => (a.e.date < b.e.date ? -1 : 1))
    .slice(0, DETAIL_CAP);
  const details = new Map();
  const detailDeadline = Date.now() + DETAIL_BUDGET_MS;
  for (const r of needDetail) {
    if (Date.now() > detailDeadline) break;
    try {
      details.set(r.id, await detail(r.id));
    } catch {
      /* skip */
    }
    await sleep(350);
  }

  const out = [];
  for (const { id, e, meta, end, city } of rows) {
    const d = details.get(id);
    const finalCity = d ? (city === 'sofia' ? 'sofia' : d.city) : city;
    if (finalCity !== 'sofia') continue;
    const date = e.date ?? d?.date;
    const time = e.time ?? d?.time;
    if (!date) continue;
    const start = sofiaLocalToIso(`${date} ${time ?? '00:00'}`);
    if (Date.parse(start) < now - 6 * 3600_000 && !(end && Date.parse(`${end}T23:59:59Z`) >= now)) continue;
    out.push(
      makeEvent('epaygo', id, {
        title: e.name,
        start,
        end: end && end !== date ? sofiaLocalToIso(`${end} 23:59`) : null,
        venue: {
          name: d?.venueName || e.place || null,
          address: d?.address ?? null,
          lat: d?.lat ?? null,
          lon: d?.lon ?? null,
        },
        url: `${BASE}/${id}`,
        image: e.pic ? `https://online.epay.bg/v3/eventpic/${id}/${e.pic}` : null,
        categories: [...e.cats, meta?.EVENT_HOST_NAME].filter(Boolean),
        description: d?.desc ?? null,
      }),
    );
  }
  return out;
}
