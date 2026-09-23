# Sofia event sources: ticketing platforms, city guides, venues

Research date: 2026-09-23. All probes used a normal Chrome User-Agent. **VERIFIED** means I fetched it in this session and checked the response. **UNVERIFIED** means I inferred it or could not fetch it.

Tooling note: macOS system `curl` (LibreSSL) fails the TLS handshake with eventim.bg, public-api.eventim.com and ticketstation.bg. They work with Node 18+ `fetch` (OpenSSL). Use Node `fetch`/undici, Python `httpx`, or a modern curl in production.

---

## Summary table

| # | Source | Sofia volume (approx.) | Best access method | Difficulty (1 easy to 5 hard) | Verified endpoint |
|---|---|---|---|---|---|
| 1 | **bilet.bg** | ~190 active Sofia events (~60-100/month): parties, theatre, workshops, concerts, seminars | **Public JSON REST API** (the Next.js frontend's backend, no auth) | **1** | `https://panel.bilet.bg/api/v1/events?per_page=100&filter[city]=Sofia&include=venue,categories,activePriceCategoriesInfo` VERIFIED |
| 2 | **eventim.bg** | 290 product groups / 477 dated shows in Sofia; 171 groups between 23 Sep and 31 Oct | **Eventim public search JSON API** (used by the site). Fallback: city-page HTML | **1-2** (robots caveat) | `https://public-api.eventim.com/websearch/search/api/exploration/v2/productGroups?webId=web__eventim-bgr&language=bg&city_ids=7510&top=50&sort=DateAsc&page=1` VERIFIED |
| 3 | **EPAYGO (epaygo.bg)** by ePay | 772 active events nationwide on one page; large share in Sofia (Arena 8888, NDK, Cinelibri and others) | HTML: one "all events" page, then detail pages for city/venue | **3** | `https://epaygo.bg/events/all` VERIFIED (1.1 MB, 772 event IDs) |
| 4 | **visitsofia.bg** (Sofia Municipality tourism calendar, Joomla JEvents) | ~64 occurrences/week (~200+/month): culture, exhibitions, sports, festivals | HTML list view (week or month). Small RSS module. iCal export returns 403 | **3** | `https://www.visitsofia.bg/bg/component/jevents/week.listevents/2026/09/28/-?Itemid=330` VERIFIED |
| 5 | **Toplocentrala** (arts centre) | ~35-40/month | **schema.org microdata Event** in month pages | **2** | `https://toplocentrala.bg/program/performance/2026/10` VERIFIED (32 Event items) |
| 6 | **Club Mixtape 5** | ~20-30/month (parties, gigs) | **iCal feed** + RSS + WP REST | **1** | `https://mixtape5.com/events.ics` VERIFIED (34 VEVENTs) |
| 7 | **Sofia Philharmonic / Bulgaria Hall** | ~25-40/month | Program HTML (Next.js SSR) + JSON-LD `MusicEvent` on each event page. Sitemap | **2-3** | `https://sofiaphilharmonic.com/programa?venueGroup=bulgaria-complex` VERIFIED |
| 8 | **NDK** (National Palace of Culture) | ~29 listed (sparse; many NDK shows also appear on Eventim) | HTML + AJAX JSON pagination (`{html, hasMore}`) | **2** | `https://ndk.bg/bg/programa/ajax?page=2&search=&type=&date=` VERIFIED |
| 9 | **Sofia Opera & Ballet** | ~30-40/month | HTML `/repertoire` | **2-3** | `https://www.operasofia.bg/repertoire` VERIFIED |
| 10 | **National Theatre "Ivan Vazov"** | ~26 performances/month | HTML `/bg/programa` | **2-3** | `https://www.nationaltheatre.bg/bg/programa` VERIFIED |
| 11 | **Joy Station** | ~10 upcoming | HTML `/all-events/` (WP REST lacks the event date) | **2** | `https://www.joystation.bg/all-events/` VERIFIED |
| 12 | **Vidas Art Arena** | ~5-15 in season (outdoor) | WP REST `fest_event` + page parse for dates | **2-3** | `https://vidasartarena.bg/wp-json/wp/v2/fest_event` VERIFIED |
| 13 | **ticket.bg** | ~38 shows (theatre, musical, concerts) | Sitemap `/bilet/` + JSON-LD `Product`/`Offer` (dates in offers) | **2** | `https://ticket.bg/sitemap.xml` VERIFIED |
| 14 | **sabitie.bg** | ~50 (conferences, courses, some concerts) | HTML | **3** | `https://sabitie.bg/` VERIFIED |
| 15 | **Ticket Station** | Large: major concerts and festivals (Fest Team) | SPA (urboapp whitelabel). API needs an OAuth token → headless browser | **4** | `https://api2.urboapp.com/api/events/getCities` → 401 VERIFIED |
| 16 | **Grabo.bg /events** | ~30-50 discounted tickets (theatre, stand-up, concerts) | HTML scrape (`/ajax/`, `/rss/`, `/api/` disallowed) | **3** | `https://grabo.bg/events` VERIFIED |
| 17 | **programata.bg** | Editorial only (reviews, film pages); no structured event dates | WP REST posts / RSS | **4** (low value) | `https://programata.bg/wp-json/wp/v2/posts` VERIFIED |
| 18 | **sofialive.bg** | Editorial news about concerts | HTML articles, no structured events | **5** (low value) | VERIFIED homepage |
| 19 | **artsofia.bg** (municipal) | ~10-15/month, news-like | HTML | **3** (low value) | `https://artsofia.bg/bg/events` VERIFIED |
| 20 | **allevents.in/sofia** (aggregator, likely another research slice) | ~95 in RSS; 64 JSON-LD Events on page | RSS + JSON-LD | **2** | `https://allevents.in/sofia/RSS` VERIFIED |
| - | Sofia Live Club | Covered by Eventim (venue facet) | own site is urboapp SPA | 4 | VERIFIED JS-only |
| - | Arena 8888 Sofia | Covered by Eventim / EPAYGO | arenasofia.bg times out | - | VERIFIED dead / timeout |
| - | kupibileti.bg | ? | Cloudflare 403 on homepage | 5 | VERIFIED 403 |
| - | Fever (feverup.com/sofia) | **Not present** (404) | - | - | VERIFIED 404 |
| - | kade.bg, bileti.bg | Parked domains | - | - | VERIFIED |
| - | ticketportal.bg, epaytickets.bg, fest.bg, biletbg.com | Dead or broken (TLS unrecognized name, timeout, expired cert, NXDOMAIN) | - | - | VERIFIED failing |
| - | sofia.bg "Календар на културните събития" / kultura.sofia.bg | A **grant-funding programme**, not an event feed | - | - | VERIFIED |
| - | Terminal 1, Studio 5, Club Kvartal, Fans Pub, Yalta | No working websites found (timeouts/NXDOMAIN; yaltaclub.com is a spam page). These venues publish on Facebook/Instagram; some tickets appear on bilet.bg/Eventim | - | - | VERIFIED failing |

---

## 1. bilet.bg: best source (VERIFIED)

- **Stack:** Next.js (App Router) frontend with a Laravel-style REST backend at `https://panel.bilet.bg/api/v1`. The base URL is hard-coded in the public JS bundle (`apiUrl:"https://panel.bilet.bg/api/v1"`).
- **Auth:** none. It returned HTTP 200 to plain curl.
- **robots:** `bilet.bg/robots.txt` disallows `/api/` on bilet.bg itself, but the API lives on `panel.bilet.bg`, whose robots.txt is `User-agent: * / Disallow:` (allow all). VERIFIED.
- **Endpoint:** `GET https://panel.bilet.bg/api/v1/events`
  - Query params (taken from the JS bundle; city, page and per_page were tested):
    - `per_page`, `page`, `sort`
    - `include=venue,categories,activePriceCategoriesInfo`
    - `filter[city]=Sofia`: matches both "София" and "Sofia" venues (187 results vs 312 unfiltered)
    - `filter[category_id]`, `filter[venue_id]`, `filter[month]`, `filter[search]`, `filter[start_date_b]`, `filter[end_date_b]`, `filter[promoter]`
  - Pagination: Laravel style (`next_page_url`, `current_page`). No total count is returned; loop until `next_page_url` is null.
  - The default list seems to return only active/upcoming events. With the Sofia filter, dates ran from 2026-09-23 to 2027-05-29.
- **Other endpoints:**
  - `GET /api/v1/categories`: 1 Партита, 2 Театър, 3 Спорт, 4 Концерти, 6 Семинари/Конференции, 7 Фестивали, 10 Детски, 12 Работилници, 22 Коледа, 23 Halloween, 26 БГ Музика. VERIFIED
  - The JS bundle also shows `venues`, `venues/{id}/events`, `promoters`, `home` and `sliders` (UNVERIFIED).
- **Sample fields (VERIFIED):**
  ```
  id 8785, name "Синьо лято", slug "sino-lato-8785", start_date "2026-09-26 21:00", end_date null,
  image "https://panel.bilet.bg/media/events/....png", description (HTML), m_description (plain text),
  venue {name "Чистилището", address "...София", city "София", post_code "1202", slug},
  categories [{id 26, name "БГ Музика"}],
  price_categories [{name "Early bird", prices [{price "40.00", original_price "40.00"}]}]
  ```
- **Event URL:** `https://bilet.bg/bg/events/{slug}`. Event pages also carry JSON-LD `Event` (name, startDate, location with PostalAddress, organizer, image).
- **Sitemap:** `https://www.bilet.bg/sitemap.xml` (14 MB, 8,652 event URLs including past events). Useful only as a fallback.
- **Mix of Sofia categories** (first 100): workshops 35, theatre 34, concerts 29, kids 19, seminars 11, parties 11, festivals 5. Descriptions are in Bulgarian.
- **Bot protection:** Cloudflare sits in front of bilet.bg, but the API responded without a challenge.

## 2. eventim.bg (VERIFIED)

- **Website:** Akamai. A direct `/event/...` page returned **403 Access Denied** (Akamai edge) to Node fetch. The city page `https://www.eventim.bg/city/софия-7510/` returned 200.
- **Public search API (the site's own XHR):** `https://public-api.eventim.com/websearch/search/api/exploration/v2/productGroups`
  - Required: `webId=web__eventim-bgr`. Also `language=bg|en`, `city_ids=7510` (Sofia), `page`, `top` (page size; 50 works), `sort=DateAsc`, `date_from=YYYY-MM-DD`, `date_to=YYYY-MM-DD` (all VERIFIED).
  - v1 product-level variant: `.../exploration/v1/products?webId=web__eventim-bgr&language=bg&city_ids=7510&sort=DateAsc` returns one row per show date (477 in Sofia). It can include a few past shows; filter by date client-side. VERIFIED
  - The response includes `totalResults`, `totalPages` and useful facets: venues (CLWD, Club MIXTAPE 5, Joy Station, Sofia Live Club, Pirotska 5, Inter Expo Center, The Academy, ...) and a category tree (Culture/Theatre 202, Music/Classical 68, Pop 41, Rock 25, Club 13, Sport 7, ...).
  - **Fields:** `name`, `productGroupId`, `startDate`/`endDate` (ISO with timezone), `imageUrl` (222x222 teaser), `categories` (hierarchical), `link`, `status`, `currency: EUR`, and `products[]` with `link`, `promoter`, `typeAttributes.liveEntertainment.location {name, city, postalCode, geoLocation lat/lng}`, `startDate`.
  - There is no price and no long description in the search response.
- **robots caveat (important):**
  - `https://public-api.eventim.com/robots.txt` is `User-agent: * Disallow: /` and only allows Googlebot on `/websearch/`.
  - `www.eventim.bg/robots.txt` disallows `/api/` and `/search/`, but **allows** `/city/` and `/event/`.
  - Sitemaps are allowed:
    - `https://www.eventim.bg/staticsite/sitemap/BGI/sitemapindex_bg.xml`
    - `events1_bg.xml.gz`: 543 event URLs
    - `eventseries1_bg.xml.gz`: 261 series
    - `city1_bg.xml.gz`: Sofia = `/city/софия-7510/`
  - For a personal, low-rate (daily) project, the API is by far the most practical option. The robots-compliant alternative is the sitemap plus the city page `https://www.eventim.bg/city/софия-7510/` (VERIFIED 200; 29 event and 23 eventseries links per page, plus a JSON-LD ItemList). Event detail pages may be blocked by Akamai.
- **ToS:** Eventim's general terms prohibit automated data extraction (standard clause, UNVERIFIED for the .bg wording). Keep the rate low and link back.

## 3. EPAYGO (epaygo.bg) (VERIFIED)

- EPAYGO is ePay's ticketing arm. `https://epaygo.bg/events/all` is a single server-rendered page (1.1 MB) with all **772** active events. Each card has a title, a from/to date (day + Bulgarian month name, no year), an image (`online.epay.bg/v3/eventpic/{id}/...`) and a link `https://epaygo.bg/{10-digit id}`.
- **Detail page** (`https://epaygo.bg/2946651961`): "Място на провеждане" gives country/city ("София"), venue, maps link, ticket table and a Markdown-ish description. There is no JSON-LD and only `og:type`.
- **Category pages:** `/epaygo/party-and-clubs`, `/concerts-and-festivals`, `/theater-and-opera`, `/trainings-and-seminars`, `/sports-and-health`, `/comedy-and-show`, `/free-events`, `/this-week`, `/today`.
- **robots.txt and sitemap.xml:** both redirect to `/front` (none exist).
- **Approach:** fetch the `/events/all` page, then fetch the detail pages that are new since the last run (cache by ID), and keep only city = София.
- Sofia share: UNVERIFIED count, estimated 300+.

## 4. visitsofia.bg: official city calendar (VERIFIED)

- Joomla + JEvents, Itemid=330.
- **Views:**
  - Week list: `/bg/component/jevents/week.listevents/YYYY/MM/DD/-?Itemid=330`. 64 unique occurrences for the week of 28 Sep; 1.6 MB page.
  - Month calendar: `/bg/component/jevents/month.calendar/YYYY/MM/01/-?Itemid=330` (4.5 MB, 129 links).
  - `range.listevents`: empty.
  - `month.listevents`: 404.
- **Detail URL:** `/bg/component/jevents/icalrepeat.detail/YYYY/MM/DD/{id}/-/{slug}?Itemid=330`. The date is in the URL. The page has title, description, photos and location; there is no JSON-LD.
- **RSS:** `https://www.visitsofia.bg/bg/index.php?option=com_jevents&task=modlatest.rss&format=feed&type=rss&modid=0` returns 200 with only 5 items.
- **iCal export:** `index.php?option=com_jevents&task=icals.export...` returns **403**.
- **robots:** allows the components paths used here (only `/components/` and similar filesystem dirs are disallowed).
- **Content:** municipal "Столична програма Култура" events, exhibitions, NDK shows, Swing Buzz festival, roller-ski cup and more. Descriptions are in Bulgarian. An English site likely exists under `/en/` (UNVERIFIED).

## 5. Toplocentrala (VERIFIED)

- **Month pages:** `https://toplocentrala.bg/program/performance/YYYY/MM` and `/program/visual/YYYY/MM`.
- Each item is `<li itemscope itemtype="https://schema.org/Event">` with `itemprop` `url`, `name`, `startDate` (content="2026-09-01T19:00") and `location`. The page shows 40 items for September and 32 for October.
- robots: allow all, and a sitemap exists. It uses 12 schema.org-marked items per page (not JSON-LD, so use a microdata parser such as `extruct`).

## 6. Club Mixtape 5 (VERIFIED)

- Uses the WordPress Events Manager plugin.
- **iCal:** `https://mixtape5.com/events.ics` (also `/?ical=1`) returns `text/calendar` with TZID Europe/Sofia and 34 VEVENTs (DTSTART/DTEND, SUMMARY, DESCRIPTION, URL, ATTACH image, LOCATION). Descriptions often include price and a bilet.bg ticket link.
- **RSS:** `https://mixtape5.com/events/feed/`
- **REST:** `https://mixtape5.com/wp-json/wp/v2/event`
- robots: allow.
- This is the easiest venue source.

## 7. Sofia Philharmonic / Bulgaria Hall (VERIFIED)

- The Next.js site is SSR. `https://sofiaphilharmonic.com/programa?venueGroup=bulgaria-complex` (and `?organizer=sofia-philharmonic`) shows 24 event links for the current month.
- Event pages carry JSON-LD `MusicEvent` with `startDate` (UTC ISO), `location` (hall + address), `performer[]`, `image` and `eventStatus`.
- The sitemap `https://sofiaphilharmonic.com/sitemaps/bg.xml` has 11,609 `/sabitia/` URLs (mostly historical, all lastmod 2026-08).
- robots disallows `/api/` and `/tarsene/`.
- The query param for other months is UNVERIFIED.

## 8. NDK (VERIFIED)

- `https://ndk.bg/bg/programa` gives the first 12 events.
- `GET https://ndk.bg/bg/programa/ajax?page=N&search=&type=&date=` returns JSON `{html, hasMore, lastDate}`. There were 29 events in total through April 2027.
- Card fields: title, `ie_date` (dd.mm.yyyy), `ie_hour`, `ie_place` (hall), image, link to `/bg/sabitie/{slug}`, ticket link (tickets.ndk.bg / epaygo / eventim).
- robots: allow all. There is no sitemap (404).
- Big NDK concerts are also on Eventim, so dedupe.

## 9-12. Other venues (VERIFIED)

- **Sofia Opera** `https://www.operasofia.bg/repertoire`: `article.item` with `item__date` (dd.mm, no year), `item__title`, `item__author` (genre), `/repertoire/{id}` and `/buy-tickets/{id}`. Cloudflare, but plain fetch works. robots allow.
- **National Theatre** `https://www.nationaltheatre.bg/bg/programa`: server-rendered list with day, month, weekday, title, author, time and stage. 26 `predstavlenie` links. It also has a subtitles program (`/bg/programa-subtitri`, useful for expats). robots allow.
- **Joy Station**:
  - WP REST `https://www.joystation.bg/wp-json/wp/v2/events` has 188 total items including past ones, but no date field (acf only has `old_id`).
  - Scrape `https://www.joystation.bg/all-events/` instead: about 10 cards with a `fa-calendar-o` date `dd-mm-yyyy`.
  - Behind Cloudflare, but fetch worked.
- **Vidas Art Arena** (the arenasofia.com redirect lands here):
  - WP REST `https://vidasartarena.bg/wp-json/wp/v2/fest_event` has 40 items. Dates are only in the title text (e.g. "RHCP Tribute | 11 ОКТОМВРИ 2026 · НЕДЕЛЯ").
  - `/feed/` exists.

## 13-16. Smaller ticketing platforms

- **ticket.bg** (VERIFIED):
  - Next.js. `sitemap.xml` has 38 `/bilet/` event URLs.
  - Each page has JSON-LD `Product` with `offers[]`: one Offer per date, with `url` `/book-event/...-14-october-19-1158`, `price`, `priceCurrency EUR` and `priceValidUntil` = show datetime. So the dates must be derived from the offers.
  - `api.ticket.bg/v1/events` returns "not yet implemented".
  - robots allows everything except `/api/`.
- **sabitie.bg** (VERIFIED): Symfony HTML. Event URLs look like `/event/{category}/{slug}.{id}` and carry date/time range, venue and prices (BGN/EUR). Mostly business seminars and courses. robots allow. No sitemap.
- **Ticket Station** (VERIFIED as JS-only):
  - Ticket Station belongs to the major promoter Fest Team. Its site is now a Vue SPA on the urboapp whitelabel platform (`api2.urboapp.com/api`).
  - The API returns `401 Unauthenticated` without a bearer token. The frontend obtains the token via an OAuth client-credentials grant, with client ID and secret embedded in the public JS bundle. **I did not use them.** Treat this as gray-area and ToS-sensitive.
  - Endpoints seen in the bundle: `/events/getCities`, `/events/getEventTypes`, `/events/getSingle`, `/events/autocomplete`, `/whitelabel/getHomePage`, `/whitelabel/getFeatured`.
  - No sitemap or robots file (the SPA returns index.html for every path).
  - Realistic options: a headless browser (Playwright) on `https://ticketstation.bg/bg`, or rely on these events also being mirrored on other sources. Sofia Live Club uses the same platform (`sofialiveclub.urboapp.com`).
- **Grabo.bg** (VERIFIED): `https://grabo.bg/events` plus subcategories `/events/koncerti`, `/teatri`, `/standup`, etc. Deal cards are in HTML. robots disallows `/ajax/`, `/api/` and `/rss/`, so HTML only. These are discounted tickets for shows that also exist elsewhere, so they have low marginal value.

## City and culture guides

- **programata.bg** (VERIFIED): now a WordPress editorial site. `wp-json/wp/v2/posts` works (category "Филми" has 13.5k posts; there are city categories "София"). Posts are articles with no structured event date or venue, so they are not suitable as an event feed. The best use is an optional "editorial highlights" source via `/feed/` (UNVERIFIED path) or the REST API.
- **sofialive.bg** (VERIFIED): news articles (e.g. "... на 14 ноември в Sofia Live Club"). No schema, feed or structured dates. Skip, or use LLM extraction only.
- **sofia.bg**: the culture section links out to kultura.sofia.bg (a grants programme, not events) and artsofia.bg. ArtSofia `/bg/events` has about 12 news-like items with dates in the URL (`/bg/events/2026/09/16/...`). Low value.

## Recommendations (priority order)

1. **bilet.bg API**: clean JSON with venue, city, category, price, image and description, no auth, robots-permitted host. Covers parties, workshops, theatre and club gigs (the core "meet people" events). Poll daily with `per_page=100`.
2. **Eventim public search API** (`city_ids=7510`, `sort=DateAsc`, `top=50`): the biggest catalogue of concerts, theatre, sport and clubs, with geo-coordinates. Keep the rate very low, because the API host's robots.txt disallows non-Google bots. If you want strict compliance, use the sitemap plus the `/city/софия-7510/` HTML instead.
3. **EPAYGO `/events/all`** plus cached detail pages filtered to София: covers Arena 8888 shows, festivals, free events and seminars that are not on Eventim or bilet.bg.
4. **visitsofia.bg JEvents week view**: the official municipal calendar (free and cultural events, exhibitions, city festivals). This is where much of the free "go meet people" content lives.
5. **Cheap venue feeds**:
   - Mixtape 5 `.ics`
   - Toplocentrala microdata
   - NDK AJAX
   - Philharmonic JSON-LD
   - Opera and National Theatre HTML
   - Joy Station HTML
6. **Skip or deprioritise:**
   - Ticket Station (needs a headless browser; lower priority because many of its events also appear on other sources)
   - Fever (not in Sofia)
   - programata.bg and sofialive.bg (editorial only)
   - Grabo (duplicates)
   - kade.bg and bileti.bg (parked)
   - ticketportal.bg, epaytickets.bg and fest.bg (dead)
7. **Dedupe:** the same show often appears on Eventim, bilet.bg, EPAYGO, the venue site and visitsofia. Build a dedupe key from normalised title + date + venue, with fuzzy matching (Cyrillic/Latin transliteration). Eventim's lat/lng helps with venue matching.
8. **Gaps not covered by this slice:** small clubs such as Terminal 1, Studio 5, Kvartal, Fans Pub and Yalta have no usable websites. Their events live on Facebook/Instagram (and sometimes bilet.bg). Coverage has to come from other slices (e.g. RA, Facebook, allevents.in, whose RSS `https://allevents.in/sofia/RSS` returns 95 items and whose `/sofia` page has 64 JSON-LD Events).
