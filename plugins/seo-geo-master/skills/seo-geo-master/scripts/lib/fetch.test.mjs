import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import zlib from 'node:zlib';
import dns from 'node:dns';
import net from 'node:net';
import { createFetcher, isPrivateAddress, isLocalHost, DEFAULT_UA } from './fetch.mjs';

let server; let origin; let hits429 = 0;
before(async () => {
  server = http.createServer((req, res) => {
    const u = req.url;
    if (u === '/ok') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<title>ok</title>'); }
    if (u === '/r1') { res.writeHead(301, { location: '/r2' }); return res.end(); }
    if (u === '/r2') { res.writeHead(302, { location: `${origin}/ok` }); return res.end(); }
    if (u === '/loop1') { res.writeHead(301, { location: '/loop2' }); return res.end(); }
    if (u === '/loop2') { res.writeHead(301, { location: '/loop1' }); return res.end(); }
    if (u === '/gz') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync('<p>zipped</p>')); }
    if (u === '/big') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('x'.repeat(5000)); }
    if (u === '/hebrew') { res.writeHead(200, { 'content-type': 'text/html; charset=windows-1255' }); return res.end(Buffer.from([0xf9, 0xec, 0xe5, 0xed])); }
    if (u === '/limit') { hits429++; if (hits429 === 1) { res.writeHead(429, { 'retry-after': '0' }); return res.end(); } res.writeHead(200); return res.end('after retry'); }
    if (u === '/ua') { res.writeHead(200); return res.end(req.headers['user-agent']); }
    res.writeHead(404); res.end('nope');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const local = () => createFetcher({ delayMs: 0, allowLocalOrigin: origin, maxBytes: 1000 });

test('private address detection', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '224.0.0.1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2606:4700::1111']) assert.equal(isPrivateAddress(ip), false, ip);
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('app.localhost'), true);
  assert.equal(isLocalHost('127.0.0.1'), true);
  assert.equal(isLocalHost('example.test'), false);
});

test('blocks private addresses unless the origin is the allowed local origin', async () => {
  const blocked = await createFetcher({ delayMs: 0 }).get(`${origin}/ok`);
  assert.equal(blocked.error, 'blocked-private-address');
  const ok = await local().get(`${origin}/ok`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body, '<title>ok</title>');
  assert.equal(ok.headers['content-type'], 'text/html; charset=utf-8');
});

test('records redirect chains and detects loops', async () => {
  const r = await local().get(`${origin}/r1`);
  assert.equal(r.status, 200);
  assert.equal(r.finalUrl, `${origin}/ok`);
  assert.deepEqual(r.chain.map(h => h.status), [301, 302]);
  const loop = await local().get(`${origin}/loop1`);
  assert.equal(loop.error, 'redirect-loop');
});

test('decompresses gzip, decodes legacy Hebrew charset, truncates large bodies', async () => {
  assert.equal((await local().get(`${origin}/gz`)).body, '<p>zipped</p>');
  assert.equal((await local().get(`${origin}/hebrew`)).body, 'שלום');
  const big = await local().get(`${origin}/big`);
  assert.equal(big.truncated, true);
  assert.ok(big.bytes > 1000);
  assert.ok(big.body.length <= 1000 + 65536);
});

test('retries once after 429 with Retry-After and sends an honest user agent', async () => {
  const r = await local().get(`${origin}/limit`);
  assert.equal(r.status, 200);
  assert.equal(r.body, 'after retry');
  const ua = await local().get(`${origin}/ua`);
  assert.match(ua.body, /^seo-geo-master\//);
});

// The same tool runs against sites its user does not own, so the User-Agent says who it is and where to read about it, and claims nothing else.
test('the default User-Agent names the tool and its repo, and does not claim an owner audit or a search engine', () => {
  assert.equal(DEFAULT_UA, 'seo-geo-master/0.1 (+https://github.com/tomerhayundev/skills)');
  assert.doesNotMatch(DEFAULT_UA, /owner|googlebot|bingbot|mozilla/i);
});

// ---------------------------------------------------------------------------------------------
// Hardening beyond the brief: SSRF guard on every path, request lifecycle, body cap, timeouts.
// ---------------------------------------------------------------------------------------------

let xs; let xorigin; let xport; let xInflight = 0; let xMaxInflight = 0; let hits503 = 0;
const xsockets = new Set();
const noisyRaw = Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 251));
const noisy = zlib.gzipSync(noisyRaw);
const pageRaw = Buffer.from('<html><head><title>Truncation test</title></head><body>' + 'lorem ipsum dolor sit amet '.repeat(200) + '</body></html>');
const ENCODINGS = { gz: ['gzip', zlib.gzipSync], deflate: ['deflate', zlib.deflateSync], br: ['br', zlib.brotliCompressSync] };
const RAW = { page: pageRaw, noisy: noisyRaw };
let xConns = 0;
const xhits = [];

