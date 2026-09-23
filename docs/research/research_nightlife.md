# Nightlife

Date: 2026-09-23. Scope: Sofia bars, nightclubs, club nights, promoter parties and live-music clubs.
Everything below was probed with Node `fetch` and a desktop Chrome User-Agent. **VERIFIED** means real upcoming events came back today.

## Summary

- **The big win is SofiaStage (`sofiastage.com`).** It has a public, documented, read-only JSON API (`/llms.txt`, `/.well-known/openapi.json`, `GET /api/v1/events`, cursor paging, no auth). It covers about 2,600 upcoming Sofia events, **including Facebook-only club nights** (FOMO, Gramophone, Bar Petak, Yalta, Carrusel, Culture Beat, Rebels, Rabbit Hole quizzes...). Paging all of Sofia takes 26 requests and about 7 seconds. The nightlife connector filters by venue name. **It is also the best general-purpose source found so far (theatre, concerts, kids), so it is worth a general connector too.**
- **Resident Advisor** works through `POST https://ra.co/graphql` with no auth. Sofia is `areas: {eq: 558}`. There are about 25–35 upcoming techno/house nights: Kupe, Tell Me, Nutone, Mesmeric, Club Pave, EXE-promoted events and OBLK.
- **EXE Club no longer exists under that name.** The venue at ul. Shipka 6 has been rebuilt as **CLWD** (clwd-space.com, a Framer site with a server-rendered calendar). It keeps the EXE weekly formats: Thu **WИNAMP** (2000s pop), Fri **WE TRAP** (rap), Sat electronic. EXE carries on as a promoter (Verknipt/F2F at Inter Expo, EPISODE series), and those events show up on RA and allevents.
- **"Secret Crush" is a party brand, not a venue.** It runs as Saturday nights at FOMO the club ("25.10 | Secret Crush SATURDAY @ FOMO the club", Facebook). FOMO's own brands (Ay, Papi / Shame Party / Детска дискотека (за възрастни) / Secret Crush) are roughly monthly, not weekly. They are covered by SofiaStage and allevents.
- **Carrusel's website** (carruselclub.com/upcoming-events) only has flyer images with no text, so it is unusable without OCR. Its events come through SofiaStage, Go Sofia and RA.
- Go Sofia venue pages carry `Place.event[]` JSON-LD and add about 60 events that the other sources don't have after dedupe.

## Connectors built

| File | Source | Events today | Suggested minEvents | Runtime | Notes |
|---|---|---|---|---|---|
| `ra.js` | ra.co GraphQL `eventListings`, area 558 | 25 | 8 | <1 s | Times are Sofia local with no offset, converted via `sofiaLocalToIso`. Drops "TBA - TBA" spam listings (an Italian promoter posts fake Sofia dates), placeholder events more than 400 days out, and fake integer coordinates. `attending` is used as attendees. Cost is parsed to EUR, or BGN when "лв" appears |
| `sofiastage.js` (general; replaced the earlier `sofiastage.js`) | sofiastage.com `/api/v1/events`, all upcoming Sofia events | ~2,300 (238 tagged Nightlife) | 1000 | ~12–16 s, 26 requests | Everything is kept except kids events (puppet theatre, kindergartens, "за деца" titles; an adult override keeps "Детска дискотека (за възрастни)"), online events and non-Sofia events. Categories are guessed from venue and title (Nightlife/Club/Bar, Theatre, Classical, Musical, Cinema, Exhibition, Concert, Sport, Comedy, Party, Quiz, Workshop/Talk, Literature); about 15% end up uncategorised. `url` prefers the official/ticket link over Facebook (about 270 still point to Facebook). The API gives no price or coordinates. Collapses same venue+title+day (literature-night slots). It overlaps heavily with Eventim, bilet and epaygo, so dedupe matters |
| `clwd.js` | clwd-space.com/calendar plus up to 30 detail pages | 14 | 4 | ~8 s | Framer markup (`data-framer-name="Calendar_new"`), so it is fragile if they redesign. Detail pages give line-up, price (EUR) and a Fourvenues/bilet ticket link |
| `sofialiveclub.js` | sofialiveclub.com/events/YYYYMM (month list comes from the `<select>`) | 29 | 8 | ~2 s | Live music/jazz club. Title from `<b>`, time from "начало - HH:MM", and it skips "PRIVATE PARTY". Ticket URL (Eventim/bilet/more.com) is used as `url` when present, so dedupe with Eventim works on title+hour. **The server only offers TLS 1.2 CBC ciphers, which Deno's rustls rejects (connection reset). It works in Node only, so don't schedule it in Edge Functions** |
| `alleventsparties.js` | allevents.in/sofia/parties?page=N (about 5 pages) | 38 | 12 | ~5 s | Mirrors Facebook club events. The category is noisy (hikes, bazaars, trips from Botevgrad), so the connector keeps only late starts or nightlife keywords and drops a noise regex. `attendees` is allevents' "interested" count. Source name is `allevents`, and the ids are the allevents eid. **Redundant now:** the general `allevents.js` (built separately) already crawls `/sofia/parties` with the same ids, so don't register both. At most, merge the nightlife keyword filter and tagging into `allevents.js` |
| `gosofianightlife.js` | go-sofia.com/venues/<slug> JSON-LD (43 bar/club slugs from the sitemap) | 87 | 25 | ~21 s | robots.txt allows `/venues/`. Date-only events (no time on the site) default to **21:00**. Drops bilingual BG/EN duplicates that share a ticket link. Source name is `gosofia` |

