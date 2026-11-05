import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { startEgressProxy } from './egress-proxy.mjs';

let target, port, proxy;
const hits = [];
before(async () => {
  target = http.createServer((req, res) => { hits.push(`${req.headers.host.split(':')[0]}${req.url}`); res.end('inside'); });
  await new Promise((r) => target.listen(0, '127.0.0.1', r));
  port = target.address().port;
  // The gate: pinned.example is allowed and pinned to this machine's test server; everything else is refused.
  proxy = await startEgressProxy(async (host) => (host === 'pinned.example' ? '127.0.0.1' : null));
});
after(async () => { target.close(); await proxy.close(); });

const viaProxy = (url) => new Promise((resolve) => {
  const req = http.request({ host: '127.0.0.1', port: proxy.port, path: url, headers: { host: new URL(url).host } }, (res) => {
    let body = ''; res.on('data', (c) => { body += c; }); res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', (e) => resolve({ status: 0, body: e.message }));
  req.end();
});
const connect = (hostPort) => new Promise((resolve) => {
  const s = net.connect(proxy.port, '127.0.0.1', () => s.write(`CONNECT ${hostPort} HTTP/1.1\r\nHost: ${hostPort}\r\n\r\n`));
  let got = '';
  s.on('data', (c) => {
    got += c;
    if (/\r\n\r\n/.test(got) && !s.sentInner) {
      if (!/^HTTP\/1\.1 200/.test(got)) { s.destroy(); return resolve({ head: got, body: '' }); }
      s.sentInner = true; got = '';
      s.write(`GET /tunnel HTTP/1.1\r\nHost: ${hostPort}\r\nConnection: close\r\n\r\n`);
    }
  });
  s.on('end', () => resolve({ head: 'HTTP/1.1 200', body: got }));
  s.on('error', () => resolve({ head: 'error', body: '' }));
});

test('a refused host is answered 403 and the request never leaves', async () => {
  const before = hits.length;
  const r = await viaProxy(`http://localhost:${port}/secret`);
  assert.equal(r.status, 403);
  assert.equal(hits.length, before);
});

test('an allowed name is connected to the exact address the gate checked, never resolved again', async () => {
  // pinned.example does not exist in any resolver: reaching the server proves the checked address was used.
  const r = await viaProxy(`http://pinned.example:${port}/page`);
  assert.equal(r.status, 200);
  assert.equal(r.body, 'inside');
  assert.ok(hits.includes('pinned.example/page'));
});

test('tunnels (https, wss) are checked the same way: refused hosts get 403, allowed ones are pinned', async () => {
  const before = hits.length;
  assert.match((await connect(`192.168.1.1:${port}`)).head, /^HTTP\/1\.1 403/);
  assert.match((await connect(`localhost:${port}`)).head, /^HTTP\/1\.1 403/);
  assert.equal(hits.length, before);
  const ok = await connect(`pinned.example:${port}`);
  assert.match(ok.body, /inside/);
  assert.ok(hits.includes('pinned.example/tunnel'));
});

test('the gate is asked about every host it sees and says which it refused', async () => {
  await viaProxy(`http://refused.example:${port}/`);
  assert.ok(proxy.refused.has('refused.example'));
  assert.ok(proxy.refused.has('localhost'));
  assert.equal(proxy.refused.has('pinned.example'), false);
});
