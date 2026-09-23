// Puzl CowOrKing (puzl.com): the events calendar of Sofia's big IT coworking and its Barter Community
// Hub - dev meetups (Python, Xcoders, SNUG, "Anonymous AI-coholics"), e-commerce/startup talks, soft-skills
// evenings, rooftop socials and brunch bazaars. Mostly free, very social. The Webflow page
// /coworking-events renders a CMS list (upcoming first, then "Past events"); each card has
// `.event-time` "September 24, 2026 7:00 PM" (Sofia wall-clock), `.event-title`, `.event-location`
// ("@Barter Community Hub") and a city field (Sofia/Budapest/Bucharest). Cards link out to the
// organiser's Facebook/Meetup/Luma page (tracking params stripped); cards without a link fall back to
// the Puzl page. Only Sofia cards that have not started more than 3 h ago are kept.
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, decodeEntities, monthIndex, pad } from '../lib/html.js';

const LIST = 'https://www.puzl.com/coworking-events';
const ADDRESSES = { 'Puzl CowOrKing Alabin': 'ул. Алабин 58, София' };

export default async function puzl() {
  const html = await get(LIST, { as: 'text' });
  const now = Date.now();
  const out = new Map();
  for (const block of html.split(/role="listitem" class="events-block/).slice(1)) {
    const when = textOf(block.match(/class="event-time">([\s\S]*?)<\/div>/)?.[1]);
    const title = textOf(block.match(/class="event-title">([\s\S]*?)<\/div>/)?.[1]);
    const locs = [...block.matchAll(/class="event-location">([\s\S]*?)<\/div>/g)].map((m) => textOf(m[1]));
    const city = locs.at(-1) ?? '';
    // "September 24, 2026 7:00 PM"
    const m = when.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)/i);
    if (!m || !title || !/sofia|софия/i.test(city)) continue;
    const month = monthIndex(m[1]);
    if (!month) continue;
    let h = Number(m[4]) % 12;
    if (/pm/i.test(m[6])) h += 12;
    const date = `${m[3]}-${pad(month)}-${pad(m[2])}`;
    const start = sofiaLocalToIso(`${date} ${pad(h)}:${m[5]}`);
    if (Date.parse(start) < now - 3 * 3600_000) continue;
    const venue = (locs.length > 1 ? locs[0] : '').replace(/^@/, '').trim() || 'Puzl CowOrKing';
    const id = `${date}-${slugify(title)}`;
    out.set(
      id,
      makeEvent('puzl', id, {
        title,
        start,
        venue: { name: venue, address: ADDRESSES[venue] ?? 'София', lat: null, lon: null },
        url: cleanLink(decodeEntities(block.match(/<a href="([^"]+)"/)?.[1] ?? '')) ?? LIST,
        image: block.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null,
        categories: ['Tech', 'Community', 'Networking', 'Coworking'],
        description: `Събитие в ${venue} (Puzl CowOrKing).`,
      }),
    );
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// Facebook links carry notification-tracking params (?acontext=...&notif_id=...): keep only the event path.
function cleanLink(href) {
  if (!/^https?:/.test(href)) return null;
  try {
    const u = new URL(href);
    if (/(^|\.)facebook\.com$/.test(u.hostname)) return `https://www.facebook.com${u.pathname.replace(/\/$/, '')}/`;
    return href;
  } catch {
    return null;
  }
}

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
