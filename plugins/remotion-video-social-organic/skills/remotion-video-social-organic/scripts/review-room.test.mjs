// node --test scripts/review-room.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { Script } from "node:vm";
import { request } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addNote, answerNote, asMessage, buildPage, buildView, LABELS, listCuts, loadNotes, parseCut, report, saveNotes, startRoom } from "./review-room.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "review-room.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "review-room-"));
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z";
const project = () => {
  const root = tmp();
  const dir = join(root, "out", "delivered");
  mkdirSync(dir, { recursive: true });
  const at = Date.now() / 1000;
  const files = ["bakery-v1.mp4", "bakery-v2.mp4", "bakery-v2.music-only.mp4", "_scratch.mp4", "launch-v1.mp4"];
  files.forEach((f, i) => {
    writeFileSync(join(dir, f), Buffer.alloc(64, i));
    utimesSync(join(dir, f), at - 100 + i, at - 100 + i);
  });
  return { root, dir };
};
const post = (room, path, body, method = "POST", headers = {}) =>
  fetch(new URL(path, room.url), { method, headers: { "content-type": "application/json", "x-review-key": room.key, ...headers }, body: JSON.stringify(body ?? {}) });
const rawGet = (url, host) =>
  new Promise((ok, no) => {
    const u = new URL(url);
    request({ host: u.hostname, port: u.port, path: "/state", headers: { host } }, (res) => (res.resume(), ok(res.statusCode))).on("error", no).end();
  });

test("a file name is a version of a film: <film>-v<n>", () => {
  assert.deepEqual(parseCut("out/delivered/spring-sale-v12.mp4"), { id: "spring-sale-v12", film: "spring-sale", version: 12 });
  assert.deepEqual(parseCut("teaser.mp4"), { id: "teaser", film: "teaser", version: 1 });
});

test("the versions are listed newest first, without music-only twins or scratch files, for the newest file's film", () => {
  const { dir } = project();
  const newest = listCuts(dir);
  assert.equal(newest.film, "launch");
  const named = listCuts(dir, "bakery");
  assert.deepEqual(named.cuts.map((c) => c.id), ["bakery-v2", "bakery-v1"]);
  assert.deepEqual(listCuts(join(dir, "missing")), { film: null, cuts: [] });
});

test("a note keeps its frame and pin, a pin needs both coordinates, and a note needs words", () => {
  const store = { film: "bakery", notes: [], sends: [] };
  const a = addNote(store, { cut: "bakery-v1", t: 1.5166666, frame: 45, x: 0.4, y: 0.6, text: "  late  " });
  assert.deepEqual([a.id, a.t, a.frame, a.x, a.y, a.text, a.status], ["n1", 1.517, 45, 0.4, 0.6, "late", "open"]);
  const b = addNote(store, { cut: "bakery-v1", t: 2, frame: 60, x: 0.5, text: "half a pin" });
  assert.deepEqual([b.id, b.x, b.y], ["n2", null, null]);
  const c = addNote(store, { cut: "bakery-v1", text: "the music is thin" });
  assert.deepEqual([c.t, c.frame], [null, null]);
  assert.throws(() => addNote(store, { cut: "bakery-v1", text: "  " }), /words/);
  assert.throws(() => addNote(store, { text: "no version" }), /version/);
});

test("an answer marks the note answered and clears the last mark", () => {
  const store = { film: "bakery", notes: [], sends: [] };
  const n = addNote(store, { cut: "bakery-v1", text: "too small" });
  Object.assign(n, { verdict: "not-yet", verdictAt: "x", status: "open" });
  answerNote(store, "n1", { cut: "bakery-v2", text: "80 px now, 0:00 to 0:08" });
  assert.equal(n.status, "answered");
  assert.equal(n.verdict, undefined);
  assert.deepEqual([n.answer.cut, n.answer.text], ["bakery-v2", "80 px now, 0:00 to 0:08"]);
  assert.throws(() => answerNote(store, "n9", { cut: "bakery-v2", text: "x" }), /no note n9/);
  assert.throws(() => answerNote(store, "n1", { cut: "bakery-v2", text: "" }), /--text/);
});

