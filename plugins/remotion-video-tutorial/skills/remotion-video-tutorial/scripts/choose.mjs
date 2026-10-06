#!/usr/bin/env node
/**
 * The chooser: the first page the user sees, before the brand read. Six steps in one column, one
 * open at a time: what the video is for, what kind of video, where it runs, how long it is, its look
 * and feel (every look on one screen, each a moving sample; Claude's pick unless the user taps one, or any two to mix) and extra settings (the
 * open questions, the tools found on this computer with the provider each one uses, and the ones
 * that are not set up yet). The recommendation is already picked in every step. A slate pinned to
 * the bottom always says what the user will get. Every tap is saved to docs/choices.json. "Send to
 * Claude" adds the film to docs/preferences.json, prints the choices and exits, which wakes the
 * agent that runs this in the background; "Copy as message" copies the same picks for the chat.
 * When the project has its own clips and photos (--media), the footage look plays the user's own
 * clip and the collage look is laid out from the user's own photos. Node 18+ (ffmpeg for --media).
 *
 *   node choose.mjs --format=short-ad [--platforms=reels,tiktok] [--material=footage,photos,ui]
 *     [--media=<folder with the project's clips and photos>] [--connected="image=<what it is>|voice"]
 *     [--recommend="footage:why|kinetic-type:why"] [--questions=docs/chooser-questions.json]
 *     [--lang=he] [--film=spring-sale] [--lock-format] [--port=0] [--no-open] [--hands-off]
 *     [--static=out/chooser.html] [--cache=<dir>] [--styles=<file>]
 *
 * --material   what exists for this film: its own clips, photos, the product's screens (app or site);
 *              --media adds footage and photos on its own when it finds them
 * --connected  tools the agent can call in this session, as id or id=what it is (the script cannot
 *              see the agent's tool list): image, video, voice, stock
 * --recommend  at most two looks, each with why it fits this ask, in any combination
 * --lock-format  a specialist: only the kinds of the format's own module can be picked
 * --hands-off  no page: the recommendation becomes the choices (chosenBy "assumed") and is printed
 * --static     a page with no saving: the user copies the picks into the chat
 *
 * Prints "chooser <url>" when the page is up, then "choices <json>" when the user sends, or after
 * 30 minutes with "done": false. Loops are fetched from the library's loopBase once, checked against
 * their sha256 and kept in --cache; offline, the page shows the posters.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadSpecs, recommend } from "./recommend.mjs";
import { SHAPES, addFilm, applyTap, detectTools, familyOf, inLanguage, lastStyle, loadStyles, loopFor, missingTools, pickStyles, validateQuestions } from "./styles.mjs";

export const DEFAULT_CACHE = join(homedir(), ".cache", "remotion-video-master", "styles");
const RTL = new Set(["he", "ar", "fa", "ur"]);
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fill = (tpl, map) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => String(map[k] ?? ""));

export const LABELS = {
  en: {
    kicker: "Video setup", stepOf: "Step {n} of {total}", allSet: "All set",
    title: "Set up your video",
    lead: "Whichever you choose, you can hand any step to Claude later.",
    leadStatic: "Six quick steps. The recommended picks are already marked. When you are done, copy your picks into the chat.",
    s1: "What is it for?", s2: "What kind of video?", s3: "Where will it run?", s4: "How long?", s5: "The look and feel", s6: "Extra settings",
    continue: "Continue", change: "Change", review: "Done, review it", recommended: "Recommended", seconds: "s",
    len: "{n} s", lenFits: "Fits everywhere you picked", lenLong: "Longer than this kind usually runs", lenShort: "Shorter than this kind usually runs", lenCut: "+ a {n} s cut for {p}", lenMax: "{p} allows up to {n} s", lenMin: "{p} needs at least {n} s",
    lenOther: "Another length", lenSet: "Use it", lenUnit: "seconds",
    lookNote: "This sets how your video looks and feels, not what happens in it: the story comes next, in your brief. Pick one look, or two to mix.",
    why: "Why:", lastTime: "Your last film", notAvailable: "Not available", needs: "Not available:", main: "Main", accent: "Accent", swap: "Swap main and accent",
    twoMax: "Two looks at most. Tap one of the picked looks to remove it.",
    yourFootage: "Your footage", yourPhotos: "Your photos",
    toolsFound: "Tools found on this computer", toolsFoundNote: "Off unless you turn them on.", provider: "Provider", uses: "Uses", via: "Found",
    viaSession: "A tool connected to this session", viaKey: "key {k}",
    toolsMissing: "Not set up yet", toolsMissingNote: "To add one, put one of its keys in your project's .env file. Keys stay on this computer; Claude never asks for them in the chat.",
    noTools: "No AI tools found on this computer. Your video is made from your own material and the engine alone.",
    note: "Anything else? (optional)", notePh: "For example: calm, no faces on screen",
    get: "What you'll get", pickFirst: "Pick a look to see what you'll get.",
    summary: "A {len} {aspect} video {where}, in {look}.", lenIn: "{n} s", whereTpl: "for {list}", whereByClaude: "for the places Claude picks",
    lookTpl: "the {main} look{accent}", lookByClaude: "a look Claude picks for your brand",
    summaryAll: "Claude picks what it's for, the kind, where it runs, the length and the look, from your ask and your brand.",
    accentTpl: ", with {accent} as an accent",
    decide: "Let Claude decide", decideNote: "Claude picks this from your ask and your brand.", decided: "Claude decides", decidedLine: "Claude decides {list}.",
    decideAll: "Let Claude decide everything", decideAllNote: "Claude picks every step from your ask and your brand. You still approve the brief before anything is built.",
    stepByStep: "Choose step by step", stepByStepNote: "Six quick steps, with the recommended picks already marked.",
    stepNames: { purpose: "what it's for", kind: "the kind of video", where: "where it runs", length: "the length", look: "the look", more: "the extra settings" },
    yoursShort: "Yours", sampleShort: "Sample", sampleLabel: "Sample", showLabel: "Show",
    introQ: "How do you want to set it up?", back: "Back", hintKeys: "Press a number, or click",
    usually: "usually {n} s", secs: "{n}s", live: "Your video, live", hook: "hook", cutAt: "{p} cut", yourVideo: "Here's your video", edit: "Edit", claudePick: "Claude's pick", rules: { one: "Pick one", any: "Pick all that apply", look: "Pick one, or two to mix", optional: "Optional" }, lookCount: "{n} of 2 picked", pickOneShort: "pick one", pickAnyShort: "pick any", lookAINote: "Claude picks the look from your ask and your brand. Tap a look to choose it yourself.",
    subs: {
      purpose: "Pick the one closest to what you need.",
      kind: "The usual length is shown on each.",
      where: "Pick every place it will be posted. The preview takes its shape.",
      length: "The recommended one fits where it runs. A long one is fine: a platform that wants shorter gets its own cut.",
      look: "This sets how your video looks and feels, not what happens in it: the story comes next, in your brief. Claude picks the look unless you tap one, or two to mix.",
      more: "Optional. Tools stay off unless you turn them on.",
    },
    next: "Next: Claude writes your brief, with frames in this look, for your OK before anything is built.",
    nextDecided: "Next: Claude reads your brand, makes the choices you handed over, and shows you a brief with frames for your OK before anything is built.",
    staticNote: "This page can't send by itself: copy your picks and paste them in the chat.",
    send: "Send to Claude", copy: "Copy as message", copied: "Copied. Paste it in the chat.", copyFail: "Couldn't copy. Select the text and copy it.",
    sent: "Sent to Claude", sentNote: "Back in the chat, Claude is writing your brief. You can close this tab.",
    offline: "This page can't reach Claude right now. Copy your picks and paste them in the chat.",
    msgIntro: "My picks for the video:", toolsOn: "Tools", noteLabel: "Note", and: " and ",
    aspects: { "9:16": "vertical", "886:1920": "vertical", "16:9": "wide", "1:1": "square", "4:5": "portrait" },
    formatHints: {
      "bumper-ad": "One idea in 6 seconds, before a video", "short-ad": "A quick ad for feeds and before videos", "standard-ad": "The classic ad: the problem, the proof, the offer",
      teaser: "A glimpse that builds curiosity", "launch-film": "The big reveal of something new", "feature-announcement": "One new feature, shown working",
      "landing-loop": "A silent loop beside your site's headline", "product-demo": "Your product, walked through", tutorial: "Step by step, how to do it",
      onboarding: "Helps new users get started", "app-store-preview": "The preview in the app stores", explainer: "An idea made simple",
      "social-organic": "A post for your feed, not an ad", testimonial: "A customer tells it in their own words", "event-recap": "The best moments of an event",
    },
  },
  he: {
    kicker: "הגדרת הסרטון", stepOf: "שלב {n} מתוך {total}", allSet: "הכול מוכן",
    title: "בואו נגדיר את הסרטון",
    lead: "בכל דרך שתבחרו, אפשר להעביר כל שלב ל־Claude גם בהמשך.",
    leadStatic: "שישה שלבים קצרים. הבחירות המומלצות כבר מסומנות. בסוף, העתיקו את הבחירות לצ'אט.",
    s1: "בשביל מה הסרטון?", s2: "איזה סוג סרטון?", s3: "איפה הוא ירוץ?", s4: "כמה זמן?", s5: "הלוק והתחושה", s6: "הגדרות נוספות",
    continue: "המשך", change: "שינוי", review: "סיימתי, לסיכום", recommended: "מומלץ", seconds: "ש׳",
    len: "{n} שניות", lenFits: "מתאים לכל המקומות שבחרתם", lenLong: "ארוך מהרגיל לסוג הזה", lenShort: "קצר מהרגיל לסוג הזה", lenCut: "+ גרסה של {n} שניות ל־{p}", lenMax: "{p} מאפשר עד {n} שניות", lenMin: "{p} דורש לפחות {n} שניות",
    lenOther: "אורך אחר", lenSet: "לבחור", lenUnit: "שניות",
    lookNote: "כאן בוחרים איך הסרטון נראה ומרגיש, לא מה קורה בו: הסיפור מגיע בשלב הבא, בתקציר. בחרו לוק אחד, או שניים לשלב.",
    why: "למה:", lastTime: "בסרטון הקודם", notAvailable: "לא זמין", needs: "לא זמין:", main: "ראשי", accent: "משני", swap: "החלפה בין הראשי למשני",
    twoMax: "עד שני לוקים. הקישו על אחד הלוקים שבחרתם כדי להסיר אותו.",
    yourFootage: "הצילומים שלכם", yourPhotos: "התמונות שלכם",
    toolsFound: "כלים שמצאתי במחשב", toolsFoundNote: "כבויים עד שתפעילו אותם.", provider: "ספק", uses: "שימוש", via: "נמצא",
    viaSession: "כלי שמחובר לשיחה הזו", viaKey: "מפתח {k}",
    toolsMissing: "עוד לא מוגדרים", toolsMissingNote: "כדי להוסיף כלי, שימו אחד מהמפתחות שלו בקובץ ‎.env של הפרויקט. המפתחות נשארים במחשב; Claude אף פעם לא מבקש אותם בצ'אט.",
    noTools: "לא מצאתי כלי AI במחשב. הסרטון ייבנה מהחומרים שלכם ומהמנוע בלבד.",
    note: "משהו נוסף? (לא חובה)", notePh: "למשל: רגוע, בלי פנים על המסך",
    get: "מה תקבלו", pickFirst: "בחרו לוק כדי לראות מה תקבלו.",
    summary: "סרטון {aspect} {len} {where}, {look}.", lenIn: "באורך {n} שניות", whereTpl: "ל־{list}", whereByClaude: "למקומות ש־Claude יבחר",
    lookTpl: "בלוק {main}{accent}", lookByClaude: "בלוק ש־Claude יבחר למותג שלכם",
    summaryAll: "Claude יבחר את המטרה, הסוג, איפה הוא ירוץ, האורך והלוק, לפי הבקשה והמותג שלכם.",
    accentTpl: ", עם {accent} כמשני",
    decide: "ש־Claude יחליט", decideNote: "Claude יבחר את זה לפי הבקשה והמותג שלכם.", decided: "Claude מחליט", decidedLine: "Claude מחליט על {list}.",
    decideAll: "ש־Claude יחליט על הכול", decideAllNote: "Claude בוחר כל שלב לפי הבקשה והמותג שלכם. את התקציר תאשרו לפני שמשהו נבנה.",
    stepByStep: "לבחור שלב אחר שלב", stepByStepNote: "שישה שלבים קצרים, והבחירות המומלצות כבר מסומנות.",
    stepNames: { purpose: "המטרה", kind: "סוג הסרטון", where: "איפה הוא ירוץ", length: "האורך", look: "הלוק", more: "ההגדרות הנוספות" },
    yoursShort: "שלכם", sampleShort: "דוגמה", sampleLabel: "דוגמה", showLabel: "להציג",
    introQ: "איך תרצו להגדיר?", back: "חזרה", hintKeys: "הקישו מספר, או לחצו",
    usually: "בדרך כלל {n} שניות", secs: "{n} ש׳", live: "הסרטון שלכם, בזמן אמת", hook: "פתיח", cutAt: "גרסה ל־{p}", yourVideo: "זה הסרטון שלכם", edit: "עריכה", claudePick: "הבחירה של Claude", rules: { one: "בחרו אחד", any: "בחרו את כל מה שמתאים", look: "בחרו אחד, או שניים לשילוב", optional: "לא חובה" }, lookCount: "נבחרו {n} מתוך 2", pickOneShort: "בחרו אחד", pickAnyShort: "בחרו כמה שתרצו", lookAINote: "Claude יבחר את הלוק לפי הבקשה והמותג שלכם. הקישו על לוק כדי לבחור בעצמכם.",
    subs: {
      purpose: "בחרו את מה שהכי קרוב למה שאתם צריכים.",
      kind: "האורך הרגיל מופיע על כל אחד.",
      where: "בחרו כל מקום שבו הוא יפורסם. התצוגה מקבלת את הצורה שלו.",
      length: "המומלץ מתאים למקום שבו הוא ירוץ. גם ארוך זה בסדר: פלטפורמה שרוצה קצר יותר מקבלת גרסה משלה.",
      look: "כאן בוחרים איך הסרטון נראה ומרגיש, לא מה קורה בו: הסיפור מגיע בשלב הבא, בתקציר. Claude יבחר את הלוק, אלא אם תקישו על אחד, או על שניים לשלב.",
      more: "לא חובה. הכלים כבויים עד שתפעילו אותם.",
    },
    next: "הבא: Claude כותב לכם תקציר עם פריימים בלוק הזה, לאישורכם לפני שמשהו נבנה.",
    nextDecided: "הבא: Claude קורא את המותג שלכם, מחליט על מה שהעברתם אליו, ומראה לכם תקציר עם פריימים לאישורכם לפני שמשהו נבנה.",
    staticNote: "הדף הזה לא יכול לשלוח בעצמו: העתיקו את הבחירות והדביקו בצ'אט.",
    send: "שליחה ל־Claude", copy: "העתקה כהודעה", copied: "הועתק. הדביקו בצ'אט.", copyFail: "ההעתקה לא הצליחה. סמנו את הטקסט והעתיקו.",
    sent: "נשלח ל־Claude", sentNote: "בצ'אט, Claude כותב עכשיו את התקציר. אפשר לסגור את הלשונית.",
    offline: "הדף לא מצליח להגיע ל־Claude כרגע. העתיקו את הבחירות והדביקו בצ'אט.",
    msgIntro: "הבחירות שלי לסרטון:", toolsOn: "כלים", noteLabel: "הערה", and: " ו־", andWord: " ו",
    aspects: { "9:16": "אנכי", "886:1920": "אנכי", "16:9": "רחב", "1:1": "ריבועי", "4:5": "לאורך" },
    families: { sell: "למכור", show: "להראות איך זה עובד", explain: "להסביר רעיון", social: "רשתות וסיפורים" },
    familyHints: { sell: "פרסומת, טיזר, סרט השקה, הכרזה, לופ לאתר", show: "הדגמה, מדריך, הדרכת פתיחה, תצוגה בחנות", explain: "סרטון הסבר", social: "פוסט לרשתות, המלצת לקוח, סיכום אירוע" },
    formats: {
      "bumper-ad": "פרסומת של 6 שניות", "short-ad": "פרסומת קצרה", "standard-ad": "פרסומת", teaser: "טיזר",
      "launch-film": "סרט השקה", "feature-announcement": "הכרזה על פיצ'ר", "landing-loop": "לופ לדף נחיתה",
      "product-demo": "הדגמת מוצר", tutorial: "מדריך", onboarding: "הדרכת פתיחה", "app-store-preview": "תצוגה בחנות האפליקציות",
      explainer: "סרטון הסבר", "social-organic": "סרטון לרשתות", testimonial: "המלצת לקוח", "event-recap": "סיכום אירוע",
    },
    formatHints: {
      "bumper-ad": "רעיון אחד ב־6 שניות, לפני סרטון", "short-ad": "פרסומת מהירה לפיד ולפני סרטונים", "standard-ad": "הפרסומת הקלאסית: הבעיה, ההוכחה, ההצעה",
      teaser: "הצצה שבונה סקרנות", "launch-film": "החשיפה הגדולה של משהו חדש", "feature-announcement": "פיצ'ר חדש אחד, בפעולה",
      "landing-loop": "לופ שקט ליד הכותרת באתר", "product-demo": "סיור במוצר שלכם", tutorial: "צעד אחר צעד, איך עושים את זה",
      onboarding: "עוזר למשתמשים חדשים להתחיל", "app-store-preview": "התצוגה בחנויות האפליקציות", explainer: "רעיון שהופך לפשוט",
      "social-organic": "פוסט לפיד, לא פרסומת", testimonial: "לקוח מספר במילים שלו", "event-recap": "הרגעים הטובים של אירוע",
    },
  },
};
export const labelsFor = (lang = "en") => {
  const code = String(lang).split("-")[0];
  return { ...LABELS.en, ...(LABELS[code] ?? {}) };
};

const STANDARD = [6, 10, 15, 20, 30, 45, 60, 75, 90, 120, 180, 240, 300];

/** What a length means for every chosen platform: blocked only by a hard limit; a long one says which shorter cut comes too. */
export function lengthNotes(specs, format, platforms, seconds, L = LABELS.en) {
  const f = specs.formats[format];
  const notes = [];
  const cuts = [];
  if (seconds > f.max) notes.push(L.lenLong);
  if (seconds < f.min) notes.push(L.lenShort);
  for (const id of platforms) {
    const p = specs.platforms[id];
    if (p.hardMax && seconds > p.hardMax) return { disabled: true, why: fill(L.lenMax, { p: p.label, n: p.hardMax }) };
    if (p.hardMin && seconds < p.hardMin) return { disabled: true, why: fill(L.lenMin, { p: p.label, n: p.hardMin }) };
    const limit = f.longForm && p.feed ? (p.feedCutdown ?? p.softMax) : p.softMax;
    if (limit && seconds > limit) {
      notes.push(fill(L.lenCut, { p: p.label, n: limit }));
      cuts.push({ platform: p.label, seconds: limit });
    }
  }
  return { disabled: false, why: notes.length ? notes.join(" · ") : L.lenFits, cuts };
}

