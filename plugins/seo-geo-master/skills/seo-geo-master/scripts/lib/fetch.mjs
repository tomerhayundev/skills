// Polite fetching for audits: low concurrency, a delay between requests, manual redirects
// (every hop recorded), Retry-After on 429/503, a body cap, gzip/deflate/br (a compressed body cut
// off before its end is reported as 'incomplete-body'), legacy charsets.
// SSRF guard: never connect to private, loopback, link-local, CGNAT or metadata addresses,
// checked on every hop (a literal IP before connecting, a hostname at DNS time on every address
// it resolves to, and the resolved IP is the one connected to), unless the URL's origin is the
// explicitly allowed local origin (auditing a local or dev site).
//
// get() never rejects and settles exactly once per request: every failure comes back as
// FetchResult.error. One request is one connection (no keep-alive pool), closed when it is done,
// truncated or timed out.
//
// get(url, { allow }): allow(url) is asked before every redirect hop (not for the first URL, which
// the caller judges itself). When it says no the hop is not requested: the result has
// error 'robots-disallowed', status null, the chain so far, and finalUrl = the refused URL.
// The name is the caller's use of it: a crawler that obeys robots.txt judges each target there.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream';

export const DEFAULT_UA = 'seo-geo-master/0.1 (+https://github.com/tomerhayundev/skills)';

const v4From = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

