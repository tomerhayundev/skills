#!/usr/bin/env node
/**
 * The review room: the page where the user answers a delivered film. They watch a version, step
 * frame by frame, click on the picture to pin a note on that exact frame (or note the frame, or the
 * whole film), play an earlier version beside it, and mark each note Claude answered in a newer
 * version as fixed or not yet. Every note is saved as it is written to docs/review/<film>/notes.json,
 * with a snapshot of its frame (the pin drawn in) under docs/review/<film>/shots/. "Send notes to
 * Claude" prints the notes and exits, which wakes the agent that runs this in the background; "Copy
 * as message" copies the same notes for the chat. The page answers this computer only (127.0.0.1).
 * Node 18+; ffprobe reads each version's frame rate (30 is assumed without it).
 *
 *   node review-room.mjs [--film=<id>] [--cuts=out/delivered] [--lang=he] [--port=0] [--no-open]
 *     [--timeout-min=120] [--fps=30] [--root=<the project folder, default the current one>]
 *   node review-room.mjs --film=<id> --answer=<note id> --in=<version id> --text="<what changed, and at what time>"
 *
 * Versions are the films in --cuts named <film>-v<n> (music-only twins, silent and scratch files are
 * left out). With no --film, the film of the newest file is opened. Prints "review <url>" when the
 * page is up, then one line per note and "notes <json>" when the user sends, or after the timeout
 * with "done": false. --answer records how a newer version answers a note, so the user can mark it.
 * Notes become text the agent acts on, so the server answers only requests addressed to itself (no
 * other site, no rebound host name), and every change carries a key only the room's page holds.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const RTL = new Set(["he", "ar", "fa", "ur"]);
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const SKIP = /(music-only|silent|^_|\.critic)/i;
const TYPES = { ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(map[k] ?? ""));

export const LABELS = {
  en: {
    title: "Review room", kicker: "Review room", version: "Version {n}", newest: "newest",
    compare: "Play beside it", noCompare: "Nothing beside it",
    play: "Play", pause: "Pause", back: "One frame back", fwd: "One frame on", speed: "Speed", sound: "Sound on", muted: "Sound off",
    frame: "frame {n}", wholeFilm: "Whole film", thisFrame: "This frame",
    hint: "Pause anywhere and click on the picture to pin a note on that frame.",
    keys: "Space: play or pause · ← →: one frame · Shift + ← →: one second · N: note on this frame",
    noteFrame: "Note on this frame", noteFilm: "Note on the whole film",
    newAt: "New note at {time}, {frame}", newFilm: "New note on the whole film",
    placeholder: "What do you see here? Say it the way you would to an editor.",
    save: "Save note", cancel: "Cancel", edit: "Edit", remove: "Delete",
    notesThis: "Your notes on this version", notesEarlier: "Notes from earlier versions",
    empty: "No notes yet. Pause anywhere and click on the picture.",
    answered: "Answered in {cut}:", waiting: "Waiting for the next version",
    fixed: "Fixed", notYet: "Not yet", isFixed: "You marked it fixed", isOpen: "Still open",
    send: "Send notes to Claude", sendHint: "Claude reads every note and the frame it points at, and answers each one in the next version.",
    sent: "Sent. Claude has your notes; you can close this tab.",
    copy: "Copy as message", copied: "Copied",
    nothing: "Write a note first, or mark the notes from earlier versions.",
    noCuts: "No finished version of this film was found.",
    msgHead: "My notes on {film}, {cut}:", msgAnswer: "Answered in {cut}: {text}",
    at: "at {x}% across, {y}% down",
  },
  he: {
    title: "חדר הצפייה", kicker: "חדר הצפייה", version: "גרסה {n}", newest: "החדשה",
    compare: "להציג לידה", noCompare: "בלי השוואה",
    play: "ניגון", pause: "השהיה", back: "פריים אחורה", fwd: "פריים קדימה", speed: "מהירות", sound: "צליל פועל", muted: "צליל כבוי",
    frame: "פריים {n}", wholeFilm: "כל הסרט", thisFrame: "הפריים הזה",
    hint: "עוצרים בכל מקום ולוחצים על התמונה כדי להצמיד הערה לפריים הזה.",
    keys: "רווח: ניגון או השהיה · חץ ימינה או שמאלה: פריים אחד, ועם Shift שנייה · N: הערה על הפריים",
    noteFrame: "הערה על הפריים הזה", noteFilm: "הערה על כל הסרט",
    newAt: "הערה חדשה ב-{time}, {frame}", newFilm: "הערה חדשה על כל הסרט",
    placeholder: "מה אתם רואים כאן? כתבו כמו שהייתם אומרים לעורך.",
    save: "שמירת ההערה", cancel: "ביטול", edit: "עריכה", remove: "מחיקה",
    notesThis: "ההערות שלכם על הגרסה הזו", notesEarlier: "הערות מגרסאות קודמות",
    empty: "אין עדיין הערות. עוצרים בכל מקום ולוחצים על התמונה.",
    answered: "התשובה ב{cut}:", waiting: "מחכה לגרסה הבאה",
    fixed: "תוקן", notYet: "עוד לא", isFixed: "סימנתם שתוקן", isOpen: "עדיין פתוח",
    send: "שליחת ההערות ל-Claude", sendHint: "Claude קורא כל הערה ואת הפריים שהיא מצביעה עליו, ועונה על כל אחת בגרסה הבאה.",
    sent: "נשלח. ההערות אצל Claude, אפשר לסגור את הלשונית.",
    copy: "העתקה כהודעה", copied: "הועתק",
    nothing: "קודם כותבים הערה, או מסמנים את ההערות מגרסאות קודמות.",
    noCuts: "לא נמצאה גרסה גמורה של הסרט הזה.",
    msgHead: "ההערות שלי על {film}, {cut}:", msgAnswer: "התשובה ב{cut}: {text}",
    at: "{x}% מהשמאל, {y}% מלמעלה",
  },
};
export const labelsFor = (lang = "en") => ({ ...LABELS.en, ...(LABELS[String(lang).split("-")[0]] ?? {}) });

/** A file name as a version: spring-sale-v2.mp4 is version 2 of the film spring-sale. */
export function parseCut(name) {
  const id = basename(name).replace(/\.[^.]+$/, "");
  const m = id.match(/^(.+?)-v(\d+)$/);
  return { id, film: m ? m[1] : id, version: m ? Number(m[2]) : 1 };
}