/** Up to eight round lengths around the recommended one, from half the format's shortest to twice its longest, plus its usual length and the cuts its platforms ask for. */
export function lengthOptions(specs, format, platforms, L = LABELS.en) {
  const f = specs.formats[format];
  const r = recommend(specs, { format, platforms });
  const rec = r.length.mode === "single" ? r.length.options[0].seconds : r.length.master.seconds;
  const cuts = r.length.mode === "single" ? [] : r.length.cutdowns.map((c) => c.seconds);
  const pool = [...new Set([...STANDARD.filter((s) => s >= f.min * 0.5 && s <= f.max * 2), f.default, rec, ...cuts])].filter((s) => s >= 3);
  const near = pool.sort((a, b) => Math.abs(Math.log(a / rec)) - Math.abs(Math.log(b / rec))).slice(0, 8).sort((a, b) => a - b);
  return near.map((s) => ({ seconds: s, recommended: s === rec, ...lengthNotes(specs, format, platforms, s, L) }));
}

/** The chosen length, unless a platform's hard limit rules it out after a change; then the recommended one. */
export function fitSeconds(specs, choices) {
  if (!lengthNotes(specs, choices.format, choices.platforms, choices.seconds).disabled) return choices;
  return { ...choices, seconds: lengthOptions(specs, choices.format, choices.platforms).find((o) => o.recommended).seconds };
}

/** The choices the page opens with: the recommendation, every question at its recommended answer, the look left to Claude. */
export function initialChoices(specs, { format, platforms = [], shown, questions = [] }) {
  const family = familyOf(specs, format);
  const list = platforms.length ? platforms : [specs.families[family].platforms[0]];
  const unknown = list.find((p) => !specs.platforms[p]);
  if (unknown) throw new Error(`unknown platform "${unknown}"; known: ${Object.keys(specs.platforms).join(", ")}`);
  const recs = shown.filter((s) => s.state === "recommended").map((s) => s.id);
  return {
    format, family, platforms: list, seconds: lengthOptions(specs, format, list).find((o) => o.recommended).seconds,
    style: { primary: recs[0] ?? null, secondary: recs[1] ?? null },
    tools: [], answers: Object.fromEntries(questions.map((q) => [q.id, q.recommended])), note: "", decided: { look: true },
  };
}

const IMAGE = /\.(jpe?g|png|webp)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;

/** The project's own photos and clips under a folder (three levels deep), in name order. */
export function scanMedia(dir, depth = 3) {
  const out = { images: [], videos: [] };
  const walk = (d, left) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (left > 0 && !e.name.startsWith(".") && e.name !== "node_modules") walk(p, left - 1);
      } else if (IMAGE.test(e.name)) out.images.push(p);
      else if (VIDEO.test(e.name)) out.videos.push(p);
    }
  };
  walk(dir, depth);
  return out;
}

const spread = (list, n) => (list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]));

/**
 * Card-sized copies of the project's media, kept in the cache: up to six stills (photos, else frames
 * of the clips), up to three 6 s silent clips and a frame of each clip to show while it loads, all
 * cropped to the card's 16:10. Needs ffmpeg.
 */
export function prepareMedia(found, cacheDir) {
  const dir = join(cacheDir, "media");
  mkdirSync(dir, { recursive: true });
  const key = (p) => createHash("sha1").update(`${resolve(p)}:${statSync(p).mtimeMs}`).digest("hex").slice(0, 16);
  const ff = (args) => spawnSync("ffmpeg", ["-v", "error", "-y", ...args]).status === 0;
  const crop = "scale=960:600:force_original_aspect_ratio=increase,crop=960:600";
  const clips = [];
  for (const p of spread(found.videos, 3)) {
    const out = join(dir, `${key(p)}.mp4`);
    if (existsSync(out) || ff(["-ss", "1", "-t", "6", "-i", p, "-an", "-vf", `${crop},fps=30`, "-c:v", "libx264", "-crf", "27", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out])) clips.push(out);
  }
  const clipPosters = [];
  for (const c of clips) {
    const out = c.replace(/\.mp4$/, ".jpg");
    if (existsSync(out) || ff(["-ss", "0.5", "-i", c, "-frames:v", "1", "-q:v", "4", out])) clipPosters.push(out);
  }
  const stills = [];
  for (const p of spread(found.images, 6)) {
    const out = join(dir, `${key(p)}.jpg`);
    if (existsSync(out) || ff(["-i", p, "-vf", crop, "-q:v", "4", out])) stills.push(out);
  }
  if (!stills.length) stills.push(...clipPosters);
  return { stills, clips, clipPosters };
}

const dataUri = (file, type) => (file && existsSync(file) ? `data:${type};base64,${readFileSync(file).toString("base64")}` : "");

