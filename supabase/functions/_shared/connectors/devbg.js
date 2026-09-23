// dev.bg: WordPress "The Events Calendar" REST API. Only keeps events with a physical venue.
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';

export default async function devbg() {
  const today = new Date().toISOString().slice(0, 10);
  const res = await get(`https://dev.bg/wp-json/tribe/events/v1/events?per_page=50&start_date=${today}`);
  return (res.events ?? []).map((e) => {
    const v = e.venue && !Array.isArray(e.venue) ? e.venue : null;
    return makeEvent('devbg', e.id, {
      title: e.title,
      start: sofiaLocalToIso(e.start_date),
      end: e.end_date ? sofiaLocalToIso(e.end_date) : null,
      venue: v ? { name: v.venue ?? null, address: v.address ?? null, lat: null, lon: null } : null,
      url: e.url,
      image: e.image?.url ?? null,
      price: /безплат|free/i.test(e.cost ?? '') ? { min: 0, currency: null, free: true } : null,
      categories: ['Tech', ...(e.categories ?? []).map((c) => c.name)],
      online: !v,
      description: e.excerpt,
    });
  });
}