/** The versions in a folder, newest first; the film of the newest file when none is named. */
export function listCuts(dir, film) {
  if (!existsSync(dir)) return { film: film ?? null, cuts: [] };
  const all = readdirSync(dir)
    .filter((f) => VIDEO.test(f) && !SKIP.test(f))
    .map((f) => ({ ...parseCut(f), file: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }));
  const pick = film ?? [...all].sort((a, b) => b.mtime - a.mtime)[0]?.film ?? null;
  const cuts = all.filter((c) => c.film === pick).sort((a, b) => b.version - a.version || b.mtime - a.mtime);
  return { film: pick, cuts };
}

/** Frame rate, size and length from ffprobe; null when ffprobe is missing or the file does not read. */
export function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=r_frame_rate,width,height:format=duration", "-of", "json", file], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const j = JSON.parse(r.stdout);
    const s = j.streams?.[0] ?? {};
    const [n, d] = String(s.r_frame_rate ?? "").split("/").map(Number);
    return { fps: n && d ? n / d : null, width: s.width ?? null, height: s.height ?? null, duration: Number(j.format?.duration) || null };
  } catch {
    return null;
  }
}

const notesDir = (root, film) => join(root, "docs", "review", film);
const notesFile = (root, film) => join(notesDir(root, film), "notes.json");
export function loadNotes(root, film) {
  const f = notesFile(root, film);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { film, notes: [], sends: [] };
}
export function saveNotes(root, store) {
  mkdirSync(notesDir(root, store.film), { recursive: true });
  writeFileSync(notesFile(root, store.film), `${JSON.stringify(store, null, 2)}\n`);
}
const nextId = (store) => `n${1 + store.notes.reduce((m, n) => Math.max(m, Number(n.id.slice(1)) || 0), 0)}`;
const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const unit = (v) => (typeof v === "number" && v >= 0 && v <= 1 ? round(v, 4) : null);

/** A new note. t and frame are null for a note on the whole film; x and y (0 to 1) only for a pin. */
export function addNote(store, { cut, t = null, frame = null, x = null, y = null, text }, at = new Date().toISOString()) {
  const body = String(text ?? "").trim();
  if (!body) throw new Error("a note needs words");
  if (!cut) throw new Error("a note needs its version");
  const note = { id: nextId(store), cut, t: t == null ? null : round(Number(t), 3), frame: frame == null ? null : Math.round(Number(frame)), x: unit(x), y: unit(y), text: body, at, status: "open", shot: null };
  if (note.x == null || note.y == null) note.x = note.y = null;
  store.notes.push(note);
  return note;
}

/** How a newer version answers a note: the agent records it, the user then marks it fixed or not yet. */
export function answerNote(store, id, { cut, text }, at = new Date().toISOString()) {
  const n = store.notes.find((x) => x.id === id);
  if (!n) throw new Error(`no note ${id}`);
  if (!cut || !String(text ?? "").trim()) throw new Error("an answer needs the version (--in) and what changed (--text)");
  n.answer = { cut, text: String(text).trim(), at };
  n.status = "answered";
  delete n.verdict;
  delete n.verdictAt;
  return n;
}

const fmtTime = (t) => {
  if (t == null) return "";
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
};
export const cutLabel = (L, cut) => fill(L.version, { n: parseCut(cut).version });

/** The notes as a chat message, for when the page cannot reach the agent. */
export function asMessage(store, viewed, L = LABELS.en) {
  const lines = [fill(L.msgHead, { film: store.film, cut: cutLabel(L, viewed) })];
  let i = 0;
  for (const n of store.notes.filter((x) => x.cut === viewed && x.status === "open")) {
    const where = n.t == null ? L.wholeFilm : `${fmtTime(n.t)} (${fill(L.frame, { n: n.frame })}${n.x != null ? `, ${fill(L.at, { x: Math.round(n.x * 100), y: Math.round(n.y * 100) })}` : ""})`;
    lines.push(`${++i}. ${where}: ${n.text}`);
  }
  for (const n of store.notes.filter((x) => x.cut !== viewed && x.verdict)) {
    lines.push(`${++i}. ${n.verdict === "fixed" ? L.fixed : L.notYet}: ${n.text}${n.answer ? ` (${fill(L.msgAnswer, { cut: cutLabel(L, n.answer.cut), text: n.answer.text })})` : ""}`);
  }
  return lines.join("\n");
}

/** What the agent reads when the user sends: the open notes on the version watched, the marks given since the room opened, then the record. */
export function report(store, root, viewed, done, since = "") {
  const lines = [];
  for (const n of store.notes) {
    const marked = n.verdictAt && n.verdictAt >= since;
    if (n.cut === viewed && n.status === "open" && !n.verdict) {
      const where = n.t == null ? "whole film" : `${fmtTime(n.t)} frame ${n.frame}${n.x != null ? ` pin ${Math.round(n.x * 100)}%,${Math.round(n.y * 100)}%` : ""}`;
      lines.push(`note ${n.id} ${n.cut} ${where} ${JSON.stringify(n.text)}${n.shot ? ` shot ${n.shot}` : ""}`);
    } else if (n.cut !== viewed && n.status === "open" && !n.answer) {
      lines.push(`unanswered ${n.id} ${n.cut} ${n.t == null ? "whole film" : `${fmtTime(n.t)} frame ${n.frame}`} ${JSON.stringify(n.text)}${n.shot ? ` shot ${n.shot}` : ""}`);
    } else if (marked && n.verdict === "fixed") lines.push(`fixed ${n.id} ${JSON.stringify(n.text)}`);
    else if (marked && n.verdict === "not-yet") lines.push(`not-yet ${n.id} ${n.cut} ${JSON.stringify(n.text)}${n.answer ? ` answered-in ${n.answer.cut} ${JSON.stringify(n.answer.text)}` : ""}${n.shot ? ` shot ${n.shot}` : ""}`);
  }
  const rec = {
    film: store.film,
    viewed,
    done,
    open: store.notes.filter((n) => n.status === "open").length,
    fixed: store.notes.filter((n) => n.status === "fixed").length,
    file: relative(root, notesFile(root, store.film)).split("\\").join("/"),
  };
  return [...lines, `notes ${JSON.stringify(rec)}`].join("\n");
}

