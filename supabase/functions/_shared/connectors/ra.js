// Resident Advisor (ra.co): the GraphQL endpoint its own site uses, no auth. Sofia = area 558.
// Best source for techno/house club nights and promoter parties (EXE, Kupe, Tell Me, Nutone, Mesmeric...).
// `startTime`/`endTime` are Sofia local wall-clock times written with a fake ".000" suffix and no offset.
import { post, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';

const AREA_ID = 558;
const PAGE_SIZE = 50;

const QUERY = `query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page, sort: { listingDate: { order: ASCENDING } }) {
    data {
      id
      event {
        id title date startTime endTime contentUrl attending isTicketed cost
        images { filename type }
        venue { id name address location { latitude longitude } }
        genres { name }
        promoters { name }
      }
    }
    totalResults
  }
}`;

const HEADERS = { referer: 'https://ra.co/events/bg/sofia', origin: 'https://ra.co', 'ra-content-language': 'en' };

// "2026-09-25T23:00:00.000" (Sofia local) -> ISO with offset
const raLocal = (s) => (s ? sofiaLocalToIso(s.slice(0, 16).replace('T', ' ')) : null);

function parseCost(cost) {
  const s = String(cost ?? '').trim();
  if (!s) return null;
  if (/free|безплат/i.test(s)) return { min: 0, currency: null, free: true };
  const nums = [...s.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const currency = /лв|bgn/i.test(s) ? 'BGN' : 'EUR';
  return { min, currency, free: min === 0 };
}

export default async function ra() {
  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map();
  for (let page = 1; page <= 6; page++) {
    const res = await post(
      'https://ra.co/graphql',
      { query: QUERY, variables: { filters: { areas: { eq: AREA_ID }, listingDate: { gte: `${today}T00:00:00.000Z` } }, pageSize: PAGE_SIZE, page } },
      { headers: HEADERS },
    );
    const listings = res?.data?.eventListings;
    if (!listings) throw new Error(`RA: unexpected response ${JSON.stringify(res).slice(0, 200)}`);
    for (const { event: e } of listings.data ?? []) {
      if (!e || byId.has(e.id)) continue;
      const v = e.venue ?? {};
      // RA has a few recurring spam listings with a placeholder venue and no attendees.
      if (/^TBA\s*-\s*TBA\s*$/i.test(v.name ?? '') && !e.attending) continue;
      const start = raLocal(e.startTime ?? e.date);
      if (!start) continue;
      const flyer = (e.images ?? []).find((i) => i.type === 'FLYERFRONT') ?? e.images?.[0];
      // Some venues carry placeholder coordinates such as (43, 23); treat whole numbers as unknown.
      const hasGeo = v.location && !Number.isInteger(v.location.latitude) && !Number.isInteger(v.location.longitude);
      byId.set(
        e.id,
        makeEvent('ra', e.id, {
          title: e.title,
          start,
          end: raLocal(e.endTime),
          venue: v.name
            ? { name: v.name, address: v.address ?? null, lat: hasGeo ? v.location.latitude : null, lon: hasGeo ? v.location.longitude : null }
            : null,
          url: `https://ra.co${e.contentUrl}`,
          image: flyer?.filename ?? null,
          price: parseCost(e.cost),
          categories: ['Nightlife', 'Club', 'Electronic', ...(e.genres ?? []).map((g) => g.name)],
          attendees: e.attending || null,
          description: (e.promoters ?? []).length ? `Promoter: ${e.promoters.map((p) => p.name).join(', ')}` : null,
        }),
      );
    }
    if (page * PAGE_SIZE >= (listings.totalResults ?? 0)) break;
    await sleep(600);
  }
  // listingDate >= today still returns things that started yesterday evening; keep only upcoming/ongoing.
  // Also drop placeholder "TBA" listings parked years ahead.
  const now = Date.now();
  const horizon = now + 400 * 86_400_000;
  return [...byId.values()].filter((e) => new Date(e.end ?? e.start).getTime() >= now && new Date(e.start).getTime() <= horizon);
}
