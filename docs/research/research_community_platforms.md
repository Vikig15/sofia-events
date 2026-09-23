# Community / social / global event platforms: Sofia coverage

Probed on 2026-09-23 with curl (Chrome desktop UA) from a Sofia IP. No accounts were created and no forms were submitted.
Raw probe files are in `scratchpad/probe/`.

Legend: **VERIFIED** means I ran it today and it returned real Sofia events. **UNVERIFIED** means it comes from docs or memory, or I couldn't confirm it.

---

## TL;DR ranking (for "meet people naturally")

| # | Source | Sofia vol / month (in person) | Social-ness | Access | Difficulty (1 easy - 5 hard) | Status |
|---|---|---|---|---|---|---|
| 1 | **Luma** | ~25-30 (43 upcoming over ~8 wks) | High (networking, founders, crypto, AI, book club, bowling, volunteering, workshops) | Public internal JSON: `api.lu.ma/discover/get-paginated-events?latitude&longitude` | 1 | VERIFIED |
| 2 | **Meetup.com** | ~20-25 (40 upcoming via 98 groups; ~17 via search) | Very high (football friendly, running club, expats, hikes, philosophy game, entrepreneurs nights, Python) | Unauthenticated GraphQL `POST https://www.meetup.com/gql2` + per-group iCal/RSS | 2 | VERIFIED |
| 3 | **Eventbrite** | ~15-25 (34 listed) | Mixed (language exchange, "100 Cities" dinners, Fuckup Nights, English stand-up, conferences) | JSON-LD `ItemList` on `/d/bulgaria--sofia/all-events/?page=N` | 2 | VERIFIED |
| 4 | **dev.bg** | ~15-20 | Medium (tech talks; many online, some office meetups) | WordPress Events Calendar REST `/wp-json/tribe/events/v1/events` + iCal | 1 | VERIFIED |
| 5 | **Allevents.in** | ~95 in feed, 45 on the "all" page | Low-Med (mostly concerts and shows scraped from Facebook; some festivals, runs, bachata) | RSS `https://allevents.in/sofia/RSS` + per-event JSON-LD | 2 | VERIFIED |
| 6 | **sofiameetups.com** | 1-2 | Very high (international mixers with icebreakers) | HTML scrape (static text) | 2 | VERIFIED |
| 7 | **Timeleft** | Weekly (Wed dinners w/ strangers) | Very high | No public listing. App only, so add a synthetic recurring event | n/a | VERIFIED Sofia is a Timeleft city |
| 8 | **Bevy** (GDG Sofia, Startup Grind Sofia) | ~0 now | High when active | Public JSON `/api/search/?result_types=upcoming_event&country_code=BG` | 1 | VERIFIED endpoint, but no Sofia events |
| 9 | eventseye.com | Trade fairs, ~40/yr BG | Low | HTML | 2 | VERIFIED |
| 10 | Couchsurfing | Claims 155 "events"; public page shows 5 imported ticketed events | Low publicly | Login for the full list | 4 | VERIFIED (not useful) |
| 11 | InterNations | ~several/month (members only) | High | Login/paywall | 5 | VERIFIED blocked |
| 12 | 10times, Sofia Tech Park, polyglotclub | n/a | - | Cloudflare challenge (403 `cf-mitigated: challenge`) | 5 | VERIFIED blocked |
| 13 | Facebook Events | Huge | High | Dead for bots (HTTP 400, login wall; iCal export removed) | 5 | VERIFIED blocked |
| - | conferenceindex.org | - | - | Mostly predatory academic "conferences" (WASET-style) | skip | VERIFIED (junk) |
| - | BESCO, Innovation Explorer | - | - | No events feed. BESCO posts on **Luma** (seen "Среща с BESCO Supporters"). Innovation Explorer is one annual conference (Paysera tickets) | - | VERIFIED |

---

## 1. Luma (lu.ma / luma.com). Best single source for networking/startup/social

