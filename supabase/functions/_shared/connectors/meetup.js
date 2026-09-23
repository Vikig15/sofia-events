// Meetup: internal GraphQL (www.meetup.com/gql2), no auth. Keyword search alone misses
// more than half the events, so we discover Sofia groups and then read each group's events.
// Findings 2026-09-23: groupSearch ignores the query text (any non-empty query, any radius 5-100 km,
// any centre near Sofia returns the same 98 "Sofia" groups), so extra keywords add nothing. On top of
// the group crawl we union eventSearch (also query-insensitive, ~35 days ahead per call, so a few
// date windows): it catches Sofia dates of groups based elsewhere (touring organisers), which the
// group crawl can't reach (their first 20 events are in other cities).
import { post, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const GQL = 'https://www.meetup.com/gql2';
const DISCOVERY_QUERIES = ['sofia', 'софия', 'bulgaria', 'social', 'expats', 'sport', 'games', 'business', 'tech'];
const SEARCH_WINDOWS_DAYS = [0, 30, 60, 90];

const GROUPS_Q = `query($q:String!,$after:String){groupSearch(filter:{query:$q,lat:42.6977,lon:23.3219,radius:30},first:100,after:$after){
  pageInfo{hasNextPage endCursor} edges{node{urlname name}}}}`;

const EVENT_FIELDS = `id title dateTime endTime eventUrl isOnline going{totalCount}
  venue{name address city lat lon} feeSettings{amount currency}`;

const EVENTS_Q = `query($u:String!){groupByUrlname(urlname:$u){name events(first:20){edges{node{
  ${EVENT_FIELDS}}}}}}`;

const EVENT_SEARCH_Q = `query($f:EventSearchFilter!){eventSearch(filter:$f,first:100){edges{node{
  ${EVENT_FIELDS} group{name}}}}}`;

const isSofia = (city) => /sofia|софия/i.test(city ?? '');

function toEvent(e, groupName) {
  const v = e.venue;
  return makeEvent('meetup', e.id, {
    title: e.title,
    start: e.dateTime,
    end: e.endTime,
    venue: v ? { name: v.name, address: v.address, lat: v.lat, lon: v.lon } : null,
    url: e.eventUrl,
    price: e.feeSettings ? { min: e.feeSettings.amount, currency: e.feeSettings.currency, free: false } : null,
    categories: [groupName].filter(Boolean),
    attendees: e.going?.totalCount ?? null,
    online: e.isOnline,
  });
}

export default async function meetup() {
  const groups = new Map();
  for (const q of DISCOVERY_QUERIES) {
    let after = null;
    for (let i = 0; i < 5; i++) {
      const res = await post(GQL, { query: GROUPS_Q, variables: { q, after } });
      const gs = res.data?.groupSearch;
      for (const { node } of gs?.edges ?? []) groups.set(node.urlname, node.name);
      if (!gs?.pageInfo?.hasNextPage) break;
      after = gs.pageInfo.endCursor;
      await sleep(300);
    }
  }

  // 4 groups at a time: ~25s instead of ~90s, still gentle (~100 requests per run).
  const byId = new Map();
  const queue = [...groups.keys()];
  const worker = async () => {
    for (let urlname = queue.shift(); urlname; urlname = queue.shift()) {
      const res = await post(GQL, { query: EVENTS_Q, variables: { u: urlname } }).catch(() => null);
      const g = res?.data?.groupByUrlname;
      for (const { node: e } of g?.events?.edges ?? []) {
        // Groups found by radius can still post events elsewhere; keep Sofia (or venue-less) only.
        if (e.venue?.city && !isSofia(e.venue.city)) continue;
        byId.set(e.id, toEvent(e, g.name));
      }
      await sleep(250);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // eventSearch union: groups outside the crawl set must have an explicit Sofia venue.
  let extra = 0;
  for (const days of SEARCH_WINDOWS_DAYS) {
    const filter = { query: 'sofia', lat: 42.6977, lon: 23.3219, radius: 30 };
    if (days) filter.startDateRange = new Date(Date.now() + days * 86_400_000).toISOString();
    const res = await post(GQL, { query: EVENT_SEARCH_Q, variables: { f: filter } }).catch(() => null);
    for (const { node: e } of res?.data?.eventSearch?.edges ?? []) {
      if (byId.has(e.id) || e.isOnline || !isSofia(e.venue?.city)) continue;
      byId.set(e.id, toEvent(e, e.group?.name));
      extra++;
    }
    await sleep(300);
  }
  console.log(`  meetup: crawled ${groups.size} groups, +${extra} events via eventSearch`);
  return [...byId.values()];
}
