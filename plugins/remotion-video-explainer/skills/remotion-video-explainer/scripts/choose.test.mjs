// node --test scripts/choose.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSpecs } from "./recommend.mjs";
import { loadStyles, pickStyles } from "./styles.mjs";
import { buildPage, buildView, cachedLoop, initialChoices, lengthNotes, lengthOptions, prepareMedia, scanMedia, startChooser } from "./choose.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "choose.mjs");
const specs = loadSpecs();
const lib = loadStyles();
const tmp = () => mkdtempSync(join(tmpdir(), "chooser-"));
// The machine running the tests may hold real keys: the CLI tests run without any.
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/(_KEY|_TOKEN)$/.test(k)));
const setup = () => {
  const shown = pickStyles(lib, { format: "short-ad", material: ["footage", "photos"] });
  const questions = [{ id: "voice", question: "The voice", options: [{ id: "captions", label: "Captions only" }, { id: "own", label: "My own recording" }], recommended: "captions" }];
  const choices = initialChoices(specs, { format: "short-ad", platforms: ["reels"], shown, questions });
  const tools = [{ id: "voice", name: "AI voice", adds: "A voiceover", providers: [{ name: "ElevenLabs", uses: "Text to speech", source: "key ELEVENLABS_API_KEY" }] }];
  return { root: tmp(), lib, specs, choices, shown, tools, questions, cacheDir: tmp() };
};
const post = (url, path, body) => fetch(new URL(path, url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

test("the first choices are the recommendation: the recommended style, length and answers, the look left to Claude", () => {
  const s = setup();
  assert.deepEqual(s.choices.style, { primary: "footage", secondary: null });
  assert.deepEqual(s.choices.decided, { look: true }, "Claude picks the look unless the user taps one");
  assert.equal(s.choices.seconds, 15);
  assert.deepEqual(s.choices.answers, { voice: "captions" });
  assert.equal(s.choices.family, "sell");
  assert.throws(() => initialChoices(specs, { format: "short-ad", platforms: ["nowhere"], shown: s.shown }), /unknown platform/);
});

test("lengths: a real range around the recommended one; a long one says which cut comes too; only a hard limit blocks", () => {
  const ex = lengthOptions(specs, "explainer", ["reels"]);
  assert.deepEqual(ex.map((o) => o.seconds), [30, 45, 60, 75, 90, 120, 180, 240], "an explainer for Reels is not stuck at 75 s");
  assert.equal(ex.find((o) => o.seconds === 180).why, "Longer than this kind usually runs · + a 45 s cut for Instagram Reels");
  assert.equal(ex.find((o) => o.recommended).seconds, 75);
  assert.match(ex.find((o) => o.seconds === 75).why, /45 s cut for Instagram Reels/);
  assert.equal(ex.find((o) => o.seconds === 45).why, "Shorter than this kind usually runs");
  assert.equal(ex.find((o) => o.seconds === 60).why, "+ a 45 s cut for Instagram Reels");
  assert.ok(ex.every((o) => !o.disabled));
  assert.deepEqual(lengthOptions(specs, "short-ad", ["reels"]).map((o) => [o.seconds, o.recommended]), [[6, false], [10, false], [15, true], [20, false], [30, false]]);
  const tut = lengthOptions(specs, "tutorial", ["youtube", "reels"]);
  assert.equal(tut.length, 8);
  assert.equal(tut.find((o) => o.recommended).seconds, 180);
  const store = lengthOptions(specs, "app-store-preview", ["app-store"]);
  assert.ok(store.find((o) => o.seconds === 10).disabled, "below the store's 15 s minimum");
  assert.equal(lengthNotes(specs, "short-ad", ["x"], 200).disabled, true, "past X's upload limit");
  assert.equal(lengthNotes(specs, "short-ad", ["reels"], 40).disabled, false, "any length a platform accepts can be typed in");
});

test("a typed length is kept when every platform accepts it, and refused with the reason when one does not", async () => {
  const s = setup();
  const c = await startChooser(s);
  let r = await post(c.url, "/tap", { field: "seconds", value: 22 });
  assert.equal((await r.json()).choices.seconds, 22);
  r = await post(c.url, "/tap", { field: "platforms", value: ["x"] });
  assert.equal((await r.json()).choices.seconds, 22, "X takes up to 140 s");
  r = await post(c.url, "/tap", { field: "seconds", value: 200 });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /allows up to 140 s/);
  c.close();
  await c.finished;
});

test("the project's own photos and clips are found and cut to card size for the footage and collage looks", () => {
  const dir = tmp();
  spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1080x1920:r=30:d=4", "-pix_fmt", "yuv420p", join(dir, "clip.mp4")]);
  for (const n of ["a", "b"]) spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xc9673e:s=800x800", "-frames:v", "1", join(dir, `${n}.jpg`)]);
  const found = scanMedia(dir);
  assert.equal(found.videos.length, 1);
  assert.equal(found.images.length, 2);
  const media = prepareMedia(found, tmp());
  assert.equal(media.clips.length, 1);
  assert.equal(media.stills.length, 2);
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", media.clips[0]], { encoding: "utf8" }).stdout.trim();
  assert.equal(probe, "960,600", "cropped to the card");
  const v = buildView({ ...setup(), media, lang: "en" });
  assert.equal(media.clipPosters.length, 1, "a frame of the clip to show while it loads");
  assert.deepEqual(v.media, { stills: ["/media/s0", "/media/s1"], clips: ["/media/c0"], clipPosters: ["/media/p0"] });
});

test("the view names each found tool's provider and lists the tools not set up with their keys", () => {
  const v = buildView({ ...setup(), lang: "en" });
  assert.deepEqual(v.tools[0].providers[0], { name: "ElevenLabs", uses: "Text to speech", source: "key ELEVENLABS_API_KEY" });
  assert.deepEqual(v.missing.map((t) => t.id), ["image", "video", "stock"]);
  assert.ok(v.missing[0].providers.some((p) => p.env.includes("OPENAI_API_KEY")));
});

test("every tap is saved; sending writes the choices and the preferences and ends the page", async () => {
  const s = setup();
  const c = await startChooser({ ...s, film: "spring" });
  const saved = () => JSON.parse(readFileSync(join(s.root, "docs", "choices.json"), "utf8"));
  let r = await post(c.url, "/tap", { field: "style", value: "3d" });
  assert.equal(r.status, 200);
  assert.deepEqual(saved().style, { primary: "3d", secondary: null }, "the first tap takes the look from Claude and starts the user's own pick");
  assert.deepEqual(saved().decided, {});
  r = await post(c.url, "/tap", { field: "style", value: "footage" });
  assert.deepEqual(saved().style, { primary: "3d", secondary: "footage" }, "any two looks mix");
  assert.equal(saved().done, false);
  r = await post(c.url, "/tap", { field: "style", value: "line-art" });
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /two looks at most/);
  r = await post(c.url, "/tap", { field: "swap" });
  assert.deepEqual((await r.json()).choices.style, { primary: "footage", secondary: "3d" });
  r = await post(c.url, "/tap", { field: "platforms", value: ["reels", "youtube"] });
  assert.equal((await r.json()).choices.seconds, 15);
  await post(c.url, "/tap", { field: "tools", value: ["voice"] });
  await post(c.url, "/done");
  const rec = await c.finished;
  assert.equal(rec.done, true);
  assert.equal(rec.chosenBy, "user");
  assert.deepEqual(rec.tools, ["voice"]);
  assert.deepEqual(rec.toolsFound, ["voice"]);
  const prefs = JSON.parse(readFileSync(join(s.root, "docs", "preferences.json"), "utf8"));
  assert.deepEqual(prefs.films.map((f) => [f.film, f.style.primary, f.style.secondary]), [["spring", "footage", "3d"]]);
});

