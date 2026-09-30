#!/usr/bin/env node
/**
 * The visual brief: the one message the user approves before the build. It shows,
 * in the user's language: what was understood about the brand (the brand read, in
 * the brand's own words), the idea, where each thing the user asked for lands, the
 * music (with an excerpt around its lift to play), the plan, the style frames (the
 * finished look, from the real assets) and a storyboard of every cut (a frame per
 * beat, its time, its words and how the shot is entered), so the user judges
 * something that looks like the film instead of a paragraph. Needs Node 18+ and ffmpeg; a Chrome or Chromium on the machine
 * also writes a PNG of the page.
 *
 *   node visual-brief.mjs docs/visual-brief.json [--out=out] [--animatic]
 *
 * Paths in the JSON are relative to the current directory (the project root).
 * Writes out/visual-brief.html (self-contained: light and dark, phone width), and
 * with --animatic out/animatic-<cut>.mp4: a rough cut at 480p with the music and
 * labelled transitions, for checking pacing and reading time. The rough cut is
 * internal: never send it to the user, who will judge it as the film.
 *
 * {
 *   "format": "promo",                 // the module (formats/<id>): its rules are the ones checked
 *   "lang": "he",                      // the page's language; he, ar, fa, ur read right to left
 *   "labels": { "idea": "..." },       // optional: headings for a language without built-in ones
 *   "title": "...",
 *   "brand": [{ "row": "difference", "quote": "the brand's own words", "source": "about page", "scope": "brand", "meaning": "for the film" },
 *             { "row": "look", ... }, { "row": "signature", "scope": "the autumn loaf", ... },   // scope: "brand", or the one part it is about
 *             { "row": "spine", "quote": null, "inferredFrom": "when the brand says nothing", "scope": "brand", "meaning": "..." }],
 *   "idea": "the concept in one sentence",
 *   "motif": { "object": "the one object that carries the film", "verb": "what it does: what the brand does",
 *              "links": "how it carries the shots between the turns" },   // each beat may add "motif": "its part here"
 *   "moments": [{ "thing": "the printed model", "becomes": "the mould it is cast in", "beat": 3 }],   // the three a viewer remembers: a thing, and what it turns into
 *   "facts": [{ "text": "24 cm pie dish", "source": "the product page" }],   // the only source of any number on screen
 *   "asks": [{ "item": "workshops", "where": "the turn: guests' hands" }],
 *   "feed": true,                      // Reels, TikTok, Shorts, Stories: the first-seconds checks apply
 *   "music": { "id": "library id", "title": "...", "artist": "...", "bpm": 90, "why": "fits the brand's look because ...",
 *              "file": "public/music/track.mp3", "liftSeconds": 16, "startSeconds": 8.6,   // where the film starts the track
 *              "alternatives": [{ "id": "...", "title": "...", "why": "...", "file": "...", "startSeconds": 0 }] },
 *   "plan": ["one line", "**bold** allowed"],
 *   "styleFrames": [{ "image": "out/style-turn.png", "caption": "..." }],
 *   "motionFrames": [{ "video": "out/motion-turn.mp4", "caption": "..." }],   // 3-6 s at final quality: the turn, the motif moving
 *   "hook": { "recommended": "...", "why": "...", "alternatives": ["..."] },
 *   "next": "After your go: ...",
 *   "cuts": [{ "name": "30 s", "message": "...", "turnAt": 13.5,
 *     "source": "footage/all.mp4", "crop": { "x": 0, "y": 0, "w": 1920, "h": 1080 },
 *     "beats": [{ "at": 0, "dur": 3.5, "src": 0, "len": 3.4, "picture": "...", "words": "...", "scale": "close", "in": "Opens mid-action" },
 *               { "at": 3.5, "dur": 3, "image": "out/still-2.png", "picture": "...", "scale": "wide", "in": "MATCH CUT on the code",
 *                 "carries": "the code, same place and size in the frame" }] }]   // what the eye follows over the cut into this shot
 * }
 *
 * `scale` is how much of the world the frame shows: macro (a detail fills it), close (one object
 * or one element), medium (a person, a whole screen), wide (the room, the whole canvas), overhead
 * (from above) or type (words fill it).
 *
 * A beat's frame comes from its `image`, or from the cut's (or its own) `source`
 * video at `src` + `len` / 2, reframed by `crop` (null for none). Exit 1 when the
 * plan does not hold together: a brand row missing, without its scope, or (but for the
 * signature, which is marked for the owner to confirm) taken from one part of the brand, or with neither a quote nor what
 * it was inferred from; no idea; no asks list, or an asked item with no place in the
 * film; music without a reason; beats that leave a gap or overlap or sit off the
 * track's beat grid (60 / bpm s, 0.5 s when no bpm is given); a caption that cannot
 * be read in its beat (about 0.3 s a word, at least 1.5 s); a long dash in the words; a number
 * on screen that is in no fact. With "feed":
 * no music.startSeconds, nothing changing in the first 2 s (a cut, or a beat's changesAt), or a cut over
 * 30 s without a longWhy. For a promo (and the modules built on it): fewer than about 10 compositions
 * per 30 s, a composition over 3.5 s with no change marked inside it, a shot with no scale, the
 * same scale three shots running or too few scales in a cut, a boundary that carries nothing
 * into the next shot, or fewer moments than the film's length asks for (three from 20 s).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const fmt = (n) => Number(n).toFixed(1);

const ROWS = ["difference", "look", "signature", "spine"];
/** Each module's nearest full module: whose pace and continuity rules a brief is checked against. */
const FAMILY = {
  promo: "promo", "feature-announcement": "promo", "social-organic": "promo", "event-recap": "promo",
  "product-demo": "product-demo", "app-store-preview": "product-demo",
  tutorial: "tutorial", onboarding: "tutorial",
  explainer: "explainer", testimonial: "explainer",
};
const SCALES = ["macro", "close", "medium", "wide", "overhead", "type"];
/** How many moments a film of this length names: a thing, and what it becomes. */
const momentsFor = (seconds) => (seconds >= 20 ? 3 : seconds >= 10 ? 2 : 1);
const RTL = new Set(["he", "ar", "fa", "ur"]);
const has = (v) => typeof v === "string" && v.trim().length > 0;
/** Seconds per beat of the chosen track: the grid every beat sits on. */
const beatSeconds = (brief) => (Number(brief.music?.bpm) > 0 ? 60 / Number(brief.music.bpm) : 0.5);

