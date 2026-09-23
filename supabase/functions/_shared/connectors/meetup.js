// Meetup: internal GraphQL (www.meetup.com/gql2), no auth. Keyword search alone misses
// more than half the events, so we discover Sofia groups and then read each group's events.
import { post, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const GQL = 'https://www.meetup.com/gql2';
const DISCOVERY_QUERIES = ['sofia', 'софия', 'bulgaria', 'social', 'expats', 'sport', 'games', 'business', 'tech'];

const GROUPS_Q = `query($q:String!,$after:String){groupSearch(filter:{query:$q,lat:42.6977,lon:23.3219,radius:30},first:100,after:$after){
  pageInfo{hasNextPage endCursor} edges{node{urlname name}}}}`;

const EVENTS_Q = `query($u:String!){groupByUrlname(urlname:$u){name events(first:20){edges{node{
  id title dateTime endTime eventUrl isOnline going{totalCount}
  venue{name address city lat lon} feeSettings{amount currency}}}}}}`;

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

  const out = [];
  for (const urlname of groups.keys()) {
    const res = await post(GQL, { query: EVENTS_Q, variables: { u: urlname } }).catch(() => null);
    const g = res?.data?.groupByUrlname;
    for (const { node: e } of g?.events?.edges ?? []) {
      const v = e.venue;
      // Groups found by radius can still post events elsewhere; keep Sofia (or venue-less) only.
      if (v?.city && !/sofia|софия/i.test(v.city)) continue;
      out.push(
        makeEvent('meetup', e.id, {
          title: e.title,
          start: e.dateTime,
          end: e.endTime,
          venue: v ? { name: v.name, address: v.address, lat: v.lat, lon: v.lon } : null,
          url: e.eventUrl,
          price: e.feeSettings ? { min: e.feeSettings.amount, currency: e.feeSettings.currency, free: false } : null,
          categories: [g.name],
          attendees: e.going?.totalCount ?? null,
          online: e.isOnline,
        }),
      );
    }
    await sleep(300);
  }
  console.log(`  meetup: crawled ${groups.size} groups`);
  return out;
}