All connectors except sofialiveclub were also run under Deno 2 successfully. Combined across these 6 sources: 349 events, 309 after `dedupe()`.

## Venue-by-venue

| Venue | Where they publish | Access | Connector? |
|---|---|---|---|
| **EXE Club / CLWD** (ul. Shipka 6) | clwd-space.com/calendar; RA club 158167/280681; Fourvenues (`web.fourvenues.com/en/clwd-euro`, bot-checked); bilet.bg | Framer SSR HTML | **clwd.js**, plus ra.js for EXE promoter events |
| **Carrusel** (Rakovski 108) | IG @carrusel_club, FB; carruselclub.com (image-only flyers); Entase tickets | Picked up by SofiaStage, Go Sofia, RA (club 110920) | via sofiastage / gosofianightlife |
| **Secret Crush** | Party brand at FOMO (FB events) | FB only; mirrored on allevents/SofiaStage when posted | via alleventsparties / sofiastage |
| **FOMO the club** (Tsar Kaloyan 6) | FB, IG; bilet.bg venue 507; ticketstation for concerts | SofiaStage (6), allevents org page, Go Sofia | via aggregators |
| **Yalta Club** | FB/IG, RA club 4339, Fourvenues (bot check), Songkick | SofiaStage (4), Go Sofia | via aggregators |
| Culture Beat (NDK) | FB/IG, RA club 55612 | SofiaStage (Fri "REMIXED", Sat "2000s PARTY") | via sofiastage |
| Bedroom Premium | FB/IG only, no events on any aggregator today | none | no, FB-only |
| Terminal 1, Studio 5, Club Kvartal, One Bar, Kosmos, Chervilo, Barcode, The Apartment | No working websites (connect timeouts or NXDOMAIN on obvious domains); no listings on RA/SofiaStage/Go Sofia today. Chervilo appears to be closed (the CLWD blurb mentions "Червило, Маскара и PM" in the past tense) | none | no |
| Bar Petak / Бар Петък | FB; Go Sofia; SofiaStage | JSON-LD / API | via aggregators |
| Club Gramophone | FB; SofiaStage (13); Go Sofia (9); allevents | API / JSON-LD | via aggregators |
| Club Pave | clubpavesofia.com (Wix, heavy); RA 248775; bilet.bg; SofiaStage (23); Go Sofia (14) | API / JSON-LD | via aggregators + RA |
| Клуб Строежа, При Черепите, Live & Loud, Malkata Tekila, Чистилището, OBLK, Studio Orfei | FB + Go Sofia + SofiaStage; liveandloud.net exists (not parsed) | JSON-LD / API | via aggregators |
| Kupe, Tell Me, Nutone, Mesmeric, Taba Record Store | RA (the techno scene lives here) | GraphQL | **ra.js** |
| Sofia Live Club | sofialiveclub.com/events/YYYYMM, Eventim | SSR HTML | **sofialiveclub.js** |
| Mixtape 5 | iCal (already built) | - | skipped (already covered) |
| Secret Room (speakeasy) | secretroom.bg (blog-style "news" pages only), FB | no event data | no |
| Bar Dak, Rabbit Hole, Art Bar 158, Rebels Club, Бар Безкрай, Schroedinger, The Pit, KICK's, C'est La Vie, Club Privilege, Magnito | FB → SofiaStage | API | via sofiastage |