before(async () => {
  xs = http.createServer((req, res) => {
    const u = req.url;
    xhits.push(u);
    const redirect = (code, location, extra = {}) => { res.writeHead(code, { location, ...extra }); res.end(); };
    if (u === '/ok') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<title>ok</title>'); }
    if (u === '/hang') return; // never answers
    if (u === '/headers-then-hang') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<p>partial'); return; }
    if (u === '/trickle') { // one byte every 30 ms for 2.5 s: the socket is never idle
      res.writeHead(200, { 'content-type': 'text/html' });
      const t = setInterval(() => res.write('a'), 30);
      const stop = setTimeout(() => res.end(), 2500);
      res.on('close', () => { clearInterval(t); clearTimeout(stop); });
      return;
    }
    if (u === '/abort') { res.writeHead(200, { 'content-length': '100' }); res.write('partial'); setTimeout(() => res.socket.destroy(), 20); return; }
    if (u === '/abort-gz') { res.writeHead(200, { 'content-encoding': 'gzip', 'content-length': String(noisy.length) }); res.write(noisy.subarray(0, 40)); setTimeout(() => res.socket.destroy(), 20); return; }
    if (u === '/bomb') { res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync('a'.repeat(3_000_000))); }
    if (u === '/bad-gz') { res.writeHead(200, { 'content-encoding': 'gzip' }); return res.end('this is not gzip'); }
    if (u === '/empty-gz-redirect') return redirect(301, '/ok', { 'content-encoding': 'gzip', 'content-length': '0' });
    const cut = /^\/cut\/(gz|deflate|br)\/(page|noisy)\/(half|last)\/(chunked|length|close)$/.exec(u);
    if (cut) { // a compressed body that stops short, with the HTTP message itself ending cleanly
      const [, codec, data, where, mode] = cut;
      const [encoding, compress] = ENCODINGS[codec];
      const full = compress(RAW[data]);
      const part = full.subarray(0, where === 'half' ? Math.floor(full.length / 2) : full.length - 1);
      const headers = { 'content-type': 'text/html', 'content-encoding': encoding };
      if (mode === 'length') headers['content-length'] = String(part.length);
      if (mode === 'close') { res.useChunkedEncodingByDefault = false; res.shouldKeepAlive = false; } // the body ends where the connection does
      res.writeHead(200, headers);
      return res.end(part);
    }
    if (u === '/cut-redirect') { res.writeHead(301, { location: '/ok', 'content-encoding': 'gzip' }); return res.end(zlib.gzipSync(pageRaw).subarray(0, 30)); }
    const empty = /^\/empty\/(gz|deflate|br)\/(301|200|304)$/.exec(u);
    if (empty) { // nothing at all in the body, whatever the Content-Encoding header says
      const status = Number(empty[2]);
      res.writeHead(status, { ...(status === 301 ? { location: '/ok' } : {}), 'content-encoding': ENCODINGS[empty[1]][0], 'content-length': '0' });
      return res.end();
    }
    if (u === '/gz-in-pieces') { // a complete gzip body that arrives in many small chunks
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
      const whole = zlib.gzipSync(noisyRaw); let at = 0;
      const t = setInterval(() => { res.write(whole.subarray(at, at + 25)); at += 25; if (at >= whole.length) { clearInterval(t); res.end(); } }, 3);
      res.on('close', () => clearInterval(t));
      return;
    }
    if (u === '/br') { res.writeHead(200, { 'content-encoding': 'br' }); return res.end(zlib.brotliCompressSync('<p>brotli</p>')); }
    if (u === '/deflate') { res.writeHead(200, { 'content-encoding': 'deflate' }); return res.end(zlib.deflateSync('<p>deflated</p>')); }
    if (u === '/odd-encoding') { res.writeHead(200, { 'content-encoding': 'zstd' }); return res.end('whatever'); }
    if (u === '/exact') return res.end('y'.repeat(1000));
    if (u === '/exact-plus-one') return res.end('y'.repeat(1001));
    if (u === '/bad-location') return redirect(302, 'http://');
    if (u === '/to-meta') return redirect(302, 'http://169.254.169.254/latest/meta-data/');
    if (u === '/to-name') return redirect(302, `http://localhost:${xport}/ok`);
    if (u === '/to-mapped') return redirect(302, `http://[::ffff:7f00:1]:${xport}/ok`);
    if (u === '/to-decimal') return redirect(302, `http://2130706433:9/ok`);
    if (u === '/to-file') return redirect(302, 'file:///etc/passwd');
    if (u === '/hop1') return redirect(301, '/hop2');
    if (u === '/hop2') return redirect(302, '/private/secret');
    if (u === '/private/secret') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('secret'); }
    if (u.startsWith('/chain/')) return redirect(302, `/chain/${Number(u.slice(7)) + 1}`);
    if (u === '/limit-long') { res.writeHead(429, { 'retry-after': '120' }); return res.end('slow down'); }
    if (u === '/limit503') { hits503++; if (hits503 === 1) { res.writeHead(503, { 'retry-after': '0' }); return res.end(); } res.writeHead(200); return res.end('back'); }
    if (u === '/slow') { xInflight++; xMaxInflight = Math.max(xMaxInflight, xInflight); setTimeout(() => { xInflight--; res.writeHead(200); res.end('slow'); }, 60); return; }
    if (u === '/meta-hebrew') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(Buffer.concat([Buffer.from('<meta charset="windows-1255"><p>'), Buffer.from([0xf9, 0xec, 0xe5, 0xed]), Buffer.from('</p>')])); }
    if (u === '/bad-charset') { res.writeHead(200, { 'content-type': 'text/html; charset=no-such-charset' }); return res.end(Buffer.from('caf\u00e9', 'utf8')); }
    res.writeHead(404); res.end('nope');
  });
  xs.on('connection', s => { xConns++; xsockets.add(s); s.on('close', () => xsockets.delete(s)); });
  await new Promise(r => xs.listen(0, '127.0.0.1', r));
  xport = xs.address().port;
  xorigin = `http://127.0.0.1:${xport}`;
});
after(() => { xs.closeAllConnections(); xs.close(); });

