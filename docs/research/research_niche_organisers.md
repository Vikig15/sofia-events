# Sofia niche / interest-specific organisers — data-source research

Date: 2026-09-23. Scope: participatory, social, ideally recurring events in Sofia for a 24-year-old.
Legend: **VERIFIED** = fetched with curl/WebFetch today and the claimed behaviour observed. **PARTIAL** = site fetched, but the specific claim (e.g. schedule) comes from search snippets. **UNVERIFIED** = search-result only / social-media page not fetchable.

---

## 0. Top findings (read this first)

1. **Machine-readable goldmines (VERIFIED):**
   - **Meetup per-group iCal**: `https://www.meetup.com/<urlname>/events/ical/` returns a real `text/calendar` with future events (no auth). Works for Founders Running Club, Sofia English (language/social), Entrepreneurs Night Out, Sofia Football Friendly, Sofia Social Philosophy Games, Sofia Expats, Toastmasters, etc. Group discovery: scrape `https://www.meetup.com/find/?location=bg--Sofia&source=EVENTS&keywords=<kw>` (SSR HTML contains `meetup.com/<urlname>/events/<id>` links).
   - **Wizards of the Coast Store & Event Locator GraphQL** (MTG events for every WPN store in Sofia): `POST https://api.tabletop.wizards.com/silverbeak-griffin-service/graphql` with header `origin: https://locator.wizards.com`, no auth. Working query:
     ```graphql
     { searchEvents(query:{latitude:42.6977,longitude:23.3219,maxMeters:15000,
         tags:["magic:_the_gathering"],sort:date,sortDirection:Asc,pageSize:15,page:0})
       { events { id title scheduledStartTime organization { name } } } }
     ```
     Returned today: The Next Generation (PreModern, prerelease), **Abordage** (Commander Nights, Thu), **Drugiyat Zamak / Другият замък** (Castle TNM Thu, Castle FNM Fri, Commander Party, Cube Draft), **Mox Games** (Thursday Night Magic Modern, FNM Commander Fri). Introspection disabled; field names found by trial (`scheduledStartTime`, not `startDatetime`).
   - **Luma calendar ICS**: `https://api.lu.ma/ics/get?entity=calendar&id=<cal-id>` (cal-id is in the calendar page HTML, e.g. ProductTank Sofia `cal-dtI5FcwDRt8DbXR`). VERIFIED returns ICS.
   - **WordPress + Modern Events Calendar ICS**: Софийски планински клуб (SPK) `https://spk.bg/?mec-ical-feed=1` (333 events) + `https://spk.bg/wp-json/wp/v2/mec-events` + RSS `https://spk.bg/events/feed/`. Caveat: latest event on site is Dec 2025 → site stale, activity moved to FB/IG.
   - **partita.bg** — a dedicated Sofia latin-dance (salsa/bachata/kizomba) party aggregator; clean SSR HTML list `https://www.partita.bg/en/list/sofia` with date/time/party/venue for the next ~4 weeks. Single best source for the dance scene.
   - **salsavida.com** Sofia guide has `ItemList` JSON-LD with `startDate` + RSS; smaller coverage than partita.
   - **5kmrun.bg** (Bulgaria's parkrun equivalent — **parkrun itself does NOT operate in Bulgaria**, verified against `images.parkrun.com/events.json`: zero events in BG). Every Saturday 09:00, Sofia locations **Южен парк** and **Западен парк 2**; SSR list `https://5kmrun.bg/5kmrun/events` with city filter.
   - **TimeHeroes.org** (volunteering): no API/RSS/ICS (`/api`, `/feed` 404), but SSR HTML list `https://timeheroes.org/en/browse?city=1` (city=1 = Sofia, VERIFIED), pagination via `https://timeheroes.org/browse?city=1&start=20` (HTML fragment used by infinite scroll). Active items are `<article>`; ended ones are `<article class="pastcause">`. Detail pages have OG tags; dates are in free text ("When? On November 25, 2023, from 19:00…") → needs LLM/regex extraction.
   - **Eventbrite** listing pages carry `Event` JSON-LD (e.g. Sofia Social & Language Exchange at I Came Alone Pub, startDate/endDate span = recurring series).
   - **begach.com** (Begach Running Club) — `Event` JSON-LD for Bulgarian races (race calendar, not social runs).
   - **Race calendars**: racecalendar.bg (SSR Nuxt table, all BG running/trail races), powerlifting-bg.com (BFST calendar page + WP RSS), chess-results.com federation page `fed.aspx?fed=BUL` (lists Sofia tournaments e.g. "Chess Battle Tournament Blitz/Rapid – Bulgaria Mall", Corporate Chess Championship Sofia 11 Oct 2026).

2. **Social-media-only is the majority.** Of ~60 organisers catalogued below, roughly **55–65 % publish upcoming events only on Facebook/Instagram** (pub quizzes, run clubs, board-game cafés, comedy, improv, book clubs, hiking groups, ESN, comic/anime, board game weekend, most dance studios, CrossFit/HYROX gyms). ~20 % have a structured feed (ICS/API/JSON-LD/clean HTML), ~20 % have a website with scrapable-but-unstructured HTML.

3. **Facebook behaviour (VERIFIED):** plain browser UA → HTTP 400 on `/Page/events` and `/events/<id>`. With `User-Agent: facebookexternalhit/1.1`, **individual event URLs and page URLs return OG metadata** (title, description incl. date in Bulgarian/English, "N people interested"), e.g. event 30433427782922446 "Good Food, Good Friends in Sofia – Recurrent event" (Nomade Table events × BlaBla Language Exchange, Tue 6 Oct 2026). Page event *listings* are NOT exposed without login. So FB can be used to *enrich a known event URL*, not to *discover* events. (ToS grey area — use sparingly/manual.)

4. **Recurring-rule layer is essential.** Many of the best social events are fixed weekly and change rarely → hand-curate as static RRULEs (with "last verified" date and a link to the organiser's IG/FB for confirmation). See §2.

---

## 1. Catalogue by category

Columns: organiser | channel(s) | access method | recurring? | status / URL

### Running
| Organiser | Channel | Access | Recurring | Status |
|---|---|---|---|---|
| 5kmrun (South Park & West Park 2) | 5kmrun.bg, FB, app | SSR HTML `https://5kmrun.bg/5kmrun/events` | **Weekly Sat 09:00** (free, timed 5k) | VERIFIED |
| parkrun South Park | — | parkrun `events.json` | n/a | VERIFIED **does not exist** in BG (FB "parkrun tourism" posts refer to 5kmrun). A "South Park junior parkrun" FB page exists (UNVERIFIED status) |
| Founders Running Club :: Sofia | Meetup | **ICS** `https://www.meetup.com/founders-running-club-sofia/events/ical/` | **Weekly Sat 09:30** (08:30 on 26 Sep) — runners + networking | VERIFIED |
| Sofia Run Club | Instagram @sofiarunclub (~6.7k) | IG only | Weekly (day UNVERIFIED) | UNVERIFIED (IG fetch returns JS shell) |
| adidas Runners Sofia / runnerssofia.com | FB group `groups/adidasrunnerssofia`, site | site timed out | weekly group runs (UNVERIFIED) | runnerssofia.com unreachable today |
| Nike Run Club Sofia | FB group `groups/nikeplusrunclubsofia` | FB only | UNVERIFIED | UNVERIFIED |
| ASICS FrontRunner Sofia | asics.com/bg-bg/frontrunner (403 to curl) | IG/FB | Borisova, South Park, Vitosha | PARTIAL (via sofiamarathon.bg article) |
| Begach Running Club | begach.com, FB/IG @begachsofia | **Event JSON-LD** (races) | regular workouts (schedule on FB) | VERIFIED (JSON-LD: "Devin Active Friday Night 5k Run" 25 Sep 20:00, "Sofia Morning Run" 25 Oct, "Tech Run" 28 Nov) |
| Wizz Air Sofia Marathon | sofiamarathon.bg | website | annual — **11 Oct 2026** | PARTIAL; club list article VERIFIED |
| racecalendar.bg | website | SSR HTML table (filters by town/date) | all BG races | VERIFIED |

### Climbing / fitness / strength
| Organiser | Channel | Access | Recurring | Status |
|---|---|---|---|---|
| Momentum Indoor Climbing (ex-Walltopia, Tsarigradsko shose 111V; 2 Sofia halls) | momentumclimbing.bg (WordPress), FB/IG | WP RSS `/tsarigradsko-shose/feed/`, "Събития" section | intro sessions, comps | PARTIAL (site + feed exist; no event feed found) |
| Balkan Climbing (ul. 187-ma 9, near Ring Mall; largest in Balkans) | balkanclimbing.com | static site | UNVERIFIED | VERIFIED site, no events feed |
| Boulderland, Боулдър зала Кино | sportenkalendar.bg listing / FB | — | — | UNVERIFIED |
| ONSIGHT Climb (competitions) | climbonsight.bg | WP site | comps (e.g. Купа "Балкан" boulder) | UNVERIFIED |
| Pulse Energy HYROX Training Club (Sofia Ring Mall) | pulsefit.bg | site | group HYROX classes | UNVERIFIED (search) |
| CrossFit affiliates Sofia | crossfit.com/gyms/bulgaria/sofia (JS-rendered) | FB/IG per box | community WODs (usually Sat) | UNVERIFIED |
| Bulgarian Powerlifting Federation (БФСТ) | powerlifting-bg.com | calendar page + WP RSS `/bpl/feed/` | **1 Nov 2026 – national classic PL juniors, NSA Sofia**; 30 May leg-press Sofia | VERIFIED |
| sportenkalendar.bg | website | HTML aggregator by city/sport | mixed | VERIFIED homepage |

### Team sports
| Sofia Football Friendly | Meetup | **ICS** `https://www.meetup.com/sofia-football-friendly/events/ical/` | **Weekly Thu 18:45–20:00**, Sport complex "Peace and Friendship" | VERIFIED |

### Dance (salsa / bachata / balfolk)
| Organiser | Channel | Access | Recurring | Status |
|---|---|---|---|---|
| **partita.bg** (aggregator) | site + FB | SSR HTML `https://www.partita.bg/en/list/sofia` | lists all socials | VERIFIED — next weeks show: **Wed 20:00 "Танци до Езерото" (Social Dance Moments)**, **Tue 21:30 Time Out Salsa Night**, Sat 21:00 Bachata & Salsa Night @ Studio Restart, Fri 22:30 Latin Force, Sat 22:30 Ritmo Dance Studio, Thu 20:00 De Fuego, Paletro Dance Spot, Abayomi, Salsa Diva 22nd birthday (3 Oct), **Te Amo Sofia Bachata Festival 2–4 Oct** |
| salsavida.com Sofia | site | ItemList JSON-LD + RSS | — | VERIFIED |
| latindancecalendar.com Sofia | WP site | RSS | — | VERIFIED (page loads) |
| Kino Cabana Salsa & Bachata matinee | salsavida listing | — | Mon & Tue (per salsavida) | UNVERIFIED |
| Balfolkaria (Балфолкарѝя) — European folk social dance | FB, TimeHeroes org page | FB | regular balls | PARTIAL (TimeHeroes mission page) |

### Board games / TCG / wargames
| Organiser | Channel | Access | Recurring | Status |
|---|---|---|---|---|
| **Wizards Event Locator** (all MTG stores) | GraphQL API | **JSON API** (see §0) | FNM Fri, TNM Thu, Commander nights | VERIFIED |
| Drugiyat Zamak (Другият замък) | Wizards API, FB | API | **Thu TNM + Commander Party, Fri FNM** | VERIFIED via API |
| Mox Games | Wizards API | API | **Thu TNM Modern, Fri FNM Commander** | VERIFIED via API |
| Abordage (board-game café-bar) | Wizards API, FB | API (MTG only) | **Thu Commander Nights**; open board gaming evenings | VERIFIED via API |
| The Next Generation (ul. Petar Bogdan 19) | thenextgeneration.bg (OpenCart) /en/events (empty), Wizards API | API | PreModern Wed | VERIFIED |
| Level Up (pl. Slaveykov 7B) — biggest board game club | IG @level.up.sofia, FB LevelUpSofia | social only | monthly DnD, Warhammer, Star Wars, MTG, Flesh&Blood, "International Board Games Night", QuizUp | UNVERIFIED (not in Wizards API results today → maybe not WPN or outside top 15) |
| BoardGames.BG (ul. Krum Popov 75) | boardgames-bg.com, FB | shop site | MTG/D&D events on FB | PARTIAL |
| Mulligan Board Games Club | FB | FB only | — | UNVERIFIED |
| Bar Restart (board/video game bar) | FB/Tripadvisor | — | — | UNVERIFIED |
| Sofia Hobby Store (Warhammer / GW) | sofiahobbystore.com | shop | — | UNVERIFIED |
| Sofia Game Night (festival) | FB SofiaGameNight | **website suspended** (sofiagamenight.com → cPanel suspended page) | annual | VERIFIED dead site |
| Sofia Board Game Weekend | FB SofiaBGW | **domain sofiaboardgame.com expired** (redirects to spam) | annual | VERIFIED dead site |

### Chess
| chess-results.com BUL | `https://s1.chess-results.com/fed.aspx?lan=1&fed=BUL` | HTML list | "Chess Battle" Blitz/Rapid at Bulgaria Mall (recurring series), Corporate Team Chess Championship Sofia 11 Oct, Corporate Individual 29 Nov | VERIFIED |
| Sofia Cup Balkan Rapid & Blitz | chess.com events | — | annual | UNVERIFIED |

### Comics / anime / fantasy / sci-fi
| Aniventure Comic Con | aniventure.net / comiccon.bg, FB, IG @nakamabg | static site (no feed) | annual, **11–12 Jul 2026** done; next July 2027 | VERIFIED site; comiccon.bg timed out |
| Comic Con Bulgaria FB | FB comiccon.bg | FB | — | UNVERIFIED |
| rostercon.com Sofia | aggregator | HTML | cons | UNVERIFIED |
No dedicated comic-shop event calendar found in Sofia; comic community overlaps with the board-game / TCG stores above.

### Pub quiz / trivia
| Sofia International Pub Quiz | FB SIPQuiz | FB only (OG via facebookexternalhit: "Monthly Pub Quiz (in English)… teams 3–5, 4 rounds") | **Monthly** | VERIFIED (OG metadata) |
| Sofia Quiz Madness | FB/IG @sofiaquizmadness | social only | EN + BG quiz nights | UNVERIFIED |
| Quiz Night BG ("Интелектуалната зараза") | FB/IG @quiznightbg | social | weekly-ish | UNVERIFIED |
| Quiz Night Show (JJ Murphy's etc.) | quiznight.show | WP site; **program page 404** | — | VERIFIED broken |
| ESN × Bar Dak Sunday Pub Quiz (EN) | esnbg.org | ESN page 404 | — | VERIFIED dead link |

### Language exchange / expat social
| Sofia English (Meetup) | Meetup | **ICS** `/sofia-english/events/ical/` | **multiple per day** (English practice, Deep Conversation, Founders for Founders) | VERIFIED |
| Sofia Social & Language Exchange / Sofia Tech Social (I Came Alone Pub, Knyaz Boris I 112) | Eventbrite + WhatsApp/Discord | **Event JSON-LD** (series Jul–Dec 2026) | recurring weekly | VERIFIED |
| Nomade Table × BlaBla Language Exchange "Good Food, Good Friends" | FB event (recurrent), website registration | FB OG | recurring (Tue 6 Oct 2026 instance, 147 interested) | VERIFIED (OG) |
| BlaBla Language Exchange (Bar After Five) | blablacommunity.com (Wix) | JSON-LD but **stale (2020)** | weekly | VERIFIED stale |
| Language Exchange Café Sofia; Language Exchange Club Sofia | FB page / group | FB only | — | UNVERIFIED |
| Sofia Expats | Meetup + sofiaexpats.com | **ICS** `/sofia-expats/events/ical/` | **Monthly** meetup (12 Oct) + hikes (Vitosha sunset 16 Oct) | VERIFIED |
| Couchsurfing Sofia | couchsurfing.com | login | monthly (4th Wed/Thu) | UNVERIFIED |
| InterNations Sofia | internations.org | login | monthly | UNVERIFIED |
| ESN Sofia / ESN Sofia University | FB, esnbg.org (RSS `/rss.xml`, news only), activities.esn.org (**Cloudflare 403**) | mostly FB | many socials during semester (from Oct) | PARTIAL |

### Philosophy / talks / self-development
| Practical Philosophy Sofia | practicalphilosophy.club/sofia, Meetup RSVP, WhatsApp | static page | **Weekly Mon 19:00–21:00, bul. Vitosha 13** | VERIFIED |
| Sofia Social Philosophy Games | Meetup `meetup-group-wanlggsp` | **ICS** | ~weekly (29 Sep 19:15) | VERIFIED |
| Walk the Talk Toastmasters | Meetup | **ICS** | 2×/month (online/hybrid) | VERIFIED |
| TEDxSofia | tedxsofia.org (countdown, no feed), epaygo tickets | static | annual **28 Nov 2026**, Dom na kinoto | PARTIAL |
| TEDxVitosha | tedxvitosha.com | static | annual | UNVERIFIED |
| Philosophy and Coffee in the Park (Meetup) | Meetup | ICS returned 0 events | — | VERIFIED empty |

### Business / networking / tech
| Entrepreneurs Night Out | Meetup | **ICS** | **~2×/month** Sofia (1 Oct Garden Social, 12 Oct, 28 Oct) | VERIFIED |
| Sofia Startup Founder 101 | Meetup | **ICS** | weekly-ish | VERIFIED |
| Tech meetups (Python, PyData, AWS, OWASP, Crypto, LFDT, Grafana, Rust, WordPress…) | Meetup | **ICS** each | monthly | VERIFIED discovery; Python ICS verified (30 Sep) |
| ProductTank Sofia | Luma | **ICS** `api.lu.ma/ics/get?entity=calendar&id=cal-dtI5FcwDRt8DbXR` | irregular | VERIFIED |

### Comedy / improv
| Inside Joke Stand-up (EN open mic) | insidejokestandup.com (Squarespace), IG | static page (Squarespace `?format=ical` not enabled) | **Weekly Mon after 21:00, KEVA, ul. Rakovski 114, free** | VERIFIED |
| The Comedy Club Sofia (Ivan Kirkov) / comedy.bg / standup.bg | FB, WP sites w/ RSS | RSS (blog-ish) | 20+ shows/month incl. open mic | PARTIAL |
| English Comedy in Sofia | FB | FB only | — | UNVERIFIED |
| HaHaHa Impro Theatre (Rakovski 44) | FB | FB only | improv jams (EN) | UNVERIFIED |
| ShiZi Improv / Sofia International Improv Fest | improvfestivals.org | — | annual, September | UNVERIFIED |

### Hiking / outdoors
| Софийски планински клуб (SPK) | spk.bg (WP+MEC), FB, YouTube | **ICS** `https://spk.bg/?mec-ical-feed=1`, WP REST, RSS | frequent hikes — but site stale since Dec 2025 | VERIFIED (stale) |
| Top Guides | topguides.bg/bg/kalendar/ (WP) | HTML calendar + RSS | weekday & weekend hikes (commercial) | VERIFIED |
| По Билото (pobiloto.com) | WP | HTML list (dates, "има места") + RSS | weekend treks | VERIFIED |
| Po Planini i Gori (poplaninigori.com) | site | HTML month calendar | trips | VERIFIED |
| Vitosha Mountain Hiking | FB vitoshahiking | Meetup group **no longer exists** | — | VERIFIED gone on Meetup |
| FB hiking groups (e.g. "Група за планински преходи" 612585398863454) | FB groups | FB only | — | UNVERIFIED |
| Sofia Expats hikes | Meetup ICS | ICS | occasional | VERIFIED |

### Volunteering
| TimeHeroes.org | website | SSR HTML list, city=1, start=N paging; free-text dates | continuous; some weekly (Bulgarian Food Bank sorting weekly, Food Not Bombs, Caritas, Precious Plastic workshop) | VERIFIED |
| BCause, Caritas Sofia, Food Bank | own sites | — | — | UNVERIFIED |

### Book clubs / cooking
| The Book Club Sofia | FB/IG @thebookclubsofia | social only | **Monthly**, no registration | UNVERIFIED |
| SEWA Book Club | sewa-bg.org | site | monthly | UNVERIFIED |
| Cooking schools (Menu, Amuse Bouche, HRC, Yummy Cooking, Food Connection) | own sites, voucher sites | per-site HTML | class schedules | UNVERIFIED (commercial, lower social value) |

### Other
| Kino Cabana (summer open-air) | FB | — | seasonal | UNVERIFIED |
| Sofia Christian Chants, Transforma breathwork, Move Your Afro, Cake decorating | Meetup | ICS | varied | discovery VERIFIED |

---

## 2. Candidate static recurring rules (hand-curated seed)

| Rule | Where | Confidence |
|---|---|---|
| Sat 09:00 — 5kmrun Южен парк & Западен парк 2 (free 5k) | 5kmrun.bg | High (VERIFIED) |
| Sat 09:30 — Founders Running Club (also on ICS) | Meetup | High |
| Mon 19:00 — Practical Philosophy, bul. Vitosha 13 | site | High |
| Mon 21:00 — Inside Joke EN open mic, KEVA Rakovski 114 | site | High |
| Tue 21:30 — Time Out Salsa Night | partita | High |
| Wed 20:00 — Танци до Езерото (Social Dance Moments) | partita | High |
| Thu 18:45 — Sofia Football Friendly | Meetup ICS | High |
| Thu — Commander Night @ Abordage; TNM @ Drugiyat Zamak & Mox Games | Wizards API | High |
| Fri — FNM @ Drugiyat Zamak, Mox Games | Wizards API | High |
| Monthly — Sofia International Pub Quiz (EN) | FB | Medium (date varies) |
| Monthly — The Book Club Sofia | IG/FB | Low-Medium |
| Monthly — Sofia Expats meetup | Meetup ICS | High |
| Weekly — Sofia Social Language Exchange @ I Came Alone Pub | Eventbrite | Medium (day UNVERIFIED) |

---

## 3. Architecture implications

- **Tier A – structured connectors (cheap, reliable):** Meetup ICS (list of ~30 Sofia group urlnames, rediscovered weekly via `/find` scrape), Wizards GraphQL, Luma ICS, WP/MEC ICS (SPK), Eventbrite JSON-LD, salsavida JSON-LD, begach JSON-LD.
- **Tier B – bespoke HTML scrapers (moderate):** partita.bg, 5kmrun.bg, TimeHeroes (+LLM date extraction), racecalendar.bg, chess-results BUL, powerlifting-bg, topguides/pobiloto/poplaninigori, sportenkalendar.bg. Each is 20–60 lines of parsing; fragile but low-change sites.
- **Tier C – social-media-only (the majority of high-social-value events: quizzes, run clubs, board-game cafés, comedy/improv, book clubs, ESN, hiking FB groups):** no reliable automated discovery. Options, in order of pragmatism:
  1. **Static recurring rules** (§2) with `last_verified` + link to IG/FB; re-verify monthly (cheap and covers most of the value since these are weekly).
  2. **"Paste a link" ingestion**: user shares a FB/IG event URL → fetch OG metadata (FB returns title/description/date text to `facebookexternalhit` UA) → LLM normalises → store.
  3. Optional: a browser-automation job using the user's own logged-in session to read a handful of followed pages' event tabs (personal use only; ToS risk; brittle). Avoid commercial scraping APIs unless needed.
  4. Instagram: effectively closed (JS shell, login wall) → rely on rules + manual adds.
- Watch for **link rot**: 3 of the organiser websites found (sofiagamenight.com, sofiaboardgame.com, quiznight.show program) are dead/expired, BlaBla JSON-LD is from 2020, SPK feed stale since Dec 2025. Each source needs a freshness check (max future event date; alert if no future events).
- Dates: Bulgarian month names and "Europe/Sofia" TZ; Wizards API returns UTC (`...Z`).
