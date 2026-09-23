// Luma: internal discover API by coordinates, no auth. Best source for networking/startup/social.
// The geo discover feed only lists "featured" events (~40, ~8 weeks ahead). Organiser calendars list
// more: on 2026-09-23 crawling the calendars behind the discover events (+ a seed list of Sofia
// calendars, so a calendar with no event in today's discover feed is still read) added ~17 Sofia events
// (handpan courses, Mamapreneur, AIE.F after-hours, nostalgia. meetups, Blockchain Week side events).
// Tried without gain: other lat/lon centres (same 42), pagination_limit=100, category_api_id (ignored),
// `slug=<category>` (a subset), get-place-v2 / url/get for "sofia" (404: Luma has no Sofia place page).
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const BASE = 'https://api.lu.ma/discover/get-paginated-events?latitude=42.6977&longitude=23.3219&pagination_limit=50';
const CAL_ITEMS = 'https://api.lu.ma/calendar/get-items?period=future&pagination_limit=50&calendar_api_id=';
const CENTER = { lat: 42.6977, lon: 23.3219 };
const MAX_CALENDARS = 45;

// Sofia-based organiser calendars seen on 2026-09-23 (all their events are in Bulgaria).
const SEED_CALENDARS = [
  'cal-nXBQGZ04EVG5DXx', // Mamapreneur
  'cal-h5VLvqXsHCiDesc', // Unicorns.BG
  'cal-MOFtoLTHCbJtl5O', // Zendō Space - The Handpan House
  'cal-A27fcxgL0vzOMgk', // Xcoders Sofia
  'cal-fNLt8CGojESOWcY', // OWASP Sofia Chapter
  'cal-xYdwq2N6Q19gvZ5', // AI4ND
  'cal-YIB0qxULb0SHpSn', // STP Events (Sofia Tech Park)
  'cal-8YW8YRE0uRYvz2T', // Blockchain Week Bulgaria
  'cal-z9CTcOp5OxFAA17', // Bulgaria Ecom Meetup
  'cal-XSBsMvjx9MzVWBX', // nostalgia. Sofia
  'cal-LNs40ElbqgZATjj', // Съзвучни събития и групи
  'cal-XfEdWuOht9rxjE6', // Soul and Soil Club
  'cal-x3glDNwGHrEY3Bc', // Mentor the Alumni - Bulgaria
  'cal-hPXfuK4kS1hfrUW', // BG | Puzl Event Program
  'cal-EDo73xpiAotxUS7', // VertoDigital
  'cal-plrEJX3KeBFhiPT', // Life at Campus X
  'cal-yhLAcGFbknoxAyf', // Flex & Connect
  'cal-pK4H5NVgaFanLmQ', // BESCO Events
  'cal-4cHeQNXrXrLWPAk', // AI Engineer Foundation Europe (Sofia after-hours)
  'cal-quVSsJESvJT2aKG', // Anonymous AI-coholics
  'cal-mUiBzGIpDG3wAwB', // Фондация "Дари Време"
  'cal-aXwxrSs74d5LylI', // Business Mixer
  'cal-p1NiTroCg1xp9mc', // Sourcelab
  'cal-JBViqk7FiD5hzNT', // Innovate with Agriventures
  'cal-57x87hApZ6pOqVq', // Лидер.БГ
  'cal-zIatzCm667BvksA', // Delarto | Italy Around The Corner
];
const SEEDS = new Set(SEED_CALENDARS);

function toEvent(entry) {
  const e = entry.event;
  const geo = e.geo_address_info ?? {};
  const t = entry.ticket_info ?? {};
  const [lat, lon] = coords(e);
  return makeEvent('luma', e.api_id, {
    title: e.name,
    start: e.start_at,
    end: e.end_at,
    venue: {
      name: geo.address ?? null,
      address: geo.full_address ?? null,
      lat,
      lon,
    },
    url: `https://luma.com/${e.url}`,
    image: e.cover_url,
    price: t.is_free ? { min: 0, currency: null, free: true } : null,
    categories: [entry.calendar?.name].filter(Boolean),
    attendees: entry.guest_count ?? null,
    online: e.location_type !== 'offline',
  });
}

export default async function luma() {
  const byId = new Map();
  const calendars = new Map(SEED_CALENDARS.map((id) => [id, true]));
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const res = await get(cursor ? `${BASE}&pagination_cursor=${encodeURIComponent(cursor)}` : BASE);
    for (const entry of res.entries ?? []) {
      const cal = entry.calendar;
      if (cal?.api_id && !cal.personal_user_api_id) calendars.set(cal.api_id, true);
      const geo = entry.event.geo_address_info ?? {};
      if (geo.country_code && geo.country_code !== 'BG') continue;
      byId.set(entry.event.api_id, toEvent(entry));
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
    await sleep(500);
  }

  // Organiser calendars: one page (50 upcoming) each; global calendars need a Sofia location.
  let extra = 0;
  for (const calId of [...calendars.keys()].slice(0, MAX_CALENDARS)) {
    await sleep(300);
    const res = await get(CAL_ITEMS + calId).catch(() => null);
    for (const entry of res?.entries ?? []) {
      const e = entry.event;
      if (!e?.api_id || byId.has(e.api_id) || e.location_type !== 'offline') continue;
      if (!inSofia(e, SEEDS.has(calId) || /sofia|софия/i.test(entry.calendar?.name ?? ''))) continue;
      byId.set(e.api_id, toEvent(entry));
      extra++;
    }
  }
  console.log(`  luma: ${byId.size - extra} discover + ${extra} from ${Math.min(calendars.size, MAX_CALENDARS)} calendars`);
  return [...byId.values()];
}

function coords(e) {
  const geo = e.geo_address_info ?? {};
  let lat = num(e.coordinate?.latitude ?? geo.latitude);
  let lon = num(e.coordinate?.longitude ?? geo.longitude);
  // Some hosts type raw coordinates as a manual address: "42.568475, 23.196520".
  const m = String(geo.address ?? '').match(/^\s*(4\d\.\d+)\s*,\s*(2\d\.\d+)\s*$/);
  if ((lat === null || lon === null) && m) [lat, lon] = [Number(m[1]), Number(m[2])];
  return [lat, lon];
}

// Calendar items aren't geo-filtered. Coordinates decide when present; else the typed address/city
// must say Sofia, or (address hidden until registration) the calendar must be a Sofia one.
function inSofia(e, localCalendar) {
  const geo = e.geo_address_info ?? {};
  const [lat, lon] = coords(e);
  if (lat !== null && lon !== null) return km(lat, lon, CENTER.lat, CENTER.lon) <= 30;
  const text = `${geo.city ?? ''} ${geo.city_state ?? ''} ${geo.full_address ?? ''} ${geo.address ?? ''}`;
  if (/sofia|софия/i.test(text)) return true;
  if (geo.city || geo.country_code || /https?:\/\//i.test(geo.address ?? '')) return false;
  return localCalendar;
}

const num = (x) => (x === undefined || x === null || x === '' || Number.isNaN(Number(x)) ? null : Number(x));

function km(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const x = (lon2 - lon1) * r * Math.cos(((lat1 + lat2) / 2) * r);
  const y = (lat2 - lat1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
