// node --test scripts/visual-brief.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnimatic, buildHtml, checkPlan } from "./visual-brief.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "visual-brief.mjs");
const dir = mkdtempSync(join(tmpdir(), "brief-"));
const footage = join(dir, "footage.mp4");
const still = join(dir, "still.png");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=12", "-pix_fmt", "yuv420p", footage]);
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x7a7468:s=640x360", "-frames:v", "1", still]);
const tone = join(dir, "tone.mp3");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=20", tone]);

const brief = () => ({
  title: "A promo for a storage brand",
  plan: ["A **30 s** master and a 15 s cut", "No voiceover: <captions> carry it"],
  styleFrames: [{ image: still, caption: "**The turn.** The finder locks onto the real code." }],
  hook: { recommended: "Which box has the lights?", why: "the problem in the viewer's words", alternatives: ["Where did the lights go?"] },
  next: "After your **go**: the build starts.",
  brand: [
    { row: "difference", quote: "Every box has a code", source: "home page", scope: "brand", meaning: "the code is the hero" },
    { row: "look", quote: "tidy, calm", source: "about page", scope: "brand", meaning: "few words, slow moves" },
    { row: "signature", quote: "the molded code", source: "product page", scope: "brand", meaning: "the motif" },
    { row: "spine", quote: null, inferredFrom: "how the product is used", scope: "brand", meaning: "from lost to found" },
  ],
  idea: "Every box answers when you scan it.",
  asks: [{ item: "the app", where: "the scan at the turn" }],
  music: { id: "calm-90", title: "A calm track", artist: "Someone", bpm: 120, why: "calm, like the brand says it is", file: tone, liftSeconds: 4 },
  cuts: [
    {
      name: "30 s",
      message: "Scan the code to see what's inside.",
      turnAt: 3.5,
      source: footage,
      crop: null,
      beats: [
        { at: 0, dur: 3.5, src: 0, len: 3, picture: "A dim basement", words: "Which box has the lights?", in: "Opens on the problem", job: "hook" },
        { at: 3.5, dur: 3, src: 4, len: 2, picture: "The code on the shelf", words: "", in: "MATCH CUT on the code", job: "proof" },
        { at: 6.5, dur: 2, image: still, picture: "The end card", in: "CLOSE", job: "close" },
      ],
    },
    { name: "15 s", source: footage, beats: [{ at: 0, dur: 2, src: 1, len: 2, picture: "The code", in: "Opens on the answer", job: "hook" }] },
  ],
});

