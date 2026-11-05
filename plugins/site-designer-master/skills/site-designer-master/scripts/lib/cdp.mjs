// Drives a headless Chromium over its debugging protocol (Node's own WebSocket, no npm packages), for the jobs the
// command-line flags cannot do: open a live page at a true phone width (a headless window is never narrower than
// about 500px), run a script inside it (hide pop-ups, read its design), then photograph it.
// Every browser gets its own temporary profile, so the owner's open browser is never touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findChrome } from './chrome.mjs';
import { startEgressProxy } from './egress-proxy.mjs';

const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function portFile(profile, timeoutMs) {
  const f = path.join(profile, 'DevToolsActivePort');
  for (const end = Date.now() + timeoutMs; Date.now() < end; await wait(100)) {
    // While the browser is still writing the file, Windows can refuse to open it: try again next round.
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch { /* not there yet, or still locked */ }
    const [port, p] = text.split(/\r?\n/);
    if (port && p) return `ws://127.0.0.1:${port}${p}`;
  }
  throw new Error('The browser did not open its debugging port.');
}

// egress: for a page nobody vetted (a link the user brought). Every connection the browser makes then goes through
// a local gate (egress-proxy) that refuses this machine and its network and pins each name to the address it checked;
// the browser's own bypass for this machine is removed, and WebRTC and QUIC, which would not pass the gate, are off.
export async function openBrowser({ timeoutMs = 20000, egress } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('No Chrome or Edge was found. Install one, or set SITE_CHROME to its path.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sdm-cdp-'));
  const gate = egress ? await startEgressProxy(egress) : null;
  const guarded = gate ? [`--proxy-server=http://127.0.0.1:${gate.port}`, '--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-quic'] : [];
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--disable-extensions', '--mute-audio', ...guarded, '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const ws = new WebSocket(await portFile(profile, timeoutMs));
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('Could not reach the browser.')); });

  let next = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else for (const l of listeners) l(msg);
  };
  // Every request has a time limit, and a browser that goes away fails what is still waiting: a page that never
  // answers (a crashed tab, a script that never settles) costs one site, never the whole run.
  const send = (method, params = {}, sessionId, timeoutMs = 60000) => new Promise((resolve, reject) => {
    const id = ++next;
    const t = setTimeout(() => { pending.delete(id); reject(new Error(`the browser did not answer ${method} within ${Math.round(timeoutMs / 1000)}s`)); }, timeoutMs);
    pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  ws.onclose = () => { for (const { reject } of pending.values()) reject(new Error('the browser closed')); pending.clear(); };
  const once = (sessionId, method, ms) => new Promise((resolve) => {
    const l = (msg) => { if (msg.sessionId === sessionId && msg.method === method) { listeners.delete(l); clearTimeout(t); resolve(true); } };
    const t = setTimeout(() => { listeners.delete(l); resolve(false); }, ms);
    listeners.add(l);
  });

  // open(url): a fresh tab at an exact size. mobile: phone screen, touch and a phone user agent.
  // settleMs: time after the load event for late pictures and fonts.
  async function open(url, { width = 1440, height = 900, mobile = false, reducedMotion = false, loadMs = 30000, settleMs = 1500 } = {}) {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (method, params, timeoutMs) => send(method, params, sessionId, timeoutMs);
    await s('Page.enable');
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) {
      await s('Emulation.setUserAgentOverride', { userAgent: PHONE_UA });
      await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    if (reducedMotion) await s('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const loaded = once(sessionId, 'Page.loadEventFired', loadMs);
    const nav = await s('Page.navigate', { url });
    if (nav.errorText) throw new Error(`${url} did not open (${nav.errorText})`);
    await loaded;
    await wait(settleMs);
    return {
      // Runs one of our own fixed scripts inside the page (pop-up hiding, the design reading); never text a page supplied.
      async eval(expression, { timeoutMs = 30000 } = {}) {
        const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs).catch((e) => { throw new Error(`the page did not answer (${e.message})`); });
        if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
        return r.result.value;
      },
      async shot() {
        const r = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        return Buffer.from(r.data, 'base64');
      },
      async close() { await send('Target.closeTarget', { targetId }, undefined, 10000).catch(() => {}); },
    };
  }

  async function close() {
    await send('Browser.close', {}, undefined, 5000).catch(() => {});
    try { ws.close(); } catch { /* already closed */ }
    await new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(() => { proc.kill(); r(); }, 3000); } });
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* a locked temp profile is harmless */ }
    if (gate) await gate.close();
  }
  // refused: the hosts the gate turned away (empty without egress).
  return { open, close, refused: gate ? gate.refused : new Set() };
}
