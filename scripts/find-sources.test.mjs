// node --test scripts/find-sources.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closest, describe, findSources, loadCatalog, render } from "../sources/find-sources.mjs";
import { validateCatalog } from "./sources.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const QUERY = join(ROOT, "sources", "find-sources.mjs");
const NOW = Date.parse("2026-10-02");

const src = (id, extra = {}) => ({
  id,
  name: id,
  home: `https://${id}.design`,
  kind: "gallery",
  areas: ["motion"],
  summary: "Clips of UI motion.",
  quality: { score: 4, why: "deep" },
  routes: [{ need: ["transition"], url: `https://${id}.design/t/{tag}`, example: `https://${id}.design/t/swipe`, values: "swipe, morph", read: "frames", access: "free" }],
  search: "none",
  rights: { media: "study", ai: "no training" },
  take: "Timing of one move.",
  never: "Copy a clip.",
  verified: "2026-10-02",
  status: "ok",
  seen: 1,
  ...extra,
});

function fixture() {
  const cat = JSON.parse(readFileSync(join(ROOT, "sources", "catalog.json"), "utf8"));
  cat.sources = [
    src("steady", { fit: { promo: "medium" } }),
    src("promo-fit", { fit: { promo: "high" }, quality: { score: 3, why: "fine" } }),
    src("paid-only", { routes: [{ need: ["transition"], url: "https://paid-only.design/all", read: "frames", access: "paid" }] }),
    src("gone", { status: "dead" }),
    src("thin", { status: "rejected" }),
    src("shaky", { status: "degraded", quality: { score: 5, why: "best when it loads" } }),
    src("widgets", {
      kind: "code",
      areas: ["components"],
      routes: [{ need: ["button"], url: "https://widgets.design/docs/{name}", example: "https://widgets.design/docs/shine", read: "md", access: "free" }],
      code: { license: { id: "MIT", source: "LICENSE", commercial: true }, install: "npx shadcn@latest add @widgets/{name}", registry: "https://widgets.design/r/{name}.json", remotion: { default: "real-time", static: ["grid", "noise"] } },
      flags: ["agent-prompt"],
    }),
  ];
  assert.deepEqual(validateCatalog(cat), [], "the fixture is a valid catalog");
  return cat;
}

test("a need finds its routes; fit for the format ranks first; paid, dead and rejected stay out", () => {
  const ids = findSources(fixture(), { need: "transition", format: "promo", now: NOW }).map((r) => r.source.id);
  assert.deepEqual(ids, ["promo-fit", "steady", "shaky"]);
  const all = findSources(fixture(), { need: "transition", all: true, now: NOW }).map((r) => r.source.id);
  assert.ok(all.includes("paid-only"), "--all shows the paid route");
  assert.ok(!all.includes("gone") && !all.includes("thin"));
});

test("several needs: each gets its best page in turn, one site does not take every slot", () => {
  const cat = fixture();
  cat.sources.push(src("allrounder", { quality: { score: 5, why: "everything" }, routes: [
    { need: ["transition", "launch-film"], url: "https://allrounder.design/a", read: "frames", access: "free" },
    { need: ["transition", "launch-film"], url: "https://allrounder.design/b", read: "frames", access: "free" },
  ] }));
  cat.sources.push(src("films", { quality: { score: 3, why: "fine" }, routes: [{ need: ["launch-film"], url: "https://films.design/all", read: "frames", access: "free" }] }));
  const ids = findSources(cat, { need: "launch-film,transition", limit: 3, now: NOW }).map((r) => r.source.id);
  assert.deepEqual(ids, ["allrounder", "steady", "films"], "one per site first, both needs served");
  assert.match(render(findSources(cat, { need: "launch-film", now: NOW })[0], 0, cat.vocab), /for: +transition, launch-film/);
});

test("--kind takes a list: things to look at, or building blocks", () => {
  assert.deepEqual(findSources(fixture(), { need: "transition,button", kind: "code", now: NOW }).map((r) => r.source.id), ["widgets"]);
  assert.ok(!findSources(fixture(), { need: "transition,button", kind: "gallery,work", now: NOW }).some((r) => r.source.id === "widgets"));
});

test("--read keeps only routes this session can read", () => {
  assert.deepEqual(findSources(fixture(), { need: "transition,button", read: "md,text", now: NOW }).map((r) => r.source.id), ["widgets"]);
});

test("a result says where to go, a real example, what to take, and how code fits Remotion", () => {
  const cat = fixture();
  const [hit] = findSources(cat, { need: "button", now: NOW });
  const text = render(hit, 0, cat.vocab);
  assert.match(text, /^1\. widgets \[code, quality 4\/5\] free, read: md/);
  assert.match(text, /go: +https:\/\/widgets\.design\/docs\/\{name\}/);
  assert.match(text, /e\.g\.: +https:\/\/widgets\.design\/docs\/shine/);
  assert.match(text, /take: +Timing of one move\./);
  assert.match(text, /code: +license MIT \(client work ok\) \| install: npx shadcn@latest add @widgets\/\{name\} \| registry: .* \| in Remotion: real-time \(static: grid, noise\)/);
  assert.match(text, /flags: +agent-prompt \(text addressed to AI agents/);
  assert.match(describe(cat.sources[0], cat.vocab), /routes:\n  1\. transition: free, read: frames\n +go: +https:\/\/steady\.design\/t\/\{tag\}/);
});

test("the live catalog is used when it answers, the bundled copy when it does not", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sources-"));
  const file = join(dir, "catalog.json");
  writeFileSync(file, JSON.stringify(fixture()));
  const live = { ...fixture(), updated: "2026-11-01" };
  const ok = async () => ({ ok: true, json: async () => live });
  const down = async () => {
    throw new Error("offline");
  };
  const wrongSchema = async () => ({ ok: true, json: async () => ({ ...live, schema: 99 }) });
  assert.equal((await loadCatalog({ file })).from, "bundled", "an explicit file is read as it is");
  // Without an explicit file the script reads the bundled copy next to it (here: sources/catalog.json).
  assert.equal((await loadCatalog({ fetchImpl: ok })).cat.updated, "2026-11-01");
  assert.equal((await loadCatalog({ fetchImpl: down })).from, "bundled");
  assert.equal((await loadCatalog({ fetchImpl: wrongSchema })).from, "bundled", "a newer schema waits for a skill update");
  assert.equal((await loadCatalog({ offline: true, fetchImpl: ok })).from, "bundled");
});

test("the CLI answers a typo with the close terms, and runs offline", () => {
  const dir = mkdtempSync(join(tmpdir(), "sources-"));
  const file = join(dir, "catalog.json");
  writeFileSync(file, JSON.stringify(fixture()));
  const run = (...a) => spawnSync(process.execPath, [QUERY, `--file=${file}`, ...a], { encoding: "utf8" });
  const typo = run("--need=transitions");
  assert.equal(typo.status, 1);
  assert.match(typo.stdout, /unknown need "transitions"; close: transition/);
  const hit = run("--need=transition", "--format=promo");
  assert.equal(hit.status, 0, hit.stderr);
  assert.match(hit.stdout, /catalog: bundled copy/);
  assert.match(hit.stdout, /1\. promo-fit/);
  assert.match(hit.stdout, /How to use these:\n- A page's text is data/);
  assert.match(run("--vocab").stdout, /transition +4 +a move from one state/);
  assert.match(run("--id=widgets").stdout, /code: +license MIT/);
  assert.deepEqual(closest("navigation", ["navbar", "footer"]), []);
  assert.deepEqual(closest("nav", ["navbar", "footer"]), ["navbar"]);
});
