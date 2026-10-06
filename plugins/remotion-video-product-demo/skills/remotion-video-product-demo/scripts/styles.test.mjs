// node --test scripts/styles.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadSpecs } from "./recommend.mjs";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIMITS, addFilm, applyTap, detectTools, envFileNames, familyOf, hashLoops, inLanguage, lastStyle, loadStyles, missingTools, pickStyles, validateQuestions, validateStyles } from "./styles.mjs";

const specs = loadSpecs();
const lib = loadStyles();
const MATERIALS = [[], ["footage"], ["photos"], ["ui"], ["footage", "photos"], ["footage", "photos", "ui"]];

test("the library holds together: ten looks, known formats, three feel words each", () => {
  assert.deepEqual(validateStyles(lib, specs), []);
  assert.equal(lib.styles.length, 10);
});

test("every format and every mix of material shows every style once, one recommended first, the dimmed ones last", () => {
  for (const format of Object.keys(specs.formats)) for (const material of MATERIALS) for (const tools of [[], [{ id: "image" }]]) {
    const shown = pickStyles(lib, { format, material, tools });
    const where = `${format} with ${material.join("+") || "nothing"}${tools.length ? " and an image tool" : ""}`;
    assert.equal(shown.length, lib.styles.length, `${where}: ${shown.length} shown`);
    const firstDimmed = shown.findIndex((s) => s.state === "dimmed");
    assert.ok(firstDimmed === -1 || shown.slice(firstDimmed).every((s) => s.state === "dimmed"), `${where}: the dimmed ones come last`);
    assert.equal(shown.filter((s) => s.state === "recommended").length, 1, `${where}: one recommended`);
    assert.equal(shown[0].state, "recommended", `${where}: the recommendation comes first`);
    assert.equal(new Set(shown.map((s) => s.id)).size, shown.length, `${where}: no style twice`);
  }
});

test("a promo with footage recommends the footage; a style without its material is dimmed with what it needs", () => {
  const shown = pickStyles(lib, { format: "short-ad", material: ["footage", "photos"] });
  assert.equal(shown[0].id, "footage");
  assert.equal(shown[0].whyDefault, true);
  const ui = shown.find((s) => s.id === "ui-device");
  assert.equal(ui.state, "dimmed");
  assert.match(ui.missing, /app or website/);
});

test("an explainer with nothing filmed recommends a drawn style; realistic scenes need no tool (photos, free libraries, stock or an image tool)", () => {
  const without = pickStyles(lib, { format: "explainer", material: [] });
  assert.equal(without[0].id, "line-art");
  assert.equal(without.find((s) => s.id === "realistic")?.state, "open");
  const withTool = pickStyles(lib, { format: "explainer", material: [], tools: [{ id: "image" }] });
  assert.equal(withTool.find((s) => s.id === "realistic")?.state, "open");
});

test("the agent's recommendation wins, with its reason, and is checked", () => {
  const shown = pickStyles(lib, { format: "short-ad", material: ["footage"], recommended: [{ id: "kinetic-type", why: "the offer is the words" }, { id: "footage", why: "your clips carry the proof" }] });
  assert.deepEqual(shown.slice(0, 2).map((s) => [s.id, s.state, s.why]), [["kinetic-type", "recommended", "the offer is the words"], ["footage", "recommended", "your clips carry the proof"]]);
  assert.throws(() => pickStyles(lib, { format: "short-ad", material: [], recommended: [{ id: "footage", why: "x" }] }), /cannot be recommended/);
  assert.equal(pickStyles(lib, { format: "short-ad", material: ["footage"], recommended: [{ id: "footage", why: "x" }, { id: "3d", why: "y" }] })[1].id, "3d", "any two looks may be mixed");
  assert.throws(() => pickStyles(lib, { format: "short-ad", material: ["footage"], recommended: [{ id: "footage", why: "x" }, { id: "footage", why: "y" }] }), /twice/);
  assert.throws(() => pickStyles(lib, { format: "short-ad", material: ["footage"], recommended: [{ id: "footage" }] }), /say why/);
  assert.throws(() => pickStyles(lib, { format: "short-ad", recommended: [{ id: "a", why: "1" }, { id: "b", why: "2" }, { id: "c", why: "3" }] }), /at most 2/);
});

