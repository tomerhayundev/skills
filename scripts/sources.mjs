#!/usr/bin/env node
/**
 * The sources library's maintainer tool (sources/catalog.json). Node 18+, no dependencies.
 *
 *   node scripts/sources.mjs validate [--file=<catalog>]   format and vocab; exit 1 on an error
 *   node scripts/sources.mjs normalize <url>...            a URL as the catalog stores it (no tracking)
 *   node scripts/sources.mjs has <url>...                  known (and its id) or new, per URL
 *   node scripts/sources.mjs seen <url>... [--now]         a known site recommended again: +1, held in
 *                                                          sources/pending-seen.json (releases nothing);
 *                                                          --now writes it into the catalog at once
 *   node scripts/sources.mjs add <drafts.json>...          merge drafted entries; a known site gains routes;
 *                                                          a new source or route also folds in pending counts
 *   node scripts/sources.mjs check [--write] [--id=<id>]   load every route; --write records status changes
 *   node scripts/sources.mjs stats                         counts by kind, area, need and status
 *
 * The intake (MAINTAINING.md, "The sources library") drafts entries from loaded pages; this tool
 * merges, validates and health-checks them. It never invents a route.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SCHEMA = 1;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG = join(ROOT, "sources", "catalog.json");
// Counts of known sites recommended again, held until a real source is added. The sync and the checks
// never copy or read this file, so a count alone releases no plugin.
const pendingFile = (catalogFile) => join(dirname(catalogFile), "pending-seen.json");

const TRACKING = [/^utm_/i, /^(ref|ref_src|ref_url|via|fbclid|gclid|dclid|msclkid|igshid|si|mc_cid|mc_eid|_ga)$/i];
const SOCIAL_HOSTS = /(^|\.)(x|twitter)\.com$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EM_DASH = String.fromCharCode(0x2014);
const INSTRUCTION = /\b(ignore (all |any )?(previous|prior|above)|system prompt|you are (an?|the) (ai|assistant|agent|model)|disregard (the|all|your))\b|<\s*script/i;
const LIMITS = { summary: 240, take: 240, never: 240, why: 240, note: 300, values: 360, media: 300, ai: 260 };

const today = () => new Date().toISOString().slice(0, 10);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/** A placeholder-safe URL parse: "{tag}" survives as itself. */
function parse(url) {
  const holes = [];
  const masked = String(url).replace(/\{[a-z][a-z0-9_-]*\}/gi, (m) => (holes.push(m), `__hole${holes.length - 1}__`));
  const u = new URL(masked);
  return { u, unmask: (s) => s.replace(/__hole(\d+)__/g, (_, i) => holes[i]) };
}

/** Query parameters that only track who sent the visitor. */
export function trackingParams(url) {
  const { u } = parse(url);
  return [...u.searchParams.keys()].filter((k) => TRACKING.some((re) => re.test(k)) || (SOCIAL_HOSTS.test(u.hostname) && /^(s|t)$/.test(k)));
}

/** The URL as the catalog stores it: tracking parameters and an empty fragment removed, host lowercased. */
export function normalizeUrl(url) {
  const { u, unmask } = parse(url.trim());
  for (const k of trackingParams(url)) u.searchParams.delete(k);
  u.hostname = u.hostname.toLowerCase();
  if (u.hash === "#") u.hash = "";
  let out = unmask(u.toString());
  if (u.pathname === "/" && !u.search && !u.hash) out = out.replace(/\/$/, "");
  return out;
}

