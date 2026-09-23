// TimeHeroes.org: volunteering missions. No API/RSS; the BG browse list (/browse?city=1, paged with
// &start=N, 20 per page, active missions first, then `<article class="pastcause">`) links to mission
// pages whose "Кога?" ("When?") paragraph is free text. We regex-extract:
//   - single dates:   "4 октомври ... от 8:00", "16 октомври, петък, от 9:00 до 16:00", "On November 25, 2023, from 19:00"
//   - weekly rules:   "Всяка неделя от 10:00 до 14:00", "всеки вторник и четвъртък от 9:00" -> next 2 weeks
// Ranges ("от 23 до 29 септември"), deadlines ("до 30 септември"), "целогодишно" and dates without a
// time are skipped. The BG list has ~5x more active missions than /en/browse.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { textOf, meta, monthIndex, inferYear, pad } from '../lib/html.js';

const BASE = 'https://timeheroes.org';
const MAX_PAGES = 6;
const MAX_DETAILS = 45;
const DEADLINE_MS = 80_000;

const BG_MONTH = 'януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември';
const EN_MONTH = 'january|february|march|april|may|june|july|august|september|october|november|december';
const WEEKDAYS = [
  ['неделя', 'sunday'],
  ['понеделник', 'monday'],
  ['вторник', 'tuesday'],
  ['сряда', 'wednesday'],
  ['четвъртък', 'thursday'],
  ['петък', 'friday'],
  ['събота', 'saturday'],
];

export default async function timeheroes() {
  const t0 = Date.now();
  const missions = [];
  for (let p = 0; p < MAX_PAGES; p++) {
    const html = await get(`${BASE}/browse?city=1${p ? `&start=${p * 20}` : ''}`, { as: 'text' });
    const articles = [...html.matchAll(/<article([^>]*)>([\s\S]*?)<\/article>/g)];
    const active = articles.filter((m) => !/pastcause/.test(m[1]));
    for (const m of active) {
      const href = m[2].match(/<h2>\s*<a href="([^"]+)"/)?.[1] ?? m[2].match(/href="([^"]+)"/)?.[1];
      const loc = textOf(m[2].match(/<span class="location">([\s\S]*?)<\/span>/)?.[1]);
      if (!href || !/софия|sofia/i.test(loc)) continue;
      missions.push({
        href,
        loc,
        title: textOf(m[2].match(/<h2>([\s\S]*?)<\/h2>/)?.[1]),
        org: textOf(m[2].match(/class="organization"[^>]*>([\s\S]*?)<\/a>/)?.[1]),
        tags: [...(m[2].match(/<span class="tags">([\s\S]*?)<\/span>/)?.[1] ?? '').matchAll(/>([^<]+)<\/a>/g)].map((x) => x[1].trim()),
        participants: Number(m[2].match(/(\d+)\s+(?:героя|герои|heroes)/)?.[1] ?? NaN),
      });
    }
    if (articles.length < 20 || active.length < articles.length) break; // reached the past missions
    await sleep(500);
  }

  const out = [];
  let skipped = 0;
  for (const ms of missions.slice(0, MAX_DETAILS)) {
    if (Date.now() - t0 > DEADLINE_MS) break;
    await sleep(400);
    let html;
    try {
      html = await get(BASE + ms.href, { as: 'text' });
    } catch {
      continue;
    }
    const when = whenSection(html);
    const where = sectionAfter(html, /^(Къде|Where)\??$/i);
    const slots = when ? parseWhen(when) : [];
    if (!slots.length) {
      skipped++;
      continue;
    }
    const slug = ms.href.split('/').filter(Boolean).slice(-2).join('/');
    for (const s of slots) {
      const start = sofiaLocalToIso(`${s.date} ${s.from}`);
      const end = s.to ? sofiaLocalToIso(`${s.date} ${s.to}`) : null;
      if (Date.parse(end ?? start) < Date.now()) continue;
      out.push(
        makeEvent('timeheroes', `${slug}@${s.date}`, {
          title: ms.title || meta(html, 'og:title'),
          start,
          end: end && Date.parse(end) > Date.parse(start) ? end : null,
          venue: where ? { name: where.slice(0, 120), address: null, lat: null, lon: null } : null,
          url: BASE + ms.href,
          image: meta(html, 'og:image'),
          price: { min: 0, currency: null, free: true },
          categories: ['Volunteering', ...(s.weekly ? ['Weekly'] : []), ...ms.tags],
          attendees: Number.isFinite(ms.participants) ? ms.participants : null,
          description: [ms.org && `Organiser: ${ms.org}.`, `When: ${when}`].filter(Boolean).join(' '),
        }),
      );
    }
  }
  // Surfaced in logs so the health report can show how much free text we could not parse.
  console.log(`[timeheroes] ${missions.length} Sofia missions, ${skipped} skipped (no parseable date/time)`);
  return out;
}