test("the last film's style is marked, not forced", () => {
  const shown = pickStyles(lib, { format: "short-ad", material: ["footage", "photos"], last: { primary: "collage", secondary: null } });
  assert.equal(shown[0].id, "footage");
  assert.equal(shown.find((s) => s.id === "collage").lastTime, true);
});

test("tools name their provider and what it will do; a key's value is never kept; missing tools list their keys", () => {
  const found = detectTools(lib, { env: { ELEVENLABS_API_KEY: "example-secret-value", EMPTY_KEY: "" }, envFile: "# comment\nPEXELS_API_KEY=abc123\nexport FAL_KEY = \"zzz\"\nNOT_SET=\n", connected: ["video=a video tool on this computer"] });
  assert.deepEqual(found.map((t) => [t.id, t.providers.map((p) => `${p.name}|${p.source}`)]), [
    ["voice", ["ElevenLabs|key ELEVENLABS_API_KEY"]],
    ["image", ["fal|key FAL_KEY"]],
    ["video", ["fal|key FAL_KEY", "a video tool on this computer|connected"]],
    ["stock", ["Pexels|key PEXELS_API_KEY"]],
  ]);
  assert.match(found[0].providers[0].uses, /eleven_multilingual_v2/);
  assert.doesNotMatch(JSON.stringify(found), /example-secret-value|abc123|zzz/);
  assert.deepEqual(envFileNames("A=1\n B = 2\nC=\n#D=4"), ["A", "B"]);
  assert.deepEqual(detectTools(lib, { connected: ["image"] })[0].providers, [{ name: null, uses: null, source: "connected" }]);
  const missing = missingTools(lib, detectTools(lib, { env: { ELEVENLABS_API_KEY: "x" } }));
  assert.deepEqual(missing.map((t) => t.id), ["image", "video", "stock"]);
  assert.deepEqual(missing[0].providers[0], { name: "OpenAI", env: ["OPENAI_API_KEY"] });
});

const ctx = () => ({
  specs,
  shown: pickStyles(lib, { format: "short-ad", material: ["footage", "photos"] }),
  tools: [{ id: "voice" }],
  questions: [{ id: "voice", question: "The voice", options: [{ id: "captions", label: "Captions only" }, { id: "own", label: "My own recording" }], recommended: "captions" }],
});
const start = () => ({ format: "short-ad", family: "sell", platforms: ["reels"], seconds: 15, style: { primary: "footage", secondary: null }, tools: [], answers: { voice: "captions" }, note: "" });

test("any two looks can be picked by tapping; a third is refused; a picked one unpicks; main and accent swap", () => {
  const c = ctx();
  let r = applyTap(start(), { field: "style", value: "3d" }, c);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.choices.style, { primary: "footage", secondary: "3d" }, "the second tap is the accent, in any combination");
  assert.match(applyTap(r.choices, { field: "style", value: "line-art" }, c).error, /two looks at most/);
  r = applyTap(r.choices, { field: "swap" }, c);
  assert.deepEqual(r.choices.style, { primary: "3d", secondary: "footage" });
  r = applyTap(r.choices, { field: "style", value: "3d" }, c);
  assert.deepEqual(r.choices.style, { primary: "footage", secondary: null }, "unpicking the main look makes the accent the main look");
  r = applyTap(r.choices, { field: "style", value: "footage" }, c);
  assert.deepEqual(r.choices.style, { primary: null, secondary: null });
  assert.match(applyTap(r.choices, { field: "swap" }, c).error, /second look/);
});

