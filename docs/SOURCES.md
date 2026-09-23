# Sofia event sources: what we can pull, and how

Research date: 2026-09-23. Every endpoint below was fetched live unless marked *unverified*.
Raw per-area research: [ticketing & venues](research/research_ticketing_venues.md), [community platforms](research/research_community_platforms.md), [niche organisers](research/research_niche_organisers.md).

## The short version

1. **Free and reliable is possible for most *listed* events.** 33 connectors return **~2,800 unique in-person events**, refreshed daily and on demand.
2. **The most social events are the hardest to get.** About 55–65% of organisers of highly participatory events (pub quizzes, run clubs, board-game cafés, comedy, book clubs, hiking groups, ESN) publish **only on Facebook/Instagram**, which are closed to bots. Handle that with (a) hand-curated weekly rules and (b) a future "paste a link" feature, not by scraping Facebook.
3. **Ticketing sites give volume; Luma, Meetup and weekly rules give the people-meeting.** Rank accordingly: participatory formats and events with RSVP counts beat concerts in a seat.

## Built: 33 connectors (in `supabase/functions/_shared/connectors/`), as of 2026-09-23

About 2,800 unique upcoming in-person events after fuzzy cross-source dedupe (~5,000 raw listings).
Live health is in the app's "Sources" panel (`source_health` view).

| Group | Sources (upcoming events) |
|---|---|
| Aggregators & ticketing | SofiaStage (~2,240; public API, includes many Facebook-only bar/club nights), EPAYGO (~680), Eventim (~445), Allevents (~190), bilet.bg (~160), visitsofia.bg (~105), ticket.bg (~77) |
| Social / community | Luma (~43), Meetup (~36, 98 groups crawled), Eventbrite (~21), sofiameetups.com, dev.bg, TimeHeroes (local only) |
| Games | Wizards of the Coast locator (~105 MTG nights at 5 stores) |
| Dance & sport | partita.bg (~31), salsavida (~28), 5kmrun, racecalendar.bg, chess-results, powerlifting federation |
| Nightlife | Resident Advisor (~24), CLWD (ex-EXE, ~14), Go Sofia (43 bar/club venue pages, ~82), Mixtape 5 iCal, Sofia Live Club (local only) |
| Venues & culture | National Theatre (~135), Opera (~71), Toplocentrala (~67), Philharmonic (~49), NDK (~27), Joy Station, Sofia University public calendar |
| Hand-curated | 7 weekly rules in `recurring.js` (5kmrun x2, Practical Philosophy, Inside Joke open mic, salsa, bachata, Timeleft) |

Local-only (`edge: false`): TimeHeroes (Cloudflare challenge for datacenter IPs), Sofia Live Club (TLS ciphers Deno rejects) and EPAYGO (times out from Supabase Edge IPs; only ~60 of its events are unique, mostly theatre).
Nightlife findings (EXE → CLWD, Secret Crush = FOMO brand, Carrusel flyer-only site): [research_nightlife.md](research/research_nightlife.md).

## Still worth adding

| Source | Why | Notes |
|---|---|---|
| Entase (Carrusel's ticketing) | Club nights | Not investigated yet |
| Ticket Station | Big concerts/festivals | JS-only, token-gated API → headless browser |
| Hiking clubs | Outdoors, very social | Mostly Facebook; topguides.bg calendar is JS-only |
| LLM tagging pass | Better tags than keyword regexes (e.g. K-pop shows tagged "networking") | Batch new events through Claude once per run |

**Dead or blocked (don't bother):** Facebook event listings (login wall), Instagram, InterNations/Couchsurfing (login), 10times / Sofia Tech Park site / kupibileti / Shotgun / Fourvenues / FIXR / Bandsintown / Songkick (bot walls), Fever / Xceed / DICE (no Sofia), programata/sofialive (articles, not events), kade.bg/bileti.bg/ticketportal.bg (dead), parkrun (not in Bulgaria; 5kmrun is the equivalent), conferenceindex (junk).

## The Facebook/Instagram gap, and how to cover it

These organisers are high value but social-media-only: Sofia International Pub Quiz, Quiz Madness, Sofia Run Club, adidas/Nike/ASICS run crews, Level Up / Mulligan board-game cafés, The Comedy Club, HaHaHa Impro, The Book Club Sofia, ESN Sofia, CrossFit/HYROX boxes, most dance studios. Full list: [niche research](research/research_niche_organisers.md).

1. **Weekly rules** (`recurring.js`): cheap, and most of these events repeat weekly. Each rule has a `verified` date, and the run warns after 45 days.
2. **"Paste a link" ingestion** (later): share a Facebook/Instagram event URL. The server fetches its link-preview metadata (Facebook returns title and description text to its own `facebookexternalhit` UA), then an LLM extracts the date and venue into the normal event format. This enriches events you already know about, not discovery. Keep it low-volume and personal.
3. **Not recommended:** driving your logged-in Facebook session with a bot. It's brittle and risks your account.

## Ground rules for staying "free and reliable"

- **One run per day**, sleeps between requests, a real browser UA (Eventim's Akamai blocks short UAs). This is a personal tool, so stay far below anything a site would notice.
- **Health check every source every run**: `minEvents` in `sources.js`. Internal APIs (Luma, Meetup, Eventim) *will* change eventually, and a sudden 0 is the alarm.
- **Prefer official/public paths** (bilet API, iCal, JSON-LD, WordPress REST) over internal APIs where both exist.
- **Link back** to the source for tickets/RSVP. Never republish descriptions publicly. If this ever becomes a public app, revisit Eventim/Meetup/Luma terms first.
- Use Node `fetch`, not macOS `curl`: curl fails the TLS handshake with eventim.bg and ticketstation.bg.

## Where the app is (and what's next)

Done: Supabase storage with `first_seen`/`last_seen`, daily `pg_cron` refresh plus an on-demand Refresh button, social/interest scoring, fuzzy dedupe, and a mobile feed at https://vikig15.github.io/sofia-events/ (filters: tonight / weekend / vibes / free / social; saved events).

Next:
1. **LLM tagging pass** for consistent BG/EN categories instead of keyword regexes.
2. **"Paste a link"** for Facebook/Instagram events you hear about.
3. **Feedback loop:** "going"/"not for me" buttons that tune the interest weights.
4. **Map view** (lat/lon is filled for Eventim, Luma, Meetup, ticket.bg and some others).
