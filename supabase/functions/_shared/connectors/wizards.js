// Wizards of the Coast store locator GraphQL: every MTG event at WPN stores in Sofia
// (Drugiyat Zamak, Mox Games, Abordage, The Next Generation...). No auth.
import { post, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const PAGE_SIZE = 100;
const query = (page) => `{ searchEvents(query:{latitude:42.6977,longitude:23.3219,maxMeters:15000,
  tags:["magic:_the_gathering"],sort:date,sortDirection:Asc,pageSize:${PAGE_SIZE},page:${page}})
  { events { id title scheduledStartTime organization { name } } } }`;

export default async function wizards() {
  const all = [];
  for (let page = 0; page < 5; page++) {
    const res = await post(
      'https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql',
      { query: query(page) },
      { headers: { origin: 'https://locator.wizards.com' } },
    );
    if (res.errors) throw new Error(JSON.stringify(res.errors).slice(0, 300));
    const events = res.data?.searchEvents?.events ?? [];
    all.push(...events);
    if (events.length < PAGE_SIZE) break;
    await sleep(400);
  }
  return all.map((e) =>
    makeEvent('wizards', e.id, {
      title: `${e.title} @ ${e.organization?.name ?? 'store'}`,
      start: e.scheduledStartTime,
      venue: { name: e.organization?.name ?? null, address: null, lat: null, lon: null },
      url: `https://locator.wizards.com/events/${e.id}`,
      categories: ['Board & card games', 'Magic: The Gathering'],
    }),
  );
}