## Aggregators and ticketing checked

| Source | Result |
|---|---|
| **Resident Advisor** | VERIFIED. `POST https://ra.co/graphql`, `areas(searchTerm:"Sofia")` returns id **558**. `eventListings(filters:{areas:{eq:558}, listingDate:{gte:...}}, pageSize, page)` returns 35 listings (one event can appear twice via two listing ids, so dedupe by `event.id`). Headers used: `referer: https://ra.co/events/bg/sofia`, `ra-content-language: en` |
| **SofiaStage** | VERIFIED. Public agent API with an explicit rate guidance of 1–3 req/s and a request to attribute SofiaStage. `/api/v1/venues` caps at 100 venues with no cursor, so fetch events and filter locally |
| **Go Sofia** | VERIFIED. Venue pages have JSON-LD. `/Events?category=Music` shows 12 of 386 events per page, but `page=` is disallowed in robots.txt, so it is not used |
| **allevents.in** | VERIFIED. `/sofia/parties?page=N` works (64 cards over 5 pages). `/sofia/nightlife` is the same list. `/sofia/parties/this-weekend` returns 404 |
| Shotgun | `shotgun.live/en/cities/sofia` returns 429 "Vercel Security Checkpoint", so it is blocked |
| Xceed | No Sofia city (`/en/sofia/events` returns 404) |
| DICE | No Sofia browse page (404) |
| Songkick | 406 to non-browser clients, even with Accept headers |
| Bandsintown | Cloudflare 403 |
| Fourvenues (Yalta, CLWD tickets) | "No bots on the guest list" JS challenge (403) |
| FIXR (EXE venue page) | Cloudflare challenge (403) |
| musicofourdesire.com | Cloudflare challenge (403) |
| Entase (entase.com, Carrusel's ticketing) | General BG ticketing; `/explore/bg/sofia` is JS-loaded. Not pursued for nightlife, but a possible general source (they have a developers page at howto.entase.com/developers) |
| disco.bg | `/ndbg/bg/program/calendar/0/YYYY-MM-DD` has a "recommended parties" list (Slippery Club, Casa de Cuba, Social Cafe) with **no start times** and about 8 Sofia items. Low value, not built |
| eventhive.tech, justbook.bg | Venue pages exist (FOMO); JS/login-oriented and not needed given SofiaStage |
| axle.events | 503 "Service Suspended" |
| sofialive.bg, programata | Articles, not structured events (see ticketing research) |

## Proposed recurring rules (for `recurring.js`; not added)

Most Facebook-only club nights now come through SofiaStage/allevents, so few rules are needed. The candidates:

| key | title | weekday | time | venue | link | confidence |
|---|---|---|---|---|---|---|
| `bardak-quiz` | Куиз и пица @ Bar Dak | 4 (Thu) | 19:45 | Bar Dak | https://sofiastage.com/venue/Bar%20Dak | Medium: two consecutive Thursdays are listed, and it is already in sofiastage, so add a rule only if that connector drops |
| `artbar158-quiz` | English quiz night @ Art Bar 158 | 3 (Wed) | 20:00 | Art Bar 158 | https://sofiastage.com/venue/Art%20Bar%20158 | Medium: weekly per Golemiat Quiz; also in sofiastage |
| `carrusel-weekend` | Carrusel Club night (Fri/Sat) | 5 and 6 | 23:30 | Carrusel Club, ул. Г. С. Раковски 108 | https://www.instagram.com/carrusel_club/ | Low: open every weekend, but themed nights change and they post only on IG |
| `bedroom-weekend` | Bedroom Premium hip-hop/R&B night | 5 and 6 | 23:30 | Bedroom Premium | FB/IG | Low: guidebook info only, unverified |

**Not recommended as rules:** FOMO's Ay, Papi / Secret Crush / Shame (roughly monthly, not weekly; the allevents org page shows irregular dates) and CLWD's Thu/Fri/Sat formats (clwd.js already covers them).
