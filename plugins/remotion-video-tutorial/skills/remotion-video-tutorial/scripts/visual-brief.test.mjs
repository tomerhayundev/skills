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
  music: tone,
  musicLiftSeconds: 4,
  cuts: [
    {
      name: "30 s",
      message: "Scan the code to see what's inside.",
      turnAt: 3.5,
      source: footage,
      crop: null,
      beats: [
        { at: 0, dur: 3.5, src: 0, len: 3, picture: "A dim basement", words: "Which box has the lights?", in: "Opens on the problem" },
        { at: 3.5, dur: 3, src: 4, len: 2, picture: "The code on the shelf", words: "", in: "MATCH CUT on the code" },
        { at: 6.5, dur: 2, image: still, picture: "The end card", in: "CLOSE" },
      ],
    },
    { name: "15 s", source: footage, beats: [{ at: 0, dur: 2, src: 1, len: 2, picture: "The code", in: "Opens on the answer" }] },
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

test("the plan is checked: gaps, the 0.5 s grid, reading time", () => {
  assert.deepEqual(checkPlan(brief()), []);
  const b = brief();
  b.cuts[0].beats[1].at = 4;
  b.cuts[0].beats[2].dur = 1.2;
  b.cuts[0].beats[0].dur = 1.5;
  b.cuts[0].beats[0].words = "Which one of these many boxes has the lights?";
  const problems = checkPlan(b).join("\n");
  assert.match(problems, /30 s, beat 2: starts at 4\.0 s, but the beat before it ends at 1\.5 s/);
  assert.match(problems, /beat 3: 1\.2 s is off the 0\.5 s grid/);
  assert.match(problems, /beat 1: 9 words need about 3\.2 s on screen, the beat has 1\.5 s/);
});

test("the rough cut is the cut's length, with the music, and is marked internal", () => {
  const out = join(dir, "rough.mp4");
  const r = buildAnimatic(brief(), brief().cuts[0], out);
  assert.equal(r.music, true);
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
  const rough = spawnSync(process.execPath, [script, json, `--out=${outDir}`, "--animatic"], { encoding: "utf8" });
  assert.match(rough.stdout, /animatic-30s\.mp4 .*internal: pacing and reading time; never sent to the user/);
});