test("the page is the one message to approve: plan, style frames, a storyboard per cut, the hook", () => {
  const html = buildHtml(brief());
  assert.match(html, /Reply <b>go<\/b>/);
  assert.match(html, /<b>30 s<\/b> master/);
  assert.match(html, /No voiceover: &lt;captions&gt; carry it/, "text is escaped");
  assert.equal((html.match(/<h2>Storyboard, /g) ?? []).length, 2);
  assert.match(html, /<div class="tag">MATCH CUT on the code<\/div>/);
  assert.match(html, /<q>Which box has the lights\?<\/q>/);
  assert.match(html, /<i>no words<\/i>/);
  assert.match(html, /In one sentence:<\/span> Scan the code/);
  assert.equal((html.match(/src="data:image\/jpeg;base64,/g) ?? []).length, 5, "1 style frame + 4 beats, all embedded");
  assert.match(html, /Also possible:<\/span> "Where did the lights go\?"/);
  assert.match(html, /prefers-color-scheme:dark/);
});

test("the brand read, the idea, the asks and the music come first, with the track's lift to play", () => {
  const html = buildHtml(brief());
  const at = (s) => html.indexOf(s);
  assert.ok(at("What I understood about your brand") > 0 && at("What I understood about your brand") < at("The plan"), "the brand read opens the page");
  assert.match(html, /<th>What sets you apart<\/th><td><q>Every box has a code<\/q><small>home page<\/small><\/td><td>the code is the hero<\/td>/);
  assert.match(html, /Not said on your site; inferred from how the product is used/);
  assert.match(html, /<h2>The idea<\/h2><div class="box idea">Every box answers when you scan it\.<\/div>/);
  assert.match(html, /<th>the app<\/th><td>the scan at the turn<\/td>/);
  assert.match(html, /<audio controls preload="metadata" src="data:audio\/mpeg;base64,/);
  assert.match(html, /calm, like the brand says it is/);
});

test("the page speaks the user's language: Hebrew reads right to left", () => {
  const b = brief();
  b.lang = "he";
  const html = buildHtml(b);
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /מה הבנתי על המותג/);
  assert.match(html, /מה ביקשתם, ואיפה זה בסרט/);
  const custom = buildHtml({ ...brief(), lang: "de", labels: { idea: "Die Idee" } });
  assert.match(custom, /<html lang="de" dir="ltr">/);
  assert.match(custom, /<h2>Die Idee<\/h2>/);
});

test("no brief without the brand read, the idea, every asked item placed and the music's reason", () => {
  const b = brief();
  delete b.brand;
  delete b.idea;
  delete b.asks;
  b.music = { id: "calm-90", bpm: 120 };
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /brand read: missing/);
  assert.match(problems, /the idea: missing/);
  assert.match(problems, /asks: list every item the user asked for/);
  assert.match(problems, /music: say why this track fits the brand's look/);
  const c = brief();
  c.brand = c.brand.filter((r) => r.row !== "signature");
  c.brand[0].quote = "";
  c.asks.push({ item: "the classes" });
  const more = checkPlan(c).join("\n");
  assert.match(more, /brand read: no "signature" row/);
  assert.match(more, /brand read, difference: quote the brand's own words/);
  assert.match(more, /asks: "the classes" has no place in the film/);
  const legacy = brief();
  legacy.music = "public/music/track.mp3";
  assert.match(checkPlan(legacy).join("\n"), /music: name the track from the library/);
});

test("every brand row says what it is about; one collection's detail never carries the brand", () => {
  const b = brief();
  delete b.brand[1].scope;
  b.brand[0].scope = "the new collection";
  b.brand[2].scope = "the new collection";
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /brand read, look: say what it is about/);
  assert.match(problems, /brand read, difference: taken from the new collection, one part of the brand/);
  assert.doesNotMatch(problems, /brand read, signature: taken from/, "a part-only signature is shown for confirmation, not refused");
  const html = buildHtml(b);
  assert.match(html, /<small class="confirm">Please confirm: this is said only about the new collection<\/small>/);
  assert.equal((html.match(/class="confirm"/g) ?? []).length, 2, "only the rows taken from one part are marked");
});

test("in a feed: the track starts on its beat, the first shot changes within 2 s, and a promo stays at 30 s", () => {
  const b = brief();
  b.feed = true;
  b.cuts = [{ name: "51 s", source: footage, beats: [
    { at: 0, dur: 3.5, src: 0, len: 3, picture: "the printer" },
    { at: 3.5, dur: 28, src: 1, len: 3, picture: "everything else" },
  ] }];
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /feed: start the track where its beat already plays/);
  assert.match(problems, /feed, 51 s: nothing changes for 3\.5 s/);
  assert.match(problems, /feed, 51 s: 31\.5 s; a promo in a feed is 15 to 30 s/);
  b.music.startSeconds = 0;
  b.cuts[0].beats = [{ at: 0, dur: 1.5, src: 0, len: 1.5, picture: "the pour, mid-action" }, { at: 1.5, dur: 28.5, src: 1, len: 3, picture: "the rest" }];
  assert.deepEqual(checkPlan(b).filter((p) => p.startsWith("feed")), []);
  b.cuts[0].beats = [{ at: 0, dur: 2.5, src: 0, len: 2.5, picture: "the pour, then a push-in", changesAt: 1.5 }, { at: 2.5, dur: 27.5, src: 1, len: 3, picture: "the rest" }];
  assert.deepEqual(checkPlan(b).filter((p) => p.startsWith("feed")), [], "a hook line can stay up across a change inside the shot");
  delete b.feed;
  b.cuts[0].beats[0].dur = 3.5;
  assert.equal(checkPlan(b).filter((p) => p.startsWith("feed")).length, 0, "the feed checks apply only to a feed");
});

test("the music plays from where the film starts it, with alternatives to choose by ear", () => {
  const b = brief();
  b.music.startSeconds = 2;
  b.music.alternatives = [{ id: "warm-120", title: "A warm guitar", why: "more lift for a Reel", file: tone, startSeconds: 0 }];
  const html = buildHtml(b);
  assert.equal((html.match(/<audio controls preload="metadata" src="data:audio\/mpeg;base64,/g) ?? []).length, 2);
  assert.match(html, /Also possible, each from where the film would start it:/);
  assert.match(html, /<div class="alt"><b>A warm guitar<\/b>/);
});

test("beats sit on the chosen track's beat grid, not a fixed 0.5 s", () => {
  const b = brief();
  b.music.bpm = 90;
  b.cuts = [{ name: "30 s", source: footage, beats: [{ at: 0, dur: 2, src: 0, len: 2, picture: "a", job: "hook" }, { at: 2, dur: 1.5, src: 2, len: 1.5, picture: "b", job: "close" }] }];
  const problems = checkPlan(b);
  assert.equal(problems.length, 1, problems.join("\n"));
  assert.match(problems[0], /beat 2: 1\.5 s is off the 0\.667 s beat grid/);
});

test("a file that is not on disk is named, and the page still builds with a stand-in", () => {
  const b = brief();
  b.cuts[0].beats[2].image = join(dir, "clips", "GONE.mp4");
  assert.ok(checkPlan(b).some((p) => p.includes("GONE.mp4 is not on disk")));
  const html = buildHtml(b);
  assert.ok(html.includes("data:image/svg+xml;base64,"), "a stand-in frame");
  assert.ok(Buffer.from(html.match(/data:image\/svg\+xml;base64,([^"]+)/)[1], "base64").toString().includes("missing: GONE.mp4"));
});

test("every shot says its job, and the page shows it", () => {
  assert.ok(buildHtml(brief()).includes('2 · 3.5-6.5 s · <span class="job">proof</span>'), "the job is on the storyboard");
  const b = brief();
  delete b.cuts[0].beats[1].job;
  assert.ok(checkPlan(b).some((p) => p.startsWith("30 s, beat 2: say what this shot does for the viewer (job)")));
});

test("the plan is checked: gaps, the 0.5 s grid, reading time", () => {
  assert.deepEqual(checkPlan(brief()), []);
  const b = brief();
  b.cuts[0].beats[1].at = 4;
  b.cuts[0].beats[2].dur = 1.2;
  b.cuts[0].beats[0].dur = 1.5;
  b.cuts[0].beats[0].words = "Which one of these many boxes has the lights?";
  b.cuts[0].beats[1].words = "In the box \u2014 the lights";
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /beat 2: a long dash in the words on screen/);
  assert.match(problems, /30 s, beat 2: starts at 4\.0 s, but the beat before it ends at 1\.5 s/);
  assert.match(problems, /beat 3: 1\.2 s is off the 0\.5 s beat grid/);
  assert.match(problems, /beat 1: 9 words need about 3\.2 s on screen, the beat has 1\.5 s/);
});

test("the rough cut is the cut's length, with the music, and is marked internal", () => {
  const out = join(dir, "rough.mp4");
  const r = buildAnimatic(brief(), brief().cuts[0], out);
  assert.equal(r.music, true);
  const legacy = { ...brief(), music: tone, musicLiftSeconds: 4 };
  assert.equal(buildAnimatic(legacy, legacy.cuts[0], join(dir, "rough-legacy.mp4")).music, true, "the old music path still plays");
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", out], { encoding: "utf8" });
  const info = JSON.parse(probe.stdout);
  assert.ok(Math.abs(Number(info.format.duration) - 8.5) < 0.15, info.format.duration);
  assert.deepEqual(info.streams.map((s) => s.codec_type).sort(), ["audio", "video"]);
});

test("the command writes the page, and the rough cut only when asked, labelled internal", () => {
  const json = join(dir, "brief.json");
  writeFileSync(json, JSON.stringify(brief()));
  const outDir = join(dir, "out");
  const plain = spawnSync(process.execPath, [script, json, `--out=${outDir}`], { encoding: "utf8" });
  assert.equal(plain.status, 0, plain.stdout + plain.stderr);
  assert.ok(existsSync(join(outDir, "visual-brief.html")));
  assert.ok(!existsSync(join(outDir, "animatic-30s.mp4")));
  assert.ok(existsSync(join(outDir, "music-1-calm-90.mp3")), "the music is also a file to send");
  assert.match(plain.stdout, /music-1-calm-90.mp3 .*send it as a file too/);
  const rough = spawnSync(process.execPath, [script, json, `--out=${outDir}`, "--animatic"], { encoding: "utf8" });
  assert.match(rough.stdout, /animatic-30s\.mp4 .*internal: pacing and reading time; never sent to the user/);
});
