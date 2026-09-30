// node --test scripts/visual-brief.test.mjs   (needs ffmpeg and ffprobe on PATH)
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAnimatic, buildHtml, checkPlan, writeMotionFiles } from "./visual-brief.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "visual-brief.mjs");
const dir = mkdtempSync(join(tmpdir(), "brief-"));
const footage = join(dir, "footage.mp4");
const still = join(dir, "still.png");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=12", "-pix_fmt", "yuv420p", footage]);
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x7a7468:s=640x360", "-frames:v", "1", still]);
const turn = join(dir, "turn.mp4");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=4", "-pix_fmt", "yuv420p", turn]);
const longTurn = join(dir, "long-turn.mp4");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=9", "-pix_fmt", "yuv420p", longTurn]);
const tone = join(dir, "tone.mp3");
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:d=20", tone]);

const brief = () => ({
  format: "promo",
  title: "A promo for a storage brand",
  plan: ["A **30 s** master and a 15 s cut", "No voiceover: <captions> carry it"],
  styleFrames: [{ image: still, caption: "**The turn.** The finder locks onto the real code." }],
  motionFrames: [{ video: turn, caption: "**The turn, moving.** The code is scanned and the list opens." }],
  hook: { recommended: "Which box has the lights?", why: "the problem in the viewer's words", alternatives: ["Where did the lights go?"] },
  next: "After your **go**: the build starts.",
  brand: [
    { row: "difference", quote: "Every box has a code", source: "home page", scope: "brand", meaning: "the code is the hero" },
    { row: "look", quote: "tidy, calm", source: "about page", scope: "brand", meaning: "few words, slow moves" },
    { row: "signature", quote: "the molded code", source: "product page", scope: "brand", meaning: "the motif" },
    { row: "spine", quote: null, inferredFrom: "how the product is used", scope: "brand", meaning: "from lost to found" },
  ],
  idea: "Every box answers when you scan it.",
  motif: { object: "the molded code", verb: "it answers when scanned, as the product does", links: "each shot finds the code on the next box" },
  moments: [{ thing: "the code on the box", becomes: "the list of what is inside", beat: 2 }],
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
        { at: 0, dur: 3.5, src: 0, len: 3, picture: "A dim basement", words: "Which box has the lights?", in: "Opens on the problem", job: "hook", scale: "wide", changesAt: 2 },
        { at: 3.5, dur: 3, src: 4, len: 2, picture: "The code on the shelf", words: "", in: "MATCH CUT on the code", job: "proof", scale: "close", motif: "the code, handed from the box to the shelf", carries: "the code, same place and size" },
        { at: 6.5, dur: 2, image: still, picture: "The end card", in: "CLOSE", job: "close", scale: "type", carries: "the code settles into the mark" },
      ],
    },
    { name: "15 s", source: footage, beats: [{ at: 0, dur: 2, src: 1, len: 2, picture: "The code", in: "Opens on the answer", job: "hook", scale: "close" }] },
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
  b.cuts = [{ name: "30 s", source: footage, beats: [{ at: 0, dur: 2, src: 0, len: 2, picture: "a", job: "hook", scale: "close" }, { at: 2, dur: 1.5, src: 2, len: 1.5, picture: "b", job: "close", scale: "wide", carries: "the code" }] }];
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

test("the film has a motif that carries it, shown on the page with its part in each shot", () => {
  const html = buildHtml(brief());
  assert.ok(html.includes("<h2>What carries the film</h2><div class=\"box\"><b>the molded code</b>"), "the motif box");
  assert.ok(html.includes('<em class="motif">the code, handed from the box to the shelf</em>'), "its part in a shot");
  const b = brief();
  delete b.motif;
  assert.ok(checkPlan(b).some((p) => p.startsWith("the motif: name the one object")));
  b.motif = { object: "a line from the logo" };
  assert.ok(checkPlan(b).some((p) => p.startsWith("the motif:")), "an object that does nothing is not a motif");
});

