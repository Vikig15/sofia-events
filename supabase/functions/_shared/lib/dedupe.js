// The same show is often on Eventim, bilet.bg, EPAYGO, the venue's own site and SofiaStage, each
// with a slightly different title ("The best of GAROU" / "GAROU | SOFIA" / "Garou „The Best of…GAROU“").
//
// Two listings are the same event when they start in the same Sofia-local hour (`slot`) and their
// title tokens overlap by >= 60% of the shorter title. The `feed` view in Postgres applies exactly
// this rule (public.titles_match); `collapse` below mirrors it for the local CLI.

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

// Words that say nothing about which event it is.
const STOP = new Set([
  'sofia', 'sofiya', 'live', 'the', 'and', 'with', 'tour', 'concert', 'kontsert', 'premiera', 'premiere', 'show',
  'party', 'parti', 'club', 'klub', 'night', 'event', 'official', 'presents', 'predstavya', 'spektakal',
  'teatar', 'theatre', 'theater', 'stsena', 'golyama', 'malka', 'zala', 'hall', 'sept', 'septemvri', 'oktomvri',
  'noemvri', 'dekemvri', 'yanuari', 'for', 'ot', 'na', 'za', 'pri', 'vav', 'pod', 'nad',
]);

const translit = (s) => s.toLowerCase().replace(/[а-я]/g, (c) => CYR[c] ?? c);

export function titleTokens(title) {
  const words = translit(title)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  return [...new Set(words)].sort();
}

export const localHour = (iso) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 13); // "YYYY-MM-DD HH"

export function titlesMatch(a, b) {
  const min = Math.min(a.length, b.length);
  if (!min) return false;
  const B = new Set(b);
  const shared = a.filter((w) => B.has(w));
  return shared.length / min >= 0.6 && shared.some((w) => w.length >= 4);
}

// Kept for the `dedupe_key` column (exact-duplicate fallback + index).
export const dedupeKey = (e) => `${titleTokens(e.title).slice(0, 6).join(' ')}|${localHour(e.start)}`;

// Same-source rows only merge on identical tokens: one source listing "Salsa classes at Ritmo" and
// "Salsa classes at Paletro" at 18:30 means two different events.
const sameEvent = (a, b) =>
  a.source === b.source ? a.title_tokens.join(' ') === b.title_tokens.join(' ') : titlesMatch(a.title_tokens, b.title_tokens);

// Local mirror of the feed view: a row is hidden when a better-ranked row in the same slot matches it.
const better = (a, b) =>
  a.priority - b.priority || (b.attendees ?? -1) - (a.attendees ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function collapse(rows) {
  const bySlot = new Map();
  for (const r of rows) (bySlot.get(r.slot) ?? bySlot.set(r.slot, []).get(r.slot)).push(r);
  const out = [];
  for (const group of bySlot.values()) {
    for (const r of group) {
      const dominated = group.some((o) => o !== r && better(o, r) < 0 && sameEvent(o, r));
      if (dominated) continue;
      const alsoOn = group
        .filter((o) => o !== r && better(r, o) < 0 && sameEvent(o, r))
        .sort(better)
        .map((o) => ({ source: o.source, url: o.url }));
      out.push({ ...r, also_on: alsoOn });
    }
  }
  return out;
}