test("sending needs a look", async () => {
  const s = setup();
  const c = await startChooser(s);
  await post(c.url, "/tap", { field: "style", value: "footage" }); // picked
  await post(c.url, "/tap", { field: "style", value: "footage" }); // and taken off again
  const r = await post(c.url, "/done");
  assert.equal(r.status, 400);
  assert.match((await r.json()).error, /pick a look/);
  c.close();
  assert.equal((await c.finished).done, false);
});

test("the page is in the user's language and direction, offers send and copy, has no em dash, and its data cannot end the script early", () => {
  const s = setup();
  const he = buildPage(buildView({ ...s, lang: "he" }));
  assert.match(he, /<html lang="he" dir="rtl">/);
  assert.match(he, /בואו נגדיר את הסרטון/);
  assert.match(he, /בשביל מה הסרטון/);
  assert.match(he, /הגדרות נוספות/);
  assert.match(he, /שליחה ל־Claude/);
  assert.match(he, /העתקה כהודעה/);
  assert.match(he, /הלוק והתחושה/);
  assert.match(he, /צילומים אמיתיים/);
  assert.match(he, /מתאים לסוג הסרטון הזה/, "the default reason is in Hebrew too");
  assert.ok(!he.includes(String.fromCharCode(0x2014)), "no em dash");
  const en = buildPage(buildView({ ...s, lang: "en", choices: { ...s.choices, note: "</script><b>x" } }));
  assert.match(en, /dir="ltr"/);
  assert.equal(en.split("</script>").length, 2, "one closing script tag: the page's own");
});