const xlocal = (o = {}) => createFetcher({ delayMs: 0, allowLocalOrigin: xorigin, ...o });
async function socketsLeft(ms = 1500) {
  const end = Date.now() + ms;
  while (xsockets.size && Date.now() < end) await new Promise(r => setTimeout(r, 20));
  return xsockets.size;
}

test('every spelling of an internal IP address is private, public ones are not', () => {
  const internal = [
    '0:0:0:0:0:ffff:7f00:1', '0000:0000:0000:0000:0000:ffff:7f00:0001', '::FFFF:7F00:1', '::ffff:0:7f00:1', '::ffff:10.0.0.1',
    '::127.0.0.1', '::7f00:1', '[::1]', 'fe80::1%eth0', 'FE80::1', 'febf::1', 'fec0::1', 'fc00::', 'fdff:ffff::1', 'fd00:ec2::254',
    'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', '2002:a9fe:a9fe::1', '2001::1', '2001:db8::1', '0100::1', '::',
    '169.254.169.254', '100.100.100.200', '100.127.255.255', '192.0.0.8', '192.0.2.1', '198.18.0.1', '198.19.255.255', '198.51.100.7', '203.0.113.9', '240.0.0.1', '255.255.255.255',
  ];
  for (const ip of internal) assert.equal(isPrivateAddress(ip), true, ip);
  const external = [
    '8.8.8.8', '11.0.0.1', '172.15.255.255', '100.63.255.255', '100.128.0.1', '169.253.1.1', '192.169.0.1', '198.20.0.1', '223.255.255.255',
    '2606:4700::1111', '2001:4860:4860::8888', '2a00:1450:4001::200e', '::ffff:8.8.8.8', '::ffff:808:808', '2002:808:808::1',
  ];
  for (const ip of external) assert.equal(isPrivateAddress(ip), false, ip);
});

test('anything that is not an IP address counts as private, and isLocalHost copes with dots, brackets and case', () => {
  for (const v of ['example.com', '', '999.1.1.1', '010.0.0.1', undefined, null, '1.2.3']) assert.equal(isPrivateAddress(v), true, String(v));
  for (const h of ['LOCALHOST', 'localhost.', 'a.b.localhost', '[::1]', '::ffff:7f00:1', '10.0.0.1']) assert.equal(isLocalHost(h), true, h);
  for (const h of ['8.8.8.8', 'localhost.evil.com', 'notlocalhost', 'example.com', '']) assert.equal(isLocalHost(h), false, h);
});

