// node --test scripts/get-track.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getTrack, listing, loadLibrary, wholeFrames } from "./get-track.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "get-track.mjs");
const dir = mkdtempSync(join(tmpdir(), "track-"));
const audio = Buffer.from("not really an mp3, but bytes with a checksum");
const sum = createHash("sha256").update(audio).digest("hex");
const sum1 = createHash("sha1").update(audio).digest("hex");
let throttled = 0;
const seenAgents = [];
writeFileSync(join(dir, "bundled.mp3"), audio);
// A real 10 s track at "122 BPM", for the time stretch.
spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=330:d=10", "-c:a", "libmp3lame", "-q:a", "4", join(dir, "real.mp3")]);
const real = readFileSync(join(dir, "real.mp3"));
const realSum = createHash("sha256").update(real).digest("hex");

const server = createServer((req, res) => {
  seenAgents.push(req.headers["user-agent"]);
  if (req.url === "/calm.mp3") return res.end(audio);
  if (req.url === "/files/warm.ogg") {
    if (throttled++ === 0) {
      res.writeHead(429, { "retry-after": "1" });
      return res.end();
    }
    return res.end(audio);
  }
  if (req.url.startsWith("/api?")) {
    const title = new URL(req.url, "http://x").searchParams.get("titles");
    const pages = title === "File:Warm.ogg" ? { 1: { imageinfo: [{ url: `${base}/files/warm.ogg`, sha1: sum1 }] } } : { "-1": { missing: "" } };
    return res.end(JSON.stringify({ query: { pages } }));
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

const libFile = join(dir, "library.json");
writeFileSync(libFile, JSON.stringify({
  commonsApi: `${base}/api`,
  tracks: [
    { id: "warm-90", title: "Warm", artist: "F", license: "CC BY 4.0", page: "https://example.org/w", mood: "warm", bpm: 90, durationSeconds: 150, firstBeatSeconds: 0, liftBeats: [24], commons: "File:Warm.ogg", sha1: sum1, credit: "Warm by F" },
    { id: "deleted-90", title: "Deleted", artist: "G", license: "CC BY 4.0", page: "https://example.org/x", mood: "warm", bpm: 90, durationSeconds: 150, firstBeatSeconds: 0, liftBeats: [24], commons: "File:Deleted.ogg", sha1: sum1, credit: "Deleted by G" },
    { id: "unfitted", title: "Unfitted", artist: "H", license: "CC BY 4.0", page: "https://example.org/u", mood: "warm", bpm: null, durationSeconds: 150, commons: "File:Warm.ogg", sha1: sum1, credit: "Unfitted by H" },
    { id: "kinetic-120", title: "Kinetic", artist: "A", license: "CC BY 4.0", page: "https://example.org/k", mood: "kinetic", fits: "tech, apps", bpm: 120, durationSeconds: 164, firstBeatSeconds: 0, liftBeats: [32, 96], gainDb: -0.3, sha256: sum, bundled: "bundled.mp3", credit: "Kinetic by A, CC BY 4.0" },
    { id: "calm-90", title: "Calm", artist: "B", license: "CC BY 4.0", page: "https://example.org/c", mood: "calm and organic", fits: "crafts, food", bpm: 90, durationSeconds: 150, firstBeatSeconds: 0.2, liftBeats: [24], sha256: sum, url: `${base}/calm.mp3`, credit: "Calm by B, CC BY 4.0" },
    { id: "moved-90", title: "Moved", artist: "C", license: "CC BY 4.0", page: "https://example.org/m", mood: "calm and organic", bpm: 90, durationSeconds: 150, firstBeatSeconds: 0, liftBeats: [24], sha256: "0".repeat(64), url: `${base}/calm.mp3`, credit: "Moved by C" },
    { id: "gone-90", title: "Gone", artist: "D", license: "CC BY 4.0", page: "https://example.org/g", mood: "calm and organic", bpm: 90, durationSeconds: 150, firstBeatSeconds: 0, liftBeats: [24], url: `${base}/gone.mp3`, credit: "Gone by D" },
    { id: "drift-114", title: "Drift", artist: "E", license: "CC BY 4.0", page: "https://example.org/d", mood: "driving", bpm: 114, durationSeconds: 150, firstBeatSeconds: 0, liftBeats: [24], bundled: "bundled.mp3", credit: "Drift by E" },
    { id: "near-122", title: "Near", artist: "I", license: "CC BY 4.0", page: "https://example.org/n", mood: "driving", sourceBpm: 122, bpm: 120, durationSeconds: 10.17, firstBeatSeconds: 0.1, liftBeats: [8], sha256: realSum, bundled: "real.mp3", credit: "Near by I" },
    { id: "odd-112", title: "Odd", artist: "J", license: "CC BY 4.0", page: "https://example.org/o", mood: "minimal", sourceBpm: 110, bpm: 112.5, durationSeconds: 9.8, firstBeatSeconds: 0, liftBeats: [8], sha256: realSum, bundled: "real.mp3", credit: "Odd by J" },
  ],
}));
const lib = loadLibrary(libFile);

test("the listing groups the library by mood, with frames a beat, and filters by a word", () => {
  const all = listing(lib).join("\n");
  assert.match(all, /^kinetic\n  kinetic-120 +120 BPM \(15 frames a beat\), 164 s  Kinetic, A  \[bundled\]/m);
  assert.match(all, /calm-90 +90 BPM \(20 frames a beat\)/);
  assert.match(all, /drift-114 +114 BPM \(off the frame grid\)/);
  const crafts = listing(lib, { mood: "crafts" }).join("\n");
  assert.match(crafts, /calm-90/);
  assert.doesNotMatch(crafts, /kinetic-120/);
});

test("a bundled track is copied, with its grid and its credit", async () => {
  const out = join(dir, "p1");
  const { track } = await getTrack(lib, "kinetic-120", { dir: out });
  assert.ok(existsSync(join(out, "kinetic-120.mp3")));
  const json = JSON.parse(readFileSync(join(out, "track.json"), "utf8"));
  assert.deepEqual(json, track);
  assert.equal(json.framesPerBeat, 15);
  assert.deepEqual(json.liftSeconds, [16, 48]);
  assert.equal(json.feedStartBeat, 0, "no feed start in the library means the track starts on its beat");
  assert.equal(json.file, "music/kinetic-120.mp3");
  assert.match(readFileSync(join(out, "CREDITS.md"), "utf8"), /Kinetic by A, CC BY 4\.0/);
});

test("a library track is downloaded and checked; its grid follows its tempo", async () => {
  const out = join(dir, "p2");
  const { track } = await getTrack(lib, "calm-90", { dir: out });
  assert.deepEqual(readFileSync(join(out, "calm-90.mp3")), audio);
  assert.equal(track.framesPerBeat, 20);
  assert.deepEqual(track.liftSeconds, [16.2]);
});

test("a Commons track is found by its title, fetched politely after a 429, checked by SHA-1 and kept as .ogg", async () => {
  const out = join(dir, "p5");
  const { track, file } = await getTrack(lib, "warm-90", { dir: out });
  assert.ok(file.endsWith("warm-90.ogg"));
  assert.equal(track.file, "music/warm-90.ogg");
  assert.equal(throttled, 2, "one 429, then the file");
  assert.ok(seenAgents.every((a) => a.startsWith("remotion-video-master-get-track/") && !a.includes("@")), "a named client, nothing personal");
  await assert.rejects(getTrack(lib, "deleted-90", { dir: out }), /no longer on Wikimedia Commons/);
  await assert.rejects(getTrack(lib, "unfitted", { dir: out }), /not been fitted/);
});

test("a near-miss tempo is stretched, pitch kept, to the nearest whole-frame tempo, fractional ones included", async () => {
  const out = join(dir, "p6");
  const { track, file } = await getTrack(lib, "near-122", { dir: out });
  assert.ok(file.endsWith("near-122.mp3"));
  assert.equal(track.framesPerBeat, 15);
  assert.equal(track.sourceBpm, 122);
  const seconds = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout);
  assert.ok(Math.abs(seconds - (10 * 122) / 120) < 0.1, `stretched to ${seconds} s`);
  const odd = await getTrack(lib, "odd-112", { dir: join(dir, "p7") });
  assert.equal(odd.track.framesPerBeat, 16, "112.5 BPM is 16 frames a beat");
  assert.equal(odd.track.secondsPerBeat * 30, 16, "a beat is exactly the grid unit");
  assert.deepEqual(odd.track.liftSeconds, [4.267]);
  assert.equal(odd.track.feedStartSeconds, 0, "odd-112 has no feed start: beat 0");
});

test("nothing is written when the file changed, is gone, or the tempo drifts", async () => {
  const out = join(dir, "p3");
  await assert.rejects(getTrack(lib, "moved-90", { dir: out }), /checksum mismatch/);
  assert.ok(!existsSync(join(out, "moved-90.mp3")));
  await assert.rejects(getTrack(lib, "gone-90", { dir: out }), /download failed: 404.*download it by hand/);
  await assert.rejects(getTrack(lib, "drift-114", { dir: out }), /not a whole number/);
  await assert.rejects(getTrack(lib, "nope", { dir: out }), /no track "nope"/);
  assert.ok(!existsSync(join(out, "track.json")));
});

test("the command lists, and fetches by id", () => {
  const list = spawnSync(process.execPath, [script, "--list", `--library=${libFile}`], { encoding: "utf8" });
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /Pick by the brand read's Look row/);
  const out = join(dir, "p4");
  const get = spawnSync(process.execPath, [script, "kinetic-120", `--library=${libFile}`, `--dir=${out}`], { encoding: "utf8" });
  assert.equal(get.status, 0, get.stderr);
  assert.match(get.stdout, /120 BPM, 15 frames a beat, lifts at 16 s, 48 s/);
});

test("the shipped library is valid: whole-frame tempos, credits, a checksum and a source for every track", () => {
  const shipped = loadLibrary();
  assert.ok(shipped.tracks.length >= 6, "a library, not one track");
  assert.ok(new Set(shipped.tracks.map((t) => t.mood)).size >= 6, "different moods");
  for (const t of shipped.tracks) {
    assert.ok(wholeFrames(30, t.bpm), `${t.id}: ${t.bpm} BPM`);
    if (t.sourceBpm) assert.ok(Math.abs(t.bpm / t.sourceBpm - 1) < 0.025, `${t.id}: a stretch under 2.5%`);
    assert.ok(t.credit && t.license && t.page && (/^[0-9a-f]{64}$/.test(t.sha256 ?? "") || /^[0-9a-f]{40}$/.test(t.sha1 ?? "")), t.id);
    assert.ok(t.bundled ? existsSync(join(shipped.dir, t.bundled)) : (t.commons ?? "").startsWith("File:"), t.id);
    assert.ok(t.liftBeats.length && t.durationSeconds > 60, t.id);
    assert.ok(Number.isInteger(t.feedStartBeat) && t.feedStartBeat >= 0 && t.feedStartBeat < Math.max(...t.liftBeats), `${t.id}: a feed start before its last lift`);
  }
});