- `https://lu.ma/sofia` is **not** a city page. It's a random 2022 event with slug `sofia`. No "Sofia" discover place exists (`api.lu.ma/discover/get-place-v2?slug=sofia` returns "Not found"; `bootstrap-page` lists 87 places, none of them in BG).
- **VERIFIED geo query (no auth):**
  ```
  GET https://api.lu.ma/discover/get-paginated-events?latitude=42.6977&longitude=23.3219&pagination_limit=50
  # paginate: &pagination_cursor=<next_cursor> while has_more
  # api2.luma.com/... is identical
  ```
  Returned **43 upcoming in-person events** in Sofia from 2026-09-23 to 2026-11-18. Examples: Co-founder Night (126 guests), Networking Cocktail Vol. 28 (138), bowling night | nostalgia., Soul Book Club, Skool IRL Sofia, Tennis Court Edition Networking Dinner, animal-shelter volunteering, n8n Sofia Meetup, AI Filmmakers Meetup, Handpan workshop, CreaTech Summit, Defense Tech Hackathon, Flex & Connect (fitness + entrepreneurship).
- Entry fields: `event{api_id,name,start_at,end_at,timezone,url(slug → https://luma.com/<url>),location_type(offline|online),geo_address_info{city,address,full_address,place_coordinate},coordinate,cover_url}`, `guest_count`, `ticket_info{is_free,price,spots_remaining,is_sold_out,require_approval}`, `calendar{api_id,name}`, `hosts[]`.
- `guest_count` is a good "social" signal.
- **VERIFIED per-calendar iCal:** `https://api.lu.ma/ics/get?entity=calendar&id=cal-XXXX` (text/calendar). Use it to follow specific organizers such as BESCO or Networking Cocktail.
- Event detail: `https://luma.com/<slug>` has `__NEXT_DATA__` with the full event. UNVERIFIED: `https://api.lu.ma/event/get?event_api_id=evt-...`.
- robots: `api.lu.ma` only disallows `/insights/`. The official Luma API needs Luma Plus (paid) and only covers your own calendars. Scraping the internal API is ToS-grey but low-volume and widely done. No bot protection seen.
- Caveat: I couldn't confirm the radius the geo query covers. The results included Сеславци (suburb), so it looks city-wide.

## 2. Meetup.com. Most "participatory" source (sports, hikes, expats, philosophy)

- **VERIFIED: unauthenticated GraphQL at `POST https://www.meetup.com/gql2`** (content-type application/json, browser UA). `api.meetup.com/gql` returns 404 from this network. The official API needs Meetup Pro OAuth, which is paid.
- **Event search (VERIFIED):**
  ```graphql
  query($f:EventSearchFilter!,$a:String){eventSearch(filter:$f,first:100,after:$a){
    totalCount pageInfo{hasNextPage endCursor}
    edges{node{id title dateTime endTime eventUrl isOnline eventType
      going{totalCount} venue{name address city lat lon} group{name urlname}
      feeSettings{amount currency}}}}}
  # vars: {"f":{"query":"social","lat":42.69,"lon":23.31,"radius":30,"eventType":"PHYSICAL"}}
  ```
  An empty `query` returns 0. The keyword match is fuzzy: any keyword returns ~15-35 Sofia events. The union over about 28 keywords gave 50 events, of which 17 were in person.
- **Recommended events (VERIFIED):** `recommendedEvents(first,after,filter:{lat,lon,radius,startDateRange,doConsolidateEvents:true},sort:{sortField:DATETIME})` returns 17 (`sortOrder` is not a valid field).
- **Most complete method: group crawl (VERIFIED).**
  1. `groupSearch(filter:{query:"sofia",lat:42.69,lon:23.31,radius:30},first:100)` gives **98 groups** (urlname, name, memberships{totalCount}). The list is saved at `probe/meetup_groups.json`.
  2. For each group: `groupByUrlname(urlname:"x"){events(first:20){edges{node{title dateTime isOnline going{totalCount} venue{...}}}}}`.
  3. Result: **40 upcoming in-person events** (Sep to Dec), including recurring ones: Thursday football friendly, Founders Running Club (weekly Sat), Sofia Expats meetup + Vitosha hike, Entrepreneurs Night Out, Philosophical Social Game, Python/AI/OWASP/AWS meetups.