test('isLocalHost: this machine and private LANs only, never link-local, metadata, CGNAT, ULA or anything else', () => {
  const local = [
    'localhost', 'LOCALHOST', 'localhost.', 'a.localhost', 'app.dev.localhost',
    '127.0.0.1', '127.1.2.3', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255', '192.168.0.1', '192.168.255.255',
    '::1', '[::1]', '0:0:0:0:0:0:0:1', '0000:0000:0000:0000:0000:0000:0000:0001', '::ffff:7f00:1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:c0a8:101', '::ffff:ac10:1',
  ];
  for (const h of local) assert.equal(isLocalHost(h), true, h);
  const notLocal = [
    '169.254.169.254', '169.254.0.1', '169.254.255.255', '[fe80::1]', 'fe80::1', 'fe80::1%eth0', 'febf::1', // link-local, with the metadata address
    '100.64.0.1', '100.100.100.200', '100.127.255.255', // CGNAT
    'fc00::1', 'fd00::1', 'fd00:ec2::254', 'fdff:ffff::1', // unique local
    '0.0.0.0', '::', '::2', '172.15.255.255', '172.32.0.1', '192.167.255.255', '192.169.0.1', '11.0.0.1', '9.255.255.255', '126.255.255.255', '128.0.0.1',
    '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.18.0.1', 'ff02::1', 'ff00::1',
    '::ffff:169.254.169.254', '::ffff:a9fe:a9fe', '::ffff:100.64.0.1', '::ffff:0.0.0.0', '::ffff:8.8.8.8', '::ffff:0:7f00:1', '::7f00:1', '2002:7f00:1::', '64:ff9b::7f00:1', '2001:db8::1',
    '8.8.8.8', '2606:4700::1111', 'metadata.google.internal', 'example.com', 'localhost.evil.com', 'notlocalhost', 'evil-localhost', '127.0.0.1.evil.com',
    '', '010.0.0.1', '127.1', '2130706433', '0x7f.0.0.1', '999.1.1.1', undefined, null,
  ];
  for (const h of notLocal) assert.equal(isLocalHost(h), false, String(h));
});

test('a caller that exempts the start origin with isLocalHost still gets the guard for metadata, link-local, CGNAT and ULA hosts', async () => {
  const calls = [];
  const spy = (h, o, cb) => { calls.push(h); dns.lookup(h, o, cb); };
  const connsBefore = xConns;
  for (const host of ['169.254.169.254', '[fe80::1]', '100.100.100.200', '[fd00:ec2::254]', '[::ffff:a9fe:a9fe]']) {
    const start = `http://${host}:${xport}`;
    const f = createFetcher({ delayMs: 0, timeoutMs: 500, lookup: spy, allowLocalOrigin: isLocalHost(new URL(start).hostname) ? start : null });
    const r = await f.get(`${start}/ok`);
    assert.equal(r.error, 'blocked-private-address', host);
    assert.equal(r.status, null, host);
  }
  assert.deepEqual(calls, []);
  assert.equal(xConns, connsBefore);
  // and the exemption still works for what is local
  const ok = await createFetcher({ delayMs: 0, allowLocalOrigin: isLocalHost(new URL(xorigin).hostname) ? xorigin : null }).get(`${xorigin}/ok`);
  assert.equal(ok.status, 200);
});

test('IP literals are judged without a DNS lookup, in every spelling the URL parser normalizes', async () => {
  const calls = [];
  const spy = (h, o, cb) => { calls.push(h); dns.lookup(h, o, cb); };
  const f = createFetcher({ delayMs: 0, lookup: spy });
  for (const host of ['127.0.0.1', '[::1]', '[::ffff:7f00:1]', '[0:0:0:0:0:ffff:7f00:1]', '[::127.0.0.1]', '2130706433', '0x7f.1', '127.1', '169.254.169.254', '[fd00:ec2::254]', '100.100.100.200']) {
    const r = await f.get(`http://${host}:${xport}/ok`);
    assert.equal(r.error, 'blocked-private-address', host);
    assert.equal(r.status, null, host);
  }
  assert.deepEqual(calls, []);
});

