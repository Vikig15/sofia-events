// The one normalized shape every connector must emit.
//
// {
//   id:          "<source>:<sourceId>"          stable, used for upserts
//   source:      "bilet" | "luma" | ...
//   title:       string
//   start:       ISO-8601 UTC (render in Europe/Sofia)
//   end:         ISO-8601 UTC | null
//   venue:       { name, address, lat, lon } | null
//   url:         canonical link to the event
//   image:       url | null
//   price:       { min, currency, free } | null
//   categories:  string[]                        raw source categories
//   attendees:   number | null                   RSVP/going count = "social signal"
//   online:      boolean
//   recurring:   boolean                         true for hand-curated weekly rules
//   description: plain text, trimmed | null
// }

export function makeEvent(source, sourceId, fields) {
  return {
    id: `${source}:${sourceId}`,
    source,
    title: clean(fields.title),
    start: toUtc(fields.start),
    end: fields.end ? toUtc(fields.end) : null,
    venue: fields.venue ?? null,
    url: fields.url,
    image: fields.image ?? null,
    price: fields.price ?? null,
    categories: fields.categories ?? [],
    attendees: fields.attendees ?? null,
    online: fields.online ?? false,
    recurring: fields.recurring ?? false,
    description: fields.description ? stripHtml(fields.description).slice(0, 1000) : null,
  };
}

export function stripHtml(s) {
  return clean(
    String(s)
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&[bl]dquo;|&[lr]squo;/g, '"')
      .replace(/&#?\w+;/g, ' '),
  );
}

// Sources mix "+03:00", "Z" and 7-digit fractions; store UTC so string sort == time sort.
const toUtc = (iso) => new Date(iso).toISOString();

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// "2026-10-03 10:00" in Sofia local time -> ISO with the correct +02/+03 offset.
export function sofiaLocalToIso(local) {
  const [d, rawT = '00:00'] = local.trim().split(/[ T]/);
  const t = rawT.slice(0, 5);
  const guess = new Date(`${d}T${t}:00Z`);
  const offsetMin = sofiaOffsetMinutes(guess);
  const sign = offsetMin >= 0 ? '+' : '-';
  const hh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
  const mm = String(Math.abs(offsetMin) % 60).padStart(2, '0');
  return `${d}T${t}:00${sign}${hh}:${mm}`;
}

function sofiaOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Sofia', timeZoneName: 'longOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName').value; // "GMT+03:00"
  const m = parts.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}