// Plain-text lines of the page, used to cut the "Кога?" paragraph up to the next "…?" heading.
function lines(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
    .split(/<\/?(?:p|div|h\d|li|br|strong|b|span|a)[^>]*>/i)
    .map((s) => textOf(s))
    .filter(Boolean);
}

function sectionAfter(html, headingRe) {
  const ls = lines(html);
  const i = ls.findIndex((l) => headingRe.test(l));
  if (i < 0) return null;
  const body = [];
  for (const l of ls.slice(i + 1, i + 25)) {
    if (/^[А-ЯA-Z][^.?!]{0,40}\?$/.test(l)) break; // next "Organiser?" style heading
    body.push(l);
  }
  return body.join(' ').replace(/\s+([.,)])/g, '$1').trim() || null;
}

const whenSection = (html) => sectionAfter(html, /^(Кога( и къде)?|When( and where)?)\??$/i);

function parseWhen(text) {
  const t = text.replace(/\s+/g, ' ');
  const low = t.toLowerCase();
  const slots = [];

  // 1) Weekly rules: "всяка неделя от 10:00 до 14:00", "всеки вторник и четвъртък от 9:00 до 17:00 ч."
  const weekly = low.match(/(?:всеки|всяка|всички|every)\s+((?:(?:понеделник|вторник|сряда|четвъртък|петък|събота|неделя|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*(?:,|и|and)\s*)?)+)/);
  if (weekly) {
    const days = WEEKDAYS.map((names, i) => (names.some((n) => weekly[1].includes(n)) ? i : -1)).filter((i) => i >= 0);
    const tm = times(low.slice(weekly.index));
    if (days.length && tm) {
      for (const d of nextWeekdays(days, 14)) slots.push({ date: d, ...tm, weekly: true });
      return slots;
    }
  }

  // Ranges / deadlines / all-year: not a single event.
  if (new RegExp(`(\\d{1,2})\\s*(?:-|–|до)\\s*\\d{1,2}\\s+(${BG_MONTH})`).test(low)) return [];
  if (new RegExp(`между\\s+\\d{1,2}\\s+(${BG_MONTH})`).test(low)) return [];

  // 2) Single dates, BG "16 октомври [2026]", EN "November 25, 2023" / "25 November 2023", numeric "16.10.2026".
  const re = new RegExp(
    `(?<!до\\s)(?<!until\\s)(?<!by\\s)\\b(?:(\\d{1,2})\\s+(${BG_MONTH}|${EN_MONTH})(?:\\s+(\\d{4}))?|(${EN_MONTH})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?|(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4}))`,
    'gi',
  );
  const matches = [...low.matchAll(re)];
  for (let k = 0; k < matches.length && slots.length < 5; k++) {
    const m = matches[k];
    let day, month, year;
    if (m[1]) [day, month, year] = [Number(m[1]), monthIndex(m[2]), m[3] && Number(m[3])];
    else if (m[4]) [day, month, year] = [Number(m[5]), monthIndex(m[4]), m[6] && Number(m[6])];
    else [day, month, year] = [Number(m[7]), Number(m[8]), Number(m[9])];
    if (!month || !day || day > 31 || month > 12) continue;
    year = year || inferYear(month, day);
    // Time: look between this date and the next one.
    const seg = low.slice(m.index + m[0].length, matches[k + 1]?.index ?? m.index + m[0].length + 160);
    const tm = times(seg);
    if (!tm) continue;
    slots.push({ date: `${year}-${pad(month)}-${pad(day)}`, ...tm });
  }
  return slots;
}

// "от 9:00 до 16:00 ч.", "from 19:00", "от 8:00 часа ... до около 13 часа", "10:00 - 14:00"
function times(seg) {
  const from = seg.match(/(?:от|from|at|в)?\s*(\d{1,2})[:.](\d{2})/);
  if (!from || Number(from[1]) > 23) return null;
  const rest = seg.slice(from.index + from[0].length, from.index + from[0].length + 140);
  const to = rest.match(/^\s*(?:ч\.?|часа)?\s*(?:до|to|until|-|–)\s*(?:около\s+)?(\d{1,2})(?:[:.](\d{2}))?/) ??
    rest.match(/до\s+(?:около\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:ч|часа)/);
  return {
    from: `${pad(from[1])}:${from[2]}`,
    to: to && Number(to[1]) <= 24 ? `${pad(Number(to[1]) % 24)}:${to[2] ?? '00'}` : null,
  };
}

// Next dates (YYYY-MM-DD, Sofia calendar) falling on the given weekdays (0=Sunday) within `days`.
function nextWeekdays(weekdays, days) {
  const out = [];
  const todaySofia = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date());
  const base = new Date(`${todaySofia}T12:00:00Z`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getTime() + i * 86_400_000);
    if (weekdays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