test('hostnames are checked after DNS on every address, whichever way Node calls lookup', async () => {
  const table = {
    'rebind.test': [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }],
    'internal.test': [{ address: '10.0.0.5', family: 4 }],
    'mapped.test': [{ address: '::ffff:7f00:1', family: 6 }],
    'meta.test': [{ address: '169.254.169.254', family: 4 }],
    'dev.test': [{ address: '127.0.0.1', family: 4 }],
    'empty.test': [],
  };
  const lookup = (host, opts, cb) => {
    const list = table[host];
    if (!list) return cb(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
    // honour how the caller asked: a list when asked for all addresses, one address otherwise
    if (opts && opts.all) return cb(null, list);
    if (!list.length) return cb(Object.assign(new Error('not found'), { code: 'ENOTFOUND' }));
    return cb(null, list[0].address, list[0].family);
  };
  const legacy = (h, o, cb) => cb(null, '127.0.0.1', 4); // a lookup that ignores { all: true } and answers with one address
  const run = async () => {
    for (const host of ['rebind.test', 'internal.test', 'mapped.test', 'meta.test', 'dev.test']) {
      const r = await createFetcher({ delayMs: 0, lookup }).get(`http://${host}:${xport}/ok`);
      assert.equal(r.error, 'blocked-private-address', host);
    }
    assert.equal((await createFetcher({ delayMs: 0, lookup: legacy }).get(`http://legacy.test:${xport}/ok`)).error, 'blocked-private-address');
    assert.equal((await createFetcher({ delayMs: 0, lookup }).get(`http://nowhere.test:${xport}/ok`)).error, 'ENOTFOUND');
    assert.equal((await createFetcher({ delayMs: 0, lookup }).get(`http://empty.test:${xport}/ok`)).error, 'ENOTFOUND');
    // the allowed origin is allowed by name, and the connection really goes to the resolved address
    const ok = await createFetcher({ delayMs: 0, lookup, allowLocalOrigin: `http://dev.test:${xport}` }).get(`http://dev.test:${xport}/ok`);
    assert.equal(ok.status, 200);
    assert.equal(ok.body, '<title>ok</title>');
    const ok2 = await createFetcher({ delayMs: 0, lookup: legacy, allowLocalOrigin: `http://legacy.test:${xport}` }).get(`http://legacy.test:${xport}/ok`);
    assert.equal(ok2.status, 200);
    // another name for the same machine is another origin
    const other = await createFetcher({ delayMs: 0, lookup, allowLocalOrigin: `http://dev.test:${xport}` }).get(`http://internal.test:${xport}/ok`);
    assert.equal(other.error, 'blocked-private-address');
  };
  await run(); // Node 20+ asks for { all: true } (autoSelectFamily)
  if (typeof net.setDefaultAutoSelectFamily === 'function') { // and without it Node asks for one address
    const prev = net.getDefaultAutoSelectFamily();
    net.setDefaultAutoSelectFamily(false);
    try { await run(); } finally { net.setDefaultAutoSelectFamily(prev); }
  }
});

test('the real resolver is guarded too, with or without IPv6, whichever way Node calls lookup', async () => {
  // None of these requests connects: the guard answers at DNS time, so they hold whether localhost
  // resolves to ::1, to 127.0.0.1 or to both, and whether Node asks for one address or for all of them.
  const connsBefore = xConns;
  const blockedRun = async () => {
    const other = await xlocal().get(`http://localhost:${xport}/ok`); // the allowed origin is 127.0.0.1, so this is another origin
    assert.equal(other.error, 'blocked-private-address');
    assert.equal(other.status, null);
    const none = await createFetcher({ delayMs: 0 }).get(`http://localhost:${xport}/ok`); // no allowed origin at all
    assert.equal(none.error, 'blocked-private-address');
  };
  await blockedRun(); // autoSelectFamily is on by default in Node 20+: the resolver is asked for { all: true }
  if (typeof net.setDefaultAutoSelectFamily === 'function') { // and with it off, as in Node 18, for one address
    const prev = net.getDefaultAutoSelectFamily();
    net.setDefaultAutoSelectFamily(false);
    try { await blockedRun(); } finally { net.setDefaultAutoSelectFamily(prev); }
  }
  assert.equal(xConns, connsBefore);
  // The fixture listens on 127.0.0.1 only and a real localhost may be ::1 first, so the allowed-by-name
  // case maps localhost to 127.0.0.1 itself instead of depending on how this machine resolves it.
  const toIPv4 = (h, o, cb) => dns.lookup(h === 'localhost' ? '127.0.0.1' : h, o, cb);
  const ok = await createFetcher({ delayMs: 0, lookup: toIPv4, allowLocalOrigin: `http://localhost:${xport}` }).get(`http://localhost:${xport}/ok`);
  assert.equal(ok.status, 200);
  // a connection opened for the allowed origin is not kept for anyone else: a keep-alive pool would
  // reuse it without any DNS lookup, and the guard would never run
  const again = await createFetcher({ delayMs: 0 }).get(`http://localhost:${xport}/ok`);
  assert.equal(again.error, 'blocked-private-address');
});