- **Per-group feeds (VERIFIED 200):** `https://www.meetup.com/<urlname>/events/ical/` (text/calendar) and `/events/rss/` (rss). robots.txt disallows `*/events/rss/*`, so **use iCal**, which isn't disallowed.
- **SSR fallback (VERIFIED):** `https://www.meetup.com/find/?location=bg--Sofia&source=EVENTS` has `__NEXT_DATA__.props.pageProps.__APOLLO_STATE__` with `Event:*` objects (title, dateTime, eventUrl, venue, rsvps.totalCount, description).
- Protection: none seen (Fastly). ToS forbids scraping. gql2 is an internal, undocumented API and could change. Keep request rates low, e.g. about 100 requests per daily run.

## 3. Eventbrite

- The public search API was removed (2019/2020). The site still works.
- **VERIFIED:** `https://www.eventbrite.com/d/bulgaria--sofia/all-events/?page=N` (redirects to the `bulgaria--софия` slug). The page has `<script type="application/ld+json">` with an `ItemList` of ~16-20 `Event` items. `__SERVER_DATA__` shows `object_count: 34`, `page_count: 2`.
  - Item fields: `name, startDate, endDate, url, image, description, location{name, address{streetAddress,addressLocality,postalCode}, geo{latitude,longitude}}, eventAttendanceMode`. There's no price in the list. The event page's JSON-LD has `offers`.
  - Category slugs follow the Eventbrite pattern (UNVERIFIED): `/d/bulgaria--sofia/free--events/`, `/business--events/`, `/hobbies--events/`, `/sports-and-fitness--events/`.
- Social examples seen: "Sofia Social and Language Exchange (Make New Friends)" (recurring, I Came Alone Pub), "100 Cities Project: Sofia | Dinner with New Friends", Fuckup Nights Sofia, English stand-up, Data Saturday, ISACA Day.
- robots.txt disallows `/api/v3/destination/events/` and `*?calendar*`. `/d/` pages are allowed.
- UNVERIFIED: the official API v3 with a free personal token still supports `GET /v3/organizers/{id}/events/?status=live`. That's useful for following known Sofia organizers.

## 4. dev.bg (tech community, BG)

- **VERIFIED:** `https://dev.bg/wp-json/tribe/events/v1/events?per_page=50&start_date=2026-09-23` returned 17 upcoming. Fields: `title, start_date, end_date, url, cost ("Безплатно"), venue{venue,address}, categories, description, image`.
- **VERIFIED iCal:** `https://dev.bg/events/?ical=1`.
- Most talks are 19:30 webinars with no venue. The in-person ones are "DEV.BG @ <Company>: Office Tech Talks" (venue set). Filter on `venue`.

## 5. Allevents.in

- **VERIFIED RSS:** `https://allevents.in/sofia/RSS` returns 95 `<item>` (title, link, description, media:content). **No date field.** You have to fetch each event URL.
- **VERIFIED per-event JSON-LD:** `@type: Event` with `name, startDate (ISO +03:00), location{name,address,geo}, eventAttendanceMode, description, image`.
- Category pages exist (`/sofia/all` 45 ids, `/sofia/meetups`, `/sofia/sports`, `/sofia/parties`, `/sofia/business`, ~15 each), but category RSS returns 404.
- Content is heavily concerts, shows, and Facebook-sourced events. There's a lot of overlap with ticketing sites. The occasional gem is a bachata festival, runs, or "Freshers' Weekend".
- robots.txt asks for crawl-delay 10 for ClaudeBot. The main UA isn't blocked. The paid API is on developer.allevents.in (UNVERIFIED, not free).

## 6. sofiameetups.com (new find)

- Monthly international mixers with paper icebreakers, run for 5 years. Examples: Oct 10 International Mixer at Club Gramophone; Oct 30 Halloween Edition at Bar Rabbit Hole; Nov 14.
- Static HTML: parse the text blocks ("Sat, Oct 10 International Mixer Club Gramophone"). No JSON-LD. FB/IG only otherwise. VERIFIED.

## 7. Timeleft (dinner with strangers)

- VERIFIED: the city selector on timeleft.com includes **Bulgaria → Sofia** (coords 23.3219, 42.6977).
- The booking flow is app only. There's no public event list, and `/city/sofia` returns 404.
- Recommendation: hard-code a recurring "Timeleft dinner, every Wednesday ~20:00 (book in app)" card. The Wednesday format is the standard one (UNVERIFIED for Sofia specifically).
- Similar formats already covered elsewhere: "100 Cities Project dinner" (Eventbrite), "Networking Dinner" (Luma).