test("the report lists the open notes, the unanswered older ones and only the marks given in this session", () => {
  const root = tmp();
  const store = { film: "bakery", notes: [], sends: [] };
  addNote(store, { cut: "bakery-v1", t: 2.5, frame: 75, x: 0.5, y: 0.8, text: "small line" });
  addNote(store, { cut: "bakery-v1", text: "thin music" });
  addNote(store, { cut: "bakery-v2", t: 1.5, frame: 45, x: 0.4, y: 0.4, text: "late square" });
  addNote(store, { cut: "bakery-v1", text: "old and fixed" });
  answerNote(store, "n1", { cut: "bakery-v2", text: "bigger" });
  Object.assign(store.notes[0], { verdict: "fixed", verdictAt: "2026-10-13T12:00:00.000Z", status: "fixed" });
  Object.assign(store.notes[3], { answer: { cut: "bakery-v2", text: "done" }, verdict: "fixed", verdictAt: "2026-10-01T00:00:00.000Z", status: "fixed" });
  const out = report(store, root, "bakery-v2", true, "2026-10-13T11:00:00.000Z").split("\n");
  assert.match(out[0], /^fixed n1 "small line"$/);
  assert.match(out[1], /^unanswered n2 bakery-v1 whole film "thin music"$/);
  assert.match(out[2], /^note n3 bakery-v2 0:01\.50 frame 45 pin 40%,40% "late square"$/);
  assert.equal(out.length, 4, "the note fixed in an earlier session is not reported again");
  const rec = JSON.parse(out[3].replace(/^notes /, ""));
  assert.deepEqual(rec, { film: "bakery", viewed: "bakery-v2", done: true, open: 2, fixed: 2, file: "docs/review/bakery/notes.json" });
});

test("the chat message carries the version, the times, the pins and the marks", () => {
  const store = { film: "bakery", notes: [], sends: [] };
  addNote(store, { cut: "bakery-v2", t: 1.5, frame: 45, x: 0.4, y: 0.6, text: "late" });
  addNote(store, { cut: "bakery-v2", text: "thin" });
  const msg = asMessage(store, "bakery-v2", LABELS.en);
  assert.equal(msg, "My notes on bakery, Version 2:\n1. 0:01.50 (frame 45, at 40% across, 60% down): late\n2. Whole film: thin");
});

test("every Hebrew label exists, and the Hebrew page is right to left", () => {
  assert.deepEqual(Object.keys(LABELS.he).sort(), Object.keys(LABELS.en).sort());
  const view = buildView({ film: "bakery", cuts: [], store: { film: "bakery", notes: [], sends: [] }, lang: "he" });
  assert.equal(view.dir, "rtl");
  const page = buildPage(view);
  assert.match(page, /<html lang="he" dir="rtl">/);
  const script = page.slice(page.indexOf("<script>") + 8, page.lastIndexOf("</script>"));
  assert.doesNotThrow(() => new Script(script), "the page's script compiles");
});

test("a note's text never reaches the page as markup", () => {
  const store = { film: "bakery", notes: [], sends: [] };
  addNote(store, { cut: "bakery-v1", text: "</script><img src=x onerror=alert(1)>" });
  const page = buildPage(buildView({ film: "bakery", cuts: [], store }));
  assert.ok(!page.includes("</script><img"), "the note is escaped inside the page's data");
});