// The eight 16-bit groups of a valid IPv6 address, in any spelling: compressed, with a dotted
// IPv4 tail, upper case, with a zone id.
function ipv6Groups(addr) {
  let s = addr.toLowerCase().split('%')[0];
  const tail = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(s);
  if (tail) {
    const [a, b, c, d] = tail.slice(1).map(Number);
    s = `${s.slice(0, tail.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, rest] = s.split('::');
  const h = head ? head.split(':') : [];
  const t = rest ? rest.split(':') : [];
  const fill = rest === undefined ? [] : new Array(8 - h.length - t.length).fill('0');
  return [...h, ...fill, ...t].map(x => parseInt(x, 16));
}

function isPrivateV6(addr) {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = ipv6Groups(addr);
  const zeros4 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (zeros4 && g4 === 0 && g5 === 0) return true; // ::/96: unspecified, loopback, IPv4-compatible
  if (zeros4 && g4 === 0 && g5 === 0xffff) return isPrivateAddress(v4From(g6, g7)); // ::ffff:a.b.c.d (IPv4-mapped)
  if (zeros4 && g4 === 0xffff && g5 === 0) return isPrivateAddress(v4From(g6, g7)); // ::ffff:0:a.b.c.d (IPv4-translated)
  if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64: 64:ff9b::/96 and 64:ff9b:1::/48
  if (g0 === 0x2002) return isPrivateAddress(v4From(g1, g2)); // 6to4 carries an IPv4 address
  if (g0 === 0x2001 && (g1 < 0x200 || g1 === 0xdb8)) return true; // 2001::/23 (Teredo, protocol assignments), documentation
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 discard-only
  return (g0 & 0xfe00) === 0xfc00 || // fc00::/7 unique local (includes the fd00:ec2::254 metadata address)
    (g0 & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (g0 & 0xffc0) === 0xfec0 || // fec0::/10 site-local (deprecated)
    (g0 & 0xff00) === 0xff00; // ff00::/8 multicast
}

// True for anything that is not a public unicast IP address, including anything that is not
// an IP address at all (fail closed).
export function isPrivateAddress(ip) {
  const addr = String(ip).replace(/^\[|\]$/g, '');
  if (net.isIPv6(addr)) return isPrivateV6(addr);
  if (!net.isIPv4(addr)) return true;
  const [a, b, c] = addr.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113);
}

// RFC 1918 and loopback: 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16.
function isLocalV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// True only for this machine and private LAN addresses: 'localhost', '*.localhost', loopback
// (127.0.0.0/8, ::1) and RFC 1918 (10/8, 172.16/12, 192.168/16), also as an IPv4-mapped IPv6
// address. A caller uses this to exempt its start origin from the SSRF guard, so it is
// deliberately narrower than isPrivateAddress: never link-local (169.254/16, fe80::/10, which
// holds the cloud metadata address), CGNAT (100.64/10), unique local (fc00::/7), the unspecified
// address, or anything else.
export function isLocalHost(hostname) {
  const h = String(hostname).replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (net.isIPv4(h)) return isLocalV4(h);
  if (!net.isIPv6(h)) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = ipv6Groups(h);
  const zeros4 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  if (zeros4 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true; // ::1
  return zeros4 && g4 === 0 && g5 === 0xffff && isLocalV4(v4From(g6, g7)); // ::ffff:a.b.c.d
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Seconds, or an HTTP date. A missing header means a short pause; an unreadable one means no retry.
function retryAfterMs(v) {
  if (v === undefined) return 1000;
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  const d = /[a-z]/i.test(s) ? Date.parse(s) : NaN;
  return Number.isFinite(d) ? Math.max(0, d - Date.now()) : null;
}

function decode(buf, contentType = '') {
  let cs = (/charset=["']?([\w-]+)/i.exec(contentType) || [])[1];
  if (!cs && /html/i.test(contentType)) cs = (/<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1')) || [])[1];
  try { return new TextDecoder(cs || 'utf-8').decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

function result(url, finalUrl, chain, r) {
  const headers = r.headers || {};
  return {
    url, finalUrl, status: r.status ?? null, headers, chain,
    body: r.buffer ? decode(r.buffer, headers['content-type'] || '') : '',
    buffer: r.buffer ?? null, bytes: r.bytes ?? 0, truncated: Boolean(r.truncated), timeMs: r.timeMs ?? null, error: r.error ?? null,
    retried: Boolean(r.retried), // true when this answer came after the one retry that a 429 or 503 with a short Retry-After earns
  };
}

// Always a non-empty string, whatever was thrown.
function errorCode(e) {
  if (e && e.code === 'EBLOCKED') return 'blocked-private-address';
  return (e && (e.code || (e.errors && e.errors[0] && e.errors[0].code) || e.message)) || 'request-failed';
}

// Returns undefined for no encoding, null for one we cannot decode. A decoder that runs out of
// input before the end of its stream fails with Z_BUF_ERROR ("unexpected end of file") after it
// has passed on everything it could decode; the caller turns that into 'incomplete-body'.
function decoderFor(header) {
  const enc = String(header || '').trim().toLowerCase();
  if (enc === '' || enc === 'identity') return undefined;
  if (enc === 'gzip' || enc === 'x-gzip') return zlib.createGunzip();
  if (enc === 'deflate') return zlib.createInflate();
  if (enc === 'br') return zlib.createBrotliDecompress();
  return null;
}

function originOf(value) {
  let u = null;
  try { u = new URL(value); } catch { /* reported below */ }
  if (!u || (u.protocol !== 'http:' && u.protocol !== 'https:')) throw new TypeError(`allowLocalOrigin must be an http(s) URL, got ${String(value)}`);
  return u.origin;
}

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export function createFetcher(opts = {}) {
  const {
    concurrency = 2, delayMs = 300, timeoutMs = 15000, maxRedirects = 10, maxBytes = 5 * 1024 * 1024,
    userAgent = DEFAULT_UA, allowLocalOrigin = null, lookup = dns.lookup,
  } = opts;
  const allowedOrigin = allowLocalOrigin ? originOf(allowLocalOrigin) : null;
  const slots = Math.max(1, Math.floor(concurrency) || 1);
  let active = 0;
  const waiters = [];
  const acquire = () => new Promise(res => { if (active < slots) { active++; res(); } else waiters.push(res); });
  const release = () => setTimeout(() => { const next = waiters.shift(); if (next) next(); else active--; }, delayMs);

  // One request, no redirects. Resolves exactly once with { status, headers, buffer, bytes, truncated, timeMs } or { error }.
  // timeoutMs bounds the whole request (connect, headers and body), so a server that drips
  // bytes cannot hold a slot.
  function once(rawUrl) {
    return new Promise(resolve => {
      let u;
      try { u = new URL(rawUrl); } catch { return resolve({ error: 'invalid-url' }); }
      const host = u.hostname.replace(/^\[|\]$/g, '');
      const local = allowedOrigin !== null && u.origin === allowedOrigin;
      // A literal IP is connected to without calling lookup at all, so it is judged here.
      if (!local && net.isIP(host) && isPrivateAddress(host)) return resolve({ error: 'blocked-private-address' });
      const mod = u.protocol === 'https:' ? https : u.protocol === 'http:' ? http : null;
      if (!mod) return resolve({ error: 'unsupported-protocol' });

      // Node calls this with { all: true } when it tries several addresses (autoSelectFamily) and
      // without it otherwise. Either way every address is judged, and the address that passes is
      // the one Node connects to.
      const guardedLookup = (hostname, options, cb) => {
        if (typeof options === 'function') { cb = options; options = {}; } else if (typeof options === 'number') options = { family: options };
        const wantList = Boolean(options && options.all);
        let answered = false;
        const reply = (...args) => { if (!answered) { answered = true; cb(...args); } };
        const refuse = (code, message) => reply(Object.assign(new Error(message), { code }));
        try {
          lookup(hostname, { ...options, all: true }, (err, addrs) => {
            if (err) return reply(err);
            const list = (Array.isArray(addrs) ? addrs : [{ address: addrs }]).filter(a => a && a.address)
              .map(a => ({ address: a.address, family: a.family || (net.isIPv6(a.address) ? 6 : 4) }));
            if (!list.length) return refuse('ENOTFOUND', `no address for ${hostname}`);
            if (!local && list.some(a => isPrivateAddress(a.address))) return refuse('EBLOCKED', `blocked private address for ${hostname}`);
            return wantList ? reply(null, list) : reply(null, list[0].address, list[0].family);
          });
        } catch (e) { reply(e); }
      };

      const started = Date.now();
      let done = false; let req = null; let res = null; let decoder = null; let timer = null;
      const finish = v => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
        if (decoder) decoder.destroy();
        if (res) res.destroy();
        if (req) req.destroy();
      };
      const fail = e => finish({ error: errorCode(e) });

      const onResponse = r => {
        res = r;
        if (done) return r.destroy();
        r.on('error', fail);
        r.on('close', () => { if (!r.complete) fail({ code: 'ECONNRESET' }); });
        const dec = decoderFor(r.headers['content-encoding']);
        if (dec === null) return finish({ error: 'unsupported-content-encoding' });
        const chunks = [];
        let size = 0;
        const out = truncated => ({ status: r.statusCode, headers: r.headers, buffer: Buffer.concat(chunks), bytes: size, truncated, timeMs: Date.now() - started });
        // A compressed body that ends before its stream does is incomplete: report it, and keep the
        // status, the headers and what decoded, so a caller does not read the gap as a page without
        // a title. Nothing at all to decode is not that: a 301 or 304 can still say Content-Encoding.
        const decodeFailed = e => {
          if (!(e && e.code === 'Z_BUF_ERROR' && decoder)) return fail(e);
          return finish(decoder.bytesWritten === 0 ? out(false) : { ...out(false), error: 'incomplete-body' });
        };
        let stream = r;
        if (dec) { decoder = dec; stream = dec; pipeline(r, dec, err => { if (err) decodeFailed(err); }); }
        stream.on('data', c => {
          if (done) return;
          const room = maxBytes - size;
          size += c.length;
          if (c.length <= room) { chunks.push(c); return; }
          if (room > 0) chunks.push(c.subarray(0, room));
          finish(out(true));
        });
        stream.on('end', () => finish(out(false)));
        stream.on('error', decodeFailed);
      };

      timer = setTimeout(() => finish({ error: 'ETIMEDOUT' }), timeoutMs);
      try {
        req = mod.request(u, {
          method: 'GET', agent: false, lookup: guardedLookup,
          headers: {
            'user-agent': userAgent,
            accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
            'accept-encoding': 'gzip, deflate, br',
          },
        }, onResponse);
      } catch (e) { return fail(e); }
      req.on('error', fail);
      req.end();
    });
  }

  async function follow(url, allow) {
    const chain = [];
    const seen = new Set();
    let current = url;
    for (;;) {
      if (seen.has(current)) return result(url, current, chain, { error: 'redirect-loop' });
      seen.add(current);
      let r = await once(current);
      if (!r.error && (r.status === 429 || r.status === 503)) {
        const wait = retryAfterMs(r.headers['retry-after']);
        if (wait !== null && wait <= 30000) { await sleep(wait); r = await once(current); r.retried = true; }
      }
      // A redirect whose own body was cut short still carries its Location: follow it.
      const bodyOnly = r.error === 'incomplete-body' && REDIRECTS.has(r.status) && r.headers.location;
      if (r.error && !bodyOnly) return result(url, current, chain, r);
      if (REDIRECTS.has(r.status) && r.headers.location) {
        let next;
        try { next = new URL(r.headers.location, current).href; } catch { return result(url, current, chain, { ...r, error: 'invalid-redirect' }); }
        chain.push({ url: current, status: r.status, location: next });
        // A refused hop is never requested: the caller (robots.txt) said this URL is not to be fetched.
        if (allow && !(await allow(next))) return result(url, next, chain, { error: 'robots-disallowed' });
        if (chain.length > maxRedirects) return result(url, next, chain, { error: 'too-many-redirects' });
        current = next;
        continue;
      }
      return result(url, current, chain, r);
    }
  }

  async function get(input, callOpts) {
    const url = String(input);
    const allow = callOpts && typeof callOpts.allow === 'function' ? callOpts.allow : null;
    await acquire();
    try {
      return await follow(url, allow);
    } catch (e) {
      return result(url, url, [], { error: errorCode(e) });
    } finally {
      release();
    }
  }

  return { get };
}
