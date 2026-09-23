# Instagram as an event source

Research date: 2026-09-23. Every claim below was fetched live on that date unless marked otherwise.
Rules held throughout: no login, no accounts, no CAPTCHA solving, no proxies or IP rotation.

Built: `supabase/functions/_shared/connectors/instagram.js` (source `instagram`) and
`instagram-accounts.js` (84 curated Sofia accounts). It is **not registered yet**: `sources.js` was left untouched.

## Summary

1. **One no-login path works: the profile page.** A logged-out `GET https://www.instagram.com/<handle>/` is server-rendered with the latest 12 posts embedded as JSON. It only does that when the request looks like a real top-level navigation (see headers below).
2. **Works from a home IP. Blocked from datacenter IPs.** From the Supabase project's DB egress, every profile request got **HTTP 429 on the first try** (4 of 4, minutes apart). From a residential IP, about 440 profile fetches in one day never got a 429. The connector must run **locally only** (`edge: false`).
3. **Today's yield: 101 upcoming events from 46 of 84 accounts.** They come from 526 posts under 21 days old. 59 of the 101 have an explicit time. A full run takes 74 s.
4. **Parsing is conservative.** Every event needs a specific date. Across the ~100 events I reviewed, about 85–90% have the right date. About 75% have a good title. The venue is the main weak spot.

## What was probed

| Path | Result (residential IP) | Datacenter (Supabase `net.http_get`) |
|---|---|---|
| `www.instagram.com/api/v1/users/web_profile_info/?username=X` + `x-ig-app-id: 936619743392459` | 400 "SecFetch Policy violation" without `sec-fetch-*` headers. With them: **401 `require_login`** ("Please wait a few minutes") on the first call | not retried |
| `i.instagram.com/api/v1/users/web_profile_info/…` | 400 "Asset … ig_business_category_subvertical has been deleted" (endpoint retired) | same 400 |
| `www.instagram.com/<handle>/embed/` | 200, but the page says the profile "may have been removed" (`EmbedIsBroken`): profile embeds are gone | n/a |
| `www.instagram.com/p/<code>/embed/captioned/` | 200 shell, `EmbedIsBroken`, no caption without JS | 200 (224 KB), same empty shell |
| `www.instagram.com/<handle>/`, default fetch headers | 200 JS shell, no posts, no `og:` tags | – |
| `www.instagram.com/<handle>/` + navigation headers | **200, 12 posts embedded** | **429** (4/4) |
| `www.instagram.com/<handle>/` with the `facebookexternalhit` UA | 200 with `og:description` (follower and post counts), no posts | 429 |
| `www.instagram.com/` (home page) | – | 200, so the IP isn't blocked outright; profile pages are rate-limited |

Headers that unlock server-rendered posts. Only two matter: dropping either one returns the shell.

```
accept: text/html,application/xhtml+xml,...
sec-fetch-site: none
(plus sec-fetch-mode: navigate, sec-fetch-dest: document, a desktop Chrome UA)
```

These are the headers any browser sends when you type the URL, not a bypass. The account must be public. The page for a missing account is also a 200, just with no posts, so an empty result doesn't prove a handle is gone.

**What the embedded JSON gives you per post** (`<script type="application/json">` → `…edges[].node`):
- `code`: the shortcode. Permalink is `https://www.instagram.com/p/<code>/`.
- `pk`: the media id. Upload time is `(pk >> 23) + 1314220021721` ms. Checked against the "on September 06, 2026" in `accessibility_caption`; it matches when read in US Pacific time.
- `caption.text`: the full caption.
- `display_uri`: a 640 px image on the signed CDN. `oe=` is an expiry, so these URLs die after some days.
- `accessibility_caption`: "Photo by X on <date>. May be an image of text that says '…'". This is Meta's OCR of the flyer, and it often holds the date when the caption doesn't.
- `user.username`, `media_type`, `product_type`.
- **Not present:** `taken_at`, like counts, location. Pinned posts come first, so filter by `pk` time.

**Rate limits (residential IP):** about 440 profile fetches on 2026-09-23 with no 429 or 401:
- 187 fetches at 1 per ~3.5 s while checking handles
- 84 at 1 per ~2.8 s to cache pages
- one full connector run: 84 profiles in 74 s, 2 workers, 0.9 s gap

I didn't push harder than that on purpose. The datacenter answered 429 on the first request each time, so no limit could be measured there. Supabase **Edge Function** IPs differ from DB egress IPs and weren't tested, because deploying a test function would change project state. Expect them to behave like the DB egress: AWS ranges.

## Connector design (`instagram.js`)

