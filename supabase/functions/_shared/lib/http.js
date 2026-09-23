// Polite HTTP helpers. Node's fetch is used on purpose: macOS curl fails the
// TLS handshake with eventim.bg / ticketstation.bg, Node's undici does not.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function get(url, { headers = {}, retries = 2, as = 'json' } = {}) {
  return request(url, { method: 'GET', headers }, retries, as);
}

export async function post(url, body, { headers = {}, retries = 2, as = 'json' } = {}) {
  return request(
    url,
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
    retries,
    as,
  );
}

async function request(url, init, retries, as) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : '*/*', ...init.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}