test("a locked format shows only the kinds of its own module", () => {
  const s = setup();
  const v = buildView({ ...s, lang: "en", lockFormat: true });
  assert.ok(v.lockedFormats.length > 1);
  assert.ok(v.lockedFormats.every((f) => specs.formats[f.id].module === "promo"));
});

test("a loop is downloaded once, checked against its checksum, and served from the cache", async () => {
  const bytes = Buffer.from("a few bytes standing in for an mp4");
  const sum = createHash("sha256").update(bytes).digest("hex");
  let hits = 0;
  const origin = createServer((req, res) => {
    hits++;
    if (req.url === "/footage.mp4") return res.end(bytes);
    res.statusCode = 404;
    res.end();
  });
  await new Promise((ok) => origin.listen(0, "127.0.0.1", ok));
  const fake = { ...lib, loopBase: `http://127.0.0.1:${origin.address().port}/` };
  const style = { id: "footage", loop: { file: "footage.mp4", sha256: sum } };
  const dir = tmp();
  assert.deepEqual(readFileSync(await cachedLoop(fake, style, dir)), bytes);
  await cachedLoop(fake, style, dir);
  assert.equal(hits, 1, "the second time comes from the cache");
  assert.equal(await cachedLoop(fake, { id: "x", loop: { file: "footage.mp4", sha256: "0".repeat(64) } }, tmp()), null, "a wrong checksum is not kept");
  assert.equal(await cachedLoop(fake, { id: "y", loop: { file: "missing.mp4", sha256: sum } }, tmp()), null);
  assert.equal(await cachedLoop(fake, { id: "z", loop: { file: "z.mp4", sha256: null } }, tmp()), null, "not released yet");
  assert.equal(await cachedLoop({ ...lib, loopBase: "http://127.0.0.1:9/" }, style, tmp()), null, "offline: the page shows the poster");
  origin.close();
});

test("the page serves a cached loop in byte ranges, so the video can loop", async () => {
  const s = setup();
  const bytes = Buffer.from("0123456789");
  const sum = createHash("sha256").update(bytes).digest("hex");
  const withLoop = { ...lib, styles: lib.styles.map((x) => (x.id === "footage" ? { ...x, loop: { ...x.loop, sha256: sum } } : x)) };
  writeFileSync(join(s.cacheDir, "footage.mp4"), bytes);
  const c = await startChooser({ ...s, lib: withLoop });
  const r = await fetch(new URL("/loop/footage", c.url), { headers: { range: "bytes=2-5" } });
  assert.equal(r.status, 206);
  assert.equal(await r.text(), "2345");
  assert.equal(r.headers.get("content-type"), "video/mp4");
  c.close();
  await c.finished;
});

test("hands-off writes the recommendation as assumed choices and prints them, with no page and no preferences", () => {
  const root = tmp();
  const r = spawnSync(process.execPath, [script, "--format=explainer", "--platforms=youtube", "--hands-off", "--recommend=diagram:the idea is a process"], { cwd: root, encoding: "utf8", env: cleanEnv });
  assert.equal(r.status, 0, r.stderr);
  const rec = JSON.parse(r.stdout.match(/^choices (.+)$/m)[1]);
  assert.equal(rec.chosenBy, "assumed");
  assert.deepEqual(rec.style, { primary: "diagram", secondary: null });
  assert.ok(existsSync(join(root, "docs", "choices.json")));
  assert.ok(!existsSync(join(root, "docs", "preferences.json")));
});