/** Problems that make the plan not hold together, as sentences. */
export function checkPlan(brief) {
  const problems = [];
  const family = FAMILY[brief.format];
  if (!family) problems.push(`format: name the module this film is (format: ${Object.keys(FAMILY).join(", ")}); its rules are the ones checked`);
  const promo = family === "promo";
  if (!Array.isArray(brief.brand)) {
    problems.push("brand read: missing. Add the four rows (difference, look, signature, spine) from the brand's own words (references/brand-read.md)");
  } else {
    for (const row of ROWS) {
      const r = brief.brand.find((x) => x.row === row);
      if (!r) problems.push(`brand read: no "${row}" row`);
      else {
        if (!has(r.quote) && !has(r.inferredFrom)) problems.push(`brand read, ${row}: quote the brand's own words, or say what it was inferred from (inferredFrom)`);
        if (!has(r.meaning)) problems.push(`brand read, ${row}: say what it means for the film (meaning)`);
        if (!has(r.scope)) problems.push(`brand read, ${row}: say what it is about: "brand" for the whole brand, or which part (a collection, a product, a season) (scope)`);
        else if (row !== "signature" && r.scope !== "brand") problems.push(`brand read, ${row}: taken from ${r.scope}, one part of the brand; the ${row} comes from what the brand says about itself as a whole`);
      }
    }
  }
  if (!has(brief.idea)) problems.push("the idea: missing. Write the concept in one sentence (idea)");
  const mo = brief.motif;
  if (!mo || !has(mo.object) || !has(mo.verb)) problems.push("the motif: name the one object that carries the film and what it does, which is what the brand does (motif.object, motif.verb); it is what makes the film flow");
  if (!Array.isArray(brief.asks)) problems.push("asks: list every item the user asked for, with where it lands in the film (an empty list when the ask named none)");
  else for (const a of brief.asks) if (!has(a.where)) problems.push(`asks: "${a.item ?? "?"}" has no place in the film; put it inside the story, or say which film it gets`);
  if (!brief.music || typeof brief.music !== "object") problems.push("music: name the track from the library and why it fits the brand's look (music.id, music.why)");
  else {
    if (!has(brief.music.id) && !has(brief.music.title)) problems.push("music: name the track (music.id or music.title)");
    if (!has(brief.music.why)) problems.push("music: say why this track fits the brand's look (music.why)");
    if (brief.feed && !(Number(brief.music.startSeconds) >= 0)) problems.push("feed: start the track where its beat already plays (music.startSeconds, from track.json feedStartSeconds), never at its quiet intro");
  }
  if (brief.feed) {
    for (const cut of brief.cuts ?? []) {
      const first = cut.beats?.[0];
      // The first visible change: the cut, or one inside the shot (a push-in, an action completing), so a hook line can stay up across it.
      const change = first ? Math.min(first.dur, Number(first.changesAt) > 0 ? Number(first.changesAt) : first.dur) : 0;
      if (first && change > 2) problems.push(`feed, ${cut.name}: nothing changes for ${fmt(change)} s; in a feed something visibly changes within 2 s: cut sooner, or mark a change inside the shot (changesAt) (references/feed.md)`);
      const total = (cut.beats ?? []).reduce((s, b) => s + b.dur, 0);
      if (total > 30.5 && !has(cut.longWhy)) problems.push(`feed, ${cut.name}: ${fmt(total)} s; a promo in a feed is 15 to 30 s (say why in longWhy if it truly holds longer)`);
    }
  }
  const motion = brief.motionFrames ?? [];
  if (!motion.length) problems.push("motion frame: render 3 to 6 s of the turn at final quality with the motif moving through it (motionFrames); stills cannot show the flow");
  for (const [i, m] of motion.entries()) {
    if (!has(m.video)) problems.push(`motion frame ${i + 1}: needs a video`);
    else if (!existsSync(resolve(m.video))) problems.push(`motion frame ${i + 1}: ${m.video} is not on disk (the page shows a stand-in)`);
    else {
      const seconds = videoSeconds(m.video);
      if (seconds < 2.5 || seconds > 6.5) problems.push(`motion frame ${i + 1}: ${fmt(seconds)} s; 3 to 6 s shows the turn without becoming a rough cut`);
    }
  }
  const beat = beatSeconds(brief);
  const beatText = String(Number(beat.toFixed(3)));
  const facts = (brief.facts ?? []).map((f) => String(f?.text ?? "")).join(" \n ");
  const numbers = (s) => String(s ?? "").match(/\d+(?:[.,:]\d+)*/g) ?? [];
  const unsourced = (s) => numbers(s).filter((n) => !new RegExp(`(^|[^\\d.,:])${n.replace(/[.]/g, "\\.")}([^\\d]|$)`).test(facts));
  if (family && family !== "tutorial") {
    for (const f of brief.facts ?? []) if (!has(f?.text) || !has(f?.source)) problems.push(`facts: "${f?.text ?? "?"}" needs its text and where it comes from (source)`);
    for (const n of unsourced(brief.hook?.recommended)) problems.push(`the opening line: "${n}" is on screen but in no fact; every number shown comes from the facts list (facts: text, source), never from memory`);
  }
  if (promo) {
    const longest = Math.max(0, ...(brief.cuts ?? []).map((c) => (c.beats ?? []).reduce((s, b) => s + b.dur, 0)));
    const need = momentsFor(longest);
    const moments = Array.isArray(brief.moments) ? brief.moments : [];
    if (moments.length < need) problems.push(`moments: name ${need === 1 ? "the moment" : `the ${need} moments`} a viewer will remember, each as a thing and what it becomes (moments: thing, becomes, beat), in plain words with no effect names; a film with none is a run of shots`);
    moments.forEach((m, i) => {
      if (!has(m?.thing) || !has(m?.becomes)) problems.push(`moments, ${i + 1}: say the thing and what it becomes ("the inspection photo" becomes "the report's first picture")`);
      if (!(Number.isInteger(m?.beat) && m.beat >= 1 && m.beat <= (brief.cuts?.[0]?.beats?.length ?? 0))) problems.push(`moments, ${i + 1}: say which beat of the first cut it happens in (beat)`);
    });
  }
  for (const cut of brief.cuts ?? []) {
    let t = 0;
    if (promo) {
      const total = cut.beats.reduce((s, b) => s + b.dur, 0);
      const per30 = (cut.beats.length * 30) / total;
      if (total >= 10 && per30 < 10) problems.push(`${cut.name}: ${cut.beats.length} compositions in ${fmt(total)} s (${fmt(per30)} per 30 s); a promo holds about 12 to 15 per 30 s, each 1.4 to 3.5 s: split the long ones, or show what is missing`);
      const kinds = new Set(cut.beats.map((b) => b.scale).filter((s) => SCALES.includes(s)));
      const needKinds = total >= 15 ? 3 : total >= 6 ? 2 : 1;
      if (cut.beats.every((b) => SCALES.includes(b.scale)) && kinds.size < needKinds) problems.push(`${cut.name}: every shot is ${[...kinds].join(" or ")}; ${fmt(total)} s needs at least ${needKinds} scales (${SCALES.join(", ")}), or it reads as one layout repeated`);
    }
    cut.beats.forEach((b, i) => {
      const where = `${cut.name}, beat ${i + 1}`;
      if (promo) {
        if (!SCALES.includes(b.scale)) problems.push(`${where}: say how much of the world the frame shows (scale: ${SCALES.join(", ")})`);
        else if (i >= 2 && cut.beats[i - 1].scale === b.scale && cut.beats[i - 2].scale === b.scale) problems.push(`${where}: the third ${b.scale} shot running; change the scale, or the eye stops seeing the cuts`);
        if (i > 0 && !has(b.carries)) problems.push(`${where}: say what the eye follows over the cut into this shot (carries): the motif, or a real object, shape or movement that sits in the same place on both sides; a cut that carries nothing restarts the film`);
        if (b.dur > 3.5 + 0.01 && !(Number(b.changesAt) > 0)) problems.push(`${where}: ${fmt(b.dur)} s with no change marked inside it; past 3.5 s a composition needs one (changesAt), or it is two shots`);
      }
      if (family && family !== "tutorial") for (const n of unsourced(b.words)) problems.push(`${where}: "${n}" is on screen but in no fact; every number shown comes from the facts list (facts: text, source), never from memory`);
      if (Math.abs(b.at - t) > 0.01) problems.push(`${where}: starts at ${fmt(b.at)} s, but the beat before it ends at ${fmt(t)} s`);
      if (Math.abs(b.dur / beat - Math.round(b.dur / beat)) > 0.01) problems.push(`${where}: ${b.dur} s is off the ${beatText} s beat grid`);
      const words = (b.words ?? "").trim().split(/\s+/).filter(Boolean).length;
      const need = words ? Math.max(1.5, words * 0.3) + 0.5 : 0; // the words land, then hold
      if (words && b.dur < need) problems.push(`${where}: ${words} words need about ${fmt(need)} s on screen, the beat has ${fmt(b.dur)} s`);
      if (/[\u2014\u2013]/.test(b.words ?? "")) problems.push(`${where}: a long dash in the words on screen reads as machine-written; use two lines or a colon`);
      if (!b.image && b.src === undefined) problems.push(`${where}: needs an image or a src time in the footage`);
      const file = b.image ?? b.source ?? cut.source;
      if (file && !existsSync(resolve(file))) problems.push(`${where}: ${file} is not on disk (the page shows a stand-in)`);
      if (!has(b.job)) problems.push(`${where}: say what this shot does for the viewer (job): for a promo hook, promise, proof, offer or close; a shot with no job is cut`);
      t = b.at + b.dur;
    });
  }
  return problems;
}