test("the brief shows the turn in motion: 3 to 6 s, playable, a strip for the critic and a file to send", () => {
  const html = buildHtml(brief());
  assert.ok(html.includes('<video src="data:video/mp4;base64,'), "the turn plays on the page");
  assert.ok(html.includes("The turn, moving."));
  const b = brief();
  delete b.motionFrames;
  assert.ok(checkPlan(b).some((p) => p.startsWith("motion frame: render 3 to 6 s of the turn")));
  b.motionFrames = [{ video: longTurn }];
  assert.ok(checkPlan(b).some((p) => /motion frame 1: 9\.0 s/.test(p)), "a long clip is a rough cut, not a motion frame");
  const out = join(dir, "motion-out");
  mkdirSync(out, { recursive: true });
  const written = writeMotionFiles(brief(), out);
  assert.equal(written.length, 1);
  assert.ok(existsSync(join(out, "motion-1-strip.png")) && existsSync(join(out, "motion-1.mp4")));
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

test("a promo is dense and varied: enough compositions, no long unchanging shot, the scale changing", () => {
  const b = brief();
  const shot = (at, dur, scale, more = {}) => ({ at, dur, src: 0, len: 1, picture: "p", job: "proof", scale, carries: "the code", ...more });
  b.cuts = [{ name: "30 s", source: footage, beats: [shot(0, 6, "close"), shot(6, 6, "close"), shot(12, 6, "close"), shot(18, 6, "close"), shot(24, 6, "close", { changesAt: 3 })] }];
  b.moments = [1, 2, 3].map((n) => ({ thing: `thing ${n}`, becomes: `result ${n}`, beat: n }));
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /30 s: 5 compositions in 30\.0 s \(5\.0 per 30 s\); a promo holds about 12 to 15/);
  assert.match(problems, /30 s, beat 1: 6\.0 s with no change marked inside it/);
  assert.doesNotMatch(problems, /beat 5: 6\.0 s with no change/, "a change marked inside the shot is enough");
  assert.match(problems, /30 s: every shot is close; 30\.0 s needs at least 3 scales/);
  assert.match(problems, /30 s, beat 3: the third close shot running/);
  delete b.cuts[0].beats[0].scale;
  assert.ok(checkPlan(b).some((p) => p.startsWith("30 s, beat 1: say how much of the world the frame shows (scale:")));
});

test("every cut hands something on, and the film names the moments a viewer remembers", () => {
  const b = brief();
  delete b.cuts[0].beats[1].carries;
  delete b.moments;
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /30 s, beat 2: say what the eye follows over the cut into this shot \(carries\)/);
  assert.doesNotMatch(problems, /beat 1: say what the eye follows/, "the first shot has no cut before it");
  assert.match(problems, /moments: name the moment a viewer will remember/);
  b.moments = [{ thing: "the code" }];
  const more = checkPlan(b).join("\n");
  assert.match(more, /moments, 1: say the thing and what it becomes/);
  assert.match(more, /moments, 1: say which beat of the first cut it happens in/);
  const html = buildHtml(brief());
  assert.ok(html.includes('<h2>The moments you will remember</h2><ol class="moments"><li><b>the code on the box</b> <span class="mute">becomes</span> <b>the list of what is inside</b></li></ol>'));
  assert.ok(html.includes('<em class="carry">Carried over the cut: the code, same place and size</em>'));
  assert.ok(html.includes('<span class="job">proof</span> · <span class="job">close</span>'), "the scale sits beside the job");
});

test("the pace and carry rules are the promo's; every brief names its module", () => {
  const b = brief();
  b.format = "tutorial";
  delete b.moments;
  for (const beat of b.cuts[0].beats) {
    delete beat.scale;
    delete beat.carries;
  }
  assert.deepEqual(checkPlan(b), [], "a tutorial holds on a step and cuts inside a recording");
  delete b.format;
  assert.ok(checkPlan(b).some((p) => p.startsWith("format: name the module this film is")));
});

test("a promo's first shot does not wait: something changes within 3 s, in a feed or out of one", () => {
  const b = brief();
  delete b.cuts[0].beats[0].changesAt;
  assert.ok(checkPlan(b).some((p) => p.startsWith("the opening, 30 s: nothing changes for 3.5 s; a picture that waits under its line is not a hook")));
  b.cuts[0].beats[0].changesAt = 1;
  assert.deepEqual(checkPlan(b), []);
  b.feed = true;
  b.music.startSeconds = 0;
  assert.ok(checkPlan(b).some((p) => p.startsWith("feed, 30 s: nothing changes for 2.5 s")), "in a feed the wait after the one change is too long");
  b.cuts[0].beats[0].changesAt = [1, 2, 3];
  assert.deepEqual(checkPlan(b), [], "a part arriving each second");
  delete b.feed;
  b.format = "tutorial";
  delete b.cuts[0].beats[0].changesAt;
  assert.deepEqual(checkPlan(b).filter((p) => p.startsWith("the opening")), [], "a tutorial opens on its result, which may hold");
  assert.ok(buildHtml({ ...brief(), hook: { ...brief().hook, kind: "the problem, seen" } }).includes('<span class="job">the problem, seen</span><br><b>Which box has the lights?</b>'));
});

test("a number on screen comes from the facts list, never from memory", () => {
  const b = brief();
  b.cuts[0].beats[1].words = "24 boxes, found in 3 seconds";
  b.hook.recommended = "90% of boxes are never opened";
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /30 s, beat 2: "24" is on screen but in no fact/);
  assert.match(problems, /30 s, beat 2: "3" is on screen but in no fact/);
  assert.match(problems, /the opening line: "90" is on screen but in no fact/);
  b.facts = [{ text: "a set of 24 boxes", source: "the product page" }, { text: "found in 3 seconds", source: "the home page" }, { text: "90% of boxes" }];
  const left = checkPlan(b);
  assert.equal(left.length, 1, left.join("\n"));
  assert.match(left[0], /facts: "90% of boxes" needs its text and where it comes from/);
});