test("the static page needs no server: no saving, nothing fetched from it", () => {
  const root = tmp();
  const r = spawnSync(process.execPath, [script, "--format=short-ad", "--static=out/chooser.html"], { cwd: root, encoding: "utf8", env: cleanEnv });
  assert.equal(r.status, 0, r.stderr);
  const html = readFileSync(join(root, "out", "chooser.html"), "utf8");
  assert.match(html, /const STATIC=true/);
  assert.doesNotMatch(html, /"\/poster\//);
});

test("a key's value never reaches the output or the saved choices", () => {
  const root = tmp();
  writeFileSync(join(root, ".env"), "ELEVENLABS_API_KEY=example-very-secret\n");
  const r = spawnSync(process.execPath, [script, "--format=explainer", "--hands-off"], { cwd: root, encoding: "utf8", env: cleanEnv });
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout + readFileSync(join(root, "docs", "choices.json"), "utf8"), /example-very-secret/);
  assert.match(r.stdout, /"toolsFound":\["voice"\]/);
});

test("a bad flag stops with the reason", () => {
  const r = spawnSync(process.execPath, [script, "--format=movie", "--hands-off"], { cwd: tmp(), encoding: "utf8", env: cleanEnv });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--format: one of/);
});

test("the length follows the recommendation until the user picks one", async () => {
  const s = setup();
  const c = await startChooser(s);
  let v = await (await post(c.url, "/tap", { field: "format", value: "standard-ad" })).json();
  assert.equal(v.choices.seconds, 30, "a standard ad starts at its own recommended length");
  v = await (await post(c.url, "/tap", { field: "seconds", value: 20 })).json();
  v = await (await post(c.url, "/tap", { field: "platforms", value: ["reels", "youtube"] })).json();
  assert.equal(v.choices.seconds, 20, "a length the user picked stays");
  c.close();
  await c.finished;
});

test("a look can carry its own loop for a language, and the page serves the one for its language", async () => {
  const s = setup();
  const sum = (b) => createHash("sha256").update(b).digest("hex");
  const en = Buffer.from("english");
  const he = Buffer.from("hebrew!");
  const styled = { ...lib, styles: lib.styles.map((x) => (x.id === "footage" ? { ...x, loop: { ...x.loop, file: "f.mp4", sha256: sum(en) }, i18n: { ...x.i18n, he: { ...x.i18n.he, loop: { file: "f.he.mp4", seconds: 6, sha256: sum(he) } } } } : x)) };
  writeFileSync(join(s.cacheDir, "f.mp4"), en);
  writeFileSync(join(s.cacheDir, "f.he.mp4"), he);
  for (const [lang, want] of [["en", "english"], ["he", "hebrew!"]]) {
    const c = await startChooser({ ...s, lib: styled, lang });
    try {
      const r = await fetch(new URL("/loop/footage", c.url));
      assert.equal(await r.text(), want, lang);
    } finally {
      c.close();
      await c.finished;
    }
  }
});

test("a look's film comes in the frame's shape: the page asks for tall, square or portrait and gets that film, or wide when there is none", async () => {
  const s = setup();
  const sum = (b) => createHash("sha256").update(b).digest("hex");
  const wide = Buffer.from("wide!");
  const tall = Buffer.from("tall!!");
  const styled = { ...lib, styles: lib.styles.map((x) => (x.id === "footage" ? { ...x, loop: { ...x.loop, file: "w.mp4", sha256: sum(wide) }, loops: { tall: { file: "t.mp4", seconds: 8, sha256: sum(tall) } }, i18n: { ...x.i18n, he: { ...x.i18n.he, loop: undefined, loops: undefined } } } : x)) };
  writeFileSync(join(s.cacheDir, "w.mp4"), wide);
  writeFileSync(join(s.cacheDir, "t.mp4"), tall);
  // the page lists the shapes of the looks it shows
  const shown = s.shown.map((x) => (x.id === "footage" ? { ...x, loops: styled.styles.find((y) => y.id === "footage").loops } : x));
  const c = await startChooser({ ...s, lib: styled, shown });
  try {
    for (const [q, want] of [["", "wide!"], ["?shape=tall", "tall!!"], ["?shape=square", "wide!"], ["?shape=bogus", "wide!"]]) {
      const r = await fetch(new URL(`/loop/footage${q}`, c.url));
      assert.equal(await r.text(), want, q || "no shape");
    }
    const v = await (await fetch(new URL("/state", c.url))).json();
    assert.deepEqual(v.styles.find((x) => x.id === "footage")?.shapes ?? [], ["tall"]);
  } finally {
    c.close();
    await c.finished;
  }
});
