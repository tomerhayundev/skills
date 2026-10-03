#!/usr/bin/env node
import path from 'node:path';
import zlib from 'node:zlib';
import { createFetcher, isLocalHost } from './lib/fetch.mjs';
import { extract, hostKey, decodeEntities } from './lib/html.mjs';
import { parseRobots, isAllowed, policyForFetch, looksLikeHtml, NOT_CHECKED_REASONS, ROBOTS_MAX_REDIRECTS, ALLOW_ALL, DISALLOW_ALL } from './lib/robots.mjs';
import { robotsFetchFindings } from './lib/robots-findings.mjs';
import { finding, findingsMarkdown, parseArgs, isMain, writeJson, writeText } from './lib/report.mjs';

const HELP = `Usage: node crawl.mjs <url> [--max 200] [--out seo/crawl] [--sitemap <url>] [--delay 300] [--concurrency 2] [--ignore-robots]

Crawls a site as raw HTML (no JavaScript, the way most AI crawlers read it) from its sitemaps and
internal links, checks indexing signals, and writes crawl.json, pages.csv and findings.md to --out.
It names itself seo-geo-master, never Googlebot, and obeys robots.txt by default (the seo-geo-master
group, else the * group): a URL that robots.txt disallows is not fetched, and one ROBOTS_SKIPPED
finding lists them. If robots.txt cannot be read, nothing is fetched. --ignore-robots fetches those
URLs anyway, for example to look for noindex on blocked pages: use it only on your own site or one
you may audit. A redirect is checked at every hop: a hop into a disallowed URL is not followed. Only
the start origin's robots.txt is read, so other origins of the same site (www and the apex domain,
http and https, a CDN-hosted sitemap) are judged with the start origin's robots.txt rules.
Private or local hosts are reachable only when the start URL itself is local. A Crawl-delay line in
robots.txt is not read: the pace is set by --delay (milliseconds between requests, default 300) and
--concurrency.`;

const LIMIT_2MB = 2 * 1024 * 1024;
const OWN_AGENT = 'seo-geo-master'; // the crawler's name in robots.txt (the fetcher's User-Agent starts with it)
// What this tool could not do with a URL (it says nothing about the site): the fetcher's refusals plus a page it could not read.
const TOOL_SIDE = { ...NOT_CHECKED_REASONS, 'parse-failed': 'the page came back but this tool could not read its HTML' };
const CLI_OPTIONS = ['max', 'out', 'sitemap', 'delay', 'concurrency', 'ignore-robots', 'help'];
// The crawl holds untrusted input, so every collection has a ceiling.
const QUEUE_FACTOR = 20; // queued URLs: at most max * 20, so a faceted site cannot grow the queue without limit
const MAX_WORKERS = 20;
const MAX_LINKS_KEPT = 5000; // distinct links kept per page
const MAX_IMAGES_KEPT = 1000;
const MAX_TEXT_KEPT = 20000; // characters of page text kept (what crawl.json holds)
const PAIR_PAGES = 2000; // the duplicate-intent comparison is quadratic: it covers this many indexable pages
const MAX_PAIR_FINDINGS = 200;
const MAX_SITEMAP_URLS = 100000;
const MAX_UNZIPPED = 50 * 1024 * 1024;
const MAX_LISTED = 100; // URLs or errors listed as evidence in one place

const sleep = ms => new Promise(r => setTimeout(r, ms));
const short = (s, n = 80) => { const x = String(s); return x.length > n ? `${x.slice(0, n - 3)}...` : x; };
const STOP = new Set(['the', 'and', 'for', 'with', 'a', 'an', 'of', 'to', 'in', 'on', 'vs', 'versus', 'or', 'how', 'what', 'your', 'our', 'is', 'are', 'מה', 'של', 'את', 'על', 'עם', 'או', 'איך', 'מול', 'לעומת']);

// The caller's own mistake (a bad start URL or a bad number). It is a TypeError for callers that
// already catch that; the CLI reports it and exits 1, and anything else thrown is a bug.
export class InputError extends TypeError {
  constructor(message) { super(message); this.name = 'InputError'; }
}

export function normalizeUrl(u) {
  const x = new URL(u);
  x.hash = '';
  return x.href;
}

function tokens(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w)));
}

// Jaccard similarity of two token sets is at least 0.8. A size ratio below 0.8 rules it out
// without counting, which keeps the pairwise loop cheap.
function near(a, b) {
  if (!a.size || !b.size) return false;
  const small = Math.min(a.size, b.size);
  const big = Math.max(a.size, b.size);
  if (small / big < 0.8) return false;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter) >= 0.8;
}

// Directives that are not a crawler name, so "unavailable_after: ..." is not read as one.
const DIRECTIVES = new Set(['all', 'noindex', 'nofollow', 'none', 'noarchive', 'nosnippet', 'notranslate', 'noimageindex', 'indexifembedded', 'unavailable_after', 'max-snippet', 'max-image-preview', 'max-video-preview', 'noai', 'noimageai']);

// "noindex" or "bingbot: noindex, googlebot: nofollow, noarchive": a "name:" that is not a directive
// starts the rules for that crawler, which run until the next one. Only rules for everyone
// (no name) and for googlebot count.
function headerDirectives(value) {
  const out = [];
  let scope = null;
  for (const raw of String(value || '').toLowerCase().split(',')) {
    let d = raw.trim();
    const m = /^([a-z0-9_-]+)\s*:\s*(.*)$/.exec(d);
    if (m && !DIRECTIVES.has(m[1])) { scope = m[1]; d = m[2].trim(); }
    if (d && (scope === null || scope === 'googlebot')) out.push(d);
  }
  return out;
}

function directives(p) {
  return [...(p.facts?.metaRobots || []), ...headerDirectives(p.xRobots)];
}

export const isNoindex = p => directives(p).some(d => d === 'noindex' || d === 'none');

// <loc> values in document order without a backtracking pattern: a closer is looked for forward
// only, and when none follows an opener none follows a later one, so a hostile file costs one pass.
function* locValues(xml) {
  const open = /<loc>/gi;
  const close = /<\/loc\s*>/gi;
  let m;
  while ((m = open.exec(xml))) {
    close.lastIndex = open.lastIndex;
    const c = close.exec(xml);
    if (!c) return;
    const raw = xml.slice(open.lastIndex, c.index).trim();
    yield raw.startsWith('<![CDATA[') && raw.endsWith(']]>') ? raw.slice(9, -3).trim() : decodeEntities(raw);
    open.lastIndex = close.lastIndex;
  }
}