- Fetches each account's profile page: 2 workers, a 0.9 s gap, and an 80 s budget. It stops early on a 429 or 401, or after 6 profiles in a row with no posts (a login wall). The order rotates 17 accounts a day, so a throttled run skips a different tail each day and every account is still seen every few days.
- Keeps posts under 21 days old. That also drops old pinned posts.
- **Date extraction:** caption first, then the flyer OCR, then relative words, then "every X". It handles:
  - numeric dates: `25.09`, `25/09`, `25.09.2026`, `02.10.26`
  - ranges: `25-27.09`, `25–27 September`, `от 6 до 8 октомври`, `23 септември – 4 ноември` → first day, flagged as multi-day
  - lists: `10 и 11 октомври`, `14-ти, 21-ви, 28.09` → first upcoming day, the others noted
  - BG/EN month words: `26 септември`, `26-ти септември`, `Sep 26th`, `October 3rd`
  - relative: `тази вечер`/`довечера`/`tonight`, `утре`/`tomorrow`, `тази събота`/`този петък`/`this Saturday`/`в петък`, `всеки вторник`/`every Thursday` (weekly, `recurring: true`)
  - year inference relative to the post date
- **Rejected dates:** deadlines and sales (`регистрация до`, `deadline`, `early bird`, `до 23.09`, `until`), release dates (`излиза`, `out now`), times like `21.30` or `от 19.10`, and `23:59`/`11.59 pm` deadlines. Times on a deadline line are ignored too.
- **Times:** `21:00`, `21.00`, `21ч`, `21 h`, `9pm`, `11.59 pm`, `от 21`, `start 22`. "начало/start" beats "врати/doors". No time means 20:00, and the description says so.
- **Programme posts:** when two or more dates start their own lines ("Fri 25.09 | JAFFAR & MILEN"), each line becomes its own event and takes its title from that line. Tour lists (lines naming Varna, Helsinki…) keep only the Sofia line.
- **Not-Sofia filter:** skips a post when the location line, the title, the date's line, the ±150 chars around the date, or the 40 chars after the date name another city (about 60 BG, resort and European cities) and not Sofia.
- **Venue:** a `📍`, `Location:` or `Място:` line if present. Otherwise the account's venue, or the account name for organisers. A 📍 line that is just an address or the account's own handle maps back to the account's venue.
- **Dedupe:** organisers repost the same event many times. Per account and day, the connector keeps one event per stated time, and an event with no time is dropped when that day already has one. It prefers a stated time, then caption over list/flyer/relative, then the newest post. A collab post that shows up on two accounts is emitted once. This cut 157 raw hits to 101.
- **Event fields:**
  - `id`: `instagram:<code>`, or `instagram:<code>-<date>` for programme lines
  - `url`: the post permalink
  - `image`: `display_uri`
  - `categories`: `[account.category, 'Instagram']`
  - `description`: parsing notes plus the first 700 characters of the caption
- **Runtime:** only `../lib/http.js`, `../lib/event.js` and `../lib/html.js`. No npm or `node:` imports. Checked under Deno 2 (`parseProfile` + `eventsForAccount` on a cached page).

### Registering it (not done: `sources.js` untouched)

```js
import instagram from './connectors/instagram.js';
// …
{ name: 'instagram', run: instagram, minEvents: 40, edge: false },
```

Suggested `PRIORITY.instagram = 5`. The organiser's own post should beat aggregators, but Luma and Meetup RSVPs are richer. Note that `edge: false` sources currently run only in `npm run ingest`, which writes `data/feed.json`. Nothing pushes local-only rows to Supabase yet, so a local "push" step is needed before Instagram events reach the app.

**minEvents: 40.** 101 today. Autumn is peak season for clubs, quizzes and conferences, so a quiet summer week might halve that. 0–10 means blocked or a markup change.

## Accounts (84, in `instagram-accounts.js`)

Every handle was fetched on 2026-09-23 and returned posts. Handles were found by web search (`site:instagram.com`), from the existing research docs, and by following @mentions in verified accounts' captions.

