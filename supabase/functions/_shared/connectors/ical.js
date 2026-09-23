// Generic iCal feed connector. Feeds are listed in src/sources.js (venue calendars,
// Meetup groups, Luma organiser calendars...).
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { parseIcs, icsDate } from '../lib/ical.js';

export function icalConnector(feeds) {
  return async function ical() {
    const out = [];
    const failures = [];
    for (const feed of feeds) {
      try {
        const text = await get(feed.url, { as: 'text', headers: { accept: 'text/calendar' } });
        for (const v of parseIcs(text)) {
          const start = icsDate(v.DTSTART, sofiaLocalToIso);
          if (!start) continue;
          out.push(
            makeEvent(`ical`, `${feed.key}:${v.UID?.value ?? start}`, {
              title: v.SUMMARY?.value ?? feed.name,
              start,
              end: icsDate(v.DTEND, sofiaLocalToIso),
              venue: v.LOCATION ? { name: v.LOCATION.value, address: null, lat: null, lon: null } : null,
              url: v.URL?.value ?? feed.home,
              categories: [feed.name, ...(feed.tags ?? [])],
              description: v.DESCRIPTION?.value,
            }),
          );
        }
      } catch (err) {
        failures.push(`${feed.key}: ${err.message}`);
      }
      await sleep(400);
    }
    if (failures.length === feeds.length) throw new Error(failures.join('; '));
    if (failures.length) console.warn(`  ical: ${failures.length} feed(s) failed: ${failures.join('; ')}`);
    return out;
  };
}