// allow(url) is false for a sitemap file the crawler may not fetch (robots.txt): it is listed in `skipped`, not
// requested. It is also the fetcher's per-hop hook, so a sitemap URL that redirects to a file robots.txt blocks
// stops at that hop: `skipped` then holds the refused URL and `skippedRedirects` says which sitemap led there.
export async function loadSitemaps(fetcher, urls, limit = 50, maxUrls = MAX_SITEMAP_URLS, allow = null) {
  const pageUrls = new Set();
  const read = [];
  const errors = [];
  const truncated = [];
  const skipped = [];
  const skippedRedirects = [];
  let capped = false;
  const addError = e => { if (errors.length < MAX_LISTED) errors.push(e); };
  const queue = [...urls];
  const seen = new Set();
  for (let head = 0; head < queue.length && seen.size < limit && !capped; head++) {
    const sm = queue[head];
    if (seen.has(sm)) continue;
    seen.add(sm);
    if (allow && !allow(sm)) { skipped.push(sm); continue; }
    const r = await fetcher.get(sm, allow ? { allow } : undefined);
    if (r.error === 'robots-disallowed') { skipped.push(r.finalUrl); skippedRedirects.push({ url: sm, blocked: r.finalUrl }); continue; }
    // retried says whether the fetcher's one retry happened (it is skipped when Retry-After is long or unreadable).
    if (r.error || r.status !== 200) { addError({ url: sm, status: r.status, error: r.error, ...(r.retried === undefined ? {} : { retried: r.retried }) }); continue; }
    let xml = r.body;
    // A .xml.gz file served as a file (not as Content-Encoding): the output size is bounded, so a small
    // file cannot be a decompression bomb.
    if (r.buffer && r.buffer[0] === 0x1f && r.buffer[1] === 0x8b) {
      try { xml = zlib.gunzipSync(r.buffer, { maxOutputLength: MAX_UNZIPPED }).toString('utf8'); } catch { addError({ url: sm, error: 'gunzip-failed' }); continue; }
    }
    if (!/<(?:urlset|sitemapindex)\b/i.test(xml)) { addError({ url: sm, status: r.status, error: 'not-a-sitemap' }); continue; }
    read.push(sm);
    if (r.truncated) truncated.push(sm);
    const base = r.finalUrl || sm;
    const index = /<sitemapindex\b/i.test(xml);
    for (const l of locValues(xml)) {
      if (!l) continue;
      let u;
      try { u = new URL(l, base); } catch { addError({ url: l.slice(0, 200), error: 'invalid-url' }); continue; }
      if (index) { if (queue.length < limit * 4) queue.push(u.href); continue; }
      if (pageUrls.size >= maxUrls) { capped = true; break; }
      pageUrls.add(normalizeUrl(u.href));
    }
  }
  return { pageUrls: [...pageUrls], read, errors, truncated, skipped, skippedRedirects, capped };
}

// What a page keeps in memory is bounded, so a page of 200,000 links or images cannot fill it:
// distinct links (linksTruncated says when some were left out), the first images (the count of those
// without alt is kept), and the first part of the text (textTruncated says when some was left out; the
// word count was taken from all of it). The facts that extract() read from the whole page stay as they
// are, such as starSignal (stars in an aria-label, title, alt, class, id or itemprop, which a crawl keeps no other trace of).
function boundFacts(facts) {
  const seen = new Set();
  const kept = [];
  for (const l of facts.links) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    if (kept.length >= MAX_LINKS_KEPT) { facts.linksTruncated = true; break; }
    kept.push(l);
  }
  facts.links = kept;
  facts.imagesMissingAlt = facts.images.filter(i => i.alt === null).length;
  if (facts.images.length > MAX_IMAGES_KEPT) { facts.imagesTotal = facts.images.length; facts.images = facts.images.slice(0, MAX_IMAGES_KEPT); }
  trimText(facts);
}

// Keeps the first part of the text and says when the rest was left out (textTruncated), so a check that
// looks for a value in this text can tell "not on the page" from "not in the part that was kept".
function trimText(facts) {
  if (facts.text.length > MAX_TEXT_KEPT) { facts.text = facts.text.slice(0, MAX_TEXT_KEPT); facts.textTruncated = true; }
}