function ff(args) {
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.trim().split("\n").pop()}`);
}

/** A stand-in frame naming a file that is not on disk, so the page still builds and shows the gap. */
const missingFrame = (path, w = 640, h = 1138) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#e9e6e1"/><text x="50%" y="50%" font-family="Arial" font-size="26" fill="#8a2c0d" text-anchor="middle">missing: ${esc(String(path).split(/[\\/]/).pop())}</text></svg>`).toString("base64")}`;

/** A beat's frame as a small JPEG data URI. */
function frameFor(cut, b, tmp, key) {
  const src = b.image ?? b.source ?? cut.source;
  if (!src || !existsSync(resolve(src))) return missingFrame(src ?? "no source");
  const out = join(tmp, `${key}.jpg`);
  const crop = b.crop !== undefined ? b.crop : cut.crop;
  const reframe = crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : "";
  if (b.image) ff(["-i", resolve(b.image), "-frames:v", "1", "-vf", `${reframe}scale=640:-2`, "-q:v", "3", out]);
  else ff(["-ss", String(b.src + (b.len ?? 0) / 2), "-i", resolve(b.source ?? cut.source), "-frames:v", "1", "-vf", `${reframe}scale=640:-2`, "-q:v", "3", out]);
  return `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`;
}

const imageUri = (path) => {
  if (!path || !existsSync(resolve(path))) return missingFrame(path ?? "no image", 1280, 720);
  const tmp = mkdtempSync(join(tmpdir(), "vb-"));
  const out = join(tmp, "s.jpg");
  ff(["-i", resolve(path), "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", out]);
  const uri = `data:image/jpeg;base64,${readFileSync(out).toString("base64")}`;
  rmSync(tmp, { recursive: true, force: true });
  return uri;
};

const LABELS = {
  en: {
    title: "Your video: here's what you'll get",
    lead: "One look before I build it. Reply <b>go</b>, or change any line or any shot.",
    brand: "What I understood about your brand",
    brandNote: "Did I get it right? Correct any line here: everything below is built on it.",
    said: "In your words", meaning: "What it means for the film",
    rows: { difference: "What sets you apart", look: "How you look", signature: "Your signature", spine: "Your story" },
    inferred: "Not said on your site; inferred from",
    partOnly: "Please confirm: this is said only about",
    idea: "The idea", motif: "What carries the film", moments: "The moments you will remember", becomes: "becomes", carried: "Carried over the cut:", asks: "What you asked for, and where it is in the film", asked: "You asked for", where: "Where it is",
    music: "The music", alsoMusic: "Also possible, each from where the film would start it:", plan: "The plan", look: "The look (final quality, from your assets)", motion: "The motion: the turn, at final quality",
    storyboard: "Storyboard", oneSentence: "In one sentence:", noWords: "no words",
    hook: "The opening line", recommended: "recommended", also: "Also possible:",
  },
  he: {
    title: "הסרטון שלכם: זה מה שיהיה",
    lead: "מבט אחד לפני שאני בונה. אפשר לאשר (<b>go</b>), או לשנות כל שורה או שוט.",
    brand: "מה הבנתי על המותג",
    brandNote: "הבנתי נכון? אפשר לתקן כל שורה כאן: כל מה שלמטה נבנה עליה.",
    said: "במילים שלכם", meaning: "מה זה אומר לסרט",
    rows: { difference: "מה מייחד אתכם", look: "איך אתם נראים", signature: "החתימה שלכם", spine: "הסיפור שלכם" },
    inferred: "לא כתוב אצלכם; הסקתי מ",
    partOnly: "לאישורכם: זה נאמר רק על",
    idea: "הרעיון", motif: "מה מוביל את הסרט", moments: "הרגעים שיזכרו", becomes: "הופך ל", carried: "עובר בחיתוך:", asks: "מה ביקשתם, ואיפה זה בסרט", asked: "ביקשתם", where: "איפה זה בסרט",
    music: "המוזיקה", alsoMusic: "אפשר גם, כל אחת מהמקום שבו הסרט יתחיל אותה:", plan: "התוכנית", look: "הלוק (באיכות סופית, מהחומרים שלכם)", motion: "התנועה: רגע המפנה, באיכות סופית",
    storyboard: "סטוריבורד", oneSentence: "במשפט אחד:", noWords: "בלי מילים",
    hook: "שורת הפתיחה", recommended: "מומלץ", also: "אפשר גם:",
  },
};

/**
 * 15 s of a track as an MP3 data URI, so the user hears the music in the brief: from where the film
 * starts it (startSeconds, the feed start in a feed), else from 8 s before its lift.
 */
function musicExcerpt(music, tmp, key = "music") {
  if (!music?.file || !existsSync(resolve(music.file))) return null;
  const out = join(tmp, `${key}.mp3`);
  const start = Number(music.startSeconds) >= 0 ? Number(music.startSeconds) : Math.max(0, (Number(music.liftSeconds) || 8) - 8);
  ff(["-ss", String(start), "-t", "15", "-i", resolve(music.file), "-vn", "-af", "afade=t=in:d=0.3,afade=t=out:st=13.5:d=1.5", "-ac", "2", "-b:a", "96k", out]);
  return `data:audio/mpeg;base64,${readFileSync(out).toString("base64")}`;
}

/** A video's length in seconds, 0 when it cannot be read. */
function videoSeconds(path) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", resolve(path)], { encoding: "utf8" });
  return Number(r.stdout) || 0;
}

/** A motion frame as a data URI: 720 px wide, silent, small enough to embed. */
function videoUri(path, tmp, key) {
  if (!path || !existsSync(resolve(path))) return null;
  const out = join(tmp, `${key}.mp4`);
  ff(["-i", resolve(path), "-an", "-vf", "scale='min(720,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  return `data:video/mp4;base64,${readFileSync(out).toString("base64")}`;
}

/** Each motion frame's strip (12 frames across it) for the storyboard critic, and a copy to send as a file. */
export function writeMotionFiles(brief, outDir) {
  const written = [];
  for (const [i, m] of (brief.motionFrames ?? []).entries()) {
    if (!m?.video || !existsSync(resolve(m.video))) continue;
    const seconds = videoSeconds(m.video) || 1;
    const strip = join(outDir, `motion-${i + 1}-strip.png`);
    ff(["-i", resolve(m.video), "-vf", `fps=${(12 / seconds).toFixed(4)},scale=240:-2,tile=12x1:padding=4:color=white`, "-frames:v", "1", strip]);
    const copy = join(outDir, `motion-${i + 1}.mp4`);
    if (resolve(m.video) !== copy) writeFileSync(copy, readFileSync(resolve(m.video)));
    written.push({ strip, copy });
  }
  return written;
}

/** Each track the brief offers, as its own 15 s MP3 in outDir (music-1-<id>.mp3, ...), for sending as files. */
export function writeMusicFiles(brief, outDir) {
  const m = brief.music && typeof brief.music === "object" ? brief.music : null;
  if (!m) return [];
  const tmp = mkdtempSync(join(tmpdir(), "vb-"));
  try {
    return [m, ...(m.alternatives ?? [])].flatMap((t, i) => {
      if (!t?.file || !existsSync(resolve(t.file))) return [];
      musicExcerpt(t, tmp, `m${i}`);
      const out = join(outDir, `music-${i + 1}-${String(t.id ?? "track").replace(/[^\w-]+/g, "")}.mp3`);
      writeFileSync(out, readFileSync(join(tmp, `m${i}.mp3`)));
      return [out];
    });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function buildHtml(brief) {
  const tmp = mkdtempSync(join(tmpdir(), "vb-"));
  const lang = String(brief.lang ?? "en");
  const base = LABELS[lang.split("-")[0]] ?? LABELS.en;
  const L = { ...base, ...(brief.labels ?? {}), rows: { ...base.rows, ...(brief.labels?.rows ?? {}) } };
  const dir = RTL.has(lang.split("-")[0]) ? "rtl" : "ltr";
  try {
    const brandRows = (brief.brand ?? []).slice().sort((a, b) => ROWS.indexOf(a.row) - ROWS.indexOf(b.row)).map((r) => {
      const part = has(r.scope) && r.scope !== "brand" ? `<small class="confirm">${esc(L.partOnly)} ${esc(r.scope)}</small>` : "";
      const said = (has(r.quote) ? `<q>${esc(r.quote)}</q>${r.source ? `<small>${esc(r.source)}</small>` : ""}` : `<span class="mute">${esc(L.inferred)} ${esc(r.inferredFrom ?? "")}</span>`) + part;
      return `<tr><th>${esc(L.rows[r.row] ?? r.row)}</th><td>${said}</td><td>${rich(r.meaning ?? "")}</td></tr>`;
    }).join("");
    const brand = brandRows ? `<h2>${esc(L.brand)}</h2><table class="kv"><thead><tr><th></th><th>${esc(L.said)}</th><th>${esc(L.meaning)}</th></tr></thead><tbody>${brandRows}</tbody></table><p class="note">${esc(L.brandNote)}</p>` : "";
    const idea = has(brief.idea) ? `<h2>${esc(L.idea)}</h2><div class="box idea">${rich(brief.idea)}</div>` : "";
    const mo = brief.motif && has(brief.motif.object) ? `<h2>${esc(L.motif)}</h2><div class="box"><b>${esc(brief.motif.object)}</b>${has(brief.motif.verb) ? ` <span class="mute">· ${esc(brief.motif.verb)}</span>` : ""}${has(brief.motif.links) ? `<p>${rich(brief.motif.links)}</p>` : ""}</div>` : "";
    const moments = (brief.moments ?? []).filter((x) => has(x?.thing) && has(x?.becomes));
    const mm = moments.length ? `<h2>${esc(L.moments)}</h2><ol class="moments">${moments.map((x) => `<li><b>${esc(x.thing)}</b> <span class="mute">${esc(L.becomes)}</span> <b>${esc(x.becomes)}</b></li>`).join("")}</ol>` : "";
    const asks = brief.asks?.length ? `<h2>${esc(L.asks)}</h2><table class="kv"><thead><tr><th>${esc(L.asked)}</th><th>${esc(L.where)}</th></tr></thead><tbody>${brief.asks.map((a) => `<tr><th>${esc(a.item)}</th><td>${rich(a.where ?? "")}</td></tr>`).join("")}</tbody></table>` : "";
    const m = brief.music && typeof brief.music === "object" ? brief.music : null;
    const track = (t, key) => {
      const clip = musicExcerpt(t, tmp, key);
      return `<b>${esc(t.title ?? t.id ?? "")}</b>${t.artist ? ` <span class="mute">· ${esc(t.artist)}</span>` : ""}${t.bpm ? ` <span class="mute">· ${esc(t.bpm)} BPM</span>` : ""}${t.why ? `<p>${rich(t.why)}</p>` : ""}${clip ? `<audio controls preload="metadata" src="${clip}"></audio>` : ""}`;
    };
    const alts = (m?.alternatives ?? []).map((t, i) => `<div class="alt">${track(t, `alt${i}`)}</div>`).join("");
    const music = m ? `<h2>${esc(L.music)}</h2><div class="box">${track(m, "music")}${alts ? `<p class="mute">${esc(L.alsoMusic)}</p>${alts}` : ""}</div>` : "";
    const storyboards = (brief.cuts ?? []).map((cut, c) => {
      const cells = cut.beats.map((b, i) => `<figure><div class="tag">${esc(b.in ?? "")}</div><img src="${frameFor(cut, b, tmp, `c${c}b${i}`)}" alt="${esc(b.picture)}"><figcaption><b>${i + 1} · ${fmt(b.at)}-${fmt(b.at + b.dur)} s${has(b.job) ? ` · <span class="job">${esc(b.job)}</span>` : ""}${has(b.scale) ? ` · <span class="job">${esc(b.scale)}</span>` : ""}</b><span>${esc(b.picture)}</span>${has(b.motif) ? `<em class="motif">${esc(b.motif)}</em>` : ""}${has(b.carries) ? `<em class="carry">${esc(L.carried)} ${esc(b.carries)}</em>` : ""}${b.words ? `<q>${esc(b.words)}</q>` : `<i>${esc(L.noWords)}</i>`}</figcaption></figure>`).join("");
      return `<h2>${esc(L.storyboard)}, ${esc(cut.name)}</h2>${cut.message ? `<p class="msg"><span>${esc(L.oneSentence)}</span> ${esc(cut.message)}</p>` : ""}<div class="grid">${cells}</div>`;
    }).join("");
    const motion = (brief.motionFrames ?? []).map((m, i) => {
      const uri = videoUri(m.video, tmp, `motion${i}`);
      const player = uri ? `<video src="${uri}" controls muted loop playsinline preload="metadata"></video>` : `<img src="${missingFrame(m.video ?? "no video", 640, 1138)}" alt="">`;
      return `<figure>${player}<figcaption>${rich(m.caption ?? "")}</figcaption></figure>`;
    }).join("");
    const frames = (brief.styleFrames ?? []).map((f) => `<figure><img src="${imageUri(f.image)}" alt="${esc(f.caption)}"><figcaption>${rich(f.caption)}</figcaption></figure>`).join("");
    const hook = brief.hook ? `<h2>${esc(L.hook)}</h2><div class="box"><b>${esc(brief.hook.recommended)}</b>${brief.hook.why ? ` <span class="mute">(${esc(L.recommended)}: ${esc(brief.hook.why)})</span>` : ""}${brief.hook.alternatives?.length ? `<br><span class="mute">${esc(L.also)}</span> ${brief.hook.alternatives.map((a) => `"${esc(a)}"`).join(" · ")}` : ""}</div>` : "";
    return `<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Video brief</title><style>
