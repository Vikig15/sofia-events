// Dependency-free helpers for HTML sources. Must run in both Node and Deno (no node: imports).

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&[bl]dquo;|&[lr]dquo;/g, '"')
    .replace(/&[lr]squo;/g, "'")
    .replace(/&ndash;|&mdash;/g, '-');
}

export const textOf = (html) => decodeEntities(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// All schema.org objects of the given @type(s) found in <script type="application/ld+json"> blocks,
// flattening @graph and ItemList.itemListElement[].item.
export function jsonLd(html, types = ['Event']) {
  const want = new Set(types.map((t) => t.toLowerCase()));
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    const t = [].concat(node['@type'] ?? []).map((x) => String(x).toLowerCase());
    if (t.some((x) => want.has(x) || (want.has('event') && x.endsWith('event')))) out.push(node);
    if (node['@graph']) visit(node['@graph']);
    if (node.itemListElement) visit(node.itemListElement.map((i) => i.item ?? i));
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      visit(JSON.parse(m[1].trim()));
    } catch {
      /* some sites ship invalid JSON-LD; skip */
    }
  }
  return out;
}

export function meta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m = html.match(re) ?? html.match(re2);
  return m ? decodeEntities(m[1]) : null;
}

const BG_MONTHS = ['януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Month name (BG full/short, EN full/short) -> 1..12, or null.
export function monthIndex(name) {
  const n = String(name).toLowerCase().replace(/\./g, '');
  const bg = BG_MONTHS.findIndex((m) => m.startsWith(n.slice(0, 3)) && n.length >= 3);
  if (bg > -1) return bg + 1;
  const en = EN_MONTHS.findIndex((m) => n.startsWith(m));
  return en > -1 ? en + 1 : null;
}

// Dates without a year ("12 октомври"): pick the year that puts the date closest to "now",
// preferring the future (a date >60 days in the past rolls into next year).
export function inferYear(month, day, now = new Date()) {
  const y = now.getFullYear();
  const candidate = new Date(Date.UTC(y, month - 1, day));
  return (now - candidate) / 86_400_000 > 60 ? y + 1 : y;
}

export const pad = (n) => String(n).padStart(2, '0');