export function buildView({ film, cuts, store, lang = "en", fps = 30, error = null }) {
  const L = labelsFor(lang);
  return {
    lang,
    dir: RTL.has(String(lang).split("-")[0]) ? "rtl" : "ltr",
    labels: L,
    film,
    error,
    cuts: cuts.map((c, i) => ({ id: c.id, version: c.version, label: fill(L.version, { n: c.version }), newest: i === 0, fps: c.fps ?? fps, width: c.width ?? 1920, height: c.height ?? 1080, duration: c.duration ?? null, type: TYPES[extname(c.file).toLowerCase()] ?? "video/mp4" })),
    notes: store.notes,
    messages: Object.fromEntries(cuts.map((c) => [c.id, asMessage(store, c.id, L)])),
  };
}

const PIN = (n) => `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M30 5c14 0 25 9 25 23 0 15-12 27-27 26C14 53 5 43 6 29 7 16 17 6 33 7" fill="none" stroke="rgba(0,0,0,.7)" stroke-width="9" stroke-linecap="round"/><path d="M30 5c14 0 25 9 25 23 0 15-12 27-27 26C14 53 5 43 6 29 7 16 17 6 33 7" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg><b>${n}</b>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h2v12H6zM20 6v12l-9-6z" fill="currentColor"/></svg>',
  fwd: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6h2v12h-2zM4 6v12l9-6z" fill="currentColor"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  muted: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const CSS = `:root{color-scheme:dark;--bg:#121110;--panel:#1a1917;--card:#1d1c1a;--frame:#0b0b0a;--ink:#f2ede4;--mute:#a39b8f;--line:#2e2b27;--accent:#ff6a2b;--accent-text:#ff8a55;--on-accent:#170903;--ok:#7bc47f;--shadow:0 18px 40px rgba(0,0,0,.45);--display:Calibri,"Assistant","Segoe UI",system-ui,sans-serif}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f3efe7;--panel:#fbf8f2;--card:#fffdf9;--frame:#e6e0d4;--ink:#1a1714;--mute:#655e54;--line:#dad2c4;--accent:#e2531c;--accent-text:#b13f10;--ok:#2f7a35;--shadow:0 18px 40px rgba(60,40,20,.14)}}
:root:lang(he){--display:"Assistant",Calibri,"Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 var(--display);-webkit-font-smoothing:antialiased}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.app{display:grid;grid-template-columns:360px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);gap:14px 18px;height:100dvh;padding:14px 18px}
.app>header{grid-column:1/-1;display:flex;align-items:center;gap:14px;flex-wrap:wrap;min-width:0}
.app>aside{grid-column:1;grid-row:2}.app>.stagecol{grid-column:2;grid-row:2}
.kicker{font:600 11.5px/1 var(--display);letter-spacing:.16em;text-transform:uppercase;color:var(--accent-text);margin:0}
:lang(he) .kicker{letter-spacing:.04em;font-size:12.5px}
h1{font:700 20px/1.2 var(--display);margin:2px 0 0;overflow-wrap:anywhere}
.versions{display:flex;gap:6px;flex-wrap:wrap;margin-inline-start:auto;align-items:center}
.pill{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 13px;border-radius:999px;border:1px solid var(--line);color:var(--ink);font:600 14px var(--display);cursor:pointer;white-space:nowrap}
.pill[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.pill small{font-weight:500;opacity:.8}
@media (hover:hover){.pill:hover{border-color:var(--mute)}}
select{font:500 14px var(--display);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:10px;min-height:36px;padding:0 10px;max-width:100%}
label.cmp{display:inline-flex;align-items:center;gap:8px;color:var(--mute);font-size:14px}
.stagecol{display:flex;flex-direction:column;gap:10px;min-height:0;min-width:0}
.screens{flex:1;min-height:0;display:flex;gap:10px;align-items:center;justify-content:center}
.screen{position:relative;flex:0 1 auto;width:min(100%,calc(var(--avail-h) * var(--ar)));aspect-ratio:var(--ar);background:#000;border-radius:10px;overflow:hidden;box-shadow:var(--shadow)}
.screen video{position:absolute;inset:0;width:100%;height:100%;display:block;background:#000}
.shot{margin:0;display:flex;flex-direction:column;gap:6px;flex:0 1 auto;width:min(calc(50% - 5px),calc((var(--avail-h) - 26px) * var(--ar)))}
.shot figcaption{font:600 13.5px var(--display);color:var(--mute)}.shot.main figcaption{color:var(--accent-text)}
.shot .screen{width:100%}
.pins{position:absolute;inset:0;z-index:2;pointer-events:none}
.hit{position:absolute;inset:0;z-index:3;cursor:crosshair}
.pin{position:absolute;width:56px;height:56px;margin:-28px 0 0 -28px;color:var(--accent);pointer-events:none;transition:opacity .15s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}
.pin svg{width:100%;height:100%;display:block}
.pin b{position:absolute;top:-6px;right:-8px;min-width:24px;height:24px;padding:0 5px;border-radius:999px;background:var(--accent);color:var(--on-accent);font:700 12.5px/20px var(--display);text-align:center;border:2px solid rgba(0,0,0,.7)}
.pin.done{color:var(--ok)}.pin.done b{background:var(--ok)}
.pin.draft{animation:pulse 1.2s ease-in-out infinite}
@keyframes pulse{50%{opacity:.55}}
@media (prefers-reduced-motion:reduce){.pin.draft{animation:none}}
.controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;direction:ltr}.controls .grow{flex:1}.keys{opacity:.75}@media (hover:none){.keys{display:none}}
.ctl{all:unset;box-sizing:border-box;width:40px;height:40px;border-radius:10px;border:1px solid var(--line);display:inline-grid;place-items:center;color:var(--ink);cursor:pointer;flex:none}
.ctl svg{width:20px;height:20px}
@media (hover:hover){.ctl:hover{border-color:var(--mute)}}
.ctl.big{width:48px;height:48px;background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.time{font:600 14px var(--display);font-variant-numeric:tabular-nums;color:var(--ink);direction:ltr;unicode-bidi:isolate;white-space:nowrap}
.time span{color:var(--mute);font-weight:500}
.speed{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.speed button{all:unset;padding:0 10px;height:38px;display:inline-grid;place-items:center;font:600 13px var(--display);color:var(--mute);cursor:pointer;font-variant-numeric:tabular-nums}
.speed button[aria-pressed=true]{background:var(--card);color:var(--ink)}
.track{position:relative;height:34px;direction:ltr;cursor:pointer;touch-action:none}
.track .rail{position:absolute;inset-inline:0;top:14px;height:6px;border-radius:3px;background:var(--line)}
.track .done{position:absolute;left:0;top:14px;height:6px;border-radius:3px;background:var(--accent)}
.track .head{position:absolute;top:8px;width:4px;height:18px;margin-left:-2px;border-radius:2px;background:var(--ink)}
.track .tick{position:absolute;top:0;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:var(--accent);border:2px solid var(--bg)}
.track .tick.done{background:var(--ok)}
.hint{color:var(--mute);font-size:13.5px;margin:0}
aside{display:flex;flex-direction:column;gap:12px;min-height:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}
aside h2{font:700 14px var(--display);margin:0;color:var(--mute);letter-spacing:.02em}
.list{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding-inline-end:2px}
.note{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px}
.note.on{border-color:var(--accent)}
.note .num{grid-row:span 3;width:24px;height:24px;border-radius:999px;background:var(--accent);color:var(--on-accent);font:700 12.5px/24px var(--display);text-align:center}
.note.fixed .num{background:var(--ok)}
.note .where{all:unset;cursor:pointer;font:600 13px var(--display);color:var(--accent-text);font-variant-numeric:tabular-nums}
.note .where bdi{direction:ltr}
.note p{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.note img{grid-column:2;width:100%;border-radius:8px;display:block;cursor:pointer}
.note .row{grid-column:2;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.note .ans{grid-column:2;margin:2px 0 0;padding:8px 10px;border-radius:8px;background:var(--panel);font-size:14px}
.note .ans b{display:block;color:var(--mute);font-size:12.5px}
.note .state{font:600 12.5px var(--display);color:var(--mute)}
.note.fixed .state{color:var(--ok)}
.mini{all:unset;box-sizing:border-box;min-height:32px;padding:0 11px;border-radius:9px;border:1px solid var(--line);font:600 13px var(--display);color:var(--ink);cursor:pointer;display:inline-flex;align-items:center}
.mini.ok{border-color:var(--ok);color:var(--ok)}
.mini.ghost{border-color:transparent;color:var(--mute)}
@media (hover:hover){.mini:hover{border-color:var(--mute)}}
.composer{background:var(--card);border:1px solid var(--accent);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.composer .at{font:600 13px var(--display);color:var(--accent-text)}
.composer img{width:100%;border-radius:8px;display:block}
textarea{width:100%;min-height:84px;resize:vertical;font:15px/1.4 var(--display);color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:9px;padding:9px}
.adds{display:flex;gap:6px;flex-wrap:wrap}
.foot{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--line);padding-top:12px}
.btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 18px;border-radius:13px;border:1px solid var(--line);color:var(--ink);font:600 15px var(--display);cursor:pointer;text-align:center}
.btn.go{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn[disabled]{opacity:.45;cursor:default}
.empty{color:var(--mute);margin:6px 2px}
.banner{grid-column:1/-1;padding:10px 14px;border-radius:12px;border:1px solid var(--accent);color:var(--accent-text)}
.sentcard{grid-column:1/-1;grid-row:1/-1;align-self:center;justify-self:center;max-width:520px;text-align:center;display:flex;flex-direction:column;gap:10px;align-items:center}
.sentcard h1{font-size:24px}
@media (max-width:900px){.app{grid-template-columns:1fr;grid-template-rows:auto auto auto;height:auto;min-height:100dvh}.app>aside,.app>.stagecol{grid-column:1;grid-row:auto}.screens{--avail-h:62vh}.duo{flex-direction:column}.shot{width:100%}aside{min-height:60vh}}`;

function client() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v; // only this file's own SVG constants (ICON, PIN), never user or page data
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "disabled") el.disabled = Boolean(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };
  const L = V.labels;
  const fill = (t, m) => String(t).replace(/\{(\w+)\}/g, (_, k) => String(m[k] ?? ""));
  const fmt = (t) => {
    if (t == null || !isFinite(t)) return "0:00.00";
    const m = Math.floor(t / 60);
    return `${m}:${(t - m * 60).toFixed(2).padStart(5, "0")}`;
  };
  const api = async (method, path, body) => {
    const r = await fetch(path, { method, headers: { "content-type": "application/json", "x-review-key": V.key }, body: JSON.stringify(body ?? {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  };
  const S = { cut: V.cuts[0]?.id ?? null, beside: null, composer: null, editing: null, speed: 1, muted: false, sent: false, copied: false, pending: null };
  const cutOf = (id) => V.cuts.find((c) => c.id === id);
  const labelOf = (id) => cutOf(id)?.label ?? fill(L.version, { n: (String(id).match(/-v(\d+)$/) || [0, 1])[1] });
  // A note's number is its id, so it never changes and matches the snapshot and the agent's report.
  const num = (n) => Number(String(n.id).slice(1));
  const nextNum = () => 1 + V.notes.reduce((m, n) => Math.max(m, num(n)), 0);
  const app = $("#app");
  let video = null;
  let other = null;

  const fps = () => cutOf(S.cut).fps;
  const frameNow = () => (video ? Math.floor(video.currentTime * fps() + 1e-3) : 0);
  const seekFrame = (f) => {
    if (!video) return;
    const c = cutOf(S.cut);
    const last = Math.max(0, Math.floor((video.duration || c.duration || 0) * c.fps) - 1);
    video.currentTime = (Math.min(last, Math.max(0, f)) + 0.5) / c.fps;
  };
  const togglePlay = () => {
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };
  const take = (state) => {
    V.notes = state.notes;
    V.messages = state.messages;
  };

  // The frame at the video's own size (at most 1280 wide), with the pin drawn in.
  const snapshot = (x, y, n) => {
    try {
      const w = Math.min(1280, video.videoWidth || 1280);
      const ht = Math.round(w * ((video.videoHeight || 720) / (video.videoWidth || 1280)));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = ht;
      const g = cv.getContext("2d");
      g.drawImage(video, 0, 0, w, ht);
      if (x != null) {
        const r = Math.max(18, w * 0.035);
        const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff6a2b";
        const cx = x * w;
        const cy = y * ht;
        const lw = Math.max(4, w * 0.005);
        g.lineWidth = lw * 2.4;
        g.strokeStyle = "rgba(0,0,0,.7)";
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.lineWidth = lw;
        g.strokeStyle = color;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "rgba(0,0,0,.7)";
        g.beginPath();
        g.arc(cx + r * 0.8, cy - r * 0.8, r * 0.5 + lw * 0.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = color;
        g.beginPath();
        g.arc(cx + r * 0.8, cy - r * 0.8, r * 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#170903";
        g.font = `700 ${Math.round(r * 0.6)}px Calibri, Assistant, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(n), cx + r * 0.8, cy - r * 0.8);
      }
      return cv.toDataURL("image/jpeg", 0.86);
    } catch {
      return null;
    }
  };

  const openComposer = (kind, x = null, y = null) => {
    if (!video) return;
    video.pause();
    const film = kind === "film";
    const frame = film ? null : frameNow();
    const t = film ? null : (frame + 0.5) / fps();
    const n = nextNum();
    S.composer = { kind, x, y, frame, t, n, shot: null, text: S.composer?.text ?? "" };
    S.editing = null;
    const grab = () => {
      if (S.composer && !film) S.composer.shot = snapshot(x, y, n);
      renderSide();
      $(".composer textarea")?.focus();
    };
    if (!film && Math.abs(video.currentTime - t) > 0.5 / fps()) {
      video.addEventListener("seeked", grab, { once: true });
      seekFrame(frame);
    } else grab();
  };
  const closeComposer = () => {
    S.composer = null;
    renderSide();
  };
  const saveComposer = async () => {
    const text = ($(".composer textarea")?.value ?? "").trim();
    const k = S.composer;
    if (!text || !k) return;
    try {
      take(await api("POST", "/note", { cut: S.cut, t: k.t, frame: k.frame, x: k.x, y: k.y, text, shot: k.shot }));
      S.composer = null;
      renderSide();
    } catch (e) {
      alert(e.message);
    }
  };
  const act = async (fn) => {
    try {
      take(await fn());
      renderSide();
    } catch (e) {
      alert(e.message);
    }
  };
  const send = async () => {
    try {
      await api("POST", "/send", { viewed: S.cut });
      S.sent = true;
      render();
    } catch (e) {
      alert(e.message);
    }
  };
  const copy = async () => {
    const text = V.messages[S.cut] ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = h("textarea", {}, text);
      document.body.append(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    S.copied = true;
    renderSide();
    setTimeout(() => {
      S.copied = false;
      renderSide();
    }, 1600);
  };
  const jump = (n) => {
    if (n.cut !== S.cut) {
      S.cut = n.cut;
      S.composer = null;
      S.pending = n.frame;
      if (S.beside === n.cut) S.beside = null;
      return render();
    }
    if (n.frame != null) {
      video.pause();
      seekFrame(n.frame);
    }
  };

  // The marks on the picture and on the timeline: one pin per note on this version.
  const renderMarks = () => {
    const c = cutOf(S.cut);
    const pins = $(".screen.main .pins");
    if (pins) {
      pins.textContent = "";
      for (const n of V.notes.filter((x) => x.cut === c.id && x.x != null)) pins.append(h("div", { class: `pin${n.status === "fixed" ? " done" : ""}`, "data-frame": n.frame, style: `left:${n.x * 100}%;top:${n.y * 100}%;opacity:0`, html: V.pin(num(n)) }));
      if (S.composer && S.composer.x != null) pins.append(h("div", { class: "pin draft", style: `left:${S.composer.x * 100}%;top:${S.composer.y * 100}%`, html: V.pin(S.composer.n) }));
    }
    const ticks = $(".track .ticks");
    if (ticks) {
      ticks.textContent = "";
      for (const n of V.notes.filter((x) => x.cut === c.id && x.t != null)) ticks.append(h("div", { class: `tick${n.status === "fixed" ? " done" : ""}`, style: `left:${(n.t / (video?.duration || c.duration || 1)) * 100}%`, title: n.text }));
    }
    sync();
  };

  const noteCard = (n, earlier) => {
    const where = n.t == null ? L.wholeFilm : h("bdi", {}, `${fmt(n.t)} · ${fill(L.frame, { n: n.frame })}`);
    if (S.editing === n.id)
      return h(
        "div",
        { class: "note on" },
        h("span", { class: "num" }, num(n)),
        h("textarea", { "data-edit": n.id, dir: "auto" }, n.text),
        h(
          "div",
          { class: "row" },
          h("button", { class: "mini ok", onclick: () => act(() => api("POST", `/note/${n.id}`, { text: $(`[data-edit="${n.id}"]`).value }).then((r) => ((S.editing = null), r))) }, L.save),
          h("button", { class: "mini ghost", onclick: () => ((S.editing = null), renderSide()) }, L.cancel),
        ),
      );
    const kids = [h("span", { class: "num" }, num(n)), h("button", { class: "where", onclick: () => jump(n) }, earlier ? `${labelOf(n.cut)} · ` : "", where), h("p", { dir: "auto" }, n.text)];
    if (n.shot) kids.push(h("img", { src: `/shot/${n.id}`, alt: "", loading: "lazy", onclick: () => jump(n) }));
    if (!earlier && n.status === "open")
      kids.push(h("div", { class: "row" }, h("button", { class: "mini ghost", onclick: () => ((S.editing = n.id), renderSide()) }, L.edit), h("button", { class: "mini ghost", onclick: () => act(() => api("DELETE", `/note/${n.id}`)) }, L.remove)));
    if (earlier) {
      if (n.answer) kids.push(h("div", { class: "ans", dir: "auto" }, h("b", {}, fill(L.answered, { cut: labelOf(n.answer.cut) })), n.answer.text));
      const state = n.status === "fixed" ? L.isFixed : n.verdict === "not-yet" ? L.isOpen : n.answer ? "" : L.waiting;
      kids.push(
        h(
          "div",
          { class: "row" },
          n.answer ? h("button", { class: `mini${n.status === "fixed" ? " ok" : ""}`, "aria-pressed": String(n.status === "fixed"), onclick: () => act(() => api("POST", `/verdict/${n.id}`, { verdict: "fixed" })) }, L.fixed) : null,
          n.answer ? h("button", { class: "mini", "aria-pressed": String(n.verdict === "not-yet"), onclick: () => act(() => api("POST", `/verdict/${n.id}`, { verdict: "not-yet" })) }, L.notYet) : null,
          state ? h("span", { class: "state" }, state) : null,
        ),
      );
    }
    return h("div", { class: `note${n.status === "fixed" ? " fixed" : ""}`, "data-id": n.id }, ...kids);
  };

  // The side panel: the note being written, the notes, and Send.
  function renderSide() {
    const side = $("aside");
    if (!side) return;
    const c = cutOf(S.cut);
    const mine = V.notes.filter((n) => n.cut === c.id);
    const earlier = V.notes.filter((n) => n.cut !== c.id && cutOf(n.cut) && cutOf(n.cut).version < c.version);
    const k = S.composer;
    const composer = k
      ? h(
          "div",
          { class: "composer" },
          h("span", { class: "at" }, k.kind === "film" ? L.newFilm : h("bdi", {}, fill(L.newAt, { time: fmt(k.t), frame: fill(L.frame, { n: k.frame }) }))),
          k.shot ? h("img", { src: k.shot, alt: "" }) : null,
          h(
            "textarea",
            {
              dir: "auto",
              placeholder: L.placeholder,
              oninput: (e) => (k.text = e.target.value),
              onkeydown: (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  saveComposer();
                } else if (e.key === "Escape") closeComposer();
              },
            },
            k.text,
          ),
          h("div", { class: "row adds" }, h("button", { class: "mini ok", onclick: saveComposer }, L.save), h("button", { class: "mini ghost", onclick: closeComposer }, L.cancel)),
        )
      : h("div", { class: "adds" }, h("button", { class: "mini", onclick: () => openComposer("frame") }, L.noteFrame), h("button", { class: "mini", onclick: () => openComposer("film") }, L.noteFilm));
    const canSend = mine.some((n) => n.status === "open") || earlier.some((n) => n.verdict);
    const scroll = $(".list", side)?.scrollTop ?? 0;
    side.textContent = "";
    side.append(
      ...[
      composer,
      h(
        "div",
        { class: "list" },
        h("h2", {}, L.notesThis),
        mine.length ? mine.map((n) => noteCard(n, false)) : h("p", { class: "empty" }, L.empty),
        earlier.length ? [h("h2", { style: "margin-top:8px" }, L.notesEarlier), earlier.map((n) => noteCard(n, true))] : null,
      ),
      h(
        "div",
        { class: "foot" },
        h("button", { class: "btn go", disabled: !canSend, title: canSend ? null : L.nothing, onclick: send }, L.send),
        h("button", { class: "btn", onclick: copy, disabled: !canSend }, S.copied ? L.copied : L.copy),
        h("p", { class: "hint" }, canSend ? L.sendHint : L.nothing),
      ),
      ].filter(Boolean),
    );
    $(".list", side).scrollTop = scroll;
    renderMarks();
  }

  // Time, playhead, pins and the play button follow the video without rebuilding anything.
  function sync() {
    if (!video) return;
    const c = cutOf(S.cut);
    const f = frameNow();
    const time = $(".time");
    if (time) {
      time.children[0].textContent = fmt(video.currentTime);
      time.children[1].textContent = ` · ${fill(L.frame, { n: f })}`;
    }
    const p = Math.min(1, video.currentTime / (video.duration || c.duration || 1));
    const done = $(".track .done");
    const head = $(".track .head");
    if (done) done.style.width = `${p * 100}%`;
    if (head) head.style.left = `${p * 100}%`;
    const span = video.paused ? 0 : Math.round(c.fps * 0.4);
    for (const el of $$(".screen.main .pin[data-frame]")) el.style.opacity = Math.abs(Number(el.dataset.frame) - f) <= span ? "1" : "0";
    const pb = $("#play");
    if (pb && pb.dataset.state !== String(video.paused)) {
      pb.dataset.state = String(video.paused);
      pb.innerHTML = video.paused ? V.icons.play : V.icons.pause;
      pb.setAttribute("aria-label", video.paused ? L.play : L.pause);
    }
    if (other && other.readyState > 0 && Math.abs(other.currentTime - video.currentTime) > (video.paused ? 0.5 : 4) / c.fps) other.currentTime = Math.min(video.currentTime, (other.duration || 1) - 0.01);
  }
  let ticking = false;
  const tick = () => {
    sync();
    requestAnimationFrame(tick);
  };

  const screen = (c, main) => {
    const box = h(
      "div",
      { class: `screen${main ? " main" : ""}`, style: `--ar:${c.width}/${c.height}` },
      h("video", { src: `/cut/${encodeURIComponent(c.id)}`, preload: "auto", playsinline: true }),
      main ? h("div", { class: "pins" }) : null,
      main
        ? h("div", {
            class: "hit",
            role: "button",
            "aria-label": L.hint,
            onclick: (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              openComposer("pin", (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            },
          })
        : null,
    );
    return S.beside ? h("figure", { class: `shot${main ? " main" : ""}`, style: `--ar:${c.width}/${c.height}` }, h("figcaption", {}, c.label), box) : box;
  };

  const fit = () => {
    const s = $(".screens");
    if (!s) return;
    if (matchMedia("(max-width:900px)").matches) s.style.removeProperty("--avail-h");
    else s.style.setProperty("--avail-h", `${s.clientHeight}px`);
  };

  // The whole page: only when the version or the one beside it changes.
  function render() {
    const keep = video ? video.currentTime : null;
    app.textContent = "";
    video = other = null;
    if (S.sent || !V.cuts.length) {
      app.append(h("div", { class: "sentcard" }, h("p", { class: "kicker" }, L.kicker), h("h1", {}, S.sent ? L.sent : L.noCuts)));
      return;
    }
    const c = cutOf(S.cut);
    const beside = S.beside ? cutOf(S.beside) : null;
    const header = h(
      "header",
      {},
      h("div", {}, h("p", { class: "kicker" }, L.kicker), h("h1", {}, V.film)),
      h(
        "div",
        { class: "versions" },
        V.cuts.map((x) =>
          h(
            "button",
            {
              class: "pill",
              "aria-pressed": String(x.id === S.cut),
              onclick: () => {
                if (x.id === S.cut) return;
                S.cut = x.id;
                if (S.beside === x.id) S.beside = null;
                S.composer = S.editing = null;
                render();
              },
            },
            x.label,
            x.newest ? h("small", {}, `· ${L.newest}`) : null,
          ),
        ),
        V.cuts.length > 1
          ? h(
              "label",
              { class: "cmp" },
              L.compare,
              h(
                "select",
                { onchange: (e) => ((S.beside = e.target.value || null), render()) },
                h("option", { value: "" }, L.noCompare),
                V.cuts.filter((x) => x.id !== S.cut).map((x) => h("option", { value: x.id, selected: x.id === S.beside ? "selected" : null }, x.label)),
              ),
            )
          : null,
      ),
    );
    const track = h("div", { class: "track", role: "slider", "aria-label": L.title, "aria-valuemin": "0", "aria-valuemax": String(c.duration ?? 0), tabindex: "0" }, h("div", { class: "rail" }), h("div", { class: "done" }), h("div", { class: "ticks" }), h("div", { class: "head" }));
    const scrub = (e) => {
      const r = track.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      video.pause();
      seekFrame(Math.floor(p * (video.duration || c.duration || 0) * c.fps));
    };
    track.addEventListener("pointerdown", (e) => {
      track.setPointerCapture(e.pointerId);
      scrub(e);
      track.onpointermove = scrub;
    });
    track.addEventListener("pointerup", () => (track.onpointermove = null));
    const controls = h(
      "div",
      { class: "controls" },
      h("button", { class: "ctl", "aria-label": L.back, title: L.back, html: V.icons.back, onclick: () => (video.pause(), seekFrame(frameNow() - 1)) }),
      h("button", { class: "ctl big", id: "play", "aria-label": L.play, html: V.icons.play, onclick: togglePlay }),
      h("button", { class: "ctl", "aria-label": L.fwd, title: L.fwd, html: V.icons.fwd, onclick: () => (video.pause(), seekFrame(frameNow() + 1)) }),
      h("span", { class: "time" }, h("span", {}, "0:00.00"), h("span", {}, "")),
      h("span", { class: "grow" }),
      h(
        "div",
        { class: "speed", role: "group", "aria-label": L.speed },
        [0.25, 0.5, 1].map((s) =>
          h(
            "button",
            {
              "aria-pressed": String(S.speed === s),
              onclick: (e) => {
                S.speed = s;
                for (const v of [video, other]) if (v) v.playbackRate = s;
                for (const b of $$(".speed button")) b.setAttribute("aria-pressed", String(b === e.currentTarget));
              },
            },
            `${s}×`,
          ),
        ),
      ),
      h("button", {
        class: "ctl",
        id: "mute",
        "aria-label": S.muted ? L.muted : L.sound,
        title: S.muted ? L.muted : L.sound,
        html: S.muted ? V.icons.muted : V.icons.sound,
        onclick: (e) => {
          S.muted = !S.muted;
          video.muted = S.muted;
          e.currentTarget.innerHTML = S.muted ? V.icons.muted : V.icons.sound;
          e.currentTarget.setAttribute("aria-label", S.muted ? L.muted : L.sound);
          e.currentTarget.title = S.muted ? L.muted : L.sound;
        },
      }),
    );
    const stage = h("section", { class: "stagecol" }, h("div", { class: `screens${beside ? " duo" : ""}` }, screen(c, true), beside ? screen(beside, false) : null), track, controls, h("p", { class: "hint" }, L.hint, " ", h("span", { class: "keys" }, L.keys)));
    app.append(...[header, V.error ? h("div", { class: "banner" }, V.error) : null, stage, h("aside", {})].filter(Boolean));
    video = $(".screen.main video");
    other = $(".screen:not(.main) video");
    video.muted = S.muted;
    for (const v of [video, other]) if (v) v.playbackRate = S.speed;
    if (other) other.muted = true;
    fit();
    video.addEventListener("loadedmetadata", () => {
      if (S.pending != null) seekFrame(S.pending);
      else if (keep) video.currentTime = Math.min(keep, video.duration - 0.01);
      S.pending = null;
      renderMarks();
    });
    video.addEventListener("play", () => other && other.play().catch(() => {}));
    video.addEventListener("pause", () => other && (other.pause(), (other.currentTime = video.currentTime)));
    renderSide();
    if (!ticking) {
      ticking = true;
      tick();
    }
  }

  window.addEventListener("resize", fit);
  document.addEventListener("keydown", (e) => {
    if (!video || e.target.closest("textarea,input,select")) return;
    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      video.pause();
      seekFrame(frameNow() + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? Math.round(fps()) : 1));
    } else if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      openComposer("frame");
    } else if (e.key === "Escape" && S.composer) closeComposer();
  });
  render();
}

const FONTS = "https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700&display=swap";

/** The page: one HTML file holding the view as data and the client script. */
export function buildPage(view, key = "") {
  const data = JSON.stringify({ ...view, icons: ICON, key }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="${esc(view.lang)}" dir="${view.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(view.labels.title)}: ${esc(view.film ?? "")}</title><link rel="icon" href="data:,"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${CSS}</style></head><body><main id="app" class="app"></main><script>let V=${data};V.pin=${PIN.toString()};(${client.toString()})();</script></body></html>`;
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function streamFile(req, res, file, type) {
  const size = statSync(file).size;
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "no-store" };
  if (!m) {
    res.writeHead(200, { ...headers, "content-length": size });
    return createReadStream(file).pipe(res);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) {
    res.writeHead(416, { "content-range": `bytes */${size}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}` });
  createReadStream(file, { start, end }).pipe(res);
}

const readBody = (req, limit = 8_000_000) =>
  new Promise((ok, no) => {
    let s = "";
    req.on("data", (d) => {
      s += d;
      if (s.length > limit) {
        no(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        ok(s ? JSON.parse(s) : {});
      } catch (e) {
        no(e);
      }
    });
  });

/** Serves the room on 127.0.0.1. Resolves to { url, key, finished, close }; finished resolves to the printed report. */
export function startRoom({ root, film, cuts, lang = "en", fps = 30, port = 0, timeoutMs = 120 * 60 * 1000 }) {
  const store = loadNotes(root, film);
  const L = labelsFor(lang);
  const shots = join(notesDir(root, film), "shots");
  const view = (error = null) => buildView({ film, cuts, store, lang, fps, error });
  const state = () => ({ notes: store.notes, messages: Object.fromEntries(cuts.map((c) => [c.id, asMessage(store, c.id, L)])) });
  const since = new Date().toISOString();
  let viewed = cuts[0]?.id ?? null;
  const key = randomBytes(18).toString("hex");
  // Only the room's own page reaches it: its own host name (a rebound name fails), its own origin,
  // and on every change its key in a header, which no other site can send without asking first.
  const refuse = (req) => {
    const own = [`127.0.0.1:${server.address().port}`, `localhost:${server.address().port}`];
    if (!own.includes(req.headers.host)) return "wrong host";
    if (req.headers.origin && !own.some((h) => req.headers.origin === `http://${h}`)) return "wrong origin";
    if (req.method === "GET") return null;
    if (req.headers["x-review-key"] !== key || !String(req.headers["content-type"] ?? "").startsWith("application/json")) return "no key";
    return null;
  };
  let resolveFinished;
  const finished = new Promise((r) => (resolveFinished = r));
  let timer;
  let over = false;
  const server = createServer(async (req, res) => {
    try {
      const why = refuse(req);
      if (why) return send(res, 403, { error: why });
      const url = new URL(req.url, "http://127.0.0.1");
      const p = url.pathname;
      if (req.method === "GET" && p === "/") return send(res, 200, buildPage(view(), key), "text/html; charset=utf-8");
      if (req.method === "GET" && p === "/state") return send(res, 200, view());
      const cut = p.match(/^\/cut\/([^/]+)$/);
      if (req.method === "GET" && cut) {
        const c = cuts.find((x) => x.id === decodeURIComponent(cut[1]));
        return c ? streamFile(req, res, c.file, TYPES[extname(c.file).toLowerCase()] ?? "video/mp4") : send(res, 404, { error: "no such version" });
      }
      const shot = p.match(/^\/shot\/(n\d+)$/);
      if (req.method === "GET" && shot) {
        const f = join(shots, `${shot[1]}.jpg`);
        return existsSync(f) ? streamFile(req, res, f, "image/jpeg") : send(res, 404, { error: "no snapshot" });
      }
      if (req.method === "POST" && p === "/note") {
        const b = await readBody(req);
        if (!cuts.some((c) => c.id === b.cut)) return send(res, 400, { error: "no such version" });
        const n = addNote(store, b);
        const img = typeof b.shot === "string" ? b.shot.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/) : null;
        if (img) {
          mkdirSync(shots, { recursive: true });
          writeFileSync(join(shots, `${n.id}.jpg`), Buffer.from(img[1], "base64"));
          n.shot = relative(root, join(shots, `${n.id}.jpg`)).split("\\").join("/");
        }
        viewed = b.cut;
        saveNotes(root, store);
        return send(res, 200, state());
      }
      const one = p.match(/^\/note\/(n\d+)$/);
      if (one && (req.method === "POST" || req.method === "DELETE")) {
        const i = store.notes.findIndex((x) => x.id === one[1]);
        if (i < 0) return send(res, 404, { error: "no such note" });
        if (store.notes[i].status !== "open") return send(res, 400, { error: "an answered note is marked, not edited" });
        if (req.method === "DELETE") {
          rmSync(join(shots, `${store.notes[i].id}.jpg`), { force: true });
          store.notes.splice(i, 1);
        }
        else {
          const text = String((await readBody(req)).text ?? "").trim();
          if (!text) return send(res, 400, { error: "a note needs words" });
          store.notes[i].text = text;
        }
        saveNotes(root, store);
        return send(res, 200, state());
      }
      const ver = p.match(/^\/verdict\/(n\d+)$/);
      if (req.method === "POST" && ver) {
        const n = store.notes.find((x) => x.id === ver[1]);
        const { verdict } = await readBody(req);
        if (!n || !n.answer) return send(res, 400, { error: "only an answered note is marked" });
        if (!["fixed", "not-yet"].includes(verdict)) return send(res, 400, { error: "fixed or not-yet" });
        n.verdict = verdict;
        n.verdictAt = new Date().toISOString();
        n.status = verdict === "fixed" ? "fixed" : "answered";
        saveNotes(root, store);
        return send(res, 200, state());
      }
      if (req.method === "POST" && p === "/send") {
        const b = await readBody(req);
        if (cuts.some((c) => c.id === b.viewed)) viewed = b.viewed;
        // Not yet sends the note back: it is open again, on the version it was written on.
        for (const n of store.notes) if (n.verdict === "not-yet" && n.status === "answered") n.status = "open";
        store.sends.push({ at: new Date().toISOString(), viewed, open: store.notes.filter((n) => n.status === "open").length });
        saveNotes(root, store);
        send(res, 200, { ok: true });
        return finish(true);
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
  const finish = (done) => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    resolveFinished(report(store, root, viewed, done, since));
  };
  return new Promise((ok, no) => {
    server.on("error", no);
    server.listen(port, "127.0.0.1", () => {
      timer = setTimeout(() => finish(false), timeoutMs);
      ok({ url: `http://127.0.0.1:${server.address().port}/`, key, finished, close: () => finish(false) });
    });
  });
}

function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // no browser here: the agent opens the printed URL itself
  }
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const flag = (k) => args.includes(`--${k}`);
  const root = resolve(arg("root") ?? ".");
  const dir = resolve(root, arg("cuts") ?? join("out", "delivered"));
  const { film, cuts } = listCuts(dir, arg("film"));
  if (arg("answer")) {
    if (!film) throw new Error("--film: which film's notes");
    const store = loadNotes(root, film);
    const n = answerNote(store, arg("answer"), { cut: arg("in"), text: arg("text") });
    saveNotes(root, store);
    console.log(`answered ${n.id} in ${n.answer.cut}`);
    return;
  }
  if (!film || !cuts.length) throw new Error(`no finished version in ${relative(root, dir) || "."}: deliver the film as <film>-v<n>.mp4 first`);
  const fps = Number(arg("fps") ?? 30);
  for (const c of cuts) {
    const p = probe(c.file);
    Object.assign(c, p ?? {}, { fps: p?.fps ?? fps });
  }
  const room = await startRoom({ root, film, cuts, lang: arg("lang") ?? "en", fps, port: Number(arg("port") ?? 0), timeoutMs: Number(arg("timeout-min") ?? 120) * 60 * 1000 });
  console.log(`review ${room.url}`);
  if (!flag("no-open")) openBrowser(room.url);
  console.log(await room.finished);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(2);
  });
}
