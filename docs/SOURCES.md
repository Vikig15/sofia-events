# Sofia event sources: what we can pull, and how

Research date: 2026-09-23. Every endpoint below was fetched live unless marked *unverified*.
Raw per-area research: [ticketing & venues](research/research_ticketing_venues.md), [community platforms](research/research_community_platforms.md), [niche organisers](research/research_niche_organisers.md).

## The short version

1. **Free and reliable is possible for about 80% of the *listed* events.** Seven connectors (built) already return **~830 unique in-person events over 90 days**.
2. **The most social events are the hardest to get.** About 55–65% of organisers of highly participatory events (pub quizzes, run clubs, board-game cafés, comedy, book clubs, hiking groups, ESN) publish **only on Facebook/Instagram**, which are closed to bots. Handle that with (a) hand-curated weekly rules and (b) a future "paste a link" feature, not by scraping Facebook.
3. **Ticketing sites give volume; Luma, Meetup and weekly rules give the people-meeting.** Rank accordingly: participatory formats and events with RSVP counts beat concerts in a seat.

## Built (in `src/connectors/`) — last run 2026-09-23

| Source | Upcoming (90d) | What it's good for | Access | Risk |
|---|---|---|---|---|
| **Eventim** | ~440 shows | Biggest catalogue: concerts, theatre, sport, Arena 8888, NDK, Sofia Live Club | Site's internal JSON search API. `page` is ignored, so we walk date windows | robots.txt disallows bots on the API host; run ≤1×/day |
| **bilet.bg** | ~160 | Parties, workshops, festivals, theatre, gigs; has prices | Public JSON API, no auth | Low |
| **Wizards (MTG)** | ~105 | Weekly Magic nights at 5 Sofia stores: board-game community | Public GraphQL | Low |
| **Luma** | ~43 | Networking, founders, AI, book clubs, bowling, volunteering. `guest_count` shows how many people are going | Internal discover API by lat/lon | ToS-grey, low volume |
| **Meetup** | ~35 in person | Football friendly, running club, expats, hikes, philosophy game, entrepreneurs | Internal GraphQL `gql2`: find 98 Sofia groups, then read each one's events | ToS forbids scraping; ~110 requests/day |
| **iCal feeds** | ~20 | Mixtape 5, ProductTank; add any organiser that has a calendar feed | `.ics` | Low |
| **dev.bg** | ~2 in person | Office tech talks | WordPress Events REST API | Low |
| **Weekly rules** | 7 rules | 5kmrun (Sat), Practical Philosophy (Mon), Inside Joke open mic (Mon), salsa (Tue), bachata (Wed), Timeleft (Wed) | Hand-curated in `src/recurring.js` | Rot; re-verify monthly |

## Backlog: verified sources worth adding next (in priority order)

| Source | Why | How | Effort |
|---|---|---|---|
| **Eventbrite** Sofia | Language exchange, "100 Cities" dinners, Fuckup Nights, English stand-up | JSON-LD `ItemList` on `eventbrite.com/d/bulgaria--sofia/all-events/?page=N` | S |
| **partita.bg** | Every salsa/bachata/kizomba social in Sofia. Would replace the dance rules | Server-rendered HTML `partita.bg/en/list/sofia` | S |
| **EPAYGO** | 772 events nationally (Arena 8888, festivals, free events), not on Eventim | `epaygo.bg/events/all`, then cached detail pages, filter to София | M |
| **visitsofia.bg** | City's official calendar, lots of free culture | Weekly HTML list `/bg/component/jevents/week.listevents/YYYY/MM/DD/-?Itemid=330` | M |
| **TimeHeroes** | Volunteering: very social, meaningful | HTML `timeheroes.org/en/browse?city=1`; dates are free text, so use an LLM to extract them | M |
| **5kmrun.bg** | Would turn the static rule into real data | HTML `5kmrun.bg/5kmrun/events` | S |
| **Allevents.in** | Catch-all for events that originate on Facebook | RSS `allevents.in/sofia/RSS` + JSON-LD on each event page (RSS has no dates) | M |
| **sofiameetups.com** | International mixers with icebreakers | HTML | S |
| Toplocentrala, NDK, Philharmonic, Opera, National Theatre, Joy Station | Culture/venues (mostly overlap Eventim) | JSON-LD / AJAX JSON / HTML | S each |
| chess-results (BUL), racecalendar.bg, powerlifting-bg.com, hiking clubs | Sport/competition calendars | HTML / RSS | S each |
| Ticket Station | Big concerts/festivals | JS-only site with a token-gated API, so it needs a headless browser | L |

**Dead or blocked (don't bother):** Facebook event listings (login wall), Instagram, InterNations/Couchsurfing (login), 10times / Sofia Tech Park site / kupibileti (Cloudflare), Fever (no Sofia), programata/sofialive (articles, not events), kade.bg/bileti.bg/ticketportal.bg (dead), parkrun (doesn't operate in Bulgaria, 5kmrun is the equivalent), conferenceindex (junk).

## The Facebook/Instagram gap, and how to cover it

These organisers are high value but social-media-only: Sofia International Pub Quiz, Quiz Madness, Sofia Run Club, adidas/Nike/ASICS run crews, Level Up / Mulligan board-game cafés, The Comedy Club, HaHaHa Impro, The Book Club Sofia, ESN Sofia, CrossFit/HYROX boxes, most dance studios. Full list: [niche research](research/research_niche_organisers.md).

1. **Weekly rules** (`src/recurring.js`): cheap, and most of these events repeat weekly. Each rule has a `verified` date, and the run warns after 45 days.
2. **"Paste a link" ingestion** (later): share a Facebook/Instagram event URL. The server fetches its link-preview metadata (Facebook returns title and description text to its own `facebookexternalhit` UA), then an LLM extracts the date and venue into the normal event format. This enriches events you already know about, not discovery. Keep it low-volume and personal.
3. **Not recommended:** driving your logged-in Facebook session with a bot. It's brittle and risks your account.

## Ground rules for staying "free and reliable"

- **One run per day**, sleeps between requests, a real browser UA (Eventim's Akamai blocks short UAs). This is a personal tool, so stay far below anything a site would notice.
- **Health check every source every run**: `minEvents` in `src/sources.js`. Internal APIs (Luma, Meetup, Eventim) *will* change eventually, and a sudden 0 is the alarm.
- **Prefer official/public paths** (bilet API, iCal, JSON-LD, WordPress REST) over internal APIs where both exist.
- **Link back** to the source for tickets/RSVP. Never republish descriptions publicly. If this ever becomes a public app, revisit Eventim/Meetup/Luma terms first.
- Use Node `fetch`, not macOS `curl`: curl fails the TLS handshake with eventim.bg and ticketstation.bg.

## Path to an app (next steps)

1. **Storage:** replace `data/events.json` with SQLite (upsert by `id`, keep `first_seen`/`last_seen` so you can show "new this week").
2. **Scheduling:** a daily cron (launchd locally, or a GitHub Actions cron that commits the JSON, which is free).
3. **Scoring for "can I meet people here":** boost participatory formats (run, football, board games, language exchange, mixer, dance social, workshop, volunteering, quiz, hike), RSVP/attendee counts, free or cheap, evenings and weekends. Demote seated shows. Then personal interest boosts (gym, philosophy, games, business, fantasy/sci-fi), kept as soft weights so you still see things outside your usual list. An LLM pass can tag categories consistently across BG/EN titles.
4. **UI:** a simple mobile-friendly "this week" feed with filters (tonight / weekend / free / social-only), plus a "going" button that feeds back into the scoring.
