// Is a web address public? A link the user brings is opened by a browser on their machine, so it must not lead
// to the machine itself or to anything on its home or carrier network: not by name, not by the addresses the
// name resolves to, not by a redirect (the capture checks each hop and the page it lands on with this).
import dns from 'node:dns/promises';
import net from 'node:net';

const V4_PRIVATE = [[0, 8], [10, 8], [100 << 24 | 64 << 16, 10], [127, 8], [169 << 24 | 254 << 16, 16], [172 << 24 | 16 << 16, 12], [192 << 24 | 168 << 16, 16], [198 << 24 | 18 << 16, 15], [224 << 24, 3]];
const toInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;

export function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const n = toInt(ip);
    return V4_PRIVATE.some(([base, bits]) => {
      const b = bits === 8 ? base << 24 : base;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return ((n & mask) >>> 0) === ((b & mask) >>> 0);
    });
  }
  if (v === 6) {
    const h = hextets(ip);
    const v4 = (hi, lo) => isPrivateAddress([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.'));
    const zero = (from, to) => h.slice(from, to).every((x) => x === 0);
    // Forms that carry an IPv4 address are judged by it: ::a.b.c.d, ::ffff:a.b.c.d, NAT64 64:ff9b::/96, 6to4 2002::/16.
    if (zero(0, 6)) return zero(6, 8) || v4(h[6], h[7]);
    if (zero(0, 5) && h[5] === 0xffff) return v4(h[6], h[7]);
    if (h[0] === 0x64 && h[1] === 0xff9b && zero(2, 6)) return v4(h[6], h[7]);
    if (h[0] === 0x2002) return v4(h[1], h[2]);
    // Teredo (2001::/32) and documentation (2001:db8::/32) are never a site to open.
    if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return true;
    // Only global unicast (2000::/3) is public: unique-local, link-local, site-local, multicast and the rest are not.
    return (h[0] & 0xe000) !== 0x2000;
  }
  return true;
}

// The eight 16-bit groups of an IPv6 address, with :: expanded and a trailing dotted IPv4 turned into two groups.
function hextets(ip) {
  let a = ip.toLowerCase().replace(/%.*$/, '');
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (dotted) { const n = toInt(dotted[1]); a = a.slice(0, -dotted[1].length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const [head, tail] = a.split('::');
  const part = (s) => (s ? s.split(':').map((x) => parseInt(x, 16)) : []);
  const H = part(head), T = tail === undefined ? [] : part(tail);
  return [...H, ...Array(8 - H.length - T.length).fill(0), ...T];
}

// One rule for a whole capture: each name is resolved once and remembered for a minute, so a page with many
// pictures does not ask the resolver for every one.
export function publicRule(lookup = dns.lookup) {
  const seen = new Map();
  return (raw) => {
    let host;
    try { host = new URL(raw).host; } catch { return Promise.resolve(false); }
    const hit = seen.get(host);
    if (hit && Date.now() - hit.at < 60000) return hit.ok.then((ok) => ok && /^https?:/i.test(raw));
    const ok = checkPublic(raw, lookup);
    seen.set(host, { at: Date.now(), ok });
    return ok;
  };
}

// lookup: (host, { all: true }) => [{ address }]; the default asks the system resolver.
export async function checkPublic(raw, lookup = dns.lookup) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) return !isPrivateAddress(host);
  if (/(^|\.)localhost$|\.local$/i.test(host)) return false;
  try {
    const found = await lookup(host, { all: true });
    const list = Array.isArray(found) ? found : [found];
    return list.length > 0 && list.every((a) => a && !isPrivateAddress(a.address));
  } catch { return false; }
}