/** Everything the page shows, in the user's language. posters: "served" (from this server) or "inline" (a static page). */
export function buildView({ lib, specs, choices, recommended = choices, shown, tools = [], questions = [], media = { stills: [], clips: [], clipPosters: [] }, lang = "en", lockFormat = false, error = null, posters = "served" }) {
  const L = labelsFor(lang);
  const code = String(lang).split("-")[0];
  const tr = (o, k) => o?.i18n?.[code]?.[k] ?? o?.[k];
  const formatLabel = (id) => L.formats?.[id] ?? specs.formats[id].label;
  const fmt = (id) => ({ id, label: formatLabel(id), hint: L.formatHints?.[id] ?? "", seconds: specs.formats[id].default });
  const fam = specs.families[choices.family];
  const module = specs.formats[choices.format].module;
  const inline = posters === "inline";
  return {
    lang, dir: RTL.has(code) ? "rtl" : "ltr", labels: L, lockFormat, error, recommended,
    families: Object.entries(specs.families).map(([id, f]) => ({ id, label: L.families?.[id] ?? f.label, hint: L.familyHints?.[id] ?? f.hint, formats: f.formats.map(fmt) })),
    lockedFormats: lockFormat ? Object.keys(specs.formats).filter((x) => specs.formats[x].module === module).map(fmt) : [],
    platforms: [...new Set([...fam.platforms, ...choices.platforms])].map((p) => ({ id: p, label: specs.platforms[p].label, aspect: specs.platforms[p].aspect })),
    lengths: lengthOptions(specs, choices.format, choices.platforms, L),
    lengthNow: lengthNotes(specs, choices.format, choices.platforms, choices.seconds, L),
    styles: shown.map((x) => inLanguage(x, lang)).map((s) => ({
      id: s.id, name: tr(s, "name"), line: tr(s, "line"), feel: tr(s, "feel") ?? [], missing: tr(s, "missing") ?? null,
      why: s.whyDefault ? (lib.defaultWhyI18n?.[code] ?? lib.defaultWhy) : s.why,
      state: s.state, lastTime: s.lastTime, loop: Boolean(s.loop?.sha256),
      shapes: SHAPES.filter((k) => s.loops?.[k]?.sha256),
      posterUrl: inline ? dataUri(join(lib.dir, s.poster), "image/webp") : existsSync(join(lib.dir, s.poster)) ? `/poster/${s.id}` : "",
    })),
    media: inline
      ? { stills: media.stills.map((f) => dataUri(f, "image/jpeg")), clips: [], clipPosters: (media.clipPosters ?? []).map((f) => dataUri(f, "image/jpeg")) }
      : { stills: media.stills.map((_, i) => `/media/s${i}`), clips: media.clips.map((_, i) => `/media/c${i}`), clipPosters: (media.clipPosters ?? []).map((_, i) => `/media/p${i}`) },
    tools: tools.map((t) => ({ id: t.id, name: tr(t, "name"), adds: tr(t, "adds"), providers: t.providers.map((p) => ({ name: p.name, uses: tr(p, "uses"), source: p.source })) })),
    missing: missingTools(lib, tools).map((t) => ({ id: t.id, name: tr(t, "name"), adds: tr(t, "adds"), providers: t.providers })),
    questions,
    choices,
  };
}

