// The only way out for a browser that opens a link the user brought. Every connection the browser makes (pages,
// frames, pop-ups, workers, WebSockets, https tunnels) comes here first; the gate decides by host and answers with
// the one address it checked, and the connection goes to exactly that address. A name is never resolved twice, so
// an answer that changes after the check (DNS rebinding) cannot send the browser somewhere else.
//   startEgressProxy(gate) -> { port, refused: Set<host>, close() }
//   gate(host) -> Promise<ip | null>   (null refuses)
import http from 'node:http';
import net from 'node:net';

export async function startEgressProxy(gate) {
  const refused = new Set();
  const decide = async (host) => {
    const ip = await Promise.resolve(gate(host.replace(/^\[|\]$/g, ''))).catch(() => null);
    if (!ip) refused.add(host);
    return ip;
  };
  const server = http.createServer(async (req, res) => {
    // Plain http through the proxy: the request line carries the full address.
    let u;
    try { u = new URL(req.url); } catch { res.writeHead(400); return res.end(); }
    if (u.protocol !== 'http:') { res.writeHead(403); return res.end(); }
    const ip = await decide(u.hostname);
    if (!ip) { res.writeHead(403, { 'content-type': 'text/plain' }); return res.end('refused: this machine or its network'); }
    const headers = { ...req.headers, host: u.host };
    delete headers['proxy-connection'];
    const out = http.request({ host: ip, port: u.port || 80, path: `${u.pathname}${u.search}`, method: req.method, headers, setHost: false }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    out.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(out);
  });
  // https and wss: a tunnel to host:port, opened only to the checked address.
  server.on('connect', async (req, socket, head) => {
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url || '');
    const ip = m ? await decide(m[1]) : null;
    if (!ip) { socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n'); return; }
    const up = net.connect(Number(m[2]), ip, () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket); socket.pipe(up);
    });
    const end = () => { up.destroy(); socket.destroy(); };
    up.on('error', end); socket.on('error', end);
  });
  // A plain-http WebSocket upgrade through the proxy is not passed on: it would skip the address check.
  server.on('upgrade', (req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    port: server.address().port,
    refused,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
