// Instagram (source 'instagram'): upcoming events announced in the recent posts of ~85 curated Sofia
// accounts (instagram-accounts.js): clubs, promoters, quizzes, run clubs, board-game stores, comedy...
//
// HOW (no login, no API keys): a logged-out browser navigation to https://www.instagram.com/<handle>/
// is server-rendered with the latest 12 posts embedded as JSON (<script type="application/json">
// ... edges[].node {pk, code, caption.text, accessibility_caption, display_uri}). It only comes back
// when the request looks like a top-level navigation (accept: text/html + sec-fetch-site: none);
// otherwise Instagram serves an empty JS shell. Post time = the media pk (top 41 bits are ms since
// Instagram's epoch). accessibility_caption often contains Meta's OCR of the flyer ("... that says
// '13.09. 09:00 START'"), which we use as a fallback when the caption has no date.
// Dead ends (2026-09-23): /api/v1/users/web_profile_info (401 require_login / 400), profile
// /embed/ and post /embed/captioned/ (both "EmbedIsBroken" without JS). See docs/research/research_instagram.md.
//
// LOCAL ONLY (edge: false): from the Supabase project's datacenter egress every profile page answered
// HTTP 429 on the first request (4/4, minutes apart). From a residential IP ~440 profile fetches on
// 2026-09-23 (1 per 1.5-2.5 s, plus one full run of this connector) never hit a 429.
//
// Budget: ~1.3 s per profile + POLITE_MS gap, 2 workers -> 84 accounts in ~74 s (measured). If the
// 80 s budget runs out, or Instagram answers 429/401, or 6 profiles in a row come back without posts
// (login wall), the remaining accounts are skipped for this run. The account order rotates by
// day-of-year (17 accounts further each day), so a throttled run skips a different tail each day and
// every account is still covered every few days.
//
// Parsing is deliberately conservative: a post only becomes an event when it names a specific
// future date ("25.09", "25/09 от 21:00", "петък 26 септември", "Fri 26 Sep 22:00", "tonight",
// "тази събота", "every Thursday"...). No date -> no event. No time -> 20:00, flagged in the description.
import { get, sleep } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { decodeEntities, monthIndex, pad } from '../lib/html.js';
import { INSTAGRAM_ACCOUNTS } from './instagram-accounts.js';

const MAX_POST_AGE_DAYS = 21;
const MAX_AHEAD_DAYS = 120;
const BUDGET_MS = 80_000;
const POLITE_MS = 900;
const WORKERS = 2;
const DEFAULT_TIME = '20:00';

// Navigation-style headers; without sec-fetch-site/accept Instagram returns a JS-only shell.
const NAV_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,bg;q=0.8',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
};

const IG_EPOCH_MS = 1314220021721;
export const pkToDate = (pk) => new Date(Number(BigInt(pk) >> 23n) + IG_EPOCH_MS);

// ---------------------------------------------------------------- fetching / profile parsing

export function parseProfile(html) {
  const posts = [];
  const seen = new Set();
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.code && o.pk && 'caption' in o) {
      if (!seen.has(o.code)) {
        seen.add(o.code);
        posts.push(o);
      }
      return;
    }
    for (const v of Object.values(o)) walk(v);
  };
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!m[1].includes('"code"') || !m[1].includes('"caption"')) continue;
    try {
      walk(JSON.parse(m[1]));
    } catch {
      /* unrelated or truncated JSON blob */
    }
  }
  return posts.map((p) => ({
    code: p.code,
    pk: String(p.pk),
    postedAt: pkToDate(String(p.pk)),
    caption: p.caption?.text ?? '',
    ocr: ocrText(p.accessibility_caption),
    image: p.display_uri ?? null,
    username: p.user?.username ?? null,
  }));
}