const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/** One question per screen on the left, the video's live preview on the right; a bar at the bottom on a phone. */
const CSS = `:root{color-scheme:dark;--bg:#121110;--panel:#1a1917;--card:#1d1c1a;--frame:#0b0b0a;--ink:#f2ede4;--mute:#a39b8f;--line:#2e2b27;--accent:#ff6a2b;--accent-text:#ff8a55;--on-accent:#170903;--stage-glow:#24211d;--shadow:0 18px 40px rgba(0,0,0,.45);--display:Calibri,"Assistant","Segoe UI",system-ui,sans-serif;--body:var(--display);--mono:var(--display)}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f3efe7;--panel:#fbf8f2;--card:#fffdf9;--frame:#e6e0d4;--ink:#1a1714;--mute:#655e54;--line:#dad2c4;--accent:#e2531c;--accent-text:#b13f10;--stage-glow:#fffdf9;--shadow:0 18px 40px rgba(60,40,20,.14)}}
:root:lang(he){--display:"Assistant",Calibri,"Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--body);-webkit-font-smoothing:antialiased}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.05;background-image:${GRAIN}}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.kicker{font:500 11.5px/1 var(--mono);letter-spacing:.16em;text-transform:uppercase;color:var(--accent-text);margin:0}
:lang(he) .kicker{letter-spacing:.04em;font-size:12.5px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.btn{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 22px;border-radius:14px;border:1px solid var(--line);color:var(--ink);font:600 15px var(--body);cursor:pointer;white-space:nowrap;transition:transform .15s,border-color .15s,background .15s}
@media (hover:hover){.btn:hover{border-color:var(--mute)}}
.btn.go{background:var(--accent);border-color:var(--accent);color:var(--on-accent);box-shadow:0 10px 26px color-mix(in srgb,var(--accent) 32%,transparent)}
@media (hover:hover){.btn.go:hover{transform:translateY(-1px)}}
.btn.ghost{border-color:transparent;color:var(--mute)}@media (hover:hover){.btn.ghost:hover{color:var(--ink)}}
.btn.ai{border-style:dashed;border-color:color-mix(in srgb,var(--accent) 60%,var(--line));color:var(--accent-text)}
.btn.ai[aria-pressed=true]{border-style:solid;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.btn.small{min-height:40px;padding:0 16px;font-size:13.5px}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.top{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;min-height:64px;padding:12px 28px;background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top #all{justify-self:end}
.bars{display:flex;gap:6px}
.bars button{all:unset;cursor:pointer;width:44px;height:5px;border-radius:5px;background:var(--line);transition:background .2s}
.bars button.on{background:var(--accent)}.bars button.cur{background:var(--ink)}
.bars button:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.shell{position:relative;z-index:1;display:grid;grid-template-columns:minmax(0,1fr) minmax(340px,30vw);min-height:calc(100vh - 65px)}
body.reviewing .shell{grid-template-columns:1fr}
.col{min-width:0;padding:44px 48px 12px}
.stage{max-width:980px;margin:0 auto}
.stage.in{animation:in .4s cubic-bezier(.2,.7,.2,1)}.stage.back{animation:inback .4s cubic-bezier(.2,.7,.2,1)}
:dir(rtl) .stage.in{animation-name:inback}:dir(rtl) .stage.back{animation-name:in}
@keyframes in{from{opacity:0;transform:translateX(24px)}}@keyframes inback{from{opacity:0;transform:translateX(-24px)}}
.q{font:700 clamp(34px,4.2vw,54px)/1.05 var(--display);letter-spacing:-.02em;margin:10px 0 12px;outline:none}
.sub{color:var(--mute);font-size:17px;margin:0 0 30px;max-width:62ch}
.rule{display:inline-flex;align-items:center;gap:9px;margin:0 0 12px;padding:6px 13px 6px 11px;border-radius:999px;background:color-mix(in srgb,var(--accent) 13%,transparent);color:var(--ink);font:700 14px/1.2 var(--body)}
.rulebar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 12px}.rulebar .rule{margin:0}
.vt.all{position:static;display:inline-flex;background:var(--card);border:1px solid var(--line);backdrop-filter:none}.vt.all[hidden]{display:none}
.vt.all button{color:var(--mute);padding:7px 12px;font-size:12.5px}.vt.all button[aria-pressed=true]{background:var(--ink);color:var(--bg)}
.sheet.tiny .vt{display:none}
.rule .mk{width:13px;height:13px;border:2px solid var(--accent);border-radius:50%;flex:none;box-sizing:border-box}
.rule.r-any .mk,.rule.r-look .mk{border-radius:4px}.rule.r-optional .mk{display:none}
.rule .cnt{font-weight:600;color:var(--accent-text);padding-inline-start:9px;border-inline-start:1px solid color-mix(in srgb,var(--accent) 40%,transparent)}
.grid{display:grid;gap:14px}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}.g3{grid-template-columns:repeat(3,minmax(0,1fr))}.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
.opt{all:unset;box-sizing:border-box;position:relative;display:flex;flex-direction:column;gap:6px;min-height:112px;padding:20px 20px 18px;border-radius:18px;border:1px solid var(--line);background:var(--card);cursor:pointer;transition:border-color .15s,transform .15s,background .15s}
@media (hover:hover){.opt:hover{border-color:var(--mute);transform:translateY(-2px)}}
.opt[aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,var(--card))}
.opt b{font:600 18px/1.25 var(--body);padding-inline-end:30px}
.opt span{color:var(--mute);font-size:14px;line-height:1.4}
.opt .key{position:absolute;top:14px;inset-inline-end:14px;display:grid;place-items:center;width:24px;height:24px;box-sizing:border-box;border-radius:50%;border:1.5px solid var(--mute);font:600 12px var(--mono);color:var(--mute)}
.opt.multi .key{border-radius:7px}
.opt[aria-pressed=true] .key{border-color:var(--accent);background:var(--accent)}.opt[aria-pressed=true] .key .n{display:none}
.opt[aria-pressed=true]:not(.multi) .key::after{content:"";width:8px;height:8px;border-radius:50%;background:var(--on-accent)}
.opt.multi[aria-pressed=true] .key::after{content:"";width:5px;height:10px;margin-top:-3px;border:solid var(--on-accent);border-width:0 2.5px 2.5px 0;transform:rotate(45deg)}
.group h3 .gr{margin-inline-start:10px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--accent-text)}
.chip::before{content:"";width:12px;height:12px;border-radius:50%;border:1.5px solid var(--mute);flex:none;box-sizing:border-box}
.chip[aria-pressed=true]::before{border-color:var(--bg);background:radial-gradient(circle,var(--bg) 0 2.5px,transparent 3px)}
.opt .meta{font:500 11.5px var(--mono);letter-spacing:.05em;text-transform:uppercase}
:lang(he) .opt .meta{font:500 13px var(--body);letter-spacing:0;text-transform:none}
.opt .rec{margin-top:auto;padding-top:8px}
.opt .ic svg{width:32px;height:32px;stroke:var(--accent-text);fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;margin-bottom:6px}
.opt.ai{border-style:dashed;border-color:color-mix(in srgb,var(--accent) 55%,var(--line))}
.opt.ai b{color:var(--accent-text)}.opt.ai[aria-pressed=true]{border-style:solid}
.opt[aria-disabled=true]{opacity:.4;cursor:not-allowed;transform:none}
.opt .num{font:700 42px/1 var(--display);letter-spacing:-.01em;padding:0 30px 0 0;padding-inline:0 30px}.opt .num small{font:500 15px var(--body);letter-spacing:0;color:var(--mute)}
.big-choice{min-height:150px;padding:26px}.big-choice b{font-size:21px}
.big-choice.ai{background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 16%,var(--card)),var(--card) 70%)}
.plat{display:flex;align-items:center;gap:14px;padding-inline-end:26px}.plat b{display:block;font-size:16px;padding:0}.plat span{display:block;font-size:13px}
.ratio{display:inline-block;background:currentColor;border-radius:2px;opacity:.32;flex:none} /* a filled shape, never read as a checkbox */
.rec{display:inline-flex;align-items:center;gap:6px;font:600 10.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent-text)}
:lang(he) .rec{font:600 12px/1 var(--body);letter-spacing:0}
.rec::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--accent)}
.opt.other{cursor:default;border-style:dashed}@media (hover:hover){.opt.other:hover{transform:none;border-color:var(--line)}}
.other .row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--mute);margin-top:auto}
.other .btn.small{min-height:40px;padding:0 14px}
.other input{width:76px;min-height:40px;padding:0 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit}
.foot{display:flex;align-items:center;gap:12px;margin-top:32px;flex-wrap:wrap}.foot .sp{flex:1}
.hint{font:500 12px var(--mono);color:var(--mute);letter-spacing:.03em}
:lang(he) .hint{font:500 13px var(--body);letter-spacing:0}
.sheet{display:grid;grid-template-columns:repeat(var(--cols,5),minmax(0,1fr));gap:14px 12px}
.stage.tighter .sheet .feel{display:none}
.look{container-type:inline-size}
@container (max-width:130px){.sheet .flag.yours{display:none}}
@container (max-width:190px){.sheet .look .flag.rec2{font-size:0;gap:0;padding:6px}.sheet .vt button{padding:4px 6px;font-size:10px}.sheet .flag{font-size:9px;padding:4px 6px}}
.stage.tight .q{font-size:clamp(30px,3vw,42px);margin:4px 0 6px}.stage.tight .sub{font-size:14.5px;margin-bottom:12px;max-width:none}
.col:has(.stage.tight){padding-top:22px}
.stage.compact .grid{gap:10px}
.stage.compact .opt{min-height:0;padding:13px 15px 12px;gap:3px;border-radius:14px}
.stage.compact .opt b{font-size:16px;padding-inline-end:28px}.stage.compact .opt span{font-size:13px;line-height:1.35}
.stage.compact .opt .ic svg{width:22px;height:22px;margin-bottom:2px}
.stage.compact .opt .key{top:10px;inset-inline-end:10px;width:22px;height:22px}
.stage.compact .opt .rec{padding-top:3px}.stage.compact .opt .num{font-size:30px}
.stage.compact .plat{gap:10px}.stage.compact .other input,.stage.compact .other .btn.small{min-height:36px}
.stage.compact .foot{margin-top:14px}.stage.compact .sub{margin-bottom:12px}
.stage.compact .group{margin-bottom:14px}.stage.compact .group h3{margin-bottom:7px}.stage.compact .chip{min-height:40px}
.stage.compact .tool{padding:11px 13px;margin-bottom:8px}.stage.compact .prov{margin-top:6px}.stage.compact .prov dl{padding:7px 10px}
.stage.compact .note{margin-bottom:8px}.stage.compact .miss summary{min-height:40px}.stage.compact .field{min-height:40px}
.stage.dense .sub{display:none}.stage.dense .opt .ic{display:none}.stage.dense .opt{padding:11px 13px 10px}
.stage.dense .prov dl{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px}.stage.dense .group{margin-bottom:10px}
.stage[data-step=look]{max-width:var(--look-w,1180px)}
.stage[data-step=look] .sub{margin-bottom:18px}.stage[data-step=look] .foot{margin-top:12px}
.strip{min-height:2.9em;margin:12px 0 0;font-size:14px;line-height:1.45;color:var(--mute)}
.strip b{color:var(--ink);font-weight:600}.strip b.ai{color:var(--accent-text)}.strip .sw{color:var(--ink)}
.sheet .flag{top:7px;inset-inline-end:7px;padding:4px 8px;font-size:9.5px}:lang(he) .sheet .flag{font-size:11px}
.sheet .flag.yours{inset-inline-start:7px}.sheet .flag.off{bottom:7px}
.sheet .tag{bottom:7px;inset-inline-start:7px;padding:4px 7px;font-size:10.5px}
.sheet .vt{bottom:7px;inset-inline-end:7px}.sheet .vt button{padding:5px 8px;font-size:11px}
.look{position:relative;min-width:0}
.mw{position:relative}
.pick{all:unset;display:block;width:100%;cursor:pointer;border-radius:14px}
.pick:focus-visible{outline:2px solid var(--accent);outline-offset:5px}
.media{position:relative;aspect-ratio:16/10}
.layers{position:absolute;inset:0;border-radius:14px;overflow:hidden;background:var(--frame);box-shadow:0 14px 30px -18px rgba(0,0,0,.6);transition:transform .45s cubic-bezier(.2,.7,.2,1),box-shadow .2s}
@media (hover:hover){.look:hover .layers{transform:translateY(-3px)}}
.look.picked .layers{box-shadow:0 0 0 3px var(--accent),0 14px 30px -18px rgba(0,0,0,.6)}
.view{position:absolute;inset:0}
.view>img,.view>video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;transition:transform 6s cubic-bezier(.2,.6,.3,1)}
.view>video{opacity:0;transition:opacity .5s}.view>video.on{opacity:1}
@media (hover:hover){.look:hover .view>img{transform:scale(1.04)}}
.blank{position:absolute;inset:0;display:grid;place-items:center;padding:20px;text-align:center;font:600 26px/1.1 var(--display);color:var(--mute)}
.flag{position:absolute;z-index:2;top:10px;inset-inline-end:10px;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(12,11,10,.76);backdrop-filter:blur(6px);color:#fff;font:600 10.5px/1 var(--mono);letter-spacing:.09em;text-transform:uppercase}
:lang(he) .flag{font:600 12px/1 var(--body);letter-spacing:0}
.flag.rec2::before{content:"";width:7px;height:7px;border-radius:50%;background:#ff4a1c;box-shadow:0 0 0 3px rgba(255,74,28,.28)}
.flag.yours{inset-inline-end:auto;inset-inline-start:10px;background:rgba(255,255,255,.92);color:#141210}
.flag.off{top:auto;bottom:10px}
.flag.ai{color:#ffb38c}
.frame .flag{top:auto;bottom:10px;white-space:nowrap} /* the stacked films put their words at the top */
.tag{position:absolute;z-index:3;bottom:10px;inset-inline-start:10px;display:none;padding:6px 10px;border-radius:7px;background:var(--accent);color:var(--on-accent);font:700 11.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase}
:lang(he) .tag{font:700 12.5px/1 var(--body);letter-spacing:0}
.picked .tag{display:block}
.vt{position:absolute;z-index:4;bottom:10px;inset-inline-end:10px;display:flex;padding:3px;border-radius:999px;background:rgba(12,11,10,.76);backdrop-filter:blur(6px)}
.vt button{all:unset;cursor:pointer;padding:6px 11px;border-radius:999px;font:600 11.5px/1 var(--body);color:#d9d2c6}
.vt button[aria-pressed=true]{background:#fff;color:#141210}
.vt button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.info{padding:9px 1px 0}
.name{font:600 14px/1.25 var(--body);margin:0}
.feel{font:500 10.5px/1.5 var(--mono);letter-spacing:.09em;text-transform:uppercase;color:var(--accent-text);margin:4px 0 5px}
:lang(he) .feel{font:600 12.5px/1.5 var(--body);letter-spacing:0}
.line{color:var(--mute);font-size:13.5px;line-height:1.45;margin:0}
.why{font-size:13px;line-height:1.45;margin:8px 0 0;padding-inline-start:10px;border-inline-start:2px solid var(--accent)}
.needs{font-size:12.5px;color:var(--mute);margin:8px 0 0}
.look.dimmed .layers{filter:grayscale(1) contrast(.8) brightness(.8);opacity:.55}.look.dimmed .pick{cursor:not-allowed}
.collage{position:absolute;inset:0;background:#e9dfcc}
.collage span{position:absolute;padding:2.2%;background:#fffdf8;box-shadow:0 10px 18px -6px rgba(40,25,10,.35),0 1px 2px rgba(40,25,10,.2)}
.collage img{width:100%;height:100%;object-fit:cover;display:block}
.collage .c1{left:6%;top:8%;width:46%;height:80%;transform:rotate(-4deg)}.collage .c2{left:53%;top:6%;width:40%;height:44%;transform:rotate(4deg)}.collage .c3{left:57%;top:52%;width:36%;height:41%;transform:rotate(-3deg)}
.collage .dot{position:absolute;left:4%;top:76%;width:9%;aspect-ratio:1;border-radius:50%;background:#e8571f}
.slideshow img:not(.base){animation:fade 12s infinite;opacity:0}
@keyframes fade{0%{opacity:0}5%{opacity:1}36%{opacity:1}41%{opacity:0}100%{opacity:0}}
.group{margin:0 0 24px}.group h3{font:600 12.5px/1.2 var(--body);letter-spacing:.09em;text-transform:uppercase;margin:0 0 10px;color:var(--mute)}
:lang(he) .group h3{letter-spacing:0;font-size:14px}
.note{color:var(--mute);font-size:14px;margin:-2px 0 12px;max-width:64ch}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;min-height:46px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);font:500 14px var(--body);cursor:pointer}
@media (hover:hover){.chip:hover{border-color:var(--mute)}}
.chip[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:var(--bg)}
.chip[aria-pressed=true] .rec{color:inherit;opacity:.75}
.tool{display:flex;gap:14px;align-items:flex-start;padding:16px;border:1px solid var(--line);border-radius:16px;background:var(--card);margin:0 0 10px;cursor:pointer;max-width:680px}
.tool input{width:22px;height:22px;margin:2px 0 0;accent-color:var(--accent);flex:none}
.tool b{display:block;font-weight:600;font-size:15.5px}.tool small{display:block;color:var(--mute);font-size:13.5px;line-height:1.45;margin-top:2px}
.prov{margin-top:10px;display:grid;gap:6px}
.prov dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0;font-size:13px;padding:10px 12px;border-radius:10px;background:color-mix(in srgb,var(--ink) 5%,transparent)}
.prov dt{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute);padding-top:2px}
:lang(he) .prov dt{font:500 12.5px var(--body);letter-spacing:0}
.prov dd{margin:0}
.miss{border:1px dashed var(--line);border-radius:14px;padding:0 16px;max-width:680px}
.miss summary{cursor:pointer;min-height:48px;display:flex;align-items:center;font:600 12.5px/1.2 var(--body);letter-spacing:.09em;text-transform:uppercase;color:var(--mute)}
:lang(he) .miss summary{letter-spacing:0;font-size:14px}
.miss p{margin:0 0 12px;color:var(--mute);font-size:13.5px}
.miss ul{margin:0 0 16px;padding:0;list-style:none;display:grid;gap:14px}
.miss li{display:grid;gap:4px;font-size:13.5px}.miss li>span{color:var(--mute)}
.keys{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px}
.kp{display:inline-flex;align-items:center;gap:8px;padding:5px 9px;border-radius:9px;border:1px solid var(--line);font-size:13px}
.kp code{font:500 11.5px var(--mono);color:var(--mute)}
.field{width:100%;max-width:680px;min-height:46px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:inherit}
.pv{position:sticky;top:64px;height:calc(100vh - 65px);display:flex;flex-direction:column;gap:6px;padding:26px 26px 22px;border-inline-start:1px solid var(--line);background:radial-gradient(700px 520px at 50% 45%,var(--stage-glow) 0%,var(--panel) 75%)}
.psum{font:600 21px/1.25 var(--display);margin:6px 0 0}
.psum.big{font-size:clamp(24px,2.2vw,30px);margin:6px 0 4px}
body.reviewing .col{padding-top:28px}
.dec{color:var(--accent-text);font-size:13px;margin:0}.dec:empty{display:none}
.pv-stage{flex:1 1 0;min-height:160px;overflow:hidden;display:grid;place-items:center}
.frame{position:relative;border-radius:18px;overflow:hidden;background:var(--frame);box-shadow:0 30px 70px -28px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.06)}
.frame.tall>.view.sample>img{filter:blur(26px) brightness(.55) saturate(1.2);transform:scale(1.25)}
.frame.tall>.view.sample:not(.shaped)>video{object-fit:contain}
.frame .acc{position:absolute;z-index:3;bottom:10px;inset-inline-start:10px;display:flex;align-items:center;gap:8px;padding:4px 10px 4px 4px;border-radius:10px;background:rgba(12,11,10,.78);backdrop-filter:blur(6px);color:#fff;font:600 12px var(--body)}
.frame .acc i{position:relative;display:block;width:44px;height:28px;border-radius:6px;overflow:hidden}
.tabs{display:flex;justify-content:center;gap:6px;margin:8px 0 0}
.tabs button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:0 12px;border-radius:999px;border:1px solid var(--line);font:500 12.5px var(--body);color:var(--mute)}
.tabs button[aria-pressed=true]{color:var(--ink);border-color:var(--mute)}
.tl{position:relative;height:46px;margin:8px 0 6px}
.tl .track{position:absolute;inset:16px 0 auto;height:6px;border-radius:6px;background:var(--line)}
.tl .hook{position:absolute;top:16px;height:6px;border-radius:6px;background:var(--accent)}
.tl .cut{position:absolute;top:9px;width:2px;height:20px;background:var(--ink);opacity:.7}
.tl .lab{position:absolute;top:28px;font:500 11px var(--mono);color:var(--mute);white-space:nowrap}
:lang(he) .tl .lab{font:500 12px var(--body)}
.tl .lab.mid{transform:translateX(-50%)}:dir(rtl) .tl .lab.mid{transform:translateX(50%)}
.tl .lab.end{transform:translateX(-100%)}:dir(rtl) .tl .lab.end{transform:translateX(100%)}
.actions{display:flex;gap:10px;flex-wrap:wrap}.actions .btn{flex:1}
.pv .note{font-size:12.5px;margin:6px 0 0}
.review{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:48px;align-items:start}
.rv-media{position:sticky;top:96px}
.rv-stage{display:grid;place-items:center;min-height:260px}
.picks{display:grid;margin:20px 0 22px}
.pk{display:grid;grid-template-columns:minmax(110px,170px) 1fr auto;gap:14px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
.pk dt{font:500 12px var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute)}
:lang(he) .pk dt{font:500 13.5px var(--body);letter-spacing:0}
.pk dd{margin:0;font-weight:600}.pk dd.ai{color:var(--accent-text)}
.pk button{all:unset;cursor:pointer;color:var(--accent-text);font:600 13px var(--body);padding:10px 6px;border-radius:8px}
.review .actions{margin:6px 0 10px;max-width:460px}
.mbar{display:none}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,12px);max-width:min(92vw,520px);padding:12px 16px;border-radius:12px;background:var(--ink);color:var(--bg);font-size:14px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:50}
.toast.show{opacity:1;transform:translate(-50%,0)}
.sent{max-width:640px;margin:14vh auto 0;padding:0 20px;position:relative;z-index:1}
@media (max-width:1099px){.shell{grid-template-columns:1fr}.pv{display:none}.col{padding:32px 24px 132px}
.mbar{position:fixed;inset:auto 0 0;z-index:15;display:flex;align-items:center;gap:12px;padding:10px 16px;background:color-mix(in srgb,var(--panel) 94%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line)}
.mbar .mini{flex:none;width:56px;height:56px;display:grid;place-items:center;overflow:hidden}.mbar .frame{border-radius:8px;box-shadow:none}
.mbar .msum{flex:1;min-width:0;margin:0;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mbar .actions{flex:none}.mbar .actions [data-copy]{display:none}.mbar .actions .btn{min-height:44px;padding:0 16px}
.toast{bottom:96px}.rv-media{position:static}}
@media (max-width:760px){.g3,.g4{grid-template-columns:repeat(2,minmax(0,1fr))}.sheet{grid-template-columns:repeat(var(--cols,3),minmax(0,1fr));gap:12px 8px}.sheet .feel{display:none}.name{font-size:12.5px}.info{padding-top:6px}.strip{font-size:13px}.stage.compact .g2,.stage.compact .g3,.stage.compact .g4{grid-template-columns:repeat(2,minmax(0,1fr))}.other .row{flex-wrap:nowrap}.other .row span{display:none}.other input{flex:1 1 0;min-width:0;width:auto}
.stage.tight .sub,.stage.tight .kicker{display:none}.stage.tight .q{font-size:30px;margin-top:0}.col:has(.stage.tight){padding-top:14px}.g2{grid-template-columns:1fr}.review{grid-template-columns:1fr;gap:20px}
.top{grid-template-columns:1fr auto;padding:10px 16px}.bars{display:none}.top #all{font-size:12px;padding:0 12px}.col{padding:24px 16px 132px}.hint{display:none}.opt{min-height:96px;padding:16px}
.pk{grid-template-columns:1fr auto;gap:2px 12px}.pk dt{grid-column:1/-1}}
@media (max-width:480px){.foot{flex-wrap:nowrap;gap:8px}.foot .btn{flex:1 1 auto;min-width:0;padding:0 12px;font-size:14px}.foot .btn.back{flex:none;width:48px;padding:0}.foot .back .lbl{display:none}.foot .sp{display:none}}
@media (prefers-reduced-motion:reduce){.stage,.layers,.view>img,.view>video,.btn,.toast,.opt,.bars button{animation:none!important;transition:none!important}.look:hover .layers,.look:hover .view>img{transform:none}.slideshow img:not(.base){animation:none;opacity:0}}`;

