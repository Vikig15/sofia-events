// Luma: internal discover API by coordinates, no auth. Best source for networking/startup/social.
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const BASE = 'https://api.lu.ma/discover/get-paginated-events?latitude=42.6977&longitude=23.3219&pagination_limit=50';

export default async function luma() {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const res = await get(cursor ? `${BASE}&pagination_cursor=${encodeURIComponent(cursor)}` : BASE);
    for (const entry of res.entries ?? []) {
      const e = entry.event;
      const geo = e.geo_address_info ?? {};
      if (geo.country_code && geo.country_code !== 'BG') continue;
      const t = entry.ticket_info ?? {};
      out.push(
        makeEvent('luma', e.api_id, {
          title: e.name,
          start: e.start_at,
          end: e.end_at,
          venue: {
            name: geo.address ?? null,
            address: geo.full_address ?? null,
            lat: e.coordinate?.latitude ?? null,
            lon: e.coordinate?.longitude ?? null,
          },
          url: `https://luma.com/${e.url}`,
          image: e.cover_url,
          price: t.is_free ? { min: 0, currency: null, free: true } : null,
          categories: [entry.calendar?.name].filter(Boolean),
          attendees: entry.guest_count ?? null,
          online: e.location_type !== 'offline',
        }),
      );
    }
    if (!res.has_more || !res.next_cursor) break;
    cursor = res.next_cursor;
    await sleep(500);
  }
  return out;
}