function siteStart(start) {
  let u;
  try { u = new URL(String(start).trim()); } catch { throw new InputError(`not a site URL: "${start}" (write it in full, such as https://example.com)`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new InputError(`not an http(s) site URL: "${start}"`);
  u.hash = '';
  return u;
}

export async function crawlSite({ start, max = 200, sitemap = null, fetcher = null, delayMs = 300, concurrency = 2, ignoreRobots = false }) {
  if (!Number.isInteger(max) || max < 1) throw new InputError(`max must be a whole number of pages, 1 or more (got ${String(max)})`);
  const startU = siteStart(start);
  const startUrl = startU.href;
  const { origin, hostname } = startU;
  const allowLocalOrigin = isLocalHost(hostname) ? origin : null;
  const workers = Math.min(MAX_WORKERS, Math.max(1, Math.floor(Number(concurrency)) || 1));
  const pageFetcher = fetcher ?? createFetcher({ delayMs, concurrency: workers, allowLocalOrigin });
  // Google follows 5 redirects for robots.txt, pages and sitemaps get the fetcher's default.
  const robotsFetcher = fetcher ?? createFetcher({ delayMs, concurrency: 1, maxRedirects: ROBOTS_MAX_REDIRECTS, allowLocalOrigin });

  const robotsUrl = `${origin}/robots.txt`;
  let rr = await robotsFetcher.get(robotsUrl);
  // A fetcher that was handed in may follow more hops than Google does.
  if (!rr.error && rr.chain && rr.chain.length > ROBOTS_MAX_REDIRECTS) rr = { ...rr, error: 'too-many-redirects' };
  const policy = policyForFetch(rr);
  const robots = policy === 'parse' ? parseRobots(rr.body) : policy === 'disallow-all' ? DISALLOW_ALL : ALLOW_ALL;
  const contentType = rr.headers?.['content-type'] ?? null;
  const robotsInfo = {
    url: robotsUrl, status: rr.status, error: rr.error, hops: rr.chain?.length ?? 0, policy, obeyed: !ignoreRobots, sitemaps: robots.sitemaps, contentType,
    isHtml: policy === 'parse' && looksLikeHtml(contentType, rr.body),
    rulesRead: robots.groups.some(g => g.rules.length) || robots.sitemaps.length > 0,
  };
  const robotsSitemaps = [];
  for (const s of robots.sitemaps) { try { robotsSitemaps.push(new URL(s, origin).href); } catch { /* an unreadable Sitemap line is ignored */ } }
  // What this crawler may fetch: its own group in robots.txt, else the * group (what Googlebot may do is
  // googlebotAllowed, a separate question). A robots.txt that could not be read allows nothing, like
  // Google's treatment of one that is down; --ignore-robots lifts all of it, for an owner's audit.
  const ownRules = policy === 'parse' ? robots : policy === 'allow-all' ? ALLOW_ALL : DISALLOW_ALL;
  const mayFetch = url => {
    if (ignoreRobots) return true;
    try { return isAllowed(ownRules, [OWN_AGENT], url).allowed; } catch { return true; } // an unparseable URL fails in the fetcher, with its own error
  };
  // The whole site is blocked when the root and an arbitrary deep path both are (Disallow: /).
  robotsInfo.rootBlocked = policy === 'parse' && !isAllowed(ownRules, [OWN_AGENT], '/').allowed && !isAllowed(ownRules, [OWN_AGENT], '/seo-geo-master-probe/page').allowed;
  // With --ignore-robots no judgement is passed on, neither for the first URL of a request nor for its redirect hops.
  const allow = ignoreRobots ? null : mayFetch;
  const fetchPage = url => (allow ? pageFetcher.get(url, { allow }) : pageFetcher.get(url));
  const smList = [...new Set([...(sitemap ? [sitemap] : []), ...robotsSitemaps, `${origin}/sitemap.xml`])];
  const sm = await loadSitemaps(pageFetcher, smList, 50, MAX_SITEMAP_URLS, allow);
  const inSitemap = new Set(sm.pageUrls);

  // robots.txt only governs its own origin: for another one (www, http) nothing is known.
  const allowedFor = url => {
    if (policy === 'not-checked') return null;
    try { if (new URL(url).origin !== origin) return null; } catch { return null; }
    return isAllowed(robots, ['googlebot'], url).allowed;
  };
  const site = hostKey(startUrl);
  const onSite = href => {
    try { const u = new URL(href); return (u.protocol === 'http:' || u.protocol === 'https:') && hostKey(href) === site; } catch { return false; }
  };
  const queueLimit = max * QUEUE_FACTOR;
  const queue = [startUrl];
  const queued = new Set(queue);
  let head = 0;
  let queueCapped = false;
  const enqueue = href => {
    if (queueCapped || queued.has(href) || !onSite(href)) return;
    if (queued.size >= queueLimit) { queueCapped = true; return; }
    queued.add(href);
    queue.push(href);
  };
  sm.pageUrls.forEach(enqueue);

  const pages = new Map();
  let inFlight = 0;
  let fetched = 0; // pages that were requested: the cap counts these, not the URLs that robots.txt kept us from
  let skipped = 0;
  let capped = false;

  async function worker() {
    for (;;) {
      // A URL robots.txt disallows is recorded without a request.
      while (head < queue.length && !mayFetch(queue[head])) {
        const url = queue[head++];
        pages.set(url, { url, inSitemap: inSitemap.has(url), status: null, finalUrl: null, chain: [], error: null, bytes: 0, truncated: false, timeMs: null, contentType: null, xRobots: '', googlebotAllowed: allowedFor(url), skipped: 'robots' });
        skipped++;
      }
      if (head >= queue.length) { if (inFlight === 0) return; await sleep(10); continue; }
      if (fetched >= max) { capped = true; return; }
      const url = queue[head++];
      fetched++;
      inFlight++;
      try {
        const rec = { url, inSitemap: inSitemap.has(url) };
        pages.set(url, rec);
        const r = await fetchPage(url);
        const type = r.headers?.['content-type'] || null;
        // A redirect hop into a URL robots.txt disallows: the URL itself was requested, the target was not.
        const blockedHop = r.error === 'robots-disallowed';
        Object.assign(rec, {
          status: r.status, finalUrl: r.finalUrl, chain: r.chain || [], error: blockedHop ? null : r.error, bytes: r.bytes, truncated: Boolean(r.truncated), timeMs: r.timeMs,
          contentType: type,
          xRobots: String(r.headers?.['x-robots-tag'] || '').toLowerCase(),
          googlebotAllowed: allowedFor(url),
          ...(r.chain?.length ? { finalGooglebotAllowed: allowedFor(r.finalUrl) } : {}),
          ...(r.retried === undefined ? {} : { retried: r.retried }),
          ...(blockedHop ? { skipped: 'robots' } : {}),
        });
        if (blockedHop) { skipped++; continue; }
        // A page that redirected off the site is recorded, not read: its links are not this site's.
        if (!r.error && r.status === 200 && /html/i.test(type || '') && onSite(r.finalUrl)) {
          // One page that cannot be read is recorded, not allowed to reject the crawl.
          try {
            const facts = extract(r.body, r.finalUrl);
            for (const l of facts.links) if (l.internal) enqueue(l.href);
            for (const c of facts.canonicals) enqueue(c);
            for (const h of facts.hreflang) if (h.href) enqueue(h.href);
            boundFacts(facts);
            rec.facts = facts;
          } catch { rec.error = 'parse-failed'; }
        }
      } finally {
        inFlight--;
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  if (head < queue.length) capped = true;
  const list = [...pages.values()];
  const findings = analyze({ pages: list, robotsInfo, sitemapInfo: sm, capped, startUrl, queueCapped });
  return {
    meta: { start: startUrl, date: new Date().toISOString().slice(0, 10), max, capped, pagesCrawled: fetched, skipped, robots: ignoreRobots ? 'ignored' : 'obeyed', sitemapUrls: sm.pageUrls.length, queued: queued.size, queueCapped },
    robots: robotsInfo, sitemap: sm, pages: list, findings,
  };
}

export function analyze({ pages, robotsInfo, sitemapInfo, capped = false, startUrl, queueCapped = false }) {
  const F = [];
  const ri = robotsInfo;
  const byUrl = new Map();
  for (const p of pages) byUrl.set(p.url, p);
  // A URL with no record of its own is known through a redirect that reached it (as the page it ended at,
  // not as a redirect: it has no hops of its own). A redirect that never arrived says nothing about it.
  for (const p of pages) {
    if (!p.finalUrl || p.finalUrl === p.url || p.error || typeof p.status !== 'number' || byUrl.has(p.finalUrl)) continue;
    byUrl.set(p.finalUrl, { ...p, url: p.finalUrl, chain: [], inSitemap: false });
  }
  // A redirect and its target hold the same HTML: judge it once, on the record for the final URL.
  const rep = new Map();
  for (const p of pages) {
    if (!p.facts) continue;
    const cur = rep.get(p.finalUrl);
    if (!cur || (p.url === p.finalUrl && cur.url !== cur.finalUrl)) rep.set(p.finalUrl, p);
  }
  const html = [...rep.values()];
  const inbound = new Map();
  for (const p of html) {
    const targets = new Set(p.facts.links.filter(l => l.internal).map(l => l.href));
    for (const t of targets) {
      if (t === p.url || t === p.finalUrl) continue;
      if (!inbound.has(t)) inbound.set(t, new Set());
      inbound.get(t).add(p.url);
    }
  }
  // A link to a redirect is a link to the page it ends at: that page's inlinks are the pages linking to
  // any URL that ends there, not counting the page itself.
  const ends = new Map();
  for (const p of pages) {
    const key = p.finalUrl || p.url;
    if (!ends.has(key)) ends.set(key, new Set([key]));
    ends.get(key).add(p.url);
  }
  const inlinkSources = p => {
    if (p.chain?.length) return new Set(inbound.get(p.url) || []);
    const own = ends.get(p.finalUrl || p.url) || new Set([p.url]);
    const out = new Set();
    for (const u of own) for (const src of inbound.get(u) || []) if (!own.has(src)) out.add(src);
    return out;
  };
  for (const p of pages) p.inlinks = inlinkSources(p).size;

  // What this tool could not do (a private address, an unreadable encoding) says nothing about the site.
  const toolSide = p => Boolean(p.error) && Object.hasOwn(TOOL_SIDE, p.error);
  // The server answered 429 or 503 (throttling or an outage; after the fetcher's one retry when it made one): the URL could not be judged.
  const rateLimited = p => !p.error && (p.status === 429 || p.status === 503);
  // Not judged either way: what happens to a link or canonical that points there is unknown.
  const unjudged = p => toolSide(p) || rateLimited(p) || isSkipped(p);
  const isSkipped = p => p.skipped === 'robots';
  // A redirect from an allowed URL whose next hop robots.txt refuses: the URL was requested, the target was not.
  const redirectBlocked = p => isSkipped(p) && (p.chain?.length || 0) > 0;
  // The URL a redirect ends at is one robots.txt blocks: refused for this crawler, or (with --ignore-robots it was
  // fetched anyway) blocked for Googlebot. Advice to link to or list that URL would be wrong.
  const leadsToBlocked = p => redirectBlocked(p) || (ri.policy === 'parse' && Boolean(p.chain?.length) && p.finalGooglebotAllowed === false);
  const isLoop = p => p.error === 'redirect-loop' || p.error === 'too-many-redirects';
  const describe = t => (t.error ? `fails (${t.error})` : t.status !== 200 ? `returns HTTP ${t.status}${t.chain?.length ? ' after redirects' : ''}` : `redirects to ${t.finalUrl}`);
  // Without a readable robots.txt every URL is "blocked" for one reason, which ROBOTS_UNAVAILABLE states.
  const blockedByRobots = p => ri.policy === 'parse' && p.googlebotAllowed === false;

  const notCheckedNote = ri.obeyed === false
    ? 'The robots.txt checks on URLs were skipped (googlebotAllowed is null for every URL in this crawl).'
    : 'Nothing was fetched, because this crawl obeys robots.txt and cannot tell what it allows; re-run with --ignore-robots to crawl anyway (the robots.txt checks on URLs are then skipped).';
  F.push(...robotsFetchFindings({ url: ri.url, policy: ri.policy, status: ri.status, error: ri.error, hops: ri.hops, contentType: ri.contentType, isHtml: ri.isHtml, rulesRead: ri.rulesRead, notCheckedNote, rulesPhrase: 'its rules were read' }));
  const htmlNoRules = Boolean(ri.isHtml) && !ri.rulesRead;
  if (ri.policy === 'parse' && !htmlNoRules && !(ri.sitemaps || []).length) F.push(finding('ROBOTS_NO_SITEMAP_LINE', 'info', 'D', 'robots.txt has no Sitemap line (optional; it helps every crawler find the sitemap)', { urls: [ri.url] }));

  const sitemapsSkipped = sitemapInfo.skipped || [];
  // A sitemap file that answered 429 or 503 is throttled or down, not missing.
  const smLimited = (sitemapInfo.errors || []).filter(e => !e.error && (e.status === 429 || e.status === 503));
  // A sitemap that was not fetched is not a missing one.
  if (!sitemapInfo.pageUrls.length && !sitemapsSkipped.length && !smLimited.length) F.push(finding('NO_SITEMAP', 'medium', 'D', (sitemapInfo.read || []).length ? 'The sitemap was read but lists no page URLs' : 'No readable XML sitemap was found (checked robots.txt Sitemap lines and /sitemap.xml)', { urls: (sitemapInfo.errors || []).map(e => e.url) }));
  if (sitemapInfo.truncated?.length) F.push(finding('CRAWL_LIMIT', 'info', 'D', 'A sitemap is larger than the 5 MB this tool reads: only its first part was used', { limit: 'sitemap', urls: sitemapInfo.truncated }));
  if (sitemapInfo.capped) F.push(finding('CRAWL_LIMIT', 'info', 'D', `The sitemaps list more than ${MAX_SITEMAP_URLS} URLs: only the first ${MAX_SITEMAP_URLS} were read`, { limit: 'sitemap', urls: [] }));
  if (queueCapped) F.push(finding('CRAWL_LIMIT', 'info', 'D', 'More internal URLs were found than this crawl queues (20 times the page cap, which a faceted or endless URL space can exceed), so some were not visited. Raise --max, or check whether filter or session parameters create endless URLs', { limit: 'queue', urls: [] }));

  const skippedPages = pages.filter(isSkipped);
  const nSkipped = skippedPages.length + sitemapsSkipped.length;
  // The URLs that were reached by a redirect from an allowed URL: the hop was refused, so the target was never requested.
  const viaRedirect = [...skippedPages.filter(redirectBlocked).map(p => ({ url: p.url, blocked: p.finalUrl })), ...(sitemapInfo.skippedRedirects || [])];
  if (nSkipped) {
    const why = ri.policy === 'parse'
      ? `because robots.txt disallows ${nSkipped === 1 ? 'it' : 'them'} for seo-geo-master (this crawl obeys robots.txt)`
      : `because robots.txt ${ri.policy === 'not-checked' ? 'could not be checked' : 'could not be read'}, which this crawl treats as "disallow all"`;
    const k = viaRedirect.length;
    const via = !k ? '' : k === nSkipped
      ? ` ${nSkipped === 1 ? 'It is the target' : 'They are targets'} of a redirect from an allowed URL, and the redirect was not followed.`
      : ` ${k} of them ${k === 1 ? 'is the target of a redirect' : 'are targets of redirects'} from an allowed URL (the redirect was not followed).`;
    const blockedUrls = [...skippedPages.map(p => (redirectBlocked(p) ? p.finalUrl : p.url)), ...sitemapsSkipped];
    F.push(finding('ROBOTS_SKIPPED', 'info', 'D', `${nSkipped} URL${nSkipped === 1 ? ' was' : 's were'} not fetched ${why}.${via} If this is your own site, re-run with --ignore-robots to check ${nSkipped === 1 ? 'it' : 'them'}, for example for a noindex on a page that robots.txt blocks (Google never sees a noindex on a page it may not fetch)`, { urls: blockedUrls.slice(0, MAX_LISTED), count: nSkipped, pages: skippedPages.length, sitemaps: sitemapsSkipped.length, redirects: viaRedirect.slice(0, MAX_LISTED) }));
  }

  // A crawl whose start page robots.txt blocks audited nothing it was asked to: that must not read as a clean result.
  const startRec = pages.find(p => p.url === startUrl);
  if (ri.policy === 'parse' && startRec && isSkipped(startRec)) {
    const viaHop = redirectBlocked(startRec);
    const googlebot = viaHop ? startRec.finalGooglebotAllowed : startRec.googlebotAllowed;
    const what = viaHop
      ? `The start page ${startUrl} redirects to ${startRec.finalUrl}, a URL robots.txt blocks for seo-geo-master, so the crawl stopped there: the page was not fetched and its links were not followed.`
      : ri.rootBlocked
        ? 'robots.txt disallows the whole site for seo-geo-master (its rules block the root path), so no page was fetched and this crawl audited nothing.'
        : `robots.txt disallows the start page ${startUrl} for seo-geo-master, so it was not fetched and its links were not followed; only what the sitemaps list and other allowed pages link to could be checked.`;
    const who = googlebot === false
      ? 'Googlebot is blocked too, so Google cannot crawl it either.'
      : googlebot === true
        ? 'Googlebot is not blocked: robots.txt treats this crawler differently from Googlebot.'
        : 'Whether Googlebot is blocked too could not be determined.';
    F.push(finding('SITE_BLOCKED_BY_ROBOTS', googlebot === false ? 'critical' : 'high', 'D', `${what} ${who} If this is your own site and you want the audit anyway, re-run with --ignore-robots.`, { urls: [startUrl], finalUrl: startRec.finalUrl ?? null, googlebotAllowed: googlebot ?? null }));
  }

  const unchecked = pages.filter(toolSide);
  if (unchecked.length) {
    const reasons = {};
    for (const p of unchecked) reasons[p.error] = (reasons[p.error] || 0) + 1;
    F.push(finding('URL_NOT_CHECKED', 'info', 'D', `${unchecked.length} URL${unchecked.length === 1 ? ' was' : 's were'} not checked because this tool refuses or cannot read ${unchecked.length === 1 ? 'it' : 'them'} (${Object.keys(reasons).join(', ')}); that is a limit of this check, not a finding about the site`, { urls: unchecked.slice(0, MAX_LISTED).map(p => p.url), reasons }));
  }

  // 429 and 503 are throttling or an outage: this tool cannot tell which, so it says both. "After one retry" is said only
  // for answers that really came after one (the fetcher skips the retry when Retry-After is above 30 s or unreadable).
  const limited = pages.filter(rateLimited);
  const requested = pages.filter(p => !isSkipped(p));
  if (limited.length || smLimited.length) {
    const statuses = {};
    for (const x of [...limited, ...smLimited]) statuses[x.status] = (statuses[x.status] || 0) + 1;
    const total = limited.length + smLimited.length;
    const what = [limited.length && `${limited.length} URL${limited.length === 1 ? '' : 's'}`, smLimited.length && `${smLimited.length} sitemap file${smLimited.length === 1 ? '' : 's'}`].filter(Boolean).join(' and ');
    const flags = [...limited, ...smLimited].map(x => x.retried);
    const retriedN = flags.filter(v => v === true).length;
    const waitN = flags.filter(v => v === false).length;
    const when = retriedN && waitN
      ? `: ${retriedN} even after one retry, ${waitN} with a request to wait longer than the crawler waits (not retried)`
      : retriedN ? ' even after one retry'
        : waitN ? ', and the server asked to wait longer than the crawler waits, so the crawler did not retry' : '';
    F.push(finding('RATE_LIMITED', 'medium', 'D', `${what} answered HTTP 429/503 (throttling or an outage)${when}, so ${total === 1 ? 'it was' : 'they were'} not checked${smLimited.length ? ' (a sitemap file that is not read lists no URLs here)' : ''}: this is not a broken link. If the server is throttling, re-run with a higher --delay or a lower --concurrency; if it is down, try again later`, { urls: limited.slice(0, MAX_LISTED).map(p => p.url), count: limited.length, statuses, sitemaps: smLimited.map(e => e.url), retried: retriedN, notRetried: waitN }));
  }
  // The start page, or at least half of the pages, answering 429/503 is more than throttling one URL: the site may be down
  // or turning this crawler away, and everything below this point is about the few pages that did answer.
  const startLimited = Boolean(startRec) && rateLimited(startRec);
  if (limited.length && (startLimited || limited.length * 2 >= requested.length)) {
    const most = limited.length * 2 >= requested.length;
    const scope = most
      ? (requested.length === 1 ? 'the start page' : `most pages (${limited.length} of ${requested.length} fetched)`)
      : (limited.length === 1 ? 'the start page' : `the start page and ${limited.length - 1} other pages`);
    F.push(finding('SITE_UNAVAILABLE', 'high', 'D', `The site answered HTTP 429/503 for ${scope}: it may be down or blocking the crawler, and nothing about those pages could be judged (their content, links and canonicals were not read). Try again later or with a higher --delay and a lower --concurrency; if the site turns crawlers away, ask its owner to allow seo-geo-master`, { urls: limited.slice(0, MAX_LISTED).map(p => p.url), count: limited.length, fetched: requested.length }));
  }

  // A start page that does not answer 200 (or at all) leaves every later check running on what is left: say so
  // first. Disjoint from the findings above: a page robots.txt blocked is SITE_BLOCKED_BY_ROBOTS, one that answered
  // 429 or 503 is SITE_UNAVAILABLE (with RATE_LIMITED), and one this tool refused or could not read is URL_NOT_CHECKED.
  if (startRec && !unjudged(startRec) && (startRec.error || startRec.status !== 200)) {
    const to = startRec.chain?.length && startRec.finalUrl ? `redirects to ${startRec.finalUrl}, which ` : '';
    const got = startRec.error ? `could not be fetched (${startRec.error})` : `${to}returns HTTP ${startRec.status}, not 200`;
    const hint = [401, 403].includes(startRec.status) ? ' A 401 or 403 can be a login wall or a firewall that turns crawlers away.' : '';
    F.push(finding('START_PAGE_NOT_200', 'high', 'D', `The start page ${startUrl} ${got}: its links were not followed, so only URLs that the sitemaps list (if any) were checked, and the orphan checks were skipped because they need the start page's links. Check that the start URL is the page you meant and that it is live.${hint}`, { urls: [startUrl], status: startRec.status ?? null, error: startRec.error ?? null, finalUrl: startRec.finalUrl ?? null }));
  }

  for (const p of pages.filter(x => x.inSitemap)) {
    // Not fetched, so no status to judge: only the rule match (what Googlebot would do) is known.
    if (isSkipped(p)) {
      if (blockedByRobots(p)) F.push(finding('SITEMAP_URL_BLOCKED', 'high', 'D', 'Sitemap lists a URL that robots.txt blocks for Googlebot', { urls: [p.url] }));
      // The sitemap URL is allowed, the page it redirects to is not: never "list the final URL instead".
      if (redirectBlocked(p)) F.push(finding('SITEMAP_URL_REDIRECTS', 'medium', 'D', `Sitemap lists a redirecting URL, and the redirect leads to a URL robots.txt blocks (${p.finalUrl}), which this crawl did not fetch; remove the URL from the sitemap or fix the redirect`, { urls: [p.url], finalUrl: p.finalUrl }));
      continue;
    }
    if (toolSide(p) || isLoop(p) || rateLimited(p)) continue;
    if (p.error) F.push(finding('SITEMAP_URL_ERROR', 'high', 'D', `Sitemap URL could not be fetched (${p.error})`, { urls: [p.url] }));
    // A redirect is only worth "list the final URL" when the final URL is a page: one that ends in an error is an error.
    else if (p.chain?.length && p.status !== 200) F.push(finding('SITEMAP_URL_NOT_200', 'high', 'D', `Sitemap lists a URL that redirects to ${p.finalUrl}, which returns HTTP ${p.status}; remove it or fix the redirect`, { urls: [p.url], finalUrl: p.finalUrl }));
    else if (p.chain?.length) F.push(finding('SITEMAP_URL_REDIRECTS', 'medium', 'D', leadsToBlocked(p)
      ? `Sitemap lists a redirecting URL, and the redirect leads to a URL robots.txt blocks (${p.finalUrl}); remove the URL from the sitemap or fix the redirect`
      : `Sitemap lists a redirecting URL; list the final URL ${p.finalUrl} instead`, { urls: [p.url], ...(leadsToBlocked(p) ? { finalUrl: p.finalUrl } : {}) }));
    else if (p.status !== 200) F.push(finding('SITEMAP_URL_NOT_200', 'high', 'D', `Sitemap lists a URL that returns HTTP ${p.status}`, { urls: [p.url] }));
    else if (isNoindex(p)) F.push(finding('SITEMAP_URL_NOINDEX', 'high', 'D', 'Sitemap lists a page marked noindex: either the page should be indexed (remove noindex) or it should leave the sitemap', { urls: [p.url], inlinks: p.inlinks }));
    else if (blockedByRobots(p)) F.push(finding('SITEMAP_URL_BLOCKED', 'high', 'D', 'Sitemap lists a URL that robots.txt blocks for Googlebot', { urls: [p.url] }));
    else if (p.facts?.canonical && p.facts.canonical !== p.finalUrl) F.push(finding('SITEMAP_URL_NOT_CANONICAL', 'medium', 'D', `Sitemap lists a page whose canonical points to ${p.facts.canonical}`, { urls: [p.url] }));
  }

  for (const p of pages) {
    if (p.chain && p.chain.length >= 2) F.push(finding('REDIRECT_CHAIN', 'medium', 'D', leadsToBlocked(p)
      ? `${p.chain.length} redirect hops lead to ${p.finalUrl}, a URL robots.txt blocks; shorten the chain, and check that the destination is meant to be blocked`
      : `${p.chain.length} redirect hops before ${p.finalUrl}; point links and redirects straight to the final URL`, { urls: [p.url], hops: p.chain, linkedFrom: [...(inbound.get(p.url) || [])] }));
    if (isLoop(p)) F.push(finding('REDIRECT_LOOP', 'high', 'D', `Redirects never reach a page (${p.error})${p.inSitemap ? ', and the sitemap lists this URL' : ''}`, { urls: [p.url] }));
    const sources = [...(inbound.get(p.url) || [])];
    if (!sources.length) continue;
    // Linking to the redirect is not the fault here; linking to where it leads is not advice either, robots.txt blocks it.
    if (redirectBlocked(p)) {
      if (p.chain.length === 1) F.push(finding('LINK_TO_REDIRECT', 'low', 'D', `Internal links point to a redirect, and the redirect leads to a URL robots.txt blocks (${p.finalUrl}), which this crawl did not fetch; check that the destination is meant to be blocked`, { urls: sources, target: p.url }));
      continue;
    }
    if (isSkipped(p) || rateLimited(p)) continue;
    const broken = (typeof p.status === 'number' && p.status >= 400) || (p.error && !isLoop(p) && !toolSide(p));
    if (broken) F.push(finding('BROKEN_INTERNAL_LINK', 'high', 'D', `Internal links point to ${p.url}, which ${describe(p)}`, { urls: sources, target: p.url }));
    else if (p.chain && p.chain.length === 1 && !p.error) F.push(finding('LINK_TO_REDIRECT', 'low', 'D', leadsToBlocked(p)
      ? `Internal links point to a redirect, and the redirect leads to a URL robots.txt blocks (${p.finalUrl}); check that the destination is meant to be blocked`
      : `Internal links point to a redirect; link to ${p.finalUrl} directly`, { urls: sources, target: p.url }));
  }

  const conflictsSeen = new Set(); // pages that name each other as canonical are reported once, not once per page
  for (const p of html) {
    const f = p.facts;
    if (new Set(f.canonicals).size > 1) F.push(finding('CANONICAL_MULTIPLE', 'high', 'D', 'More than one different canonical tag; Google may ignore all of them', { urls: [p.url], canonicals: f.canonicals }));
    const c = f.canonical;
    if (c && c !== p.finalUrl) {
      const target = byUrl.get(c);
      if (target && !unjudged(target) && (target.error || target.status !== 200 || target.chain?.length)) F.push(finding('CANONICAL_TARGET_NOT_200', 'high', 'D', `Canonical points to ${c}, which ${describe(target)}`, { urls: [p.url] }));
      else if (target && !unjudged(target) && target.facts?.canonical === p.finalUrl) {
        // A names B and B names A: one conflict for the pair, not a "points elsewhere" for each page.
        const key = [p.finalUrl, target.finalUrl].sort().join('\n');
        if (!conflictsSeen.has(key)) {
          conflictsSeen.add(key);
          F.push(finding('CANONICAL_CONFLICT', 'medium', 'D', `These two pages name each other as canonical (${p.finalUrl} and ${c}): each says the other is the real one, so Google gets contradictory signals and will choose a URL itself. Pick one, point both canonicals at it, and keep a self-referencing canonical on that page`, { urls: [p.url, target.url], canonicals: [c, p.finalUrl] }));
        }
      } else {
        F.push(finding('CANONICAL_POINTS_ELSEWHERE', p.inSitemap ? 'high' : 'medium', 'D', `Canonical points to a different URL (${c}); Google will usually index that one instead. Confirm it is intended`, { urls: [p.url], canonical: c }));
        // The target is a page of its own that names yet another URL (not this page, not itself).
        const then = target && !unjudged(target) ? target.facts?.canonical : null;
        if (then && then !== c && then !== target.finalUrl && then !== p.finalUrl) F.push(finding('CANONICAL_CHAIN', 'medium', 'D', `Canonical chain: this page's canonical is ${c}, and that page's own canonical is ${then}. Google may ignore the chain and choose a URL itself; point this page's canonical straight at ${then}, or make ${c} its own canonical`, { urls: [p.url], canonical: c, then }));
      }
      if (isNoindex(p)) F.push(finding('NOINDEX_WITH_CANONICAL', 'medium', 'D', 'noindex plus a canonical to another URL send conflicting signals', { urls: [p.url] }));
    }
    if (isNoindex(p) && !p.inSitemap) F.push(finding('NOINDEX_PAGE', p.inlinks >= 3 ? 'high' : 'medium', 'D', `Page is marked noindex${p.inlinks ? ` and ${p.inlinks} internal pages link to it` : ''}; confirm it should stay out of search`, { urls: [p.url] }));
    if (isNoindex(p) && blockedByRobots(p)) F.push(finding('NOINDEX_BLOCKED', 'medium', 'D', 'robots.txt blocks this page, so Google never sees its noindex and may still index the URL', { urls: [p.url] }));
    if (!f.title) F.push(finding('TITLE_MISSING', 'high', 'D', 'Page has no title', { urls: [p.url] }));
    if (!f.metaDescription) F.push(finding('DESCRIPTION_MISSING', 'low', 'D', 'No meta description (Google writes its own snippet; a good one can still help clicks)', { urls: [p.url] }));
    if (!f.headings.h1.length) F.push(finding('H1_MISSING', 'info', 'D', 'No H1 heading', { urls: [p.url] }));
    if (f.headings.h1.length > 1) F.push(finding('H1_MULTIPLE', 'info', 'D', `${f.headings.h1.length} H1 headings (allowed; check that the main topic is clear)`, { urls: [p.url] }));
    if (!f.lang) F.push(finding('LANG_MISSING', 'low', 'D', 'No lang attribute on <html>', { urls: [p.url] }));
    const noAlt = f.imagesMissingAlt ?? f.images.filter(i => i.alt === null).length;
    if (noAlt) F.push(finding('IMG_ALT_MISSING', 'info', 'D', `${noAlt} images have no alt attribute (decorative images can use alt="")`, { urls: [p.url] }));
    if (f.robotsMetaOutsideHead) F.push(finding('ROBOTS_META_OUTSIDE_HEAD', 'low', 'D', 'A robots meta tag sits outside <head>; keep it in the head', { urls: [p.url] }));
    for (const j of f.jsonld) {
      if (j.error) F.push(finding('JSONLD_PARSE_ERROR', 'high', 'D', `A JSON-LD block does not parse: ${short(j.error, 200)}`, { urls: [p.url] }));
      else if (j.relaxed) F.push(finding('JSONLD_NOT_STRICT', 'low', 'D', 'A JSON-LD block only parses leniently (comments or trailing commas); make it strict JSON', { urls: [p.url] }));
    }
    if (p.bytes > LIMIT_2MB) F.push(finding('HTML_OVER_2MB', 'high', 'D', `HTML is ${p.truncated ? 'more than ' : ''}${(p.bytes / 1048576).toFixed(1)} MB; Googlebot reads only the first 2 MB`, { urls: [p.url] }));
    const late = Object.entries(f.offsets).filter(([, o]) => o !== null && o > LIMIT_2MB).map(([k]) => k);
    if (late.length) F.push(finding('KEY_TAGS_AFTER_2MB', 'high', 'D', `${late.join(', ')} appear after the first 2 MB, which Googlebot does not read`, { urls: [p.url] }));
    if (f.wordCount < 50 && (f.appShell || f.bytes.scripts > 10000)) F.push(finding('CONTENT_NEEDS_JS', 'high', 'H', `Only ${f.wordCount} words in the raw HTML and the page looks like a JavaScript app shell: crawlers that do not run JavaScript (most AI crawlers) see an almost empty page. Check the rendered page and serve the main content in the HTML`, { urls: [p.url] }));
  }

  const indexable = html.filter(p => !isNoindex(p) && (!p.facts.canonical || p.facts.canonical === p.finalUrl));
  const groupBy = key => {
    const m = new Map();
    for (const p of indexable) { const v = key(p); if (!v) continue; if (!m.has(v)) m.set(v, []); m.get(v).push(p); }
    return [...m.values()].filter(group => group.length > 1);
  };
  for (const group of groupBy(p => p.facts.title?.toLowerCase())) F.push(finding('TITLE_DUPLICATE', 'medium', 'D', `${group.length} indexable pages share the title "${short(group[0].facts.title)}"`, { urls: group.map(p => p.url) }));
  for (const group of groupBy(p => p.facts.metaDescription?.toLowerCase())) F.push(finding('DESCRIPTION_DUPLICATE', 'low', 'D', `${group.length} indexable pages share a meta description`, { urls: group.map(p => p.url) }));

  // Pairs of different titles that mean the same thing. Quadratic, so it covers the first PAIR_PAGES
  // indexable pages, and the number of findings is capped too.
  const pool = indexable.slice(0, PAIR_PAGES).map(p => {
    const title = (p.facts.title || '').toLowerCase();
    return { p, title, t: tokens(title.split(' | ')[0]), h: tokens(p.facts.headings.h1[0]) };
  });
  if (indexable.length > PAIR_PAGES) F.push(finding('CRAWL_LIMIT', 'info', 'D', `The duplicate-intent comparison covered the first ${PAIR_PAGES} of ${indexable.length} indexable pages`, { limit: 'duplicate-intent', urls: [] }));
  let pairs = 0;
  pairLoop: for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const a = pool[i];
      const b = pool[j];
      if (a.title === b.title || a.t.size < 2) continue;
      if (!near(a.t, b.t) && !near(a.h, b.h)) continue;
      if (pairs++ >= MAX_PAIR_FINDINGS) { F.push(finding('CRAWL_LIMIT', 'info', 'D', `More than ${MAX_PAIR_FINDINGS} pairs of pages look like the same intent; only the first ${MAX_PAIR_FINDINGS} are listed. Many near-identical pages usually share one template or one cause`, { limit: 'duplicate-intent-pairs', urls: [] })); break pairLoop; }
      F.push(finding('DUPLICATE_INTENT_CANDIDATE', 'medium', 'H', `"${short(a.p.facts.title)}" and "${short(b.p.facts.title)}" look like the same search intent; check in Search Console whether the same queries show both URLs, then keep one and merge the other into it`, { urls: [a.p.url, b.p.url] }));
    }
  }

  // Inlinks come from the pages that were read, so a crawl that did not read every page cannot say which pages
  // nothing links to: it lists the candidates once, as unverified. The start URL, and the page it redirects
  // to, are reached without a link.
  const reasons = [];
  if (capped || queueCapped) reasons.push('the crawl stopped at its page or queue limit (re-run with a higher --max)');
  if (skippedPages.length) reasons.push(`${skippedPages.length} URL${skippedPages.length === 1 ? '' : 's'} that robots.txt disallows were not read (on your own site, --ignore-robots reads them)`);
  if (limited.length) reasons.push(`${limited.length} URL${limited.length === 1 ? '' : 's'} answered 429 or 503 (re-run with a higher --delay or a lower --concurrency)`);
  // A page that failed (a network error, an unreadable page) or answered 5xx has no links to read: a hub that errors
  // would otherwise make every child that only it links to look like an orphan.
  const failedPages = pages.filter(p => !isSkipped(p) && !rateLimited(p) && (p.error || (typeof p.status === 'number' && p.status >= 500)));
  if (failedPages.length) reasons.push(`${failedPages.length} page${failedPages.length === 1 ? '' : 's'} failed or answered HTTP 5xx, so the links on ${failedPages.length === 1 ? 'it' : 'them'} were not read`);
  if (html.some(p => p.facts.linksTruncated)) reasons.push('a page has more links than this tool keeps');
  const candidates = pages.filter(x => x.inSitemap && x.status === 200 && x.chain && !x.chain.length && x.facts && !isNoindex(x) && x.inlinks === 0 && x.url !== startUrl && !(startRec?.finalUrl && x.finalUrl === startRec.finalUrl));
  // The start page is where the crawl takes most of its links from. When it was requested but not read (an error, a 404,
  // a 429 or 503, a page that is not HTML), every sitemap URL would look unlinked: no orphan is reported, not even as unverified.
  // START_PAGE_NOT_200 or SITE_UNAVAILABLE says why. (A page robots.txt blocked keeps its own handling above.)
  const startUnread = Boolean(startRec) && !isSkipped(startRec) && !startRec.facts;
  if (!startUnread && reasons.length) {
    if (candidates.length) F.push(finding('ORPHANS_UNVERIFIED', 'info', 'H', `${candidates.length} sitemap URL${candidates.length === 1 ? ' has' : 's have'} no link from the pages this crawl read, but the crawl did not read every page (${reasons.join('; ')}), so ${candidates.length === 1 ? 'it' : 'they'} may not be orphan${candidates.length === 1 ? '' : 's'}. Check again after a complete crawl`, { urls: candidates.slice(0, MAX_LISTED).map(p => p.url), count: candidates.length }));
  } else if (!startUnread) {
    for (const p of candidates) F.push(finding('ORPHAN_PAGE', 'medium', 'D', 'In the sitemap but no crawled page links to it', { urls: [p.url] }));
  }

  const VALID = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;
  for (const p of html.filter(x => x.facts.hreflang.length)) {
    const entries = p.facts.hreflang;
    for (const e of entries) {
      if (!VALID.test(e.lang)) F.push(finding('HREFLANG_BAD_CODE', 'medium', 'D', `hreflang "${short(e.lang, 40)}" is not a valid language or language-region code`, { urls: [p.url] }));
      if (/^iw(-|$)/i.test(e.lang)) F.push(finding('HREFLANG_IW', 'low', 'D', 'Use "he" for Hebrew; "iw" is the deprecated code', { urls: [p.url] }));
    }
    if (!entries.some(e => e.href === p.finalUrl)) F.push(finding('HREFLANG_NO_SELF', 'low', 'D', 'The hreflang set does not include the page itself', { urls: [p.url] }));
    for (const e of entries) {
      if (!e.href || e.href === p.finalUrl) continue;
      const t = byUrl.get(e.href);
      if (!t || unjudged(t)) continue;
      if (t.error || t.status !== 200 || (t.chain && t.chain.length)) { F.push(finding('HREFLANG_TARGET_NOT_200', 'medium', 'D', `hreflang ${short(e.lang, 40)} points to ${e.href}, which ${describe(t)}`, { urls: [p.url] })); continue; }
      if (t.facts && !t.facts.hreflang.some(x => x.href === p.finalUrl)) F.push(finding('HREFLANG_NO_RETURN', 'high', 'D', `${e.href} (${short(e.lang, 40)}) does not link back to this page with hreflang, so Google ignores the pair`, { urls: [p.url, e.href] }));
    }
  }
  return F;
}

// A cell that starts with = + - or @ is a formula in a spreadsheet: the page it came from is not trusted.
const csvField = v => {
  let s = v === null || v === undefined ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function writeCrawl(outDir, res) {
  const slim = { ...res, pages: res.pages.map(p => { if (!p.facts) return p; const facts = { ...p.facts }; trimText(facts); return { ...p, facts }; }) };
  writeJson(path.join(outDir, 'crawl.json'), slim);
  const header = 'url,status,finalUrl,redirects,inSitemap,noindex,canonical,title,titleLength,h1Count,words,inlinks,bytes';
  const rows = res.pages.map(p => [p.url, p.status, p.finalUrl, p.chain ? p.chain.length : '', p.inSitemap, isNoindex(p), p.facts?.canonical ?? '', p.facts?.title ?? '', p.facts?.title?.length ?? '', p.facts?.headings.h1.length ?? '', p.facts?.wordCount ?? '', p.inlinks ?? '', p.bytes ?? ''].map(csvField).join(','));
  writeText(path.join(outDir, 'pages.csv'), [header, ...rows].join('\n') + '\n');
  const notes = [
    `Start: ${res.meta.start}, ${res.meta.pagesCrawled} pages crawled on ${res.meta.date}${res.meta.capped ? ` (stopped at the cap of ${res.meta.max})` : ''}.`,
    `robots.txt: ${res.robots.error ? res.robots.error : `HTTP ${res.robots.status}`} (${res.robots.policy}); sitemap URLs: ${res.meta.sitemapUrls}.`,
    res.meta.robots === 'ignored'
      ? 'This crawl ignored robots.txt (--ignore-robots): URLs it disallows were fetched too.'
      : `This crawl obeyed robots.txt for its own requests (the ${OWN_AGENT} group, else *)${res.meta.skipped ? `; ${res.meta.skipped} URL${res.meta.skipped === 1 ? ' was' : 's were'} not fetched` : ''}.`,
    'Raw HTML only: anything JavaScript adds is not seen here. Check rendered pages in a browser before concluding.',
  ];
  writeText(path.join(outDir, 'findings.md'), findingsMarkdown('Crawl findings', res.findings, notes));
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const fail = (message, code = 1) => { console.error(message); process.exit(code); };
  if (args.help) { console.log(HELP); process.exit(0); }
  // A flag that is not in this list is a typo (--ignroe-robots would otherwise be dropped and robots.txt obeyed
  // or ignored against the user's intent), so it is a usage error.
  const unknown = Object.keys(args).filter(k => k !== '_' && !CLI_OPTIONS.includes(k));
  if (unknown.length) fail(`Unknown option --${unknown[0]}. Options: ${CLI_OPTIONS.map(o => `--${o}`).join(', ')}. Run with --help for usage.`);
  // --ignore-robots takes no value, but the parser reads the word after it as one: "--ignore-robots https://a.test"
  // is the flag followed by the site. Written as --ignore-robots=<something> it is a mistake.
  let start = args._[0];
  let ignoreRobots = false;
  const flag = args['ignore-robots'];
  if (flag !== undefined) {
    if (flag === true || flag === 'true') ignoreRobots = true;
    else if (flag === 'false') ignoreRobots = false;
    else if (typeof flag === 'string' && argv.includes('--ignore-robots') && start === undefined) { ignoreRobots = true; start = flag; }
    else fail(`--ignore-robots takes no value (got ${flag === '' ? 'nothing after "="' : `"${flag}"`})`);
  }
  if (!start) { console.log(HELP); process.exit(1); }
  // A bare "--max" is parsed as true: it names no number.
  const count = (name, fallback, min) => {
    const v = args[name];
    if (v === undefined) return fallback;
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < min) fail(`--${name} needs a whole number of ${min} or more, got ${v === true ? 'nothing' : `"${v}"`}`);
    return n;
  };
  const text = (name, fallback) => {
    const v = args[name];
    if (v === undefined) return fallback;
    if (typeof v !== 'string' || !v.trim()) fail(`--${name} needs a value`);
    return v;
  };
  const max = count('max', 200, 1);
  const delayMs = count('delay', 300, 0);
  const concurrency = count('concurrency', 2, 1);
  const out = text('out', 'seo/crawl');
  const sitemap = text('sitemap', null);
  let res;
  try {
    res = await crawlSite({ start, max, sitemap, delayMs, concurrency, ignoreRobots });
  } catch (e) {
    if (!(e instanceof InputError)) throw e;
    fail(e.message);
  }
  try {
    writeCrawl(out, res);
  } catch (e) {
    fail(`Could not write the report to ${out}: ${String(e && e.message).slice(0, 150)}`, 2);
  }
  console.log(`Crawled ${res.meta.pagesCrawled} pages, ${res.findings.length} findings. Wrote ${path.join(out, 'findings.md')}`);
  if (res.meta.skipped) console.log(`${res.meta.skipped} URL${res.meta.skipped === 1 ? ' was' : 's were'} not fetched because robots.txt disallows ${res.meta.skipped === 1 ? 'it' : 'them'}; on your own site, --ignore-robots checks ${res.meta.skipped === 1 ? 'it' : 'them'}.`);
  if (res.findings.some(f => f.code === 'START_PAGE_NOT_200')) console.log('The start page did not answer 200, so this crawl could not follow its links (see START_PAGE_NOT_200 in findings.md, and the start row in pages.csv).');
  if (res.findings.some(f => f.code === 'SITE_BLOCKED_BY_ROBOTS')) console.log('robots.txt blocks the start page, so this crawl could not audit it (see SITE_BLOCKED_BY_ROBOTS in findings.md). On your own site, --ignore-robots audits it anyway.');
}