/**
 * Runs in the browser (inserted with toString). One question per screen, with a live preview of the
 * video beside it: the shape it will have, the look playing, the length with its hook and cuts.
 */
function client() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v; // only this file's own SVG constants (ICON), never user or page data
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (["checked", "disabled", "hidden"].includes(k)) el[k] = Boolean(v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of kids.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  };
  const L = V.labels;
  const AI = "✦";
  const RTL = document.documentElement.dir === "rtl";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fill = (tpl, map) => tpl.replace(/\{(\w+)\}/g, (_, k) => map[k] ?? "");
  const list = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")}${/^[֐-׿]/.test(items.at(-1)) ? (L.andWord ?? L.and) : L.and}${items.at(-1)}`);
  const byId = (id) => V.styles.find((s) => s.id === id);
  const name = (id) => byId(id)?.name ?? "";
  const pickNo = (id) => (V.choices.style.primary === id ? 1 : V.choices.style.secondary === id ? 2 : 0);
  const fam = () => V.families.find((f) => f.id === V.choices.family);
  const formats = () => (V.lockFormat ? V.lockedFormats : fam().formats);
  const fmt = () => V.families.flatMap((f) => f.formats).concat(V.lockedFormats).find((f) => f.id === V.choices.format);
  const isAI = (id) => Boolean(V.choices.decided?.[id]);
  const R = V.recommended;
  const ICON = {
    sell: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 16 16 4h12v12L16 28z"/><circle cx="22" cy="10" r="2"/></svg>',
    show: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="6" width="26" height="18" rx="3"/><path d="M13 11v8l7-4z"/><path d="M10 28h12"/></svg>',
    explain: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 4a8 8 0 0 0-5 14v4h10v-4a8 8 0 0 0-5-14z"/><path d="M12 26h8M13 29h6"/></svg>',
    social: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 7h22v15H13l-6 5v-5H5z"/><path d="M12 13h8M12 17h5"/></svg>',
  };

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove("show");
      toastTimer = setTimeout(() => { t.textContent = ""; }, 300); // a hidden toast keeps no stale text for screen readers
    }, 3600);
  }

  // The steps, and the screen each one draws.
  const STEPS = [
    !V.lockFormat && { id: "purpose", body: purpose },
    (!V.lockFormat || V.lockedFormats.length > 1) && { id: "kind", body: kind },
    { id: "where", body: where },
    { id: "length", body: length },
    { id: "look", body: looks },
    { id: "more", body: more },
  ].filter(Boolean);
  const TITLES = { purpose: L.s1, kind: L.s2, where: L.s3, length: L.s4, look: L.s5, more: L.s6 };
  const N = STEPS.length;
  let at = -1; // -1 the first choice, 0..N-1 a step, N the review
  let dir = 1;

  // The static page applies the same rules as the server, without saving.
  const OWNS = { format: ["purpose", "kind"], platforms: ["where"], seconds: ["length"], style: ["look"], swap: ["look"], tools: ["more"], answer: ["more"] };
  function local(t) {
    const c = V.choices;
    c.decided = { ...(c.decided ?? {}) };
    if (t.field === "decide" || t.field === "decideAll") {
      for (const s of t.field === "decideAll" ? STEPS.map((x) => x.id) : [t.step]) {
        c.decided[s] = true;
        if (s === "purpose" || s === "kind") Object.assign(c, { format: R.format, family: R.family });
        if (s === "purpose") c.decided.kind = true;
        if (s === "where") c.platforms = [...R.platforms];
        if (s === "length") c.seconds = R.seconds;
        if (s === "look") c.style = { ...R.style };
        if (s === "more") Object.assign(c, { answers: { ...R.answers }, tools: [...R.tools] });
      }
      return;
    }
    if (t.field === "style" && c.decided.look) c.style = { primary: null, secondary: null }; // the user's own pick starts fresh
    for (const s of OWNS[t.field] ?? []) delete c.decided[s];
    const st = c.style;
    if (t.field === "style") {
      if (st.primary === t.value) c.style = { primary: st.secondary, secondary: null };
      else if (st.secondary === t.value) st.secondary = null;
      else if (!st.primary) st.primary = t.value;
      else st.secondary = t.value;
    } else if (t.field === "swap") c.style = { primary: st.secondary, secondary: st.primary };
    else if (t.field === "answer") c.answers[t.id] = t.value;
    else if (t.field === "format") {
      c.format = t.value;
      c.family = V.families.find((f) => f.formats.some((x) => x.id === t.value)).id;
    } else c[t.field] = t.value;
  }
  async function tap(t) {
    if (t.toggle !== undefined) {
      const cur = V.choices[t.field];
      t = { field: t.field, value: cur.includes(t.toggle) ? cur.filter((x) => x !== t.toggle) : [...cur, t.toggle] };
    }
    // While Claude has the look, a tap is a fresh pick: only a look that cannot be made is refused.
    if (t.field === "style" && (isAI("look") || !pickNo(t.value))) {
      const s = byId(t.value);
      if (s.state === "dimmed") return toast(`${L.needs} ${s.missing}`), false;
      if (!isAI("look") && V.choices.style.primary && V.choices.style.secondary) return toast(L.twoMax), false;
    }
    if (STATIC) {
      local(t);
      return true;
    }
    try {
      const r = await fetch("/tap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(t) });
      const v = await r.json();
      if (!r.ok) return toast(v.error ?? L.offline), false;
      V = v;
      return true;
    } catch {
      return toast(L.offline), false;
    }
  }

  const goTo = (n) => {
    dir = n >= at ? 1 : -1;
    at = Math.max(-1, Math.min(n, N));
    render(true);
  };
  const skipKind = (i) => STEPS[i]?.id === "purpose" && isAI("purpose") && STEPS[i + 1]?.id === "kind";
  const forward = () => goTo(at + (skipKind(at) ? 2 : 1));
  // A pick on a one-answer screen applies and moves on; on a many-answer screen it applies and stays.
  let queue = Promise.resolve();
  function choose(t, move) {
    queue = queue.then(async () => {
      const ok = await tap(t);
      if (ok && move) return forward();
      render(false);
    });
    return queue;
  }
  const decide = (id) => choose({ field: "decide", step: id }, true);

  const keyed = [];
  const opt = (on, onclick, kids, extra = {}, multi = false) => {
    const b = h("button", { class: multi ? "opt multi" : "opt", type: "button", "aria-pressed": on ? "true" : "false", onclick, ...extra }, ...kids);
    if (!extra["aria-disabled"]) keyed.push(onclick);
    const n = !extra["aria-disabled"] && keyed.length <= 9 ? String(keyed.length) : "";
    b.prepend(h("span", { class: "key", "aria-hidden": "true" }, h("span", { class: "n" }, n)));
    return b;
  };
  const recFlag = (on) => (on ? h("span", { class: "rec" }, L.recommended) : null);
  // Every step says whether it takes one pick or several; the marks on its options have the same shape.
  const RULES = { purpose: "one", kind: "one", where: "any", length: "one", look: "look", more: "optional" };
  function rule(id) {
    const kind = RULES[id];
    const n = [V.choices.style.primary, V.choices.style.secondary].filter(Boolean).length;
    const count = kind === "look" && !isAI("look") && n ? h("span", { class: "cnt" }, fill(L.lookCount, { n })) : null;
    const pill = h("p", { class: `rule r-${kind}` }, h("i", { class: "mk", "aria-hidden": "true" }), L.rules[kind], count);
    return id === "look" && shows.size ? h("div", { class: "rulebar" }, pill, ownSwitch) : pill;
  }
  const aiOpt = (id) => h("button", { class: "opt ai", type: "button", "aria-pressed": isAI(id) ? "true" : "false", onclick: () => decide(id) }, h("span", { class: "key", "aria-hidden": "true" }, h("span", { class: "n" }, "")), h("b", {}, `${AI} ${L.decide}`), h("span", {}, L.decideNote));
  const foot = (id, multi) => h("div", { class: "foot" },
    h("button", { class: "btn ghost back", type: "button", "aria-label": L.back, onclick: () => goTo(at - 1) }, `${RTL ? "→" : "←"} `, h("span", { class: "lbl" }, L.back)),
    h("span", { class: "sp" }),
    ["look", "more"].includes(id) ? null : h("span", { class: "hint" }, L.hintKeys), // the rule under the title says how many
    multi ? h("button", { class: "btn ai", type: "button", "aria-pressed": isAI(id) ? "true" : "false", onclick: () => decide(id) }, `${AI} ${L.decide}`) : null,
    h("button", { class: "btn go", type: "button", onclick: forward }, at === N - 1 ? L.review : `${L.continue} ${RTL ? "←" : "→"}`));

  function intro() {
    return [
      h("h1", { class: "q", tabindex: "-1" }, L.introQ),
      h("p", { class: "sub" }, STATIC ? L.leadStatic : L.lead),
      h("div", { class: "grid g2" },
        h("button", { class: "opt big-choice", type: "button", onclick: () => goTo(0) }, h("b", {}, L.stepByStep), h("span", {}, L.stepByStepNote)),
        h("button", { class: "opt big-choice ai", type: "button", onclick: async () => { if (await tap({ field: "decideAll" })) goTo(N); } }, h("b", {}, `${AI} ${L.decideAll}`), h("span", {}, L.decideAllNote))),
    ];
  }
  function purpose() {
    return [h("div", { class: "grid g2" }, ...V.families.map((f) =>
      opt(!isAI("purpose") && f.id === V.choices.family, () => choose({ field: "format", value: f.id === R.family ? R.format : f.formats[0].id }, true),
        [h("span", { class: "ic", html: ICON[f.id] ?? "" }), h("b", {}, f.label), h("span", {}, f.hint), recFlag(f.id === R.family)])), aiOpt("purpose")), foot("purpose")];
  }
  function kind() {
    return [h("div", { class: "grid g3" }, ...formats().map((f) =>
      opt(!isAI("kind") && f.id === V.choices.format, () => choose({ field: "format", value: f.id }, true),
        [h("b", {}, f.label), h("span", {}, f.hint), h("span", { class: "meta" }, fill(L.usually, { n: f.seconds })), recFlag(f.id === R.format)])), aiOpt("kind")), foot("kind")];
  }
  const ratio = (a, size = 22) => {
    const [w, hh] = a.split(":").map(Number);
    const k = size / Math.max(w, hh);
    return h("i", { class: "ratio", style: `width:${Math.round(w * k)}px;height:${Math.round(hh * k)}px`, "aria-hidden": "true" });
  };
  function where() {
    const c = V.choices;
    return [h("div", { class: "grid g3" }, ...V.platforms.map((p) =>
      opt(c.platforms.includes(p.id), () => choose({ field: "platforms", toggle: p.id }),
        [h("div", { class: "plat" }, ratio(p.aspect), h("div", {}, h("b", {}, p.label), h("span", {}, L.aspects[p.aspect] ?? p.aspect)))], {}, true))), foot("where", true)];
  }
  function length() {
    const c = V.choices;
    const input = h("input", { type: "number", min: 3, max: 600, inputmode: "numeric", "aria-label": L.lenOther, placeholder: String(c.seconds) });
    const custom = () => { const n = Math.round(Number(input.value)); if (n > 0) choose({ field: "seconds", value: n }, true); };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); custom(); } });
    const options = [...V.lengths];
    if (!options.some((o) => o.seconds === c.seconds)) options.push({ seconds: c.seconds, recommended: false, why: V.lengthNow.why, disabled: false });
    return [h("div", { class: "grid g4" }, ...options.sort((a, b) => a.seconds - b.seconds).map((o) =>
      opt(!isAI("length") && o.seconds === c.seconds, () => (o.disabled ? toast(o.why) : choose({ field: "seconds", value: o.seconds }, true)),
        [h("b", { class: "num" }, String(o.seconds), h("small", {}, ` ${L.lenUnit}`)), h("span", {}, o.why), recFlag(o.recommended)], o.disabled ? { "aria-disabled": "true" } : {})), aiOpt("length"),
        // a typed length is a card among the others, so it is seen with them
        h("div", { class: "opt other" }, h("b", {}, L.lenOther), h("div", { class: "row" }, input, h("span", {}, L.lenUnit), h("button", { class: "btn small", type: "button", onclick: custom }, L.lenSet)))),
      foot("length")];
  }

  // The look cards: built once and moved into the look screen, so their loops never restart.
  const cards = new Map();
  const inView = new WeakMap();
  const io = "IntersectionObserver" in window ? new IntersectionObserver((seen) => { for (const e of seen) inView.set(e.target, e.isIntersecting); play(); }, { rootMargin: "120px 0px" }) : null;
  const videos = [];
  const showOwn = {};
  const shows = new Map(); // look id -> show(own), for the looks that have the user's own photos or clips
  const ownSwitch = h("div", { class: "vt all", role: "group", "aria-label": L.showLabel, hidden: true },
    h("button", { type: "button", "data-own": "0", "aria-pressed": "true", onclick: () => showAll(false) }, L.sampleShort),
    h("button", { type: "button", "data-own": "1", "aria-pressed": "false", onclick: () => showAll(true) }, L.yoursShort));
  function showAll(own) {
    for (const show of shows.values()) show(own);
    for (const b of ownSwitch.children) b.setAttribute("aria-pressed", String((b.dataset.own === "1") === own));
  }
  let hovered = null;
  function play() {
    // Preview videos are rebuilt on every change: drop the ones no longer on the page.
    for (let i = videos.length - 1; i >= 0; i--) if (videos[i].temp && !videos[i].v.isConnected) videos.splice(i, 1);
    for (const { v, id, view } of videos) {
      const inPreview = view.closest?.(".frame");
      const seen = io ? inView.get(view) === true : true;
      const on = v.isConnected && !view.hidden && (inPreview || hovered === id || (!reduce && seen));
      if (on) {
        v.preload = "auto";
        v.play().catch(() => {});
      } else v.pause();
    }
  }
  function video(id, view, src, poster, temp = false) {
    const v = document.createElement("video");
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = "none";
    v.setAttribute("aria-hidden", "true");
    if (poster) v.poster = poster;
    v.src = src;
    v.addEventListener("playing", () => v.classList.add("on"));
    v.addEventListener("error", () => v.remove());
    videos.push({ v, id, view, temp });
    return v;
  }
  function collage(stills) {
    const pic = (cls, src) => (src ? h("span", { class: cls }, h("img", { src, alt: "" })) : null);
    return h("div", { class: "collage" }, pic("c1", stills[0]), pic("c2", stills[1]), pic("c3", stills[2]), h("b", { class: "dot" }));
  }
  // the frame's shape, from the platform's aspect: the film made for that shape plays when the look has one
  const shapeOf = (a) => (a === "9:16" || a === "886:1920" ? "tall" : a === "1:1" ? "square" : a === "4:5" ? "portrait" : "wide");
  function sampleView(s, temp = false, shape = "wide") {
    const shaped = shape !== "wide" && (s.shapes ?? []).includes(shape);
    const view = h("div", { class: shaped ? "view sample shaped" : "view sample" });
    if (s.posterUrl) {
      view.append(h("img", { src: s.posterUrl, alt: "", decoding: "async", onerror: (e) => e.target.replaceWith(h("div", { class: "blank" }, s.name)) }));
      if (s.loop && !STATIC) view.append(video(s.id, view, shaped ? `/loop/${s.id}?shape=${shape}` : `/loop/${s.id}`, shaped ? "" : s.posterUrl, temp));
    } else view.append(h("div", { class: "blank" }, s.name));
    return view;
  }
  function ownView(s, temp = false) {
    const own = V.media;
    const view = h("div", { class: "view" });
    if (s.id === "footage" && own.clipPosters.length) {
      view.append(h("img", { src: own.clipPosters[0], alt: "" }));
      if (own.clips.length && !STATIC) view.append(video(s.id, view, own.clips[0], own.clipPosters[0], temp));
      return view;
    }
    if (s.id === "footage" && own.stills.length) {
      view.classList.add("slideshow");
      view.append(h("img", { class: "base", src: own.stills[0], alt: "" }), ...own.stills.slice(0, 3).map((src, k) => h("img", { src, alt: "", style: `animation-delay:${k * 4}s` })));
      return view;
    }
    if (s.id === "collage" && own.stills.length >= 2) {
      view.append(collage(own.stills.slice(0, 3)));
      return view;
    }
    return null;
  }
  // The preview keeps one view per look, shape and place, so a tap or a step change never restarts its film.
  const kept = new Map();
  const keptView = (s, shape, slot) => {
    const key = `${slot}|${s.id}|${shape}|${showOwn[s.id] === true ? "own" : "sample"}`;
    if (!kept.has(key)) kept.set(key, (showOwn[s.id] === true && ownView(s, false)) || sampleView(s, false, shape));
    return kept.get(key);
  };
  function card(s) {
    const layers = h("div", { class: "layers" });
    const sample = sampleView(s);
    const mine = ownView(s);
    const flag = h("span", { class: "flag yours", hidden: !mine });
    if (mine) {
      showOwn[s.id] = false; // the sample loop first: the user's own material is one tap away
      mine.hidden = true;
      layers.append(mine, sample);
      flag.textContent = L.sampleLabel;
    } else layers.append(sample);
    io?.observe(sample);
    if (s.state === "recommended") layers.append(h("span", { class: "flag rec2" }, L.recommended));
    else if (s.lastTime) layers.append(h("span", { class: "flag" }, L.lastTime));
    layers.append(flag);
    if (s.state === "dimmed") layers.append(h("span", { class: "flag off" }, L.notAvailable));
    const tag = h("span", { class: "tag" });
    const pick = h("button", { class: "pick", type: "button", "aria-label": s.name, "aria-describedby": `d-${s.id}`, "aria-disabled": s.state === "dimmed" ? "true" : null, onclick: () => choose({ field: "style", value: s.id }) }, h("div", { class: "media" }, layers, tag));
    let toggle = null;
    if (mine) {
      const show = (own) => {
        showOwn[s.id] = own;
        mine.hidden = !own;
        sample.hidden = own;
        flag.textContent = own ? (s.id === "footage" ? L.yourFootage : L.yourPhotos) : L.sampleLabel;
        for (const b of toggle.children) b.setAttribute("aria-pressed", String((b.dataset.own === "1") === own));
        preview();
        play();
      };
      shows.set(s.id, show);
      toggle = h("div", { class: "vt", role: "group", "aria-label": L.showLabel },
        h("button", { type: "button", "data-own": "0", "aria-pressed": "true", onclick: () => show(false) }, L.sampleShort),
        h("button", { type: "button", "data-own": "1", "aria-pressed": "false", onclick: () => show(true) }, L.yoursShort));
    }
    // The tile names the look; what it is, why it is recommended and what it needs are read in the strip under the sheet.
    const info = h("div", { class: "info", id: `d-${s.id}` },
      h("h3", { class: "name" }, s.name),
      s.feel.length ? h("p", { class: "feel" }, s.feel.join(" · ")) : null,
      h("p", { class: "sr" }, [s.line, s.state === "recommended" && s.why ? `${L.why} ${s.why}` : "", s.state === "dimmed" ? `${L.needs} ${s.missing}` : ""].filter(Boolean).join(" ")));
    const el = h("article", { class: `look ${s.state}` }, h("div", { class: "mw" }, pick, toggle), info);
    const hover = (on) => () => { hovered = on ? s.id : null; play(); describe(); };
    el.addEventListener("mouseenter", hover(true));
    el.addEventListener("mouseleave", hover(false));
    pick.addEventListener("focus", hover(true));
    pick.addEventListener("blur", hover(false));
    cards.set(s.id, { el, pick, tag });
    return el;
  }
  const sheet = h("div", { class: "sheet" }, ...V.styles.map(card));
  // All ten looks fit on one screen, so none is missed below the fold; the strip says more about the one in hand.
  const strip = h("p", { class: "strip" });
  function describe() {
    const s = byId(hovered) ?? (isAI("look") ? null : byId(V.choices.style.primary));
    if (!s) {
      const rec = V.styles.find((x) => x.state === "recommended" && x.why);
      strip.replaceChildren(h("b", { class: "ai" }, `${AI} ${L.lookAINote}`), rec ? h("span", {}, ` ${L.recommended}: ${rec.name}. ${L.why} ${rec.why}`) : "");
      return;
    }
    strip.replaceChildren(h("b", {}, s.name), s.feel.length ? h("span", { class: "sf" }, ` · ${s.feel.join(" · ")}.`) : "", h("span", {}, ` ${s.line}`),
      s.state === "recommended" && s.why ? h("span", { class: "sw" }, ` ${L.why} ${s.why}`) : "",
      s.state === "dimmed" ? h("span", { class: "sw" }, ` ${L.needs} ${s.missing}`) : "");
  }
  // Each step fits one screen, so no option waits below the fold: a smaller heading first, then compact
  // options, then without the line under the heading and the icons. Nothing a choice depends on is hidden.
  const LEVELS = ["tight", "compact", "dense"];
  function level(stage, n) { LEVELS.forEach((c, i) => stage.classList.toggle(c, i < n)); }
  function fitsScreen(stage) {
    const mbar = $("#mbar");
    const bottom = mbar && !mbar.hidden && getComputedStyle(mbar).display !== "none" ? mbar.getBoundingClientRect().top : innerHeight;
    const foot = $(".foot", stage);
    return !foot || foot.getBoundingClientRect().bottom + scrollY + 12 <= bottom;
  }
  function fitStep() {
    const stage = $("#stage");
    level(stage, 0);
    if (!STEPS.some((x) => x.id === stage.dataset.step)) return;
    if (stage.dataset.step === "look") return fitSheet(stage);
    for (let n = 0; n <= LEVELS.length; n++) {
      level(stage, n);
      if (fitsScreen(stage)) return;
    }
    level(stage, 2); // more options than this screen holds: the compact cards, and the page scrolls
  }
  function fitSheet(stage) {
    const phone = matchMedia("(max-width:760px)").matches;
    const n = V.styles.length;
    const fits = () => fitsScreen(stage);
    // Full rows first, a last row with one look alone (a leftover) last; then fewer columns, so bigger tiles.
    const rank = (c) => (n % c === 0 ? 0 : n % c === 1 ? 2 : 1);
    const counts = (phone ? [3, 4] : [3, 4, 5, 6]).filter((c) => c <= n).sort((a, b) => rank(a) - rank(b) || a - b);
    // Even rows and big tiles come before the big heading: each count is tried with the heading, then
    // with a smaller one, then without the feel words on the tiles (the strip still says them).
    for (const cols of counts) {
      sheet.style.setProperty("--cols", cols);
      tinyTiles();
      for (const k of [0, 1, 2]) {
        level(stage, k > 0 ? 1 : 0);
        stage.classList.toggle("tighter", k > 1);
        if (fits()) return tinyTiles();
      }
    }
    sheet.style.setProperty("--cols", counts.at(-1) === undefined ? 3 : Math.max(...counts)); // nothing fits this window: the smallest tiles, and the page scrolls
  }
  function tinyTiles() {
    const tiny = ($(".look", sheet)?.getBoundingClientRect().width ?? 999) < 130;
    sheet.classList.toggle("tiny", tiny);
    ownSwitch.hidden = !tiny || !shows.size;
  }
  function looks() {
    const ai = isAI("look");
    for (const s of V.styles) {
      const { el, pick, tag } = cards.get(s.id);
      const n = ai ? 0 : pickNo(s.id);
      el.classList.toggle("picked", n > 0);
      pick.setAttribute("aria-pressed", n > 0 ? "true" : "false");
      tag.textContent = n ? `${n} · ${n === 1 ? L.main : L.accent}` : "";
    }
    describe();
    return [sheet, strip, foot("look", true)];
  }
  let missOpen = false; // the folded list stays open while other picks on the screen redraw it
  function more() {
    const c = V.choices;
    const out = [];
    for (const q of V.questions) {
      out.push(h("div", { class: "group" }, h("h3", {}, q.question, h("span", { class: "gr" }, L.pickOneShort)), h("div", { class: "chips" }, ...q.options.map((o) =>
        h("button", { class: "chip", type: "button", "aria-pressed": c.answers[q.id] === o.id ? "true" : "false", onclick: () => choose({ field: "answer", id: q.id, value: o.id }) }, o.label, o.id === q.recommended ? h("span", { class: "rec" }, L.recommended) : null)))));
    }
    const source = (p) => (p.source === "connected" ? L.viaSession : fill(L.viaKey, { k: p.source.replace(/^key /, "") }));
    if (V.tools.length) {
      out.push(h("div", { class: "group" }, h("h3", {}, L.toolsFound, h("span", { class: "gr any" }, L.pickAnyShort)), h("p", { class: "note" }, L.toolsFoundNote), ...V.tools.map((t) =>
        h("label", { class: "tool" },
          h("input", { type: "checkbox", "aria-label": t.name, checked: c.tools.includes(t.id), onchange: () => choose({ field: "tools", toggle: t.id }) }),
          h("span", {}, h("b", {}, t.name), h("small", {}, t.adds),
            h("div", { class: "prov" }, ...t.providers.map((p) => h("dl", {},
              h("dt", {}, L.provider), h("dd", {}, h("b", {}, p.name ?? L.viaSession)),
              p.uses ? h("dt", {}, L.uses) : null, p.uses ? h("dd", {}, p.uses) : null,
              h("dt", {}, L.via), h("dd", {}, source(p))))))))));
    } else out.push(h("p", { class: "note" }, L.noTools));
    if (V.missing.length) {
      out.push(h("details", { class: "group miss", open: missOpen, ontoggle: (e) => { missOpen = e.target.open; } }, h("summary", {}, `${L.toolsMissing} (${V.missing.length})`), h("p", {}, L.toolsMissingNote), h("ul", {}, ...V.missing.map((t) =>
        h("li", {}, h("b", {}, t.name), h("span", {}, t.adds), h("div", { class: "keys" }, ...t.providers.map((p) => h("span", { class: "kp" }, p.name, h("code", {}, p.env[0])))))))));
    }
    const note = h("input", { class: "field", type: "text", value: c.note, maxlength: 500, placeholder: L.notePh, "aria-label": L.note, onchange: (e) => choose({ field: "note", value: e.target.value }) });
    out.push(h("div", { class: "group" }, h("h3", {}, L.note), note));
    out.push(foot("more", true));
    return out;
  }

  // What the user will get, in a sentence, and the parts Claude was handed.
  const decidedNames = () => STEPS.filter((s) => isAI(s.id)).map((s) => L.stepNames[s.id]);
  function summary() {
    const c = V.choices;
    if (STEPS.every((s) => isAI(s.id))) return L.summaryAll;
    if (!c.style.primary) return L.pickFirst;
    const chosen = V.platforms.filter((p) => c.platforms.includes(p.id));
    const aspects = [...new Set(chosen.map((p) => L.aspects[p.aspect] ?? p.aspect))];
    const accent = c.style.secondary ? fill(L.accentTpl, { accent: name(c.style.secondary) }) : "";
    const look = isAI("look") ? L.lookByClaude : fill(L.lookTpl, { main: name(c.style.primary), accent });
    // A step handed to Claude is left out, so the line never promises a length or a place Claude has yet to pick.
    const len = isAI("length") ? "" : fill(L.lenIn, { n: c.seconds });
    // In right-to-left text each Latin platform name is its own isolate, so a comma never jumps to the wrong side at a line break.
    const iso = (s) => (RTL ? `\u2068${s}\u2069` : s);
    const where = isAI("where") ? L.whereByClaude : fill(L.whereTpl, { list: list(chosen.map((p) => iso(p.label))) });
    return fill(L.summary, { len, aspect: isAI("where") ? "" : list(aspects), where, look }).replace(/ {2,}/g, " ");
  }
  const decidedText = () => { const n = decidedNames(); return n.length && n.length < N ? `${AI} ${fill(L.decidedLine, { list: list(n) })}` : ""; };
  function message() {
    const c = V.choices;
    const parts = [`${L.msgIntro} ${summary()}`];
    if (decidedText()) parts.push(decidedText());
    const tools = V.tools.filter((t) => c.tools.includes(t.id)).map((t) => `${t.name} (${t.providers.map((p) => p.name ?? L.viaSession).join(", ")})`);
    if (tools.length) parts.push(`${L.toolsOn}: ${tools.join(", ")}.`);
    for (const q of V.questions) {
      const o = q.options.find((x) => x.id === c.answers[q.id]);
      if (o && !isAI("more")) parts.push(`${q.question}: ${o.label}.`);
    }
    if (c.note) parts.push(`${L.noteLabel}: ${c.note}`);
    const look = [c.style.primary, c.style.secondary].filter(Boolean).join(" + ");
    const decided = STEPS.filter((s) => isAI(s.id)).map((s) => s.id);
    parts.push(`(format ${c.format}; platforms ${c.platforms.join(", ")}; ${c.seconds} s; look ${look}${c.tools.length ? `; tools ${c.tools.join(", ")}` : ""}${decided.length ? `; Claude decides ${decided.join(", ")}` : ""})`);
    return parts.join("\n");
  }
  async function copy() {
    const text = message();
    try {
      await navigator.clipboard.writeText(text);
      toast(L.copied);
    } catch {
      const ta = h("textarea", { class: "sr", readonly: true });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      toast(ok ? L.copied : L.copyFail);
    }
  }
  async function send() {
    if (!V.choices.style.primary) return toast(L.pickFirst);
    try {
      const r = await fetch("/done", { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      toast(L.offline);
      return $("[data-copy]")?.focus();
    }
    for (const { v } of videos) v.pause();
    const text = summary();
    document.body.classList.add("sent-mode");
    $("#app").replaceChildren(h("section", { class: "sent" }, h("p", { class: "kicker" }, L.kicker), h("h1", { class: "q" }, L.sent), h("p", { class: "sub" }, L.sentNote), h("p", { class: "psum" }, text), h("button", { class: "btn", type: "button", onclick: copy }, L.copy)));
  }
  const actions = () => h("div", { class: "actions" },
    h("button", { class: STATIC ? "btn go" : "btn", type: "button", "data-copy": "", onclick: copy }, L.copy),
    STATIC ? null : h("button", { class: "btn go", type: "button", disabled: !V.choices.style.primary, onclick: send }, L.send));

  // The live preview: the video's shape, the main look playing, the accent, the length with its hook and cuts.
  let aspect = null;
  function frame(maxW, maxH) {
    const c = V.choices;
    const aspects = [...new Set(c.platforms.map((p) => V.platforms.find((x) => x.id === p)?.aspect).filter(Boolean))];
    if (!aspects.includes(aspect)) aspect = aspects[0] ?? "16:9";
    const [w, hh] = aspect.split(":").map(Number);
    const fw = Math.max(24, Math.min(maxW, (maxH * w) / hh)); // fits the box both ways, the phone bar's 56 px slot too
    const s = byId(c.style.primary) ?? byId(R.style.primary) ?? V.styles[0];
    const acc = byId(c.style.secondary);
    const box = h("div", { class: w / hh < 1.4 ? "frame tall" : "frame", style: `width:${Math.round(fw)}px;height:${Math.round((fw * hh) / w)}px` }, keptView(s, shapeOf(aspect), maxW > 60 ? "big" : "mini"));
    if (isAI("look")) box.append(h("span", { class: "flag ai" }, `${AI} ${L.claudePick}`));
    else if (acc) box.append(h("span", { class: "acc" }, h("i", {}, keptView(acc, "wide", "acc")), `+ ${acc.name}`));
    const tabs = aspects.length > 1 ? h("div", { class: "tabs" }, ...aspects.map((a) => h("button", { type: "button", "aria-pressed": a === aspect ? "true" : "false", onclick: () => { aspect = a; preview(); review$(); } }, ratio(a, 14), L.aspects[a] ?? a))) : null;
    return { box, tabs };
  }
  function timeline() {
    const sec = V.choices.seconds;
    const max = Math.max(sec, 15);
    const pct = (t) => `${(t / max) * 100}%`;
    const pos = (t) => (RTL ? { right: pct(t) } : { left: pct(t) });
    const st = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
    return h("div", { class: "tl", "aria-hidden": "true" },
      h("i", { class: "track" }), h("i", { class: "hook", style: `${st(pos(0))};width:${pct(Math.min(3, sec))}` }),
      h("span", { class: "lab start", style: st(pos(0)) }, `${fill(L.secs, { n: 0 })} · ${L.hook}`),
      // A length handed to Claude shows no seconds and no cuts: Claude has yet to pick them.
      ...(isAI("length") ? [] : (V.lengthNow.cuts ?? []).flatMap((c) => [h("i", { class: "cut", style: st(pos(c.seconds)) }), h("span", { class: "lab mid", style: st(pos(c.seconds)) }, `${fill(L.secs, { n: c.seconds })} ${fill(L.cutAt, { p: c.platform })}`)])),
      h("span", { class: "lab end", style: st(pos(sec)) }, isAI("length") ? `${AI} ${L.decided}` : fill(L.secs, { n: sec })));
  }
  function preview() {
    const pv = $("#pv");
    if (!pv) return;
    pv.hidden = at >= N;
    $("#mbar").hidden = at >= N;
    if (at >= N) return;
    $("#pv-sum").textContent = summary();
    $("#pv-dec").textContent = decidedText();
    // Everything around the frame goes in first, so the box the frame is measured against is final.
    $("#pv-tabs").replaceChildren(...[frame(1, 1).tabs].filter(Boolean));
    $("#pv-tl").replaceChildren(timeline());
    $("#pv-act").replaceChildren(actions());
    const stage = $("#pv-stage");
    stage.replaceChildren(); // measure the empty box: a frame left inside would make it grow
    const { box } = frame(stage.clientWidth || 320, (stage.clientHeight || 420) - 16);
    stage.replaceChildren(box);
    const { box: mini } = frame(56, 56);
    $("#mbar").replaceChildren(h("div", { class: "mini" }, mini), h("p", { class: "msum" }, summary()), actions());
    play();
  }
  function review() {
    const c = V.choices;
    const rows = STEPS.map((st, i) => h("div", { class: "pk" }, h("dt", {}, L.stepNames[st.id]), h("dd", { class: isAI(st.id) ? "ai" : "" }, isAI(st.id) ? `${AI} ${L.decided}` : value(st.id)), h("button", { type: "button", onclick: () => goTo(i) }, L.edit)));
    const swap = c.style.secondary && !isAI("look") ? h("button", { class: "btn ghost", type: "button", onclick: () => choose({ field: "swap" }) }, `⇄ ${L.swap}`) : null;
    return [h("div", { class: "review" },
      h("div", { class: "rv-media" }, h("div", { id: "rv-tabs" }), h("div", { class: "rv-stage", id: "rv-stage" }), h("div", { id: "rv-tl" })),
      h("div", {},
        h("p", { class: "kicker" }, L.yourVideo), h("p", { class: "psum big" }, summary()), decidedText() ? h("p", { class: "dec" }, decidedText()) : null,
        h("dl", { class: "picks" }, ...rows), swap, actions(),
        h("p", { class: "note" }, STATIC ? L.staticNote : decidedNames().length ? L.nextDecided : L.next)))];
  }
  function review$() {
    const stage = $("#rv-stage");
    if (!stage) return;
    $("#rv-tabs").replaceChildren(...[frame(1, 1).tabs].filter(Boolean));
    $("#rv-tl").replaceChildren(timeline());
    stage.replaceChildren();
    const { box } = frame(Math.min(stage.clientWidth || 420, 560), Math.min(innerHeight * 0.62, 620));
    stage.replaceChildren(box);
    play();
  }
  function value(id) {
    const c = V.choices;
    switch (id) {
      case "purpose": return fam().label;
      case "kind": return fmt()?.label ?? "";
      case "where": return V.platforms.filter((p) => c.platforms.includes(p.id)).map((p) => p.label).join(", ");
      case "length": return fill(L.len, { n: c.seconds });
      case "look": return [name(c.style.primary), name(c.style.secondary)].filter(Boolean).join(" + ");
      default: return [...V.questions.map((q) => q.options.find((o) => o.id === c.answers[q.id])?.label), ...V.tools.filter((t) => c.tools.includes(t.id)).map((t) => t.name), c.note ? `${L.noteLabel}: ${c.note}` : null].filter(Boolean).join(" · ");
    }
  }

  // Draws the top bar, the open screen and the preview. moved: a new screen, which animates in and takes focus.
  function render(moved) {
    $("#count").textContent = at < 0 ? L.kicker : at >= N ? L.allSet : fill(L.stepOf, { n: at + 1, total: N });
    $("#bars").replaceChildren(...STEPS.map((s, i) => h("button", { type: "button", class: i < at || at >= N ? "on" : i === at ? "cur" : "", "aria-label": TITLES[s.id], title: TITLES[s.id], onclick: () => goTo(i) })));
    $("#all").hidden = at < 0 || at >= N;
    document.body.classList.toggle("reviewing", at >= N);
    const stage = $("#stage");
    keyed.length = 0;
    let kids;
    if (at < 0) kids = intro();
    else if (at >= N) kids = review();
    else {
      const s = STEPS[at];
      kids = [h("p", { class: "kicker" }, `${String(at + 1).padStart(2, "0")} · ${L.stepNames[s.id]}`), h("h1", { class: "q", tabindex: "-1" }, TITLES[s.id]), rule(s.id), h("p", { class: "sub" }, L.subs[s.id]), ...[s.body()].flat()];
    }
    stage.dataset.step = at < 0 ? "intro" : at >= N ? "review" : STEPS[at].id;
    stage.replaceChildren(...kids);
    stage.classList.remove("tighter");
    fitStep();
    if (moved) {
      stage.classList.remove("in", "back");
      void stage.offsetWidth;
      stage.classList.add(dir < 0 ? "back" : "in");
      window.scrollTo({ top: 0, behavior: "auto" });
      stage.querySelector(".q")?.focus({ preventScroll: true });
    }
    preview();
    if (at >= N) review$();
    play();
  }

  addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea, select")) return;
    const n = Number(e.key);
    if (at >= 0 && at < N && n >= 1 && n <= Math.min(9, keyed.length)) { e.preventDefault(); keyed[n - 1](); }
    else if (e.key === "Enter" && at >= 0 && at < N && !e.target.closest?.("button")) forward();
    else if (e.key === (RTL ? "ArrowRight" : "ArrowLeft") && at >= 0 && !e.target.closest?.("button")) goTo(at - 1);
  });
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { preview(); review$(); fitStep(); }, 120); });
  document.fonts?.ready.then(fitStep);

  $("#app").replaceChildren(
    h("header", { class: "top" }, h("p", { class: "kicker", id: "count" }), h("nav", { class: "bars", id: "bars", "aria-label": L.kicker }),
      h("button", { class: "btn ai small", id: "all", type: "button", onclick: async () => { if (await tap({ field: "decideAll" })) goTo(N); } }, `${AI} ${L.decideAll}`)),
    h("div", { class: "shell" },
      h("main", { class: "col" }, h("div", { class: "stage", id: "stage" })),
      h("aside", { class: "pv", id: "pv", "aria-label": L.live },
        h("p", { class: "kicker" }, L.live), h("p", { class: "psum", id: "pv-sum", "aria-live": "polite" }), h("p", { class: "dec", id: "pv-dec" }),
        h("div", { id: "pv-tabs" }), h("div", { class: "pv-stage", id: "pv-stage" }), h("div", { id: "pv-tl" }), h("div", { id: "pv-act" }),
        h("p", { class: "note" }, STATIC ? L.staticNote : L.next))),
    h("div", { class: "mbar", id: "mbar" }),
    h("div", { id: "toast", class: "toast", role: "status", "aria-live": "polite" }));
  render(true);
}

