// Shared by the Edge Function and the local CLI: run one source and turn its events into DB rows.
import { SOURCES } from './sources.js';
import { tagEvent, scoreEvent } from './lib/score.js';
import { dedupeKey, titleTokens, localHour } from './lib/dedupe.js';

const HORIZON_DAYS = 120;

// Lower number wins when the same event is on several sources (richer data / RSVP counts first).
// Official venue/organiser sites beat ticket resellers; aggregators (often Facebook links) come last.
const PRIORITY = {
  luma: 1, meetup: 2, eventbrite: 3, partita: 3, sofiameetups: 3, timeheroes: 3, recurring: 4,
  clwd: 4, ra: 4, ndk: 4, toplocentrala: 4, philharmonic: 4, opera: 4, nationaltheatre: 4, joystation: 4, unisofia: 4,
  bilet: 5, eventim: 6, epaygo: 6, ticketbg: 6, visitsofia: 7, gosofia: 7, allevents: 8, sofiastage: 8,
};

export const sourceNames = () => SOURCES.map((s) => s.name);

export async function runSource(name) {
  const src = SOURCES.find((s) => s.name === name);
  if (!src) throw new Error(`Unknown source "${name}"`);
  const now = Date.now();
  const raw = await src.run();
  const events = raw.filter((e) => {
    if (e.online) return false;
    const start = Date.parse(e.start);
    const end = e.end ? Date.parse(e.end) : start + 3 * 3_600_000;
    return !Number.isNaN(start) && end >= now && start <= now + HORIZON_DAYS * 86_400_000;
  });
  const rows = new Map(); // a source can return the same event twice (e.g. two list pages)
  for (const e of events) rows.set(e.id, toRow(e));
  return { rows: [...rows.values()], minEvents: src.minEvents };
}

export function toRow(e) {
  const tags = tagEvent(e);
  const { social, interest } = scoreEvent(e, tags);
  return {
    id: e.id,
    source: e.source,
    title: e.title,
    start_at: e.start,
    end_at: e.end,
    venue_name: e.venue?.name ?? null,
    venue_address: e.venue?.address ?? null,
    lat: e.venue?.lat ?? null,
    lon: e.venue?.lon ?? null,
    url: e.url,
    image: e.image,
    price_min: e.price?.min ?? null,
    currency: e.price?.currency ?? null,
    is_free: e.price?.free ?? null,
    categories: e.categories,
    attendees: e.attendees,
    recurring: e.recurring,
    description: e.description,
    tags,
    social_score: social,
    interest_score: interest,
    dedupe_key: dedupeKey(e),
    title_tokens: titleTokens(e.title),
    slot: localHour(e.start),
    priority: PRIORITY[e.source] ?? 6,
  };
}