/** The key two URLs of one site share: host without www, path without a trailing slash. */
export function siteKey(url) {
  const { u, unmask } = parse(url);
  return unmask(`${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase());
}

function checkText(where, key, value, errors) {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") return errors.push(`${where}: ${key} must be text`);
  const limit = LIMITS[key];
  if (limit && value.length > limit) errors.push(`${where}: ${key} is ${value.length} characters, at most ${limit}`);
  if (value.includes(EM_DASH)) errors.push(`${where}: ${key} has an em dash (house style: a comma or a colon)`);
  if (INSTRUCTION.test(value)) errors.push(`${where}: ${key} reads like an instruction to an AI; entries hold our words only`);
}

function checkUrl(where, key, value, errors, { template = false } = {}) {
  if (typeof value !== "string" || !value) return errors.push(`${where}: ${key} is required`);
  let parsed;
  try {
    parsed = parse(value);
  } catch {
    return errors.push(`${where}: ${key} is not a URL: ${value}`);
  }
  if (parsed.u.protocol !== "https:") errors.push(`${where}: ${key} must be https: ${value}`);
  const holes = value.match(/\{[^}]*\}/g) ?? [];
  if (holes.length && !template) errors.push(`${where}: ${key} cannot hold a {placeholder}: ${value}`);
  const tracking = trackingParams(value);
  if (tracking.length) errors.push(`${where}: ${key} carries tracking (${tracking.join(", ")}): ${value}`);
}

/** Every problem in a catalog, as "where: what" lines. Empty when it is valid. */
export function validateCatalog(cat) {
  const errors = [];
  if (!isObj(cat)) return ["the catalog is not a JSON object"];
  if (cat.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  if (!DATE.test(cat.updated ?? "")) errors.push("updated must be a date (YYYY-MM-DD)");
  if (!Array.isArray(cat.consumers)) errors.push("consumers must list the plugins that get a copy");
  const v = cat.vocab;
  if (!isObj(v)) return [...errors, "vocab is missing"];
  const terms = (k) => new Set(Array.isArray(v[k]) ? v[k] : Object.keys(v[k] ?? {}));
  const T = Object.fromEntries(["kinds", "areas", "needs", "fit", "read", "access", "remotion", "flags", "status"].map((k) => [k, terms(k)]));
  for (const [k, set] of Object.entries(T)) if (!set.size) errors.push(`vocab.${k} is empty`);
  if (!Array.isArray(cat.sources)) return [...errors, "sources must be a list"];

  const ids = new Map();
  const homes = new Map();
  const inVocab = (where, key, value, set) => {
    if (!set.has(value)) errors.push(`${where}: ${key} "${value}" is not in the vocab`);
  };

  cat.sources.forEach((s, i) => {
    const where = `sources[${i}]${s?.id ? ` (${s.id})` : ""}`;
    if (!isObj(s)) return errors.push(`${where}: not an object`);
    if (!ID.test(s.id ?? "")) errors.push(`${where}: id must be lowercase words joined by hyphens`);
    else if (ids.has(s.id)) errors.push(`${where}: id "${s.id}" is used twice`);
    else ids.set(s.id, i);
    if (!s.name || typeof s.name !== "string") errors.push(`${where}: name is required`);
    checkUrl(where, "home", s.home, errors);
    if (typeof s.home === "string") {
      try {
        const key = siteKey(s.home);
        if (homes.has(key)) errors.push(`${where}: the same site as ${homes.get(key)}`);
        else homes.set(key, s.id);
      } catch {
        /* reported by checkUrl */
      }
    }
    inVocab(where, "kind", s.kind, T.kinds);
    if (!Array.isArray(s.areas) || !s.areas.length) errors.push(`${where}: areas must list at least one area`);
    else s.areas.forEach((a) => inVocab(where, "area", a, T.areas));
    if (!s.summary) errors.push(`${where}: summary is required`);
    checkText(where, "summary", s.summary, errors);
    if (!isObj(s.quality) || !Number.isInteger(s.quality.score) || s.quality.score < 1 || s.quality.score > 5) errors.push(`${where}: quality.score must be a whole number from 1 to 5`);
    else checkText(where, "why", s.quality.why, errors);
    if (!DATE.test(s.verified ?? "")) errors.push(`${where}: verified must be a date (YYYY-MM-DD)`);
    inVocab(where, "status", s.status, T.status);
    if (!Number.isInteger(s.seen) || s.seen < 1) errors.push(`${where}: seen must be a count of 1 or more`);
    if (s.checked !== undefined && !DATE.test(s.checked)) errors.push(`${where}: checked must be a date`);
    (s.flags ?? []).forEach((f) => inVocab(where, "flag", f, T.flags));
    if (s.status === "rejected") return; // kept only so the same link is not checked twice

    if (s.fit !== undefined) {
      if (!isObj(s.fit)) errors.push(`${where}: fit maps a format to high, medium or low`);
      else for (const [k, val] of Object.entries(s.fit)) {
        inVocab(where, "fit format", k, T.fit);
        if (!["high", "medium", "low"].includes(val)) errors.push(`${where}: fit.${k} must be high, medium or low`);
      }
    }
    if (!Array.isArray(s.routes) || !s.routes.length) errors.push(`${where}: routes must hold at least one route`);
    else s.routes.forEach((r, j) => {
      const rw = `${where} route ${j + 1}`;
      if (!isObj(r)) return errors.push(`${rw}: not an object`);
      if (!Array.isArray(r.need) || !r.need.length) errors.push(`${rw}: need must list at least one need`);
      else r.need.forEach((n) => inVocab(rw, "need", n, T.needs));
      checkUrl(rw, "url", r.url, errors, { template: true });
      if (/\{[^}]*\}/.test(r.url ?? "")) checkUrl(rw, "example", r.example, errors);
      else if (r.example !== undefined) checkUrl(rw, "example", r.example, errors);
      inVocab(rw, "read", r.read, T.read);
      inVocab(rw, "access", r.access, T.access);
      checkText(rw, "values", r.values, errors);
      checkText(rw, "note", r.note, errors);
    });
    if (s.item !== undefined) {
      if (!isObj(s.item)) errors.push(`${where}: item must be an object`);
      else {
        if (s.item.url !== undefined) checkUrl(where, "item.url", s.item.url, errors, { template: true });
        checkText(where, "media", s.item.media, errors);
      }
    }
    if (typeof s.search !== "string" || !(s.search === "none" || s.search === "browser-only" || s.search.includes("{q}"))) {
      errors.push(`${where}: search is a URL with {q}, "browser-only" or "none"`);
    } else if (s.search.includes("{q}")) checkUrl(where, "search", s.search, errors, { template: true });
    if (s.machine !== undefined) {
      if (!isObj(s.machine)) errors.push(`${where}: machine must be an object`);
      else for (const [k, val] of Object.entries(s.machine)) {
        if (!["llms", "sitemap", "rss", "registry", "md", "npm", "repo", "mcp", "api"].includes(k)) errors.push(`${where}: machine.${k} is not a known route kind`);
        const url = isObj(val) ? val.url : val;
        if (k === "npm" && typeof url === "string" && !/^https:/.test(url)) continue; // a package name
        if (url !== undefined) checkUrl(where, `machine.${k}`, url, errors, { template: true });
        if (isObj(val) && val.access !== undefined) inVocab(where, `machine.${k}.access`, val.access, T.access);
      }
    }
    if (s.kind === "code" || s.code !== undefined) {
      const c = s.code;
      if (!isObj(c)) errors.push(`${where}: a code source needs a code block (license, remotion)`);
      else {
        if (!isObj(c.license) || !c.license.id) errors.push(`${where}: code.license.id is required ("unknown" when none was found)`);
        else if (![true, false, "unclear"].includes(c.license.commercial)) errors.push(`${where}: code.license.commercial is true, false or "unclear"`);
        if (!isObj(c.remotion)) errors.push(`${where}: code.remotion.default is required`);
        else {
          inVocab(where, "code.remotion.default", c.remotion.default, T.remotion);
          for (const k of Object.keys(c.remotion)) if (k !== "default" && !T.remotion.has(k)) errors.push(`${where}: code.remotion.${k} is not in the vocab`);
        }
        if (c.registry !== undefined) checkUrl(where, "code.registry", c.registry, errors, { template: true });
      }
    }
    if (!isObj(s.rights)) errors.push(`${where}: rights is required (media, ai)`);
    else {
      if (!["use", "study", "view"].includes(s.rights.media)) errors.push(`${where}: rights.media is use, study or view`);
      checkText(where, "ai", s.rights.ai, errors);
    }
    for (const k of ["take", "never"]) {
      if (!s[k]) errors.push(`${where}: ${k} is required`);
      checkText(where, k, s[k], errors);
    }
    if (s.fresh !== undefined && s.fresh.newest !== null && s.fresh.newest !== undefined && !DATE.test(s.fresh.newest)) errors.push(`${where}: fresh.newest must be a date or null`);
  });
  for (const s of cat.sources) {
    if (s?.mirrorOf !== undefined && !ids.has(s.mirrorOf)) errors.push(`${s.id}: mirrorOf "${s.mirrorOf}" is not a source`);
  }
  for (const c of cat.consumers ?? []) if (!ID.test(c)) errors.push(`consumers: "${c}" is not a plugin name`);
  return errors;
}

/** The source a URL belongs to: same id, same site, or the same host when the URL is deeper. */
export function findSource(cat, url) {
  const key = siteKey(normalizeUrl(url));
  const exact = cat.sources.find((s) => siteKey(s.home) === key);
  if (exact) return exact;
  const host = key.split("/")[0];
  return cat.sources.find((s) => s.kind !== "work" && siteKey(s.home) === host) ?? null;
}

/**
 * Merges drafted entries. A known site (same home) gains seen and any route it lacked; its curated
 * text stays. A new site is added as drafted. Returns { cat, added, updated }.
 */
export function mergeEntries(cat, drafts, { date = today() } = {}) {
  const next = structuredClone(cat);
  const added = [];
  const updated = [];
  for (const d of drafts) {
    const draft = { ...d, home: normalizeUrl(d.home) };
    if (draft.routes) draft.routes = draft.routes.map((r) => ({ ...r, url: normalizeUrl(r.url), ...(r.example ? { example: normalizeUrl(r.example) } : {}) }));
    const known = next.sources.find((s) => s.id === draft.id || siteKey(s.home) === siteKey(draft.home));
    if (!known) {
      next.sources.push({ ...draft, seen: draft.seen ?? 1 });
      added.push(draft.id);
      continue;
    }
    known.seen = (known.seen ?? 1) + (draft.seen ?? 1);
    const urls = new Set((known.routes ?? []).map((r) => r.url));
    const extra = (draft.routes ?? []).filter((r) => !urls.has(r.url));
    if (extra.length) {
      known.routes = [...(known.routes ?? []), ...extra];
      known.verified = draft.verified ?? date;
    }
    known.flags = [...new Set([...(known.flags ?? []), ...(draft.flags ?? [])])];
    if (!known.flags.length) delete known.flags;
    updated.push(`${known.id} (seen ${known.seen}${extra.length ? `, ${extra.length} new route(s)` : ""})`);
  }
  next.sources.sort((a, b) => a.id.localeCompare(b.id));
  next.updated = date;
  return { cat: next, added, updated };
}

/** What one load says about a URL: ok, dead, error, blocked, paywalled or soft-404. */
export function classify({ url, status, finalUrl, contentType, error }) {
  if (error) return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|CERT|certificate/i.test(String(error)) ? "dead" : "error";
  if (status === 404 || status === 410) return "dead";
  if (status === 401 || status === 402) return "paywalled";
  if (status === 403 || status === 429) return "blocked";
  if (status >= 500) return "error";
  if (status >= 200 && status < 400) {
    const gate = /\/(pricing|pro|upgrade|plans?|sign-?in|sign-?up|login|subscribe)(\/|$|\?)/i;
    const from = new URL(url).pathname;
    const to = finalUrl ? new URL(finalUrl).pathname : from;
    if (to !== from && gate.test(to) && !gate.test(from)) return "paywalled";
    if (/\.(txt|json|xml|md)$/i.test(from) && /text\/html/i.test(contentType ?? "")) return "soft-404";
    return "ok";
  }
  return "error";
}

/** A source's status from its loads. Dead takes two checks in a row; a bot wall changes nothing. */
export function verdict(source, results) {
  const home = results.find((r) => r.role === "home")?.result;
  const routes = results.filter((r) => r.role === "route").map((r) => r.result);
  const bad = routes.filter((r) => r === "dead" || r === "paywalled");
  const known = routes.filter((r) => r !== "blocked" && r !== "error");
  const was = source.status;
  if (home === "dead" || (routes.length && routes.every((r) => r === "dead"))) return was === "degraded" || was === "dead" ? "dead" : "degraded";
  if (routes.length && known.length && known.every((r) => r === "paywalled")) return "paywalled";
  if (bad.length) return "degraded";
  if (!known.length && home !== "ok") return was;
  return "ok";
}

async function load(url, timeoutMs = 15000) {
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "Mozilla/5.0 (compatible; sources-check; +https://github.com/tomerhayundev/skills)" } });
    const out = { url, status: r.status, finalUrl: r.url, contentType: r.headers.get("content-type") };
    await r.body?.cancel().catch(() => {});
    return out;
  } catch (e) {
    return { url, error: e.cause?.code ?? e.code ?? e.name ?? String(e) };
  }
}

/** Loads every route of every live source, a few at a time. Returns one row per source. */
export async function checkCatalog(cat, { id, loader = load, concurrency = 6 } = {}) {
  const sources = cat.sources.filter((s) => s.status !== "rejected" && (!id || s.id === id));
  const rows = [];
  let next = 0;
  const work = async () => {
    while (next < sources.length) {
      const s = sources[next++];
      const targets = [{ role: "home", url: s.home }];
      for (const r of s.routes ?? []) targets.push({ role: "route", url: /\{/.test(r.url) ? r.example : r.url });
      for (const [k, val] of Object.entries(s.machine ?? {})) {
        const url = isObj(val) ? val.url : val;
        if (["llms", "sitemap", "md", "registry"].includes(k) && typeof url === "string" && !/\{/.test(url) && /^https:/.test(url)) targets.push({ role: `machine.${k}`, url });
      }
      const results = [];
      for (const t of targets.filter((t) => t.url)) results.push({ ...t, result: classify(await loader(t.url)) });
      rows.push({ id: s.id, was: s.status, now: verdict(s, results), results });
    }
  };
  await Promise.all(Array.from({ length: concurrency }, work));
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

function readCatalog(file = CATALOG) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeCatalog(cat, file = CATALOG) {
  writeFileSync(file, JSON.stringify(cat, null, 2) + "\n");
}

export function readPending(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

/** Adds each pending count to its source (by id); returns the folded ids. Unknown ids are left alone. */
export function foldPending(cat, pending) {
  const folded = [];
  for (const [id, n] of Object.entries(pending)) {
    const s = cat.sources.find((x) => x.id === id);
    if (s && Number.isInteger(n) && n > 0) {
      s.seen = (s.seen ?? 1) + n;
      folded.push(id);
    }
  }
  return folded;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (k) => rest.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const args = rest.filter((a) => !a.startsWith("--"));
  const file = opt("file") ? resolve(opt("file")) : CATALOG;

  if (cmd === "validate") {
    const cat = readCatalog(file);
    const errors = validateCatalog(cat);
    for (const id of Object.keys(readPending(pendingFile(file)))) if (!cat.sources.some((x) => x.id === id)) errors.push(`pending-seen.json: "${id}" is not a source`);
    for (const e of errors) console.log(`error  ${e}`);
    console.log(errors.length ? `\n${errors.length} error(s)` : `ok: ${cat.sources.length} sources`);
    process.exit(errors.length ? 1 : 0);
  }
  if (cmd === "normalize") {
    for (const u of args) console.log(normalizeUrl(u));
    return;
  }
  if (cmd === "has") {
    const cat = readCatalog(file);
    for (const u of args) {
      const s = findSource(cat, u);
      const held = s ? readPending(pendingFile(file))[s.id] : 0;
      console.log(s ? `known  ${s.id} (${s.status}, seen ${s.seen}${held ? ` + ${held} pending` : ""})  ${normalizeUrl(u)}` : `new    ${normalizeUrl(u)}`);
    }
    return;
  }
  if (cmd === "seen") {
    const cat = readCatalog(file);
    const now = rest.includes("--now");
    const pending = readPending(pendingFile(file));
    for (const u of args) {
      const s = findSource(cat, u);
      if (!s) console.log(`new    ${normalizeUrl(u)}: draft it first`);
      else if (now) console.log(`seen   ${s.id}: ${s.seen} -> ${++s.seen}`);
      else {
        pending[s.id] = (pending[s.id] ?? 0) + 1;
        console.log(`seen   ${s.id}: ${s.seen} + ${pending[s.id]} pending (counted at the next real addition)`);
      }
    }
    if (now) {
      cat.updated = today();
      writeCatalog(cat, file);
    } else {
      writeFileSync(pendingFile(file), JSON.stringify(Object.fromEntries(Object.entries(pending).sort()), null, 2) + "\n");
    }
    return;
  }
  if (cmd === "add") {
    const drafts = args.flatMap((f) => [JSON.parse(readFileSync(f, "utf8"))].flat());
    const { cat, added, updated } = mergeEntries(readCatalog(file), drafts);
    // A real addition (a new source, or a route a known one lacked) is a release anyway: fold the held counts in.
    const real = added.length > 0 || updated.some((u) => /new route/.test(u));
    const pending = readPending(pendingFile(file));
    const folded = real ? foldPending(cat, pending) : [];
    const errors = validateCatalog(cat);
    if (errors.length) {
      for (const e of errors) console.log(`error  ${e}`);
      console.log(`\n${errors.length} error(s); nothing was written. Fix the drafts and run add again.`);
      process.exit(1);
    }
    writeCatalog(cat, file);
    if (real && Object.keys(pending).length) writeFileSync(pendingFile(file), "{}\n");
    for (const a of added) console.log(`added    ${a}`);
    if (folded.length) console.log(`counted  ${folded.length} held seen count(s), pending-seen.json cleared`);
    else if (Object.keys(pending).length) console.log(`held     ${Object.keys(pending).length} seen count(s) stay pending (no new source or route)`);
    for (const u of updated) console.log(`known    ${u}`);
    console.log(`\n${added.length} added, ${updated.length} already known; ${cat.sources.length} sources in all`);
    return;
  }
  if (cmd === "check") {
    const cat = readCatalog(file);
    const rows = await checkCatalog(cat, { id: opt("id") });
    const changed = rows.filter((r) => r.now !== r.was);
    console.log(`## Sources health check, ${today()}\n`);
    console.log(`${rows.length} sources loaded; ${changed.length} changed status.\n`);
    console.log("| Source | Was | Now | Loads |\n| --- | --- | --- | --- |");
    for (const r of rows) {
      const loads = r.results.filter((x) => x.result !== "ok").map((x) => `${x.role} ${x.result}`).join(", ") || "all ok";
      console.log(`| ${r.id} | ${r.was} | ${r.now}${r.now !== r.was ? " (changed)" : ""} | ${loads} |`);
    }
    if (rest.includes("--write") && changed.length) {
      for (const r of changed) {
        const s = cat.sources.find((x) => x.id === r.id);
        s.status = r.now;
        s.checked = today();
      }
      cat.updated = today();
      writeCatalog(cat, file);
      console.log(`\nwrote ${changed.length} status change(s)`);
    }
    return;
  }
  if (cmd === "stats") {
    const cat = readCatalog(file);
    const count = (list) => Object.entries(list.reduce((m, k) => ((m[k] = (m[k] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
    const live = cat.sources.filter((s) => s.status !== "rejected");
    console.log(`sources  ${cat.sources.length} (${count(cat.sources.map((s) => s.status))})`);
    console.log(`kinds    ${count(live.map((s) => s.kind))}`);
    console.log(`areas    ${count(live.flatMap((s) => s.areas))}`);
    console.log(`needs    ${count(live.flatMap((s) => (s.routes ?? []).flatMap((r) => r.need)))}`);
    console.log(`access   ${count(live.flatMap((s) => (s.routes ?? []).map((r) => r.access)))}`);
    return;
  }
  console.log("usage: node scripts/sources.mjs validate | normalize <url> | has <url> | seen <url> | add <drafts.json> | check [--write] [--id=<id>] | stats");
  process.exit(cmd ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