const FONTS = "https://fonts.googleapis.com/css2?family=Assistant:wght@400;500;600;700;800&display=swap";

/** The page: one HTML file holding the view as data and the client script. Fonts load when online; offline, the fallbacks hold. */
export function buildPage(view, { staticMode = false } = {}) {
  const data = JSON.stringify(view).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="${esc(view.lang)}" dir="${view.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(view.labels.title)}</title><link rel="icon" href="data:,"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${CSS}</style></head><body><main id="app" class="wrap"></main><script>const STATIC=${staticMode ? "true" : "false"};let V=${data};(${client.toString()})();</script></body></html>`;
}

/** A style's loop, from the cache or fetched once from loopBase and checked; null when it cannot be had. */
export async function cachedLoop(lib, style, cacheDir, fetchImpl = fetch) {
  const loop = style?.loop;
  if (!loop?.file || !loop.sha256) return null;
  const file = join(cacheDir, loop.file);
  if (existsSync(file) && sha256(readFileSync(file)) === loop.sha256) return file;
  try {
    const res = await fetchImpl(new URL(loop.file, lib.loopBase).href, { redirect: "follow" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (sha256(buf) !== loop.sha256) return null;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, buf);
    return file;
  } catch {
    return null;
  }
}

/** What docs/choices.json holds: the choices, who made them, and what was on the page. */
export function record(choices, { film, chosenBy, done, shown, tools, at = new Date().toISOString() }) {
  return { film, chosenBy, done, at, ...choices, shown: shown.map((s) => s.id), toolsFound: tools.map((t) => t.id) };
}

const writeJson = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function serveFile(req, res, file, type) {
  const buf = readFileSync(file);
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=3600" };
  if (!m) {
    res.writeHead(200, { ...headers, "content-length": buf.length });
    return res.end(buf);
  }
  const start = m[1] ? Number(m[1]) : Math.max(0, buf.length - Number(m[2]));
  const end = m[1] && m[2] ? Math.min(Number(m[2]), buf.length - 1) : buf.length - 1;
  res.writeHead(206, { ...headers, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${buf.length}` });
  res.end(buf.subarray(start, end + 1));
}

const readBody = (req) =>
  new Promise((ok, no) => {
    let s = "";
    req.on("data", (d) => {
      s += d;
      if (s.length > 100000) req.destroy();
    });
    req.on("end", () => {
      try {
        ok(s ? JSON.parse(s) : {});
      } catch (e) {
        no(e);
      }
    });
  });

/** Serves the page on 127.0.0.1. Resolves to { url, finished, close }; finished resolves to the saved record. */
export function startChooser(o) {
  const { root, lib, specs, shown, tools = [], questions = [], media = { stills: [], clips: [], clipPosters: [] }, lang = "en", lockFormat = false, film = "film", cacheDir = DEFAULT_CACHE, fetchImpl = fetch, port = 0, timeoutMs = 30 * 60 * 1000 } = o;
  let choices = o.choices;
  const recommended = o.recommended ?? o.choices;
  const L = labelsFor(lang);
  let resolveFinished;
  const finished = new Promise((r) => (resolveFinished = r));
  const ctx = { specs, shown, tools, questions, lockFormat, recommended };
  const view = (error = null) => buildView({ lib, specs, choices, recommended, shown, tools, questions, media, lang, lockFormat, error });
  const persist = (done) => {
    const rec = record(choices, { film, chosenBy: "user", done, shown, tools });
    writeJson(join(root, "docs", "choices.json"), rec);
    return rec;
  };
  let timer;
  let over = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, buildPage(view()), "text/html; charset=utf-8");
      if (req.method === "GET" && url.pathname === "/state") return send(res, 200, view());
      if (req.method === "POST" && url.pathname === "/tap") {
        const tap = await readBody(req);
        const r = applyTap(choices, tap, ctx);
        if (r.error) return send(res, 400, view(r.error));
        if (tap.field === "seconds") {
          const n = lengthNotes(specs, r.choices.format, r.choices.platforms, r.choices.seconds, L);
          if (n.disabled) return send(res, 400, view(n.why));
        }
        // Until the user picks a length, the length follows the recommendation for the kind and platforms picked.
        if (tap.field === "seconds") r.choices.lengthSet = true;
        if ((tap.field === "decide" && tap.step === "length") || tap.field === "decideAll") r.choices.lengthSet = false;
        if (!r.choices.lengthSet && ["format", "platforms", "decide", "decideAll"].includes(tap.field)) {
          r.choices.seconds = lengthOptions(specs, r.choices.format, r.choices.platforms).find((o) => o.recommended).seconds;
        }
        choices = fitSeconds(specs, r.choices);
        persist(false);
        return send(res, 200, view());
      }
      if (req.method === "POST" && url.pathname === "/done") {
        if (!choices.style.primary) return send(res, 400, view("pick a look first"));
        const rec = persist(true);
        const prefsFile = join(root, "docs", "preferences.json");
        const prefs = existsSync(prefsFile) ? JSON.parse(readFileSync(prefsFile, "utf8")) : null;
        writeJson(prefsFile, addFilm(prefs, choices, { film, at: rec.at }));
        send(res, 200, { ok: true });
        return finish(rec);
      }
      const poster = url.pathname.match(/^\/poster\/([\w-]+)$/);
      if (req.method === "GET" && poster) {
        const s = inLanguage(lib.styles.find((x) => x.id === poster[1]), lang);
        const f = s ? join(lib.dir, s.poster) : null;
        return f && existsSync(f) ? serveFile(req, res, f, "image/webp") : send(res, 404, { error: "no poster" });
      }
      const own = url.pathname.match(/^\/media\/([scp])(\d+)$/);
      if (req.method === "GET" && own) {
        const f = { s: media.stills, c: media.clips, p: media.clipPosters ?? [] }[own[1]][Number(own[2])];
        return f && existsSync(f) ? serveFile(req, res, f, own[1] === "c" ? "video/mp4" : "image/jpeg") : send(res, 404, { error: "no media" });
      }
      const loop = url.pathname.match(/^\/loop\/([\w-]+)$/);
      if (req.method === "GET" && loop) {
        const s = inLanguage(lib.styles.find((x) => x.id === loop[1]), lang);
        const shape = SHAPES.includes(url.searchParams.get("shape")) ? url.searchParams.get("shape") : "wide";
        const f = s ? await cachedLoop(lib, { ...s, loop: loopFor(s, shape) }, cacheDir, fetchImpl) : null;
        return f ? serveFile(req, res, f, "video/mp4") : send(res, 404, { error: "no loop" });
      }
      send(res, 404, { error: "not found" });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });
  const finish = (rec) => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections?.();
    resolveFinished(rec);
  };
  return new Promise((ok) =>
    server.listen(port, "127.0.0.1", () => {
      timer = setTimeout(() => finish(persist(false)), timeoutMs);
      ok({ url: `http://127.0.0.1:${server.address().port}/`, finished, close: () => finish(persist(false)) });
    }),
  );
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
  const list = (k, sep = ",") => (arg(k) ?? "").split(sep).map((s) => s.trim()).filter(Boolean);
  const root = resolve(".");
  const specs = loadSpecs();
  const lib = loadStyles(arg("styles") ? resolve(arg("styles")) : undefined);
  const format = arg("format");
  if (!specs.formats[format]) throw new Error(`--format: one of ${Object.keys(specs.formats).join(", ")}`);
  const cacheDir = arg("cache") ? resolve(arg("cache")) : DEFAULT_CACHE;
  const media = arg("media") ? prepareMedia(scanMedia(resolve(arg("media"))), cacheDir) : { stills: [], clips: [], clipPosters: [] };
  const material = [...new Set([...list("material"), ...(media.clips.length ? ["footage"] : []), ...(media.stills.length ? ["photos"] : [])])];
  const envFile = existsSync(join(root, ".env")) ? readFileSync(join(root, ".env"), "utf8") : "";
  const tools = detectTools(lib, { env: process.env, envFile, connected: list("connected", "|").flatMap((c) => (c.includes("=") ? [c] : c.split(","))) });
  const prefsFile = join(root, "docs", "preferences.json");
  const last = existsSync(prefsFile) ? lastStyle(JSON.parse(readFileSync(prefsFile, "utf8"))) : null;
  const recommended = list("recommend", "|").map((s) => (s.includes(":") ? { id: s.slice(0, s.indexOf(":")).trim(), why: s.slice(s.indexOf(":") + 1).trim() } : { id: s }));
  const shown = pickStyles(lib, { format, material, tools, recommended, last });
  const questions = arg("questions") ? JSON.parse(readFileSync(resolve(arg("questions")), "utf8")) : [];
  const problems = validateQuestions(questions);
  if (problems.length) throw new Error(`--questions: ${problems.join("; ")}`);
  const lang = arg("lang") ?? "en";
  const film = arg("film") ?? "film";
  const choices = initialChoices(specs, { format, platforms: list("platforms"), shown, questions });
  const opts = { root, lib, specs, choices, recommended: choices, shown, tools, questions, media, lang, lockFormat: flag("lock-format"), film, cacheDir };
  if (flag("hands-off")) {
    const rec = record(choices, { film, chosenBy: "assumed", done: true, shown, tools });
    writeJson(join(root, "docs", "choices.json"), rec);
    console.log(`choices ${JSON.stringify(rec)}`);
    return;
  }
  if (arg("static")) {
    const out = resolve(arg("static"));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buildPage(buildView({ ...opts, posters: "inline" }), { staticMode: true }));
    console.log(`wrote  ${out}   (no saving: the user replies in the chat)`);
    return;
  }
  const c = await startChooser({ ...opts, port: Number(arg("port") ?? 0) });
  console.log(`chooser ${c.url}`);
  if (!flag("no-open")) openBrowser(c.url);
  const rec = await c.finished;
  console.log(`choices ${JSON.stringify(rec)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`error: ${e.message}`);
    process.exit(2);
  });
}
