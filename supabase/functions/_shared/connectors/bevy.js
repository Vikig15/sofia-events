// Bevy community platforms (the white-label "community.dev" software behind GDG, Startup Grind, CNCF,
// Atlassian ACE, Tableau & Snowflake user groups). Every Bevy site exposes the same public JSON API:
//   /api/search/chapter/?q=sofia                       -> chapter ids (used once to build CHAPTERS below)
//   /api/event_slim/for_chapter/<id>/?status=Live      -> upcoming events (start_date/end_date in UTC)
//   /api/event/<id>/                                   -> venue_name/venue_address/venue_city, total_attendees
// The Sofia chapters are low-volume (each runs 1-6 in-person events a year: tech talks, "Jira, Rovo &
// Beer", KCD Sofia, IWD nights, Christmas quiz), so 0 upcoming events is normal; the value is that
// these rarely show up on Meetup/Luma. Virtual-only events and events outside Sofia are dropped.
import { get, sleep } from '../lib/http.js';
import { makeEvent, stripHtml } from '../lib/event.js';

// host, chapter id, label. Re-discover with /api/search/chapter/?q=sofia (and ?q=bulgaria) per host.
const CHAPTERS = [
  ['gdg.community.dev', 852, 'GDG Sofia'],
  ['www.startupgrind.com', 78, 'Startup Grind Sofia'],
  ['ace.atlassian.com', 122, 'Atlassian Community Events Sofia'],
  ['community.cncf.io', 690, 'KCD Sofia'],
  ['usergroups.tableau.com', 142, 'Bulgaria Tableau User Group'],
  ['usergroups.snowflake.com', 161, 'Snowflake User Group Bulgaria'],
];

export default async function bevy() {
  const out = new Map();
  const now = Date.now();
  let failures = 0;
  for (const [host, chapter, label] of CHAPTERS) {
    let list;
    try {
      list = await get(
        `https://${host}/api/event_slim/for_chapter/${chapter}/?page_size=20&status=Live&include_cohosted_events=true&visible_on_parent_chapter_only=true&order=start_date`,
      );
    } catch {
      failures++;
      continue;
    } finally {
      await sleep(400);
    }
    for (const e of list.results ?? []) {
      if (e.audience_type === 'VIRTUAL' || e.is_virtual_event) continue;
      if (Date.parse(e.end_date ?? e.start_date) < now) continue;
      let d = {};
      try {
        d = await get(`https://${host}/api/event/${e.id}/`);
      } catch {
        /* slim data is enough */
      }
      await sleep(400);
      const city = `${d.venue_city ?? ''} ${d.venue_address ?? ''}`;
      if (city.trim() && !/софия|sofia/i.test(city)) continue;
      const key = `${host.replace(/^www\./, '').split('.')[0]}-${e.id}`;
      out.set(
        key,
        makeEvent('bevy', key, {
          title: e.title,
          start: e.start_date,
          end: e.end_date ?? null,
          venue: d.venue_name ? { name: d.venue_name, address: d.venue_address ?? null, lat: d.venue_latitude ?? null, lon: d.venue_longitude ?? null } : null,
          url: d.url ?? e.static_url ?? `https://${host}/`,
          image: e.cropped_picture_url ?? e.picture ?? null,
          categories: ['Tech', 'Community', label],
          attendees: d.total_attendees ?? null,
          online: false,
          description: stripHtml(e.description_short || e.description || '') || null,
        }),
      );
    }
  }
  if (failures === CHAPTERS.length) throw new Error('bevy: every chapter request failed');
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}