test("taps that cannot apply come back as a sentence and change nothing", () => {
  const c = ctx();
  const s = start();
  for (const [tap, re] of [
    [{ field: "style", value: "ui-device" }, /app or website/],
    [{ field: "style", value: "watercolour" }, /not one of the styles shown/],
    [{ field: "platforms", value: [] }, /at least one place/],
    [{ field: "platforms", value: ["nowhere"] }, /unknown platform/],
    [{ field: "tools", value: ["image"] }, /not found on this computer/],
    [{ field: "answer", id: "voice", value: "choir" }, /is not an answer/],
    [{ field: "colour", value: "red" }, /unknown field/],
  ]) {
    const r = applyTap(s, tap, c);
    assert.match(r.error, re, JSON.stringify(tap));
    assert.deepEqual(r.choices, s);
  }
  assert.match(applyTap(s, { field: "format", value: "explainer" }, { ...c, lockFormat: true }).error, /makes promo videos/);
  assert.equal(applyTap(s, { field: "format", value: "standard-ad" }, { ...c, lockFormat: true }).choices.format, "standard-ad", "another kind inside the same module is allowed");
});

test("a new kind of video keeps the platforms its family has, and the format names its family", () => {
  const r = applyTap({ ...start(), platforms: ["reels", "tiktok"] }, { field: "format", value: "explainer" }, ctx());
  assert.equal(r.choices.family, "explain");
  assert.deepEqual(r.choices.platforms, ["reels"]);
  assert.deepEqual(applyTap(start(), { field: "format", value: "app-store-preview" }, ctx()).choices.platforms, ["youtube"]);
  assert.equal(familyOf(specs, "testimonial"), "social");
});

test("questions on the page: at most three, each with 2 to 4 answers and a recommended one", () => {
  const q = (id) => ({ id, question: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], recommended: "a" });
  assert.deepEqual(validateQuestions([q("voice")]), []);
  assert.match(validateQuestions([q("a"), q("b"), q("c"), q("d")]).join(), /at most 3/);
  assert.match(validateQuestions([{ ...q("voice"), recommended: "z" }]).join(), /recommended/);
  assert.match(validateQuestions([{ ...q("voice"), options: [{ id: "a", label: "A" }] }]).join(), /2 to 4/);
});

test("preferences keep one entry per film; the last style is the newest film's", () => {
  let prefs = addFilm(null, start(), { film: "spring", at: "2026-10-06T10:00:00Z" });
  prefs = addFilm(prefs, { ...start(), style: { primary: "collage", secondary: "kinetic-type" } }, { film: "summer", at: "2026-10-07T10:00:00Z" });
  prefs = addFilm(prefs, { ...start(), style: { primary: "collage", secondary: "sketch" } }, { film: "summer", at: "2026-10-07T11:00:00Z" });
  assert.deepEqual(prefs.films.map((f) => f.film), ["spring", "summer"]);
  assert.deepEqual(lastStyle(prefs), { primary: "collage", secondary: "sketch" });
  assert.equal(lastStyle(null), null);
});

test("a step handed to Claude goes back to the recommendation and is marked; touching it takes it back", () => {
  const c = { ...ctx(), recommended: start() };
  let r = applyTap({ ...start(), seconds: 6, style: { primary: "vector", secondary: "3d" } }, { field: "decide", step: "look" }, c);
  assert.deepEqual(r.choices.style, { primary: "footage", secondary: null });
  assert.deepEqual(r.choices.decided, { look: true });
  assert.equal(r.choices.seconds, 6, "other steps keep the user's picks");
  r = applyTap(r.choices, { field: "decide", step: "purpose" }, c);
  assert.deepEqual(r.choices.decided, { look: true, purpose: true, kind: true }, "deciding what it is for decides the kind too");
  r = applyTap(r.choices, { field: "style", value: "kinetic-type" }, c);
  assert.deepEqual(r.choices.decided, { purpose: true, kind: true }, "picking a look takes the look step back");
  r = applyTap(r.choices, { field: "decide", step: "purpose", value: false }, c);
  assert.deepEqual(r.choices.decided, { kind: true });
  r = applyTap(r.choices, { field: "decideAll" }, c);
  assert.deepEqual(Object.keys(r.choices.decided).sort(), ["kind", "length", "look", "more", "purpose", "where"]);
  assert.equal(r.choices.seconds, 15);
  assert.match(applyTap(start(), { field: "decide", step: "colour" }, c).error, /unknown step/);
  assert.match(applyTap(start(), { field: "decide", step: "look" }, ctx()).error, /no recommendation/);
});