test('a redirect to an internal address is refused at that hop and recorded', async () => {
  for (const [path, target] of [['/to-meta', 'http://169.254.169.254/'], ['/to-name', 'http://localhost:'], ['/to-mapped', 'http://[::ffff:7f00:1]:'], ['/to-decimal', 'http://127.0.0.1:9/']]) {
    const r = await xlocal().get(`${xorigin}${path}`);
    assert.equal(r.error, 'blocked-private-address', path);
    assert.equal(r.status, null, path);
    assert.deepEqual(r.chain.map(h => h.status), [302], path);
    assert.ok(r.finalUrl.startsWith(target), `${path} ${r.finalUrl}`);
  }
});

test('allowLocalOrigin is compared as an origin, and a bad value is refused up front', async () => {
  for (const allowed of [`${xorigin}/`, `${xorigin}/some/page?q=1`, xorigin.replace('http', 'HTTP')]) {
    const r = await createFetcher({ delayMs: 0, allowLocalOrigin: allowed }).get(`${xorigin}/ok`);
    assert.equal(r.status, 200, allowed);
  }
  for (const bad of ['not a url', 'ftp://localhost/', 'file:///tmp/x', 'data:text/html,hi']) assert.throws(() => createFetcher({ allowLocalOrigin: bad }), TypeError, bad);
  assert.doesNotThrow(() => createFetcher({ allowLocalOrigin: null }));
});

test('unusable URLs and schemes come back as errors, and get() never rejects', async () => {
  const f = xlocal();
  assert.equal((await f.get('not a url')).error, 'invalid-url');
  assert.equal((await f.get(undefined)).error, 'invalid-url');
  assert.equal((await f.get('ftp://example.com/')).error, 'unsupported-protocol');
  const file = await f.get(`${xorigin}/to-file`);
  assert.equal(file.error, 'unsupported-protocol');
  assert.deepEqual(file.chain.map(h => h.status), [302]);
  const bad = await f.get(`${xorigin}/bad-location`);
  assert.equal(bad.error, 'invalid-redirect');
  assert.equal(bad.status, 302);
  assert.equal((await f.get(new URL(`${xorigin}/ok`))).status, 200);
});

test('too many redirects stops at maxRedirects with the whole chain recorded', async () => {
  const r = await xlocal({ maxRedirects: 3 }).get(`${xorigin}/chain/0`);
  assert.equal(r.error, 'too-many-redirects');
  assert.equal(r.chain.length, 4);
  assert.equal(r.chain[0].url, `${xorigin}/chain/0`);
  assert.equal(r.chain[3].location, `${xorigin}/chain/4`);
});

test('the body cap keeps exactly maxBytes, also for compressed bombs', async () => {
  const f = () => xlocal({ maxBytes: 1000 });
  const exact = await f().get(`${xorigin}/exact`);
  assert.equal(exact.truncated, false);
  assert.equal(exact.buffer.length, 1000);
  const plusOne = await f().get(`${xorigin}/exact-plus-one`);
  assert.equal(plusOne.truncated, true);
  assert.equal(plusOne.buffer.length, 1000);
  assert.equal(plusOne.body, 'y'.repeat(1000));
  assert.ok(plusOne.bytes > 1000);
  const bomb = await f().get(`${xorigin}/bomb`);
  assert.equal(bomb.error, null);
  assert.equal(bomb.truncated, true);
  assert.equal(bomb.buffer.length, 1000);
  assert.equal(bomb.body, 'a'.repeat(1000));
  assert.ok(bomb.bytes > 1000 && bomb.bytes < 3_000_000, String(bomb.bytes));
  assert.equal(await socketsLeft(), 0);
});