| Group | n | Accounts |
|---|---|---|
| Clubs, bars, live venues | 21 | carrusel_club, yaltaclub, bedroomclubsofia, barpetak, fomo.the.club (hosts Secret Crush), clwd_space, culturebeatclub, gramophone_club, clubmixtape5, kupe.sofia, sofialiveclub, toplocentrala, bar_stage_toplocentrala, rocknrolla_bar_sofia, jjmurphysirishpub, inthemoodclub, sinatra_sofia, barlocalsofia, swinginhall, chistilishteto, yaltaclubsofia (Solar crew) |
| Promoters / party series | 12 | temperamento_events, offbeat.sofia, urban.gatherings, festteambg, innerverse.concept, blvkcat.world, cotton_candy.party, snrs_events, paknaparty, detska.diskoteka, kpopeventsbg, anijambg |
| Quizzes | 3 | sofiaquizmadness, quiznightbg, golemiatquiz |
| Comedy / improv | 3 | comedyclubsofia, hahahaimpro, insidejokestandup |
| Running, fitness, climbing, outdoors | 12 | sofiarunclub, begachsofia, runlife_nutritionbar, marathon.sofia, padel_club_sofia, momentumclimbingsofia, crossfire.sofia, crossfit681, crossfitserdika, ffbulgaria, adventureshopsofia, thesocialhikingclub |
| Board games / TCG / anime | 7 | level.up.sofia, castle.boardgames (Другият замък), abordagebg, moxgamesbg, mulligan.games, nakamabg, comiccon.bg (Aniventure) |
| Community / social / books | 7 | thebookclubsofia, esnsofia, esnsofiauni, togeda_net, singlesofsofia, millenniumbg, thenewsofiapubcrawl |
| Business / startups | 5 | sofiatechpark, startupbulgaria (Crossroads), businessparksofia, besco.association, puzlcoworking |
| Dance | 5 | teamosofiabachatafestival, bachatasofiafestival, sofiaswing, lindyhopbulgaria, novosalsa |
| Art, festivals, film | 9 | sofiaartfair, one_gallery_sofia, ica.sofia, sofia.art.galleries, sofialivefestival, sofiasummerfest, sofia.lights.festival, atojazzfestival, sofiafilmfest |

**Not found or not usable:**
- Sofia International Pub Quiz: Facebook only.
- Secret Crush: a FOMO night, no own account.
- Kosmos: `kosmossofia` is an empty personal account.
- adidas Runners / Nike Run Club Sofia: no Sofia accounts.
- HYROX Bulgaria: `hyroxbulgaria` has 0 posts.
- Campus X: not found.
- `mixtape5`, `secretcrush.sofia` and `foundersrunningclub` are unrelated or empty.
- Dormant, dropped: `fomo_club` (old, last post 2025-11), `retrogamingbar`, `asicsbulgaria` (brand posts), `structuragallery`, `sofiaclimbclub`, `planet.sofia`, `brut.club.sofia`, `sofiatribe.bg`, `speak.social`, `blablalanguage`.
- **Gaps:** language exchanges, book clubs other than The Book Club, hiking clubs, and HYROX gyms have little Instagram presence. Keep them in `recurring.js`.

## Sample extractions (2026-09-23)

Times in Sofia local. "(assumed)" = no time in the post, so 20:00.

| Account | Start | Parsed from | Title | Venue | Text the date came from |
|---|---|---|---|---|---|
| @sofiaquizmadness | 09-23 20:00 | caption | Cartoon Madness: Animation Quiz Night | Sofia Quiz Madness | "WEDNESDAY 23.09 • 20:00 • BAR RABBIT HOLE • IN ENGLISH" |
| @sofiaquizmadness | 09-29 20:00 (assumed) | programme line | MEGA MOVIE QUIZ - EN+BG - Win Spider-Man Merch | Sofia Quiz Madness | "3️⃣ 29/09, TUESDAY - MEGA MOVIE QUIZ …" |
| @golemiatquiz | 09-29 20:00 (assumed) | weekly | POV: Dog friendly quiz | bar.loga | "… и е всеки вторник в 📍@bar.loga" |
| @begachsofia | 09-25 20:00 | caption | Петък вечер може да започне и с 5 км | Южен парк, София | "На 25 септември се срещаме в Южния парк за Devin Active 5K Night Run." |
| @momentumclimbingsofia | 09-23 19:00 | caption | SPIKEBALL OUTDOOR в Momentum Sofia! | Momentum Sofia | "На 23.09 от 19:00 ч. събираме отборите за Spikeball!" |
| @level.up.sofia | 09-27 17:00 | caption | Cringer Game Night | Level Up Board Game Club | "📅 27.09 \| 17:00–22:00" |
| @singlesofsofia | 09-30 19:30 | programme line | Fall in Love — Bar Botanico | Singles of Sofia | "🍂 Fall in Love — 30 септември, 19:30 часа, Bar Botanico" |
| @bedroomclubsofia | 09-26 23:00 | relative | VOODOOCHILD е артист, … | Bedroom Club | "Тази събота го слушаме на живо в Bedroom Club." (posted 09-22) |
| @culturebeatclub | 09-25 20:00 (assumed) | relative | Нямаш оправдания да си останеш вкъщи | Culture Beat | "В петък @michaelche превзема пулта …" (posted 09-20) |
| @fomo.the.club | 09-24 20:00 (assumed) | caption | Да изпуснеш Иво Димчев на живо в София … | FOMO the club | "Този четвъртък, 24.09, @ivo_dimchev и бендът му …". The giveaway deadline "до 23.09, 17:00" was correctly ignored |
| @sofialiveclub | 10-10 20:00 | flyer OCR | Обичаната певица от … Тоника … | Sofia Live Club | OCR "10.10.2026 ВРАТИ: 19:00 НАЧАЛО: 20:00" (start preferred over doors) |
| @teamosofiabachatafestival | 10-03 14:00 | caption | M&s Masterclass | NDK Rooftop (our 2nd venue this year) | "🗓️ Saturday, October 3rd, 14:00" |
| @toplocentrala | 10-01 and 11-13 19:00 | programme line | 5Сола | Топлоцентрала | "5Сола \| 1.10 & 13.11 \| 19:00" |
| @abordagebg | 10-19 18:00 | caption | На 19 октомври на борда гостуват CALEDONIAN COURT … | София, ул. Веслец 22, бар "Абордаж" | "На 19 октомври на борда гостуват …" |
| @crossfire.sofia | 12-12 20:00 | caption | Crossfire Коледно Парти | Crossfire, НСА | "📅 12 декември 2026 г." |
| @paknaparty | 10-09, 11-13, 12-05 (assumed) | programme line | REPLAY is back | DJ Pak | "18 SEP · 09 OCT · 13 NOV · 05 DEC" (the past 18 Sep dropped) |

