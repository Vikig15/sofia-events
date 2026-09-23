// Bulgarian Powerlifting Federation (БФСТ, powerlifting-bg.com): national championships, some in Sofia (NSA).
// The WordPress "Календар" page has one block per year: "Годишен спортен календар 2026 на БФСТ" followed by
// lines like "1 ноември Републиканско Първенство ... гр.София" or "03-05 април ... гр.Свищов".
// Only 1-3 Sofia competitions a year; no start time published, so 10:00 Sofia time.
import { get } from '../lib/http.js';
import { makeEvent, sofiaLocalToIso } from '../lib/event.js';
import { decodeEntities, monthIndex, pad } from '../lib/html.js';

const PAGE = 'https://powerlifting-bg.com/bpl/%d0%ba%d0%b0%d0%bb%d0%b5%d0%bd%d0%b4%d0%b0%d1%80/';
const MONTHS = 'януари|февруари|март|април|май|юни|юли|август|септември|октомври|ноември|декември';

export default async function powerlifting() {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Sofia' }).slice(0, 10);
  const html = await get(PAGE, { as: 'text' });
  const text = decodeEntities(html.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ''));
  const out = [];
  // Split into year blocks by their headings.
  const blocks = text.split(/(?=(?:Годишен спортен календар|Календар за)\s+\d{4})/i);
  for (const block of blocks) {
    const year = Number(block.match(/^(?:Годишен спортен календар|Календар за)\s+(\d{4})/i)?.[1]);
    if (!year || year < Number(today.slice(0, 4))) continue;
    const lineRe = new RegExp(
      `^\\s*(\\d{1,2})(?:\\s*(${MONTHS}))?(?:\\s*[-–]\\s*(\\d{1,2})\\s*(${MONTHS})?)?\\s*(${MONTHS})?\\s*[-–]?\\s*(.+)$`,
      'i',
    );
    for (const raw of block.split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!/софия|sofia/i.test(line)) continue;
      const m = line.match(lineRe);
      if (!m) continue;
      const [, d1, mA, d2, mB, mC, rest] = m;
      const startMonth = monthIndex(mA ?? mC ?? mB ?? '');
      const endMonth = monthIndex(mB ?? mC ?? mA ?? '');
      if (!startMonth) continue;
      const from = `${year}-${pad(startMonth)}-${pad(d1)}`;
      const to = d2 && endMonth ? `${year}-${pad(endMonth)}-${pad(d2)}` : from;
      if (to < today) continue;
      const title = rest.replace(/[,\s]*гр\.\s*София.*$/i, '').replace(/\*+$/, '').trim();
      out.push(
        makeEvent('powerlifting', `${from}:${title.slice(0, 40)}`, {
          title: title || 'Състезание по силов трибой',
          start: sofiaLocalToIso(`${from} 10:00`),
          end: to !== from ? sofiaLocalToIso(`${to} 18:00`) : null,
          venue: { name: 'София', address: null, lat: null, lon: null },
          url: PAGE,
          categories: ['Спорт', 'Силов трибой'],
          description: line,
        }),
      );
    }
  }
  return out;
}