test('timeoutMs bounds the whole request and the socket is closed', { timeout: 15000 }, async () => {
  for (const path of ['/hang', '/headers-then-hang', '/trickle']) {
    const t0 = Date.now();
    const r = await xlocal({ timeoutMs: 300 }).get(`${xorigin}${path}`);
    assert.equal(r.error, 'ETIMEDOUT', path);
    assert.equal(r.status, null, path);
    assert.ok(Date.now() - t0 < 1500, `${path} took ${Date.now() - t0} ms`);
  }
  assert.equal(await socketsLeft(), 0);
});

test('a connection dropped mid-body ends with an error instead of hanging or crashing', { timeout: 15000 }, async () => {
  for (const path of ['/abort', '/abort-gz']) {
    const r = await xlocal().get(`${xorigin}${path}`);
    assert.equal(r.error, 'ECONNRESET', path);
    assert.equal(r.status, null, path);
  }
  assert.equal(await socketsLeft(), 0);
});

test('compressed bodies: gzip, deflate and brotli decode; a corrupt or unknown encoding is an error; an empty gzip body is not', { timeout: 15000 }, async () => {
  const f = xlocal();
  assert.equal((await f.get(`${xorigin}/deflate`)).body, '<p>deflated</p>');
  assert.equal((await f.get(`${xorigin}/br`)).body, '<p>brotli</p>');
  assert.equal((await f.get(`${xorigin}/bad-gz`)).error, 'Z_DATA_ERROR');
  assert.equal((await f.get(`${xorigin}/odd-encoding`)).error, 'unsupported-content-encoding');
  const r = await f.get(`${xorigin}/empty-gz-redirect`);
  assert.equal(r.error, null);
  assert.equal(r.status, 200);
  assert.deepEqual(r.chain.map(h => h.status), [301]);
});

test('a compressed body cut off mid-stream is flagged incomplete-body, keeping status, headers and what decoded', { timeout: 15000 }, async () => {
  const f = xlocal();
  for (const codec of ['gz', 'deflate', 'br']) {
    for (const data of ['page', 'noisy']) {
      for (const where of ['half', 'last']) {
        for (const mode of ['chunked', 'length', 'close']) {
          const name = `${codec}/${data}/${where}/${mode}`;
          const r = await f.get(`${xorigin}/cut/${name}`);
          assert.equal(r.error, 'incomplete-body', name);
          assert.equal(r.status, 200, name);
          assert.equal(r.headers['content-encoding'], ENCODINGS[codec][0], name);
          assert.equal(r.headers['content-type'], 'text/html', name);
          assert.equal(r.truncated, false, name);
          assert.equal(r.bytes, r.buffer.length, name);
          assert.ok(RAW[data].subarray(0, r.buffer.length).equals(r.buffer), `${name}: what decoded is a prefix of the real body`);
          if (where === 'last' && data === 'page') assert.ok(r.buffer.length > 4000, `${name}: nearly everything decoded, got ${r.buffer.length}`);
          if (where === 'half' && data === 'noisy') assert.ok(r.buffer.length > 0, `${name}: the partial body is kept`);
        }
      }
    }
  }
  assert.equal(await socketsLeft(), 0);
});

test('a truncated brotli page is an incomplete-body, not a quiet 200', async () => {
  const r = await xlocal().get(`${xorigin}/cut/br/page/half/chunked`);
  assert.equal(r.status, 200);
  assert.equal(r.error, 'incomplete-body');
  assert.equal(typeof r.body, 'string');
});

test('a complete compressed body is never flagged, however it arrives; a cut connection is still ECONNRESET', { timeout: 15000 }, async () => {
  const pieces = await xlocal().get(`${xorigin}/gz-in-pieces`);
  assert.equal(pieces.error, null);
  assert.equal(pieces.status, 200);
  assert.ok(pieces.buffer.equals(noisyRaw));
  for (const path of ['/gz', '/deflate', '/br']) assert.equal((await xlocal().get(`${xorigin}${path}`)).error, null, path);
  const dropped = await xlocal().get(`${xorigin}/abort-gz`);
  assert.equal(dropped.error, 'ECONNRESET');
  assert.equal(dropped.status, null);
});

test('an empty body labelled gzip, deflate or br is not an error: a 301 is followed, a 304 and an empty 200 stay as they are', { timeout: 15000 }, async () => {
  const f = xlocal();
  for (const codec of ['gz', 'deflate', 'br']) {
    const redirected = await f.get(`${xorigin}/empty/${codec}/301`);
    assert.equal(redirected.error, null, codec);
    assert.equal(redirected.status, 200, codec);
    assert.equal(redirected.finalUrl, `${xorigin}/ok`, codec);
    assert.deepEqual(redirected.chain.map(h => h.status), [301], codec);
    const notModified = await f.get(`${xorigin}/empty/${codec}/304`);
    assert.equal(notModified.error, null, codec);
    assert.equal(notModified.status, 304, codec);
    const nothing = await f.get(`${xorigin}/empty/${codec}/200`);
    assert.equal(nothing.error, null, codec);
    assert.equal(nothing.status, 200, codec);
    assert.equal(nothing.body, '', codec);
  }
});

