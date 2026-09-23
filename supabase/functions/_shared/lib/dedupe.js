// The same show is often on Eventim, bilet.bg, the venue's own site and Luma+Meetup.
// Key = normalized title (Cyrillic transliterated) + Sofia-local start date+hour.
// The first-seen copy wins; later copies contribute their source/url and fill empty fields.

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sht', ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
};

export function normTitle(s) {
  return s
    .toLowerCase()
    .replace(/[а-я]/g, (c) => CYR[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2)
    .slice(0, 6)
    .join(' ');
}

const localHour = (iso) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 13); // "YYYY-MM-DD HH"

export function dedupe(events) {
  const byKey = new Map();
  let merged = 0;
  for (const e of events) {
    const key = `${normTitle(e.title)}|${localHour(e.start)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...e, alsoOn: [] });
      continue;
    }
    merged++;
    existing.alsoOn.push({ source: e.source, url: e.url });
    for (const f of ['image', 'venue', 'price', 'attendees', 'description', 'end']) existing[f] ??= e[f];
  }
  return { events: [...byKey.values()], merged };
}
