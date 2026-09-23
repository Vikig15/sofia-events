// SofiaStage (sofiastage.com): a public, documented, read-only JSON API (see /llms.txt and
// /.well-known/openapi.json). It aggregates ~2,600 upcoming Sofia events: theatre, opera, concerts,
// exhibitions, and Facebook-only club/bar nights (FOMO, Gramophone, Bar Petak, quizzes...).
// Paging all of Sofia takes ~26 requests (~7 s); the API asks for <= 1-3 req/s, so we sleep 400 ms.
// The API has no price or coordinates; `starts_at` already carries the Sofia offset.
// Attribution requested by SofiaStage: keep info/ticket URLs (we do) and credit SofiaStage as aggregator.
import { get, sleep } from '../lib/http.js';
import { makeEvent } from '../lib/event.js';

const API = 'https://sofiastage.com/api/v1/events';

// ---- Venue/title classification (heuristic; SofiaStage exposes no categories) ----

// Bars/clubs even without "club"/"bar" in their name.
const NIGHTLIFE_NAMES =
  /\b(fomo|yalta|купе|kupe|чистилището|magnito|rebels|oblk|mesmeric|nutone|swingin'? hall|schroedinger|the pit|clwd|mixtape)\b/i;
const CLUB_BAR = /(^|[\s"'„(])(club|клуб|bar|бар|pub|паб)([\s"'“)]|$)/i;
// "Club/bar" in the name but not nightlife.
const NOT_NIGHTLIFE =
  /централен военен клуб|клуб на (пътешественика|фоторепортерите)|pressphoto|арт клуб дипломат|art club diplomat|holy smokes|book ?caf|crepes|sports bar/i;
const LIVE_VENUES = /паве|pave|строежа|live & loud|live&loud|черепите|swingin|patches|blues|the pit|malkata|gramophone|sofia live club|mixtape|in the mood/i;

const THEATRE_VENUES =
  /театър|театр|theatre|theater|théatro|сатирата|армията|сфумато|сълза и смях|зад канала|artvent|ателие 313|бонини|натфиз|мечталище|топлоцентрала|арт къща|сити марк|derida|дерида|азарян|o3\b|о3\b/i;
const OPERA_CLASSICAL = /опера|opera|филхармони|philharmon|зала българия|bulgaria hall|музикална академия|камерна зала/i;
const CINEMA = /кино|cinema|дом на киното|odeon|одеон|cabana|кабана|влайкова|lumiere|люмиер/i;
const GALLERY_MUSEUM = /галери|gallery|музей|museum|арсенал|изложб/i;
const ARENA = /арена|arena|интер експо|inter expo|стадион|stadium|зала 1|ндк|national palace|sofia event center|pirotska|city stage/i;
const COMEDY_VENUES = /comedy club|комеди клуб|hahaha|импро/i;

// Kids: explicit child audiences. Note "Детска дискотека (за възрастни)" is an adult party, keep it.
const KIDS_VENUES = /куклен театър|puppet|детски|^дг\b|^дг |детска градина|\bдг\s*(№|"|„)|kindergarten/i;
const KIDS_TITLES = /за деца|за най-малките|детски театър|детско представление|\bдетск[аио] (?!дискотека)|for kids|kids (?:workshop|class|party)|for children|бебешк|0\+|3\+|4\+|5\+/i;
const ADULT_OVERRIDE = /за възрастни|деца и възрастни|18\+|adults|бъдещи родители/i;

const ONLINE = /\b(online|онлайн|zoom|webinar|уебинар)\b/i;

export function classify(venue, title) {
  const v = String(venue ?? '');
  const t = String(title ?? '');
  const cats = [];
  const nightlife = !NOT_NIGHTLIFE.test(v) && (CLUB_BAR.test(v) || NIGHTLIFE_NAMES.test(v));
  if (nightlife) cats.push('Nightlife', /bar|бар|pub|паб/i.test(v) ? 'Bar' : 'Club');
  if (LIVE_VENUES.test(v)) cats.push('Live music');
  if (THEATRE_VENUES.test(v) && !/музикален театър/i.test(v)) cats.push('Theatre');
  if (/музикален театър|musical|мюзикъл/i.test(`${v} ${t}`)) cats.push('Musical');
  if (OPERA_CLASSICAL.test(v)) cats.push('Classical');
  if (CINEMA.test(v)) cats.push('Cinema');
  if (GALLERY_MUSEUM.test(v) || /изложба|exhibition/i.test(t)) cats.push('Exhibition');
  const sport = /бокс|boxing|волейбол|volleyball|баскетбол|basketball|футбол|football|тенис|tennis|турнир|шампионат|първенство|championship|мач\b|match\b|\bmma\b|fight|маратон|marathon/i.test(t);
  if (sport) cats.push('Sport');
  if (ARENA.test(v) && !cats.length) cats.push('Concert');
  if (COMEDY_VENUES.test(v) || /stand-?up|стендъп|комеди|open mic/i.test(t)) cats.push('Comedy');
  if (/party|парти|disco|диско|\bdj\b|rave|techno|house|afterparty/i.test(t)) cats.push('Party');
  if (/quiz|куиз|trivia/i.test(t)) cats.push('Quiz');
  if (/concert|концерт|live\b|на живо|tribute|трибют|tour\b|турне/i.test(t) && !cats.includes('Concert')) cats.push('Concert');
  if (/workshop|уъркшоп|работилни|семинар|seminar|лекция|lecture|talk|дискусия/i.test(t)) cats.push('Workshop/Talk');
  if (/нощ на литературата|книга|book|четене|reading/i.test(t)) cats.push('Literature');
  return [...new Set(cats)];
}

export const isKids = (venue, title) =>
  !ADULT_OVERRIDE.test(`${venue} ${title}`) && (KIDS_VENUES.test(String(venue ?? '')) || KIDS_TITLES.test(String(title ?? '')));

// ---- URL preference: official/ticket link over Facebook over SofiaStage's own page ----

const isFacebook = (u) => /(^|\.)facebook\.com|fb\.me|fb\.com/i.test(hostOf(u));
function hostOf(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return '';
  }
}
function pickUrl(e) {
  const candidates = [e.info_url, e.ticket_url, ...(e.ticket_links ?? [])].filter((u) => u && hostOf(u));
  return candidates.find((u) => !isFacebook(u)) ?? candidates[0] ?? e.canonical_url;
}

export default async function sofiastage() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
  const out = [];
  const seen = new Set(); // e.g. "Нощ на литературата" is listed once per 30-min reading slot
  const t0 = Date.now();
  let cursor = null;
  for (let i = 0; i < 60; i++) {
    const url = `${API}?limit=100&scope=sofia&date_from=${today}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await get(url);
    for (const e of res.data ?? []) {
      if (!e.starts_at || !e.title) continue;
      if (e.city && !/софия|sofia/i.test(e.city)) continue;
      if (ONLINE.test(`${e.title} ${e.venue}`)) continue;
      if (isKids(e.venue, e.title)) continue;
      const key = `${e.venue}|${e.title}|${e.event_date ?? e.starts_at.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const link = pickUrl(e);
      const tickets = [e.ticket_url, ...(e.ticket_links ?? [])].filter((u) => u && u !== link && !isFacebook(u));
      const fb = [e.info_url, e.ticket_url].find((u) => u && isFacebook(u) && u !== link);
      const desc = [
        e.stage && `Stage: ${e.stage}`,
        tickets.length && `Tickets: ${[...new Set(tickets)].join(' ')}`,
        fb && `Facebook: ${fb}`,
      ]
        .filter(Boolean)
        .join('\n');
      out.push(
        makeEvent('sofiastage', e.id, {
          title: e.title,
          start: e.starts_at,
          venue: e.venue ? { name: e.venue, address: e.address ?? null, lat: null, lon: null } : null,
          url: link,
          image: e.image_url ?? null,
          categories: classify(e.venue, e.title),
          description: desc || null,
        }),
      );
    }
    cursor = res.page?.has_more ? res.page.next_cursor : null;
    if (!cursor || Date.now() - t0 > 75_000) break;
    await sleep(400);
  }
  const now = Date.now();
  return out.filter((e) => new Date(e.start).getTime() >= now - 3 * 3_600_000);
}
