// Minimal iCalendar (RFC 5545) VEVENT reader. Good enough for Meetup, Luma,
// Mixtape 5, dev.bg and WordPress calendar feeds. Does not expand RRULEs.

export function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/); // unfold
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const [name, ...params] = line.slice(0, idx).split(';');
      cur[name] = { value: unescape(line.slice(idx + 1)), params: Object.fromEntries(params.map((p) => p.split('='))) };
    }
  }
  return events;
}

const unescape = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

// DTSTART value -> ISO string. Handles UTC (Z), TZID-local (assumed Europe/Sofia) and all-day.
export function icsDate(prop, toIsoFromSofiaLocal) {
  if (!prop) return null;
  const v = prop.value;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', , z] = m;
  if (z) return new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`).toISOString();
  return toIsoFromSofiaLocal(`${y}-${mo}-${d} ${h}:${mi}`);
}