// "Photo by X on September 06, 2026. May be an image of text that says '13.09. 09:00 START'."
function ocrText(acc) {
  const m = String(acc ?? '').match(/(?:that says|който гласи)\s*['"“]([\s\S]*)['"”]\.?\s*$/i);
  return m ? m[1] : '';
}

async function fetchProfile(handle) {
  const html = await get(`https://www.instagram.com/${handle}/`, { as: 'text', retries: 0, headers: NAV_HEADERS });
  return parseProfile(html);
}

// ---------------------------------------------------------------- date/time extraction

const L = '\\p{L}';
const NB = `(?<![${L}\\d])`; // "not preceded by a letter/digit" (\b does not work for Cyrillic)
const NA = `(?![${L}\\d])`;

const MONTH_WORD =
  '(?:януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември|яну|фев|мар|апр|авг|септ|сеп|окт|ное|дек|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\.?';
const ORD = '(?:-?(?:ти|ви|ри|ми|st|nd|rd|th))?';
// "10 и 11", "14-ти, 21-ви, 28", "25-27", "от 6 до 8": a day followed by more days
const DAY_TAIL = `((?:\\s*(?:,|и|and|&|-|–|—|до|to|till|until)\\s*\\d{1,2}(?![\\d:])${ORD})*)`;
const RANGE_SEP = /^(?:-|–|—|до|to|till|until)$/i;

// JS getDay(): 0 = Sunday
const WEEKDAYS = [
  [0, /^(неделя|нед|sunday|sun)$/],
  [1, /^(понеделник|пон|monday|mon)$/],
  [2, /^(вторник|вт|tuesday|tue|tues)$/],
  [3, /^(сряда|ср|wednesday|wed)$/],
  [4, /^(четвъртък|четв|чет|thursday|thu|thur|thurs)$/],
  [5, /^(петък|пет|friday|fri)$/],
  [6, /^(събота|съб|saturday|sat)$/],
];
const WEEKDAY_WORD =
  '(?:понеделник|вторник|сряда|четвъртък|петък|събота|неделя|пон|вт|ср|четв|чет|пет|съб|нед|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\.?';
const weekdayIndex = (w) => WEEKDAYS.find(([, re]) => re.test(w.toLowerCase().replace(/\.$/, '')))?.[0] ?? null;

// Dates that are not the event's date: deadlines, sales, releases.
const NON_EVENT_DATE_CUE =
  /(регистрац\p{L}*|записван\p{L}*|запиши се|early ?bird|deadline|краен срок|register|registration|sign ?up|apply|кандидатст\p{L}*|валид\p{L}*|valid|промо\p{L}*|отстъпк\p{L}*|on sale|разпродаж\p{L}*|предпродажба|giveaway|томбола|игра с награди|winner|печелив\p{L}*|обявяваме|излиза|release[sd]?|out on|pre-?save|премиера на (?:песен|сингъл|клип|албум)|имаш време)[^\n]{0,30}$/iu;
const RELEASE_AFTER = /^[^\n]{0,25}(излиза|излизат|is out|out now|drops|release|в дигиталните платформи|на всички платформи|стартира продажбата|tickets go on sale)/iu;
const UNTIL_CUE = /(?:^|[\s(])(до|until|till|by|through|through to)\s*$/iu;
const TIME_CUE = /(?:начало|старт|start|starts|doors|врати|от|from|at|в|@|час|time)\s*[:\-–]?\s*$/iu;

const DATE_RES = () => [
  // 25.09 / 25/09 / 25.09.2026 / 25. 09 / "14-ти, 21-ви, 28.09" / "25-27.09"
  { kind: 'num', re: new RegExp(`${NB}(\\d{1,2})${ORD}${DAY_TAIL}\\s?[./]\\s?(\\d{1,2})(?:[./]\\s?(\\d{4}|\\d{2}))?(?![\\d:])(?!\\s?[./]\\s?\\d)(?:\\s?г\\.)?`, 'gu') },
  // 26 септември, 26-ти септември, 10 и 11 октомври, 26th of September, 9 - 25 октомври 2026
  { kind: 'dm', re: new RegExp(`${NB}(\\d{1,2})${ORD}${DAY_TAIL}\\s*(?:of\\s+)?(${MONTH_WORD})${NA}(?:\\s*,?\\s*(\\d{4})(?:\\s?г\\.)?)?`, 'giu') },
  // September 26, Sep 26th, October 10 and 11
  { kind: 'md', re: new RegExp(`${NB}(${MONTH_WORD})\\s+(\\d{1,2})${ORD}${DAY_TAIL}${NA}(?:\\s*,?\\s*(\\d{4}))?`, 'giu') },
];

// Returns { dates: [{ y, m, d, ymd, index, len, range }], spans: [{index,len}] } sorted by position.
// `spans` covers every date-looking match (also the rejected deadlines) so times are never read from them.
export function findDates(text, postedAt) {
  const raw = [];
  for (const { kind, re } of DATE_RES()) {
    for (const m of text.matchAll(re)) {
      let first, tail, mo, yr;
      if (kind === 'num') [, first, tail, mo, yr] = m;
      else if (kind === 'dm') [, first, tail, mo, yr] = m;
      else [, mo, first, tail, yr] = m;
      const month = kind === 'num' ? Number(mo) : monthIndex(mo);
      if (!month || month > 12) continue;
      const before = text.slice(Math.max(0, m.index - 14), m.index);
      if (kind === 'num') {
        // "21.30", "от 19.10": a time, not a date
        if (!yr && !tail && /\./.test(m[0]) && TIME_CUE.test(before) && Number(first) <= 23) continue;
        if (/\d\s*[x×*]\s*$/.test(before)) continue;
      }
      const days = [Number(first)];
      let range = false;
      if (tail) {
        for (const t of tail.matchAll(/\s*(,|и|and|&|-|–|—|до|to|till|until)\s*(\d{1,2})/gi)) {
          if (RANGE_SEP.test(t[1])) range = true;
          else days.push(Number(t[2]));
        }
      }
      for (const d of range ? [days[0]] : days) {
        if (d < 1 || d > 31) continue;
        const y = yr ? Number(yr.length === 2 ? `20${yr}` : yr) : resolveYear(month, d, postedAt);
        raw.push({ y, m: month, d, ymd: `${y}-${pad(month)}-${pad(d)}`, index: m.index, len: m[0].length, range, group: days.length > 1 && !range ? m.index : null });
      }
    }
  }
  raw.sort((a, b) => a.index - b.index || b.len - a.len);
  // de-overlap: the longest match at a position wins; list expansions share index/len
  const res = [];
  for (const x of raw) {
    const last = res[res.length - 1];
    if (last && x.index < last.index + last.len && !(x.index === last.index && x.len === last.len)) continue;
    res.push(x);
  }
  const spans = res.map(({ index, len }) => ({ index, len }));
  // "23 септември – 4 ноември", "21.09 – 30.09": keep the start, mark it as a range
  const merged = [];
  for (const x of res) {
    const prev = merged[merged.length - 1];
    if (prev && x.index > prev.index && /^\s*(?:-|–|—|до|to|till|until)\s*$/i.test(text.slice(prev.index + prev.len, x.index))) {
      prev.range = true;
      prev.len = x.index + x.len - prev.index;
      continue;
    }
    merged.push({ ...x });
  }
  const dates = merged.filter((x) => {
    const before = text.slice(Math.max(0, x.index - 70), x.index);
    const lineBefore = before.slice(before.lastIndexOf('\n') + 1);
    const after = text.slice(x.index + x.len, x.index + x.len + 45);
    if (!NON_EVENT_DATE_CUE.test(lineBefore) && !UNTIL_CUE.test(lineBefore) && !RELEASE_AFTER.test(after)) return true;
    // a deadline line: never read the event time from it either ("до 23.09, 17:00 ч.")
    const start = text.lastIndexOf('\n', x.index - 1) + 1;
    const end = text.indexOf('\n', x.index);
    spans.push({ index: start, len: (end < 0 ? text.length : end) - start });
    return false;
  });
  return { dates, spans };
}

// Year for a date without one: the occurrence nearest to the post date, preferring the future.
function resolveYear(m, d, postedAt) {
  const postDay = sofiaDate(postedAt);
  const y = Number(postDay.slice(0, 4));
  const diff = (Date.UTC(y, m - 1, d) - Date.parse(`${postDay}T00:00:00Z`)) / 86_400_000;
  if (diff < -45) return y + 1; // "05.01" posted in December -> next January
  if (diff > 300) return y - 1;
  return y;
}

// Relative expressions -> Sofia dates. Only used when the post has no explicit date.
export function findRelative(text, postedAt) {
  const base = sofiaDate(postedAt);
  const res = [];
  let m;
  if ((m = text.match(new RegExp(`${NB}(tonight|this evening|тази вечер|довечера|today|днес)${NA}`, 'iu')))) res.push({ ymd: base, index: m.index });
  if ((m = text.match(new RegExp(`${NB}(tomorrow|утре)${NA}`, 'iu')))) res.push({ ymd: addDays(base, 1), index: m.index });
  // "this Saturday", "тази събота", "този петък", "next Friday", "следващия четвъртък", "on Friday", "в петък"
  const wdRe = new RegExp(`${NB}(this|next|coming|on|тази|този|това|следващ(?:ия|ата)?|идн(?:ия|ата)|в|във)\\s+(${WEEKDAY_WORD})${NA}`, 'giu');
  for (const w of text.matchAll(wdRe)) {
    const wd = weekdayIndex(w[2]);
    if (wd != null) res.push({ ymd: addDays(base, daysUntil(base, wd)), index: w.index });
  }
  return res.sort((a, b) => a.index - b.index);
}

// "every Thursday", "всеки четвъртък", "всяка сряда" -> weekday index
export function findWeekly(text) {
  const m = text.match(new RegExp(`${NB}(?:every|each|всеки|всяка|всяко)\\s+(${WEEKDAY_WORD})${NA}`, 'iu'));
  return m ? { wd: weekdayIndex(m[1]), index: m.index } : null;
}

// Time nearest after `from` (within the same paragraph-ish), else the first one. "HH:MM" or null.
export function findTime(text, from = 0, spans = []) {
  const inSpan = (i) => spans.some((s) => i >= s.index && i < s.index + s.len);
  const cands = [];
  const push = (h, mi, index, colon) => {
    if (h > 23 || mi > 59 || inSpan(index)) return;
    if (h < 6 && !colon) return; // "2.11" is not a time; "00:00" / "02:00" with a colon can be
    cands.push({ h, mi, index, prio: cands.length });
  };
  for (const m of text.matchAll(/(?<![\d:.,/])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/g)) push(+m[1], +m[2], m.index, true);
  for (const m of text.matchAll(/(?<![\d:.,/])([01]?\d|2[0-3])\.([0-5]\d)(?![\d.])/g)) push(+m[1], +m[2], m.index, false);
  for (const m of text.matchAll(/(?<![\d:.])(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)(?![\p{L}])/giu)) {
    const h = (Number(m[1]) % 12) + (/^p/i.test(m[3]) ? 12 : 0);
    push(h, Number(m[2] ?? 0), m.index, true);
    cands[cands.length - 1] && cands[cands.length - 1].index === m.index && (cands[cands.length - 1].prio = -1);
  }
  for (const m of text.matchAll(/(?<![\d:.])([01]?\d|2[0-3])\s*(?:ч\.?|h|часа)(?![\p{L}\d])/giu)) push(+m[1], 0, m.index, false);
  for (const m of text.matchAll(/(?:начало|старт|start|от|from|at)\s*[:\-–]?\s*([01]?\d|2[0-3])(?![\d:.\p{L}])(?!\s*(?:-|–|до)\s*\d)/giu)) {
    if (Number(m[1]) >= 7) push(Number(m[1]), 0, m.index + m[0].length - m[1].length, false);
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.index - b.index || a.prio - b.prio); // "11.59 pm": the am/pm reading wins
  // "ВРАТИ: 19:00 НАЧАЛО: 20:00" / "doors 19:00, start 20:00": the start time wins
  const isStart = (c) => /(начало|старт|start|starts|begins)\s*[:\-–]?\s*$/iu.test(text.slice(Math.max(0, c.index - 12), c.index));
  const after = cands.find((c) => c.index >= from && c.index - from < 250);
  const pick = cands.find((c) => isStart(c) && Math.abs(c.index - from) < 250) ?? after ?? cands[0];
  return `${pad(pick.h)}:${pad(pick.mi)}`;
}

// ---------------------------------------------------------------- post -> events

const OTHER_CITY = new RegExp(
  `${NB}(пловдив|варна|бургас|русе|стара загора|велико търново|в\\. търново|благоевград|банско|созопол|несебър|поморие|равда|слънчев бряг|приморско|китен|лозенец|албена|златни пясъци|боровец|пампорово|велинград|плевен|шумен|хасково|пазарджик|габрово|враца|сливен|ямбол|добрич|кърджали|смолян|перник|кюстендил|ловеч|видин|монтана|казанлък|самоков|plovdiv|varna|burgas|ruse|stara zagora|veliko tarnovo|blagoevgrad|bansko|sozopol|nessebar|ravda|sunny beach|primorsko|borovets|pamporovo|velingrad|pleven|sliven|bucharest|букурещ|thessaloniki|солун|belgrade|белград|skopje|скопие|istanbul|истанбул|athens|атина|helsinki|cologne|köln|prague|прага|budapest|будапеща|vienna|виена|berlin|берлин|london|лондон|paris|париж|amsterdam|madrid|barcelona|milan|rome|warsaw|krakow|zagreb|ljubljana|gran canaria|ibiza|ибиса|mykonos)${NA}`,
  'iu',
);
const SOFIA_WORDS = /софия|sofia/gi;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SOFIA = /софия|sofia|витоша|vitosha|ндк|ndk|борисова|borisova|студентски град/i;
const SKIP_POST = /(we'?re hiring|търсим (?:колег|служител|барман|сервитьор)|свободна позиция|job opening|кастинг|casting call)/i;
const LOCATION_LINE = /(?:📍|📌|(?:^|\n)[^\p{L}\d\n]*(?:място|локация|location|venue|къде|where|адрес|address|place)\s*[:\-–])\s*([^\n]{3,120})/iu;
const EVENTISH = /(event|събити|парти|party|quiz|куиз|run\b|бяган|игри|games|night|вечер|workshop|среща|meetup|турнир|tournament|open mic|стендъп|stand-?up|concert|концерт|\bdj\b|social|танц|dance|lesson|урок|class|клас|тренировк|training|join us|очакваме ви|заповядайте|ела\b|come)/i;
const LIST_OFFSET = 16; // a date this close to the start of its line looks like a programme entry

export function extractEvents(post, account, now = new Date()) {
  const caption = decodeEntities(post.caption).replace(/\r/g, '');
  if (!caption.trim() && !post.ocr) return [];
  if (SKIP_POST.test(caption)) return [];

  const postedDay = sofiaDate(post.postedAt);
  const today = sofiaDate(now);
  const baseTitle = titleFrom(caption, account);

  // Where
  const locRaw = caption.match(LOCATION_LINE)?.[1] ?? null;
  let locName = locRaw ? stripDates(cleanTitle(locRaw)).replace(/^[\s\-–—|:,.·]+|[\s\-–—|:,.·]+$/g, '') : null;
  if (locName && account.venue) {
    // "📍 FOMO the club @fomo.the.club" / "📍 @clwd_space": that's the account's own venue
    const rest = locName.replace(new RegExp(escapeRe(account.handle), 'gi'), ' ').trim();
    if (!/\p{L}{3,}/u.test(rest) || sameVenue(rest, account.venue.name) || sameVenue(locName, account.handle)) locName = account.venue.name;
  }
  if (locRaw && OTHER_CITY.test(locRaw) && !SOFIA.test(locRaw)) return [];
  if (OTHER_CITY.test(baseTitle) && !SOFIA.test(baseTitle)) return [];
  const looksLikeAddress = locName && /(^|\s)(ул\.|улица|бул\.|булевард|str\.?|street|blvd\.?|бл\.|ж\.к\.)|^\d+\s/i.test(locName) && !/(club|клуб|bar|бар|pub|паб|hall|зала|space|gallery|галерия)/i.test(locName);
  const venue =
    looksLikeAddress && account.venue
      ? { ...account.venue, address: account.venue.address ?? locName }
      : locName && /\p{L}{3,}/u.test(locName)
      ? { name: locName.slice(0, 80), address: account.venue && sameVenue(locName, account.venue.name) ? account.venue.address : null, lat: null, lon: null }
      : account.venue ?? { name: account.name, address: null, lat: null, lon: null };
  const notSofiaLine = (s) => OTHER_CITY.test(s) && !SOFIA.test(s);

  // When: explicit dates in the caption, else in the flyer OCR, else relative words, else "every X"
  let hay = caption;
  let from = 'caption';
  let { dates, spans } = findDates(caption, post.postedAt);
  if (!dates.length && post.ocr) {
    ({ dates, spans } = findDates(post.ocr, post.postedAt));
    hay = post.ocr;
    from = 'flyer';
  }
  dates = collapseGroups(dates, postedDay > today ? postedDay : today);
  const picks = []; // { ymd, time, line, multi, kind }
  if (dates.length) {
    const distinct = new Set(dates.map((d) => d.ymd));
    if (from === 'flyer') {
      // OCR has no line breaks. One date: take it. A tour flyer: only a date followed by "София/Sofia".
      const cand = distinct.size === 1 ? [dates[0]] : dates.filter((d) => SOFIA.test(hay.slice(d.index, d.index + d.len + 30)));
      for (const d of cand.slice(0, 1)) picks.push({ ymd: d.ymd, time: findTime(hay, d.index, spans), line: hay.slice(d.index, d.index + 80), kind: 'flyer', range: d.range, also: d.also });
    } else {
      const listLike = dates.filter((d) => {
        const ln = lineAt(caption, d.index);
        return ln.text.slice(0, d.index - ln.start).replace(/[^\p{L}\d]/gu, '').length <= LIST_OFFSET;
      });
      const multi = new Set(listLike.map((d) => d.ymd)).size >= 2;
      if (multi) {
        const lines = listLike.map((d) => lineAt(caption, d.index).text);
        const tour = lines.some(notSofiaLine);
        for (const d of listLike) {
          const ln = lineAt(caption, d.index);
          if (notSofiaLine(ln.text)) continue;
          if (tour && !SOFIA.test(ln.text) && !(account.venue && sameVenue(ln.text, account.venue.name))) continue;
          const lineSpans = spans.map((s) => ({ index: s.index - ln.start, len: s.len }));
          picks.push({ ymd: d.ymd, time: findTime(ln.text, d.index - ln.start, lineSpans), line: ln.text, kind: 'list', multi: true, range: d.range, also: d.also });
        }
      } else {
        // prose: the first date on/after the post day
        const d = dates.find((x) => x.ymd >= postedDay && x.ymd >= today) ?? null;
        if (d) {
          const ln = lineAt(caption, d.index);
          const around = caption.slice(Math.max(0, d.index - 150), d.index + d.len + 150);
          const rightAfter = caption.slice(d.index + d.len, d.index + d.len + 40); // "от 6 до 8 октомври в Букурещ"
          if (!notSofiaLine(ln.text) && !notSofiaLine(around) && !(OTHER_CITY.test(rightAfter) && !SOFIA.test(rightAfter))) {
            const lineSpans = spans.map((s) => ({ index: s.index - ln.start, len: s.len }));
            const time =
              findTime(ln.text, d.index - ln.start, lineSpans) ?? (distinct.size === 1 ? findTime(caption, d.index, spans) ?? (post.ocr ? findTime(post.ocr) : null) : null);
            picks.push({ ymd: d.ymd, time, line: ln.text, kind: 'caption', range: d.range, also: d.also });
          }
        }
      }
    }
  } else {
    const rel = findRelative(caption, post.postedAt)[0];
    if (rel) {
      const ln = lineAt(caption, rel.index);
      if (!notSofiaLine(ln.text)) picks.push({ ymd: rel.ymd, time: findTime(caption, rel.index) ?? (post.ocr ? findTime(post.ocr) : null), line: ln.text, kind: 'relative' });
    } else {
      const weekly = findWeekly(caption);
      if (weekly && weekly.wd != null && EVENTISH.test(caption)) {
        picks.push({ ymd: addDays(today, daysUntil(today, weekly.wd)), time: findTime(caption, weekly.index), line: lineAt(caption, weekly.index).text, kind: 'weekly' });
      }
    }
  }

  const out = [];
  const seen = new Set();
  for (const p of picks) {
    if (p.ymd < postedDay || p.ymd < today) continue; // announcements are about the post day or later
    if (daysBetween(today, p.ymd) > MAX_AHEAD_DAYS) continue;
    if (p.time === '23:59') continue; // "until 23:59 on 4 Oct": a deadline
    if (p.time === `${p.ymd.slice(8, 10)}:${p.ymd.slice(5, 7)}`) p.time = null; // OCR read "17.10" as 17:10
    if (seen.has(p.ymd)) continue; // one event per date per post (bilingual captions repeat dates)
    seen.add(p.ymd);
    let title = baseTitle;
    if (p.multi) {
      const lt = stripDates(cleanTitle(p.line)).replace(/^[\s\-–—|:,.·/&]+|[\s\-–—|:,.·/&]+$/g, '');
      const core = lt.replace(SOFIA_WORDS, ' ').replace(new RegExp(escapeRe(account.handle), 'gi'), ' ');
      if ((core.match(/\p{L}/gu) ?? []).length >= 4 && lt.length <= 90 && !/^(на|в|във|от|on|at|in)\s/i.test(lt)) title = lt;
    }
    const notes = [];
    if (!p.time) notes.push(`Time not stated in the post; ${DEFAULT_TIME} assumed.`);
    if (p.kind === 'flyer') notes.push('Date read from the flyer image text.');
    if (p.kind === 'relative') notes.push(`Date inferred from "${p.line.trim().slice(0, 60)}" relative to the post date.`);
    if (p.kind === 'weekly') notes.push('Weekly event, next occurrence.');
    if (p.range) notes.push('Multi-day: this is the first day.');
    if (p.also?.length) notes.push(`Also on ${p.also.join(', ')}.`);
    notes.push(`From @${account.handle} on Instagram, posted ${postedDay}.`);
    out.push({
      suffix: p.multi ? p.ymd : '',
      title,
      start: sofiaLocalToIso(`${p.ymd} ${p.time ?? DEFAULT_TIME}`),
      venue,
      description: `${notes.join(' ')}\n\n${caption.slice(0, 700)}`,
      recurring: p.kind === 'weekly',
      timeKnown: Boolean(p.time),
      dateSource: p.kind,
      line: p.line,
    });
    if (out.length >= 8) break;
  }
  return out;
}

// "10 и 11 октомври", "14-ти, 21-ви, 28.09": one event on the first upcoming day, the others noted.
function collapseGroups(dates, minDay) {
  const out = [];
  const groups = new Map();
  for (const d of dates) {
    if (d.group == null) out.push(d);
    else groups.set(d.group, [...(groups.get(d.group) ?? []), d]);
  }
  for (const g of groups.values()) {
    const pick = g.find((d) => d.ymd >= minDay) ?? g[g.length - 1];
    out.push({ ...pick, also: g.filter((d) => d !== pick && d.ymd >= minDay).map((d) => d.ymd) });
  }
  return out.sort((a, b) => a.index - b.index);
}

function sameVenue(a, b) {
  const n = (s) => String(s).toLowerCase().replace(/[^\p{L}\d]/gu, '');
  const x = n(a);
  const y = n(b);
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
}

function lineAt(text, index) {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  let end = text.indexOf('\n', index);
  if (end < 0) end = text.length;
  return { text: text.slice(start, end), start };
}

// Remove dates, weekdays, times and leftovers like "()" from a line.
function stripDates(s) {
  let t = s;
  for (const { re } of DATE_RES()) t = t.replace(re, ' ');
  return t
    .replace(new RegExp(`${NB}${WEEKDAY_WORD}${NA}`, 'giu'), ' ')
    .replace(/(?<![\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?:\s*(?:часа|ч\.?|h))?/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*[,;]){2,}/g, ',')
    .replace(/\s+([,;])/g, '$1')
    .replace(/([—–-])\s*,/g, '$1')
    .trim();
}

const GREETING = /^(hello|hi|hey|dear|здравейте|здрасти|здравей|скъпи|дорогие|привет|good (morning|evening))(?![\p{L}])/iu;

// Title: first meaningful caption line without emojis/hashtags/dates, not a greeting.
function titleFrom(caption, account) {
  for (const raw of caption.split('\n')) {
    const t = cleanTitle(raw)
      .replace(/^(?:when|кога|date|дата|час|time|where|къде)\s*[:\-–]\s*/i, '')
      .replace(/^[\s\-–—|:,.·/&]+|[\s\-–—|:,.·/&]+$/g, '');
    const letters = (stripDates(t).match(/\p{L}/gu) ?? []).length;
    if (letters < 6 || GREETING.test(t) || /^[(\[]/.test(t) || /(?:\+?\d[\s-]?){9,}/.test(t)) continue; // phone numbers
    if (/^(?:link in bio|линк в био)/i.test(t)) continue;
    const short = t.length > 100 ? `${t.slice(0, 97).replace(/\s+\S*$/, '')}…` : t;
    return /\p{Lu}{4,}/u.test(short) && short === short.toUpperCase() ? titleCase(short) : short;
  }
  return `${account.name}: event`;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s(\-–"„])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function cleanTitle(s) {
  return decodeEntities(String(s))
    .replace(/\d️?⃣/g, ' ') // keycap numbers "2️⃣"
    .replace(/#[\p{L}\d_]+/gu, '')
    .replace(/@([\w.]+)/g, '$1')
    .replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200B}-\u{200D}\u{20E3}\u{E0000}-\u{E007F}]/gu, '')
    .replace(/[•|◾▪︎►▶→]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-–—:,.!]+/, '');
}

// ---------------------------------------------------------------- date helpers (Sofia calendar)

const sofiaDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Sofia' });
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
const daysUntil = (ymd, wd) => (wd - new Date(`${ymd}T12:00:00Z`).getUTCDay() + 7) % 7;

// ---------------------------------------------------------------- connector

const KIND_RANK = { caption: 0, list: 1, flyer: 2, relative: 3, weekly: 4 };

// One account's recent posts -> events. Organisers repost the same event many times ("2 days left!"),
// so per account and day we keep one event per stated time; an unknown-time event is dropped when that
// day already has one. Preference: time known, then caption over list/flyer/relative, then newest post.
export function eventsForAccount(posts, account, now = new Date(), seenCodes = new Set(), stats = {}) {
  const cutoff = now.getTime() - MAX_POST_AGE_DAYS * 86_400_000;
  const cands = [];
  for (const post of posts) {
    if (post.postedAt.getTime() < cutoff) continue; // also drops old pinned posts
    if (post.username && post.username !== account.handle && seenCodes.has(post.code)) continue;
    stats.recentPosts = (stats.recentPosts ?? 0) + 1;
    for (const e of extractEvents(post, account, now)) cands.push({ e, post });
  }
  cands.sort(
    (a, b) =>
      Number(b.e.timeKnown) - Number(a.e.timeKnown) ||
      KIND_RANK[a.e.dateSource] - KIND_RANK[b.e.dateSource] ||
      b.post.postedAt - a.post.postedAt,
  );
  const byDay = new Map(); // "YYYY-MM-DD" -> Set of "HH:MM" | '?'
  const out = [];
  for (const { e, post } of cands) {
    if (seenCodes.has(`${post.code}|${e.suffix}`)) continue;
    const local = new Date(e.start).toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' });
    const day = local.slice(0, 10);
    const slot = e.timeKnown ? local.slice(11, 16) : '?';
    const taken = byDay.get(day) ?? new Set();
    if (taken.has(slot) || (slot === '?' && taken.size)) continue;
    taken.add(slot);
    byDay.set(day, taken);
    seenCodes.add(`${post.code}|${e.suffix}`);
    seenCodes.add(post.code);
    const event = makeEvent('instagram', `${post.code}${e.suffix ? `-${e.suffix}` : ''}`, {
      title: e.title,
      start: e.start,
      venue: e.venue,
      url: `https://www.instagram.com/p/${post.code}/`,
      image: post.image,
      categories: [account.category, 'Instagram'],
      recurring: e.recurring,
      description: e.description,
    });
    out.push({ account, post, extracted: e, event });
  }
  return out;
}

function rotate(list, now) {
  const doy = Math.floor((Date.parse(sofiaDate(now)) - Date.UTC(new Date(now).getUTCFullYear(), 0, 0)) / 86_400_000);
  const k = (doy * 17) % list.length; // move the start by 17 accounts a day
  return [...list.slice(k), ...list.slice(0, k)];
}

export default async function instagram({ accounts = INSTAGRAM_ACCOUNTS, now = new Date(), budgetMs = BUDGET_MS, onProfile } = {}) {
  const t0 = Date.now();
  const queue = rotate(accounts, now);
  const out = [];
  const stats = { fetched: 0, failed: 0, skipped: 0, rateLimited: false, posts: 0, recentPosts: 0 };
  const seenCodes = new Set(); // collab posts appear on both accounts' grids

  const worker = async (w) => {
    await sleep(w * 450);
    while (queue.length) {
      if (Date.now() - t0 > budgetMs || stats.rateLimited) {
        stats.skipped += queue.length;
        queue.length = 0;
        return;
      }
      const account = queue.shift();
      let posts;
      try {
        posts = await fetchProfile(account.handle);
        stats.fetched++;
      } catch (err) {
        stats.failed++;
        if (/HTTP (429|401)/.test(String(err.message))) stats.rateLimited = true;
        await sleep(POLITE_MS);
        continue;
      }
      stats.posts += posts.length;
      // A logged-out wall / JS shell has no posts. Several in a row = we are being throttled: stop.
      stats.emptyStreak = posts.length ? 0 : (stats.emptyStreak ?? 0) + 1;
      if (stats.emptyStreak >= 6) stats.rateLimited = true;
      for (const x of eventsForAccount(posts, account, now, seenCodes, stats)) {
        out.push(x.event);
        onProfile?.(x);
      }
      await sleep(POLITE_MS);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, (_, w) => worker(w)));
  instagram.lastStats = { ...stats, sec: (Date.now() - t0) / 1000 };

  const nowMs = now.getTime();
  return out.filter((e) => new Date(e.start).getTime() >= nowMs - 3 * 3_600_000);
}
