// node --test scripts/recommend.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSpecs, recommend } from "./recommend.mjs";

const specs = loadSpecs();
const today = specs.verified;
const run = (format, platforms, extra = {}) => recommend(specs, { format, platforms, today, ...extra });

test("every family names formats and platforms that exist", () => {
  for (const fam of Object.values(specs.families)) {
    for (const f of fam.formats) assert.ok(specs.formats[f], `format ${f}`);
    for (const p of fam.platforms) assert.ok(specs.platforms[p], `platform ${p}`);
  }
  for (const [id, f] of Object.entries(specs.formats)) assert.ok(f.min <= f.default && f.default <= f.max, `${id} default inside its range`);
});

test("a single platform that fits gets the format's default first", () => {
  const r = run("tutorial", ["youtube"]);
  assert.equal(r.length.mode, "single");
  assert.equal(r.length.options[0].seconds, 180);
  assert.equal(r.length.options[0].label, "Recommended");
});

test("a platform's soft limit narrows the recommendation", () => {
  const r = run("standard-ad", ["linkedin"]); // 15-34 s format, LinkedIn prefers 15-30 s
  assert.equal(r.length.options[0].seconds, 30);
  assert.ok(r.length.options.every((o) => o.seconds >= 15 && o.seconds <= 30));
});

test("the tightest platform wins when several are chosen", () => {
  const r = run("short-ad", ["reels", "x", "linkedin"]); // X prefers 15 s or less, LinkedIn 15-30 s
  assert.equal(r.length.mode, "single");
  assert.deepEqual(r.length.options.map((o) => o.seconds), [15]);
});

test("app store previews stay inside 15-30 s", () => {
  const r = run("app-store-preview", ["app-store"]);
  assert.equal(r.length.options[0].seconds, 25);
  assert.ok(r.length.options.every((o) => o.seconds >= 15 && o.seconds <= 30));
  assert.ok(r.warnings.some((w) => /in-app footage/.test(w)));
});

test("no common length gives a master plus cutdowns", () => {
  const r = run("tutorial", ["youtube", "x"]); // X prefers 15 s or less
  assert.equal(r.length.mode, "master+cutdowns");
  assert.equal(r.length.master.seconds, 180);
  assert.deepEqual(r.length.master.hostedOn, ["youtube"]);
  assert.deepEqual(r.length.cutdowns, [{ platform: "x", seconds: 15, why: specs.platforms.x.softNote }]);
});

test("a format none of the platforms can carry says where to host the master", () => {
  const r = run("tutorial", ["x"]);
  assert.equal(r.length.mode, "master+cutdowns");
  assert.ok(r.warnings.some((w) => /host the master/.test(w)));
});

test("lengths land on the 15-frame grid", () => {
  for (const format of Object.keys(specs.formats)) {
    for (const platform of Object.keys(specs.platforms)) {
      const r = run(format, [platform]);
      const all = r.length.mode === "single" ? r.length.options.map((o) => o.seconds) : [r.length.master.seconds, ...r.length.cutdowns.map((c) => c.seconds)];
      for (const s of all) assert.equal((s * 30) % 15, 0, `${format} on ${platform}: ${s} s`);
    }
  }
});

test("captions: burned where the platform needs it, an SRT where the player shows one", () => {
  const r = run("explainer", ["youtube", "linkedin"]);
  assert.match(r.captions[0], /burn captions in for LinkedIn \(autoplays muted\)/);
  assert.match(r.captions[1], /SRT for YouTube, LinkedIn: the player shows it/);
  const yt = run("tutorial", ["youtube"]);
  assert.ok(!yt.captions.some((c) => /burn captions in/.test(c)), "YouTube alone needs no burned subtitles");
  assert.match(run("short-ad", ["reels"]).captions[0], /burn captions in for Instagram Reels/);
});

test("safe zones are described, and approximate ones are flagged", () => {
  const reels = run("short-ad", ["reels"]).deliverables[0];
  assert.match(reels.safeZone, /top 14%, bottom 35%/);
  const shorts = run("short-ad", ["shorts"]);
  assert.match(shorts.deliverables[0].safeZone, /unverified/);
  assert.ok(shorts.warnings.some((w) => /Shorts safe zone is approximate/.test(w)));
});

test("fps respects a platform cap", () => {
  assert.equal(run("standard-ad", ["linkedin"]).deliverables[0].fps, 30);
});

test("stale specs warn after six months", () => {
  assert.equal(run("teaser", ["reels"], { today: "2026-12-01" }).warnings.filter((w) => /re-check/.test(w)).length, 0);
  assert.ok(run("teaser", ["reels"], { today: "2027-06-01" }).warnings.some((w) => /re-check the official pages/.test(w)));
});

test("unknown names fail loudly", () => {
  assert.throws(() => run("vlog", ["youtube"]), /unknown format "vlog"/);
  assert.throws(() => run("teaser", ["myspace"]), /unknown platform "myspace"/);
});

test("a long-form format on a short-video feed gets a master plus a feed teaser, not a squeezed video", () => {
  const r = run("tutorial", ["reels"]);
  assert.equal(r.length.mode, "master+cutdowns");
  assert.equal(r.length.master.seconds, 180);
  assert.equal(r.length.cutdowns[0].platform, "reels");
  assert.equal(r.length.cutdowns[0].seconds, 45);
  assert.match(r.length.cutdowns[0].why, /teaser that points to the full video/);
  assert.ok(r.warnings.some((w) => /host the master/.test(w)));
});

test("the same tutorial for YouTube and TikTok hosts the master on YouTube", () => {
  const r = run("tutorial", ["youtube", "tiktok"]);
  assert.deepEqual(r.length.master.hostedOn, ["youtube"]);
  assert.deepEqual(r.length.cutdowns.map((c) => [c.platform, c.seconds]), [["tiktok", 30]]);
});

test("short formats still go straight onto feeds", () => {
  assert.equal(run("launch-film", ["reels"]).length.mode, "single");
  assert.equal(run("social-organic", ["tiktok"]).length.options[0].seconds, 30);
});