## 8. Bevy platforms (GDG, Startup Grind)

- VERIFIED public JSON, no auth: `https://gdg.community.dev/api/search/?result_types=upcoming_event&country_code=BG` and `https://www.startupgrind.com/api/search/?...`. Both ignore the country filter and return global results.
- GDG Sofia is chapter 852. `api/event/?chapter=852&status=Live` returned 0.
- Startup Grind Sofia only has old/co-hosted events. Treat both as dormant and re-check quarterly.

## 9. Language exchange

- **BlaBla Language Exchange Sofia:** every other Thursday. The Wix site (blablacommunity.com) is hard to parse. The events are cross-posted to Facebook, and possibly Eventbrite/Meetup. UNVERIFIED as a feed.
- **"Sofia Social and Language Exchange":** Eventbrite recurring series. It's captured by the Eventbrite scrape.
- **Meetup `sofia-english`:** English conversation practice. Mostly online; filter `isOnline`.
- polyglotclub.com is behind Cloudflare (403). mylanguageexchange.com is a profile directory, not events.
- **Language Fair on the Square** (EU Commission), 26 Sep 2026, City Garden. One-off, found via web search.

## 10. Blocked / low value

- **Facebook Events:** `/events/explore/sofia-bulgaria/...` returns HTTP 400 without login. The iCal export (`/events/ical/upcoming`) returns 400. The Graph API public event search was removed in 2018. Scraping is against the ToS and actively blocked. **Don't build on it.** Allevents.in is the de facto legal proxy for FB events.
- **InterNations:** the Sofia page is marketing only. Events need membership (partly paid).
- **Couchsurfing:** the public place page shows 5 events (imported ticketed items like EuroVolley and a DJ championship). User hangouts are in the app, behind login.
- **10times.com, sofiatech.bg (Sofia Tech Park):** Cloudflare managed challenge (`cf-mitigated: challenge`). They'd need a headless browser, and even then it's fragile. Sofia Tech Park events show up on Luma and Eventbrite anyway ("Incubator @ Sofia Tech Park").
- **eventseye.com:** `https://www.eventseye.com/fairs/c1_trade-shows_bulgaria.html` has 43 BG trade fairs (static HTML). This is business expo stuff with low social value.
- **conferenceindex.org:** predatory academic conference listings. Skip.
- **Bumble BFF:** app only, no events. Skip.
- **sofiaexpats.com:** a newsletter/blog with WordPress RSS at `/feed` (VERIFIED). The weekly "Sofia This Week: 10+ events" issues could be parsed by an LLM as a curated signal. There's no structured event feed (`/events` returns 404).

---

## Recommendations

1. **Build first: Luma geo endpoint + Meetup gql2 group crawl.** Together they cover about 60-70 in-person, highly social events per 2 months, with attendee counts, free JSON, and no protection. Dedupe across them: several events are cross-posted, e.g. OWASP and Sofia Crypto Meetup appear on both.
2. **Add Eventbrite JSON-LD (2 pages) and the dev.bg tribe REST API.** Cheap, stable, schema.org-shaped.
3. **Add Allevents RSS + JSON-LD** as the "everything else / FB proxy" layer, downranked for social-ness (concert-heavy).
4. **Add hand-curated recurring sources:** sofiameetups.com (HTML), Timeleft Wednesdays (static card), BlaBla language exchange (biweekly Thu, static card until a feed is found), Meetup `founders-running-club-sofia` / `sofia-football-friendly` (already in the Meetup crawl).
5. **Social-ness scoring hints:** Luma `guest_count`, Meetup `going.totalCount`, `isOnline` / `location_type` to drop online events, and keywords (networking, mixer, friends, run, football, board game, exchange, hike, dinner).
6. **Skip:** Facebook, InterNations, Couchsurfing, 10times, conferenceindex. Sofia Tech Park is covered via Luma/Eventbrite.
7. **Risk note:** Meetup gql2 and the Luma discover API are undocumented internal endpoints. Wrap each source in an adapter with schema validation and alerting when the count drops to 0. Rate-limit to a daily or twice-daily crawl.