:root{--bg:#fff;--fg:#1d1f24;--mute:#6b6f7a;--line:#e6e7eb;--card:#f5f6f8;--tag:#f5d90a;--accent:#1d1f24}
@media (prefers-color-scheme:dark){:root{--bg:#121418;--fg:#e9eaee;--mute:#9ea2ad;--line:#2a2d34;--card:#1a1d22;--accent:#e9eaee}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,'Segoe UI',Inter,Arial,sans-serif}
main{max-width:1080px;margin:0 auto;padding:28px 16px 48px}h1{font-size:26px;line-height:1.25;margin:0 0 6px}.lead{color:var(--mute);margin:0 0 22px}
h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:30px 0 10px}ul{margin:0;padding-inline-start:20px}li{margin:4px 0}
.kv{width:100%;border-collapse:collapse;font-size:15px}.kv th,.kv td{text-align:start;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line)}.kv thead th{font-size:13px;color:var(--mute);font-weight:600}
.kv tbody th{width:22%;font-weight:700}.kv q{display:block;font-weight:600;margin:0}.kv small{display:block;color:var(--mute);font-size:12px;margin-top:3px}.kv small.confirm{color:#b45309;font-weight:700;font-size:13px}.note{color:var(--mute);font-size:14px;margin:8px 0 0}
.idea{font-size:18px;font-weight:600}audio{display:block;width:100%;margin-top:10px}.motion video{width:100%;max-width:420px;border-radius:10px;display:block;background:#000}.alt{margin-top:14px;padding-top:12px;border-top:1px solid var(--line)}.motif{display:block;margin-top:4px;color:#b45309;font-style:normal;font-size:13px}.carry{display:block;margin-top:4px;color:var(--mute);font-style:normal;font-size:13px}.moments{margin:0;padding-inline-start:22px}.moments li{margin:5px 0}.job{color:var(--mute);font-weight:700;text-transform:uppercase;font-size:12px;letter-spacing:.04em}.box p{margin:6px 0 0}
@media (max-width:640px){.kv,.kv tbody,.kv tr,.kv th,.kv td{display:block;width:auto}.kv thead{display:none}.kv tbody th{width:auto;padding-bottom:0;border:0}}
.frames{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.frames img{width:100%;border-radius:10px;display:block}
.frames figcaption{font-size:14px;color:var(--mute);margin-top:6px}figure{margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.grid figure{background:var(--card);border-radius:10px;overflow:hidden;position:relative}
.grid img{width:100%;display:block}.tag{position:absolute;top:8px;inset-inline-start:8px;background:var(--tag);color:#111;font-weight:700;font-size:12px;padding:2px 7px;border-radius:4px;max-width:85%}
.grid figcaption{padding:9px 11px 11px;font-size:14px;line-height:1.35}.grid figcaption b{display:block}.grid figcaption span{display:block;color:var(--mute)}
q{display:block;margin-top:5px;font-weight:600}i{display:block;margin-top:5px;color:var(--mute)}.msg{margin:0 0 10px}.msg span,.mute{color:var(--mute)}
.box{background:var(--card);border-radius:10px;padding:13px 15px}.go{margin-top:28px;border-left:4px solid var(--accent);padding:10px 14px;background:var(--card);border-radius:6px}
</style></head><body><main><h1>${esc(brief.title ?? L.title)}</h1><p class="lead">${L.lead}</p>
${brand}${idea}${mo}${mm}${asks}${music}
${brief.plan?.length ? `<h2>${esc(L.plan)}</h2><ul>${brief.plan.map((l) => `<li>${rich(l)}</li>`).join("")}</ul>` : ""}
${frames ? `<h2>${esc(L.look)}</h2><div class="frames">${frames}</div>` : ""}
${motion ? `<h2>${esc(L.motion)}</h2><div class="frames motion">${motion}</div>` : ""}
${storyboards}${hook}
${brief.next ? `<div class="go">${rich(brief.next)}</div>` : ""}</main></body></html>`;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  return candidates.find((c) => c && existsSync(c));
}

function findFont() {
  const candidates = [process.env.FONT_FILE, "C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"];
  const hit = candidates.find((c) => c && existsSync(c));
  if (hit) return hit;
  const r = spawnSync("fc-match", ["-f", "%{file}", "sans:bold"], { encoding: "utf8" });
  return r.status === 0 && existsSync(r.stdout) ? r.stdout : null;
}

/** The internal rough cut of one cut: 480p, the music, captions and labelled transitions. */
export function buildAnimatic(brief, cut, outFile) {
  const tmp = mkdtempSync(join(tmpdir(), "vb-"));
  const font = findFont();
  const f = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  try {
    const parts = cut.beats.map((b, i) => {
      const crop = b.crop !== undefined ? b.crop : cut.crop;
      const text = (name, s) => {
        const file = join(tmp, `${name}${i}.txt`);
        writeFileSync(file, s);
        return f(file);
      };
      const len = b.image ? b.dur : b.len ?? b.dur;
      const stretch = Math.min(1.5, b.dur / len);
      const pad = Math.max(0, b.dur - len * stretch);
      const vf = [
        crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}` : null,
        "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2",
        b.image ? null : `setpts=${stretch.toFixed(4)}*PTS`,
        pad > 0 && !b.image ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}` : null,
        "fps=30",
        `trim=duration=${b.dur}`,
        font && b.in ? `drawtext=fontfile='${f(font)}':textfile='${text("l", b.in)}':fontsize=15:fontcolor=black:box=1:boxcolor=0xF5D90A@0.95:boxborderw=6:x=14:y=14:enable='lt(t,1.2)'` : null,
        font && b.words ? `drawtext=fontfile='${f(font)}':textfile='${text("w", b.words)}':fontsize=24:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=8:x=(w-tw)/2:y=h-60` : null,
      ].filter(Boolean).join(",");
      const part = join(tmp, `b${i}.mp4`);
      const input = b.image ? ["-loop", "1", "-t", String(b.dur), "-i", resolve(b.image)] : ["-ss", String(b.src), "-t", String(len + 0.05), "-i", resolve(b.source ?? cut.source)];
      ff([...input, "-an", "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-pix_fmt", "yuv420p", part]);
      return part;
    });
    writeFileSync(join(tmp, "list.txt"), parts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
    const total = cut.beats.reduce((s, b) => s + b.dur, 0);
    const musicFile = typeof brief.music === "string" ? brief.music : brief.music?.file;
    const liftSeconds = brief.music?.liftSeconds ?? brief.musicLiftSeconds;
    const music = musicFile && existsSync(resolve(musicFile)) ? resolve(musicFile) : null;
    const start = music && liftSeconds !== undefined && cut.turnAt !== undefined ? Math.max(0, liftSeconds - cut.turnAt) : 0;
    ff([
      "-f", "concat", "-safe", "0", "-i", join(tmp, "list.txt"),
      ...(music ? ["-ss", String(start), "-i", music, "-filter_complex", `[1:a]atrim=duration=${total},afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, total - 1.2)}:d=1.2[a]`, "-map", "0:v", "-map", "[a]", "-c:a", "aac", "-b:a", "128k"] : ["-map", "0:v"]),
      "-c:v", "copy", "-t", String(total), outFile,
    ]);
    return { font: Boolean(font), music: Boolean(music) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const outDir = resolve(args.find((a) => a.startsWith("--out="))?.slice(6) ?? "out");
  if (!file) {
    console.error("usage: node visual-brief.mjs docs/visual-brief.json [--out=out] [--animatic]");
    process.exit(2);
  }
  const brief = JSON.parse(readFileSync(resolve(file), "utf8"));
  const problems = checkPlan(brief);
  for (const p of problems) console.log(`plan   ${p}`);
  mkdirSync(outDir, { recursive: true });
  const html = join(outDir, "visual-brief.html");
  writeFileSync(html, buildHtml(brief));
  console.log(`wrote  ${html}   <- the one message the user approves`);
  const chrome = findChrome();
  if (chrome) {
    const png = join(outDir, "visual-brief.png");
    spawnSync(chrome, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=3000", `--screenshot=${process.platform === "win32" ? png.replace(/\//g, "\\") : png}`, "--window-size=1100,2400", pathToFileURL(html).href]);
    if (existsSync(png)) console.log(`wrote  ${png}   (a picture of the same page, for chats that cannot open HTML)`);
  }
  for (const w of writeMotionFiles(brief, outDir)) {
    console.log(`wrote  ${w.copy}   (send it as a file too: a video inside a page does not play in every viewer)`);
    console.log(`wrote  ${w.strip}   (for the storyboard critic: 12 frames across the turn)`);
  }
  for (const w of writeMusicFiles(brief, outDir)) console.log(`wrote  ${w}   (send it as a file too: an audio player inside a page does not play in every viewer)`);
  if (args.includes("--animatic")) {
    for (const cut of brief.cuts ?? []) {
      const out = join(outDir, `animatic-${cut.name.replace(/[^\w]+/g, "")}.mp4`);
      const r = buildAnimatic(brief, cut, out);
      console.log(`wrote  ${out}   (internal: pacing and reading time; never sent to the user)${r.font ? "" : " [no font found: no text]"}${r.music ? "" : " [no music]"}`);
    }
  }
  process.exit(problems.length ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();