Correctly rejected, as examples:
- @sofiatechpark "How to Web, от 6 до 8 октомври в Букурещ": other city.
- @cotton_candy.party "STARA ZAGORA … 26.09": other city.
- @togeda_net "25–27 септември, Emerald Resort, Равда": seaside.
- @ffbulgaria "Registration deadline: 4 October \| 11.59 pm": deadline.
- @fomo.the.club tour list "Sep 29 — Helsinki …": only the "Sep 24 — Sofia / Club Fomo" line kept.
- @comedyclubsofia flyer listing a 12-city tour: no date followed by "София" in that position, so nothing emitted.
- Recap posts ("Thank you for last night…"): all their dates are in the past.

## Accuracy notes

- **Dates:** around 85–90% correct on review. Wrong ones come from:
  - prose that mentions a date that isn't the event, e.g. "Време е за голямата новина!" on 02.10
  - "22 → 26 септември" (`→` isn't treated as a range)
  - an artist's tour-announcement repost
  - collab posts whose event is at another venue
  - About 40% of events have no stated time and get 20:00. That is wrong for daytime things: Sofia Tech Park's Networking *Breakfast*, run-club mornings. The description flags it every time.
- **Titles:** usually the caption's first meaningful line. Sometimes that's a teaser ("Абсолютно нормална реакция!", "Събитието наближава!"), or a fallback like "Rock'N'Rolla: event" when the caption has no usable line. Programme lines give the best titles.
- **Venues:** organiser accounts often name the bar only in prose ("BAR RABBIT HOLE", "@jjmurphysirishpub"), so the venue falls back to the organiser's name. A later improvement: map @mentions of known venue accounts to venues.
- **Misses:** posts that say only a weekday with no "this/тази" ("ГОРЕЩА СРЯДА"), ongoing exhibitions that started in the past, and flyer-only posts with a multi-date image.
- **Cross-source duplicates:** many club nights here are also on SofiaStage, RA or bilet. The fuzzy dedupe in `lib/dedupe.js` will merge only when title and time line up. Instagram titles are often teasers, so expect some duplicates in the feed.

## Risks

1. **Instagram can switch off the SSR payload at any time.** It has repeatedly locked down logged-out access: `?__a=1`, `web_profile_info` and embeds are all dead now. Then the source drops to about 0 and `minEvents` flags it. No fallback exists that respects the no-login rule.
2. **Throttling of residential IPs.** One ~84-request burst a day is well inside what worked. More frequent Refresh runs would raise the risk. The connector stops at the first 429 or login wall, and I suggest keeping it daily.
3. **Terms of service:** automated collection is against Instagram's terms even for public pages. This is fine for a low-volume personal tool that links back to the post. It is not fine for a public product.
4. **Image URLs expire** (signed CDN, `oe=`). The app should tolerate broken images or re-fetch daily. The row is refreshed on each run anyway.
5. **Datacenter blocked:** the source only feeds the app if someone runs the local ingest and pushes the results.
6. **Handle rot:** venues rename (EXE → CLWD) or open new accounts (FOMO's old `fomo_club`). Re-verify the list every few months. The comment in `instagram-accounts.js` records each account's activity level on 2026-09-23.