test('a redirect whose own body is cut short is still followed: its Location arrived intact', async () => {
  const r = await xlocal().get(`${xorigin}/cut-redirect`);
  assert.equal(r.error, null);
  assert.equal(r.status, 200);
  assert.equal(r.finalUrl, `${xorigin}/ok`);
  assert.deepEqual(r.chain.map(h => h.status), [301]);
});

test('the socket is closed after a normal response, so nothing lingers', async () => {
  const r = await xlocal().get(`${xorigin}/ok`);
  assert.equal(r.status, 200);
  assert.equal(await socketsLeft(), 0);
});

test('concurrency is capped and the delay is kept between requests', async () => {
  xMaxInflight = 0;
  const shared = xlocal({ concurrency: 2 });
  await Promise.all(Array.from({ length: 6 }, () => shared.get(`${xorigin}/slow`)));
  assert.equal(xMaxInflight, 2);
  const paced = xlocal({ concurrency: 1, delayMs: 120 });
  const t0 = Date.now();
  await Promise.all([paced.get(`${xorigin}/ok`), paced.get(`${xorigin}/ok`), paced.get(`${xorigin}/ok`)]);
  assert.ok(Date.now() - t0 >= 220, `three requests took ${Date.now() - t0} ms`);
});

test('Retry-After: a 503 is retried once, a long wait is not waited for', async () => {
  const r = await xlocal().get(`${xorigin}/limit503`);
  assert.equal(r.status, 200);
  assert.equal(r.body, 'back');
  const t0 = Date.now();
  const long = await xlocal().get(`${xorigin}/limit-long`);
  assert.equal(long.status, 429);
  assert.equal(long.error, null);
  assert.ok(Date.now() - t0 < 2000);
});

test('charset: a meta tag is honoured, an unknown label falls back to UTF-8', async () => {
  assert.equal((await xlocal().get(`${xorigin}/meta-hebrew`)).body, '<meta charset="windows-1255"><p>\u05e9\u05dc\u05d5\u05dd</p>');
  assert.equal((await xlocal().get(`${xorigin}/bad-charset`)).body, 'caf\u00e9');
});

// A per-hop allow(url) hook: the caller (a crawler that obeys robots.txt) judges every redirect target before it is requested.
test('get(url, { allow }) asks before each redirect hop, never for the first URL, and a refused hop is not requested', async () => {
  const asked = [];
  xhits.length = 0;
  const r = await xlocal().get(`${xorigin}/hop1`, { allow: u => { asked.push(u); return !u.includes('/private/'); } });
  assert.deepEqual(asked, [`${xorigin}/hop2`, `${xorigin}/private/secret`], 'one call per hop, in order, the first URL is left to the caller');
  assert.equal(r.error, 'robots-disallowed');
  assert.equal(r.status, null);
  assert.equal(r.finalUrl, `${xorigin}/private/secret`, 'finalUrl is the refused URL');
  assert.equal(r.url, `${xorigin}/hop1`);
  assert.deepEqual(r.chain.map(h => [h.status, h.location]), [[301, `${xorigin}/hop2`], [302, `${xorigin}/private/secret`]], 'the chain so far, including the hop that led to the refused URL');
  assert.equal(r.body, '');
  assert.deepEqual(xhits, ['/hop1', '/hop2'], 'the refused URL was never requested');
  // A hook that allows everything changes nothing; so does no hook, and a hook that is not a function.
  for (const opts of [{ allow: () => true }, undefined, {}, { allow: 'yes' }]) {
    const ok = await xlocal().get(`${xorigin}/hop1`, opts);
    assert.equal(ok.error, null, JSON.stringify(opts));
    assert.equal(ok.status, 200);
    assert.equal(ok.body, 'secret');
  }
  // A hook that throws is a failed request, never a rejected promise.
  const boom = await xlocal().get(`${xorigin}/hop1`, { allow: () => { throw new Error('nope'); } });
  assert.ok(boom.error);
  assert.equal(boom.status, null);
});
