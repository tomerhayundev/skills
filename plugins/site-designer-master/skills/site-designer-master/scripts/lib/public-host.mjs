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
    const a = ip.toLowerCase();
    if (a === '::' || a === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);
    if (hex) { const n = (parseInt(hex[1], 16) << 16 | parseInt(hex[2], 16)) >>> 0; return isPrivateAddress([n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join('.')); }
    return /^(fc|fd|fe[89ab])/.test(a);
  }
  return true;
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