test("the room: a note with its snapshot, an edit, a mark, Send ends it and prints the report", async () => {
  const { root, dir } = project();
  const { film, cuts } = listCuts(dir, "bakery");
  const pre = loadNotes(root, film);
  addNote(pre, { cut: "bakery-v1", t: 2.5, frame: 75, x: 0.5, y: 0.8, text: "small line" });
  answerNote(pre, "n1", { cut: "bakery-v2", text: "bigger" });
  saveNotes(root, pre);
  const room = await startRoom({ root, film, cuts, timeoutMs: 60_000 });
  try {
    const page = await (await fetch(room.url)).text();
    assert.match(page, /Review room/);
    const video = await fetch(new URL("/cut/bakery-v2", room.url), { headers: { range: "bytes=0-9" } });
    assert.equal(video.status, 206);
    assert.equal((await video.arrayBuffer()).byteLength, 10);
    assert.equal((await fetch(new URL("/cut/..%2F..%2Fsecret", room.url))).status, 404);
    assert.equal((await post(room, "/note", { cut: "nope", text: "x" })).status, 400);
    // Only the room's own page may change anything: no key, another site, a rebound host name all fail.
    assert.equal((await post(room, "/note", { cut: "bakery-v2", text: "injected" }, "POST", { "x-review-key": "guess" })).status, 403);
    assert.equal((await fetch(new URL("/send", room.url), { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" })).status, 403);
    assert.equal((await post(room, "/note", { cut: "bakery-v2", text: "injected" }, "POST", { origin: "https://evil.example" })).status, 403);
    assert.equal(await rawGet(room.url, "evil.example:80"), 403);
    assert.equal(await rawGet(room.url, new URL(room.url).host), 200);
    assert.match(page, new RegExp(`"key":"${room.key}"`), "the page carries its key");
    const r = await (await post(room, "/note", { cut: "bakery-v2", t: 1.5, frame: 45, x: 0.4, y: 0.4, text: "late square", shot: JPEG })).json();
    const n = r.notes.find((x) => x.id === "n2");
    assert.equal(n.shot, "docs/review/bakery/shots/n2.jpg");
    assert.ok(existsSync(join(root, n.shot)));
    assert.equal((await fetch(new URL("/shot/n2", room.url))).status, 200);
    assert.match(r.messages["bakery-v2"], /1\. 0:01\.50 \(frame 45/);
    await post(room, "/note", { cut: "bakery-v2", text: "to delete" });
    assert.equal((await post(room, "/note/n3", null, "DELETE")).status, 200);
    assert.equal((await post(room, "/note/n2", { text: "the square lands late" })).status, 200);
    assert.equal((await post(room, "/note/n1", { text: "edit an answered note" })).status, 400);
    assert.equal((await post(room, "/verdict/n2", { verdict: "fixed" })).status, 400, "only an answered note is marked");
    assert.equal((await post(room, "/verdict/n1", { verdict: "not-yet" })).status, 200);
    assert.equal((await post(room, "/send", { viewed: "bakery-v2" })).status, 200);
    const out = (await room.finished).split("\n");
    assert.match(out[0], /^not-yet n1 bakery-v1 "small line" answered-in bakery-v2 "bigger"$/);
    assert.match(out[1], /^note n2 bakery-v2 0:01\.50 frame 45 pin 40%,40% "the square lands late" shot docs\/review\/bakery\/shots\/n2\.jpg$/);
    const saved = JSON.parse(readFileSync(join(root, "docs", "review", "bakery", "notes.json"), "utf8"));
    assert.equal(saved.notes.find((x) => x.id === "n1").status, "open", "not yet sends the note back");
    assert.equal(saved.sends.length, 1);
    assert.ok(!existsSync(join(root, "docs", "review", "bakery", "shots", "n3.jpg")));
  } finally {
    room.close();
  }
});

test("the room closes itself after the timeout and says it was not sent", async () => {
  const { root, dir } = project();
  const { film, cuts } = listCuts(dir, "bakery");
  const room = await startRoom({ root, film, cuts, timeoutMs: 50 });
  const out = await room.finished;
  assert.match(out, /"done":false/);
});

test("the CLI records an answer and refuses a room with no finished version", () => {
  const { root } = project();
  const store = loadNotes(root, "bakery");
  addNote(store, { cut: "bakery-v1", text: "too small" });
  saveNotes(root, store);
  const ok = spawnSync(process.execPath, [script, `--root=${root}`, "--film=bakery", "--answer=n1", "--in=bakery-v2", "--text=80 px now"], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /answered n1 in bakery-v2/);
  assert.equal(loadNotes(root, "bakery").notes[0].answer.text, "80 px now");
  const none = spawnSync(process.execPath, [script, `--root=${tmp()}`, "--no-open"], { encoding: "utf8" });
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no finished version/);
});