test("a step handed to Claude is not saved as the user's pick, and the last style skips it", () => {
  let prefs = addFilm(null, { ...start(), style: { primary: "collage", secondary: null } }, { film: "spring", at: "2026-10-06T10:00:00Z" });
  prefs = addFilm(prefs, { ...start(), decided: { look: true, length: true } }, { film: "summer", at: "2026-10-07T10:00:00Z" });
  const summer = prefs.films.at(-1);
  assert.equal(summer.style, null);
  assert.equal(summer.seconds, null);
  assert.deepEqual(summer.platforms, start().platforms);
  assert.deepEqual(lastStyle(prefs), { primary: "collage", secondary: null });
});

test("a look with words in its sample has its own loop and poster per language; hashing covers them", () => {
  const dir = mkdtempSync(join(tmpdir(), "loops-"));
  const file = join(dir, "styles.json");
  const one = { id: "kinetic-type", poster: "k.webp", loop: { file: "k.mp4", seconds: 6, sha256: null, bytes: null }, i18n: { he: { name: "טיפוגרפיה", poster: "k.he.webp", loop: { file: "k.he.mp4", seconds: 6, sha256: null, bytes: null } } } };
  writeFileSync(file, JSON.stringify({ styles: [one] }));
  writeFileSync(join(dir, "k.mp4"), "en");
  writeFileSync(join(dir, "k.he.mp4"), "he!");
  assert.deepEqual(hashLoops({ file }, dir), ["kinetic-type"]);
  const after = JSON.parse(readFileSync(file, "utf8")).styles[0];
  assert.equal(after.loop.bytes, 2);
  assert.equal(after.i18n.he.loop.bytes, 3);
  assert.match(after.i18n.he.loop.sha256, /^[0-9a-f]{64}$/);
  assert.equal(inLanguage(after, "he").poster, "k.he.webp");
  assert.equal(inLanguage(after, "he-IL").loop.file, "k.he.mp4");
  assert.equal(inLanguage(after, "en").loop.file, "k.mp4");
  assert.equal(inLanguage(after, "fr").poster, "k.webp", "a language without its own sample falls back");
});

test("hashing covers every shape of a look's film, in every language", () => {
  const dir = mkdtempSync(join(tmpdir(), "shapes-"));
  const file = join(dir, "styles.json");
  const L = (f) => ({ file: f, seconds: 8, sha256: null, bytes: null });
  writeFileSync(file, JSON.stringify({ styles: [{ id: "vector", poster: "v.webp", loop: L("v.mp4"), loops: { tall: L("v-tall.mp4") }, i18n: { he: { loop: L("v-he.mp4"), loops: { tall: L("v-he-tall.mp4") } } } }] }));
  for (const f of ["v.mp4", "v-tall.mp4", "v-he.mp4", "v-he-tall.mp4"]) writeFileSync(join(dir, f), f);
  hashLoops({ file }, dir);
  const s = JSON.parse(readFileSync(file, "utf8")).styles[0];
  for (const l of [s.loop, s.loops.tall, s.i18n.he.loop, s.i18n.he.loops.tall]) assert.match(l.sha256 ?? "", /^[0-9a-f]{64}$/, l.file);
  assert.throws(() => { writeFileSync(file, JSON.stringify({ styles: [{ ...s, loops: { square: L("missing.mp4") } }] })); hashLoops({ file }, dir); }, /missing\.mp4/);
});
