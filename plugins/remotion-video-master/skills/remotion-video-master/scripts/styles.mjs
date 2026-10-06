#!/usr/bin/env node
/**
 * The style library (the looks) and the choices around it, as pure functions shared by the
 * chooser page (choose.mjs) and the brief check (visual-brief.mjs). A look is how a film looks and
 * feels (filmed footage, the product's screens, line drawing, moving type...), never what happens
 * in it: the story, the motif and every move still come from the brand read and the script. Any
 * two looks may be mixed: the first is the main look, the second an accent.
 *
 *   node styles.mjs --list             the library, one line a style
 *   node styles.mjs --hash=<dir>       writes each loop's sha256 and size, from <dir>, into styles.json
 *
 * Node 18+, no dependencies.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const STYLES_FILE = join(here, "..", "assets", "styles", "styles.json");
export const MATERIAL = ["footage", "photos", "ui"];
export const LIMITS = { picksMax: 2, questionsMax: 3 };

export function loadStyles(file = STYLES_FILE) {
  const lib = JSON.parse(readFileSync(file, "utf8"));
  return { ...lib, file: resolve(file), dir: dirname(resolve(file)) };
}

/** Problems with the library itself, as sentences; empty when it holds together. */
export function validateStyles(lib, specs) {
  const problems = [];
  const ids = lib.styles.map((s) => s.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) problems.push(`duplicate style ids: ${dup.join(", ")}`);
  const toolIds = (lib.tools ?? []).map((t) => t.id);
  for (const s of lib.styles) {
    for (const k of ["id", "name", "line", "poster"]) if (!s[k]) problems.push(`${s.id ?? "?"}: no ${k}`);
    if (!s.loop?.file) problems.push(`${s.id}: no loop file`);
    if (!(s.fits ?? []).length) problems.push(`${s.id}: fits no format`);
    for (const f of s.fits ?? []) if (!specs.formats[f]) problems.push(`${s.id}: fits unknown format "${f}"`);
    for (const m of s.needsAny ?? []) if (!MATERIAL.includes(m)) problems.push(`${s.id}: unknown material "${m}"`);
    if (s.needsTool && !toolIds.includes(s.needsTool)) problems.push(`${s.id}: needs unknown tool "${s.needsTool}"`);
    if ((s.needsAny?.length || s.needsTool) && !s.missing) problems.push(`${s.id}: say what it needs (missing)`);
    if ((s.feel ?? []).length !== 3) problems.push(`${s.id}: three feel words (feel)`);
    for (const [lang, tr] of Object.entries(s.i18n ?? {})) if (tr.feel && tr.feel.length !== 3) problems.push(`${s.id}: three feel words in ${lang}`);
  }
  for (const t of lib.tools ?? []) {
    if (!t.id || !t.name || !t.adds) problems.push(`tool ${t.id ?? "?"}: needs id, name and adds`);
    if (!(t.providers ?? []).length) problems.push(`tool ${t.id}: name at least one provider`);
    for (const p of t.providers ?? []) if (!p.name || !(p.env ?? []).length || !p.uses) problems.push(`tool ${t.id}: each provider needs a name, its key names (env) and what it is used for (uses)`);
  }
  return problems;
}

/**
 * Every style, in the order to show them for this film: the recommendation first, then the ones
 * that fit the format, then the rest. recommended: the agent's picks for this ask ([{ id, why }],
 * at most 2, in any combination); without them, the first style that fits the format and has its
 * material. A style that lacks its material or tool is shown dimmed, last, with what it would take,
 * so the user sees everything the skill can make on one screen.
 */
export function pickStyles(lib, { format, material = [], tools = [], recommended = [], last = null }) {
  const have = new Set(material);
  const toolIds = new Set(tools.map((t) => t.id ?? t));
  const byId = new Map(lib.styles.map((s) => [s.id, s]));
  const lacks = (s) => Boolean((s.needsAny?.length && !s.needsAny.some((m) => have.has(m))) || (s.needsTool && !toolIds.has(s.needsTool)));
  const fits = (s) => (s.fits ?? []).includes(format);
  if (recommended.length > LIMITS.picksMax) throw new Error(`recommend at most ${LIMITS.picksMax} styles`);
  for (const r of recommended) {
    const s = byId.get(r.id);
    if (!s) throw new Error(`unknown style "${r.id}"`);
    if (lacks(s)) throw new Error(`"${r.id}" cannot be recommended: ${s.missing}`);
    if (!r.why) throw new Error(`say why "${r.id}" is recommended for this film`);
  }
  if (recommended.length === 2 && recommended[0].id === recommended[1].id) throw new Error(`"${recommended[0].id}" twice: recommend two different looks, or one`);
  let recs = recommended;
  if (!recs.length) {
    const first = lib.styles.find((s) => fits(s) && !lacks(s)) ?? lib.styles.find((s) => !lacks(s));
    recs = [{ id: first.id, why: lib.defaultWhy, whyDefault: true }];
  }
  const recIds = recs.map((r) => r.id);
  const rest = lib.styles.filter((s) => !recIds.includes(s.id));
  const open = [...rest.filter((s) => fits(s) && !lacks(s)), ...rest.filter((s) => !fits(s) && !lacks(s))];
  const dimmed = [...rest.filter((s) => fits(s) && lacks(s)), ...rest.filter((s) => !fits(s) && lacks(s))];
  const shown = [...recIds.map((id) => byId.get(id)), ...open, ...dimmed];
  return shown.map((s) => {
    const rec = recs.find((r) => r.id === s.id);
    return {
      ...s,
      state: rec ? "recommended" : lacks(s) ? "dimmed" : "open",
      why: rec?.why ?? null,
      whyDefault: Boolean(rec?.whyDefault),
      lastTime: Boolean(last && [last.primary, last.secondary].includes(s.id)),
    };
  });
}

/** Names defined in a .env file's text, never their values. An empty value does not count. */
export function envFileNames(text = "") {
  return text
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\S/))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * The tools this session can use, each with the providers that make it work here: a provider whose
 * key name is in the environment or the project's .env (never its value), or a tool the agent can
 * call in this session (connected: "image", or "image=<what it is>"). Providers keep their name and
 * what they will be used for, so the page can say exactly what runs.
 */
export function detectTools(lib, { env = {}, envFile = "", connected = [] } = {}) {
  const names = new Set([...Object.keys(env).filter((k) => String(env[k] ?? "").trim()), ...envFileNames(envFile)]);
  const linked = connected.map((c) => String(c).split("=")).map(([id, ...rest]) => ({ id: id.trim(), label: rest.join("=").trim() || null }));
  return (lib.tools ?? []).flatMap((t) => {
    const providers = [
      ...(t.providers ?? []).flatMap((p) => {
        const key = p.env.find((k) => names.has(k));
        return key ? [{ name: p.name, uses: p.uses, i18n: p.i18n, source: `key ${key}` }] : [];
      }),
      ...linked.filter((c) => c.id === t.id).map((c) => ({ name: c.label, uses: null, source: "connected" })),
    ];
    return providers.length ? [{ id: t.id, name: t.name, adds: t.adds, i18n: t.i18n, providers }] : [];
  });
}

/** The tools that were not found, with the providers and key names that would add each one. */
export function missingTools(lib, found = []) {
  const have = new Set(found.map((t) => t.id));
  return (lib.tools ?? []).filter((t) => !have.has(t.id)).map((t) => ({ id: t.id, name: t.name, adds: t.adds, i18n: t.i18n, providers: (t.providers ?? []).map((p) => ({ name: p.name, env: p.env })) }));
}

export const familyOf = (specs, format) => Object.keys(specs.families).find((id) => specs.families[id].formats.includes(format));

/** The chooser's steps, in order, and the steps each kind of tap belongs to. */
export const STEP_IDS = ["purpose", "kind", "where", "length", "look", "more"];
const STEPS_OF = { format: ["purpose", "kind"], platforms: ["where"], seconds: ["length"], style: ["look"], swap: ["look"], tools: ["more"], answer: ["more"] };

/**
 * One tap on the page applied to the choices. Never throws on a user's tap: an impossible one comes
 * back as { choices, error }. "decide" hands one step to Claude ({ step, value: false } takes it back),
 * "decideAll" hands every step: the step goes back to the recommendation and is listed in
 * choices.decided, so the agent knows it may choose that step itself after the brand read. Any other
 * tap on a step takes it back from Claude.
 */
export function applyTap(choices, tap, ctx) {
  const decided = { ...(choices.decided ?? {}) };
  if (tap?.field === "decide" || tap?.field === "decideAll") {
    const rec = ctx.recommended;
    if (!rec) return { choices, error: "there is no recommendation to decide from" };
    const steps = tap.field === "decideAll" ? STEP_IDS : [tap.step];
    if (!steps.every((s) => STEP_IDS.includes(s))) return { choices, error: `unknown step "${tap.step}"` };
    const next = structuredClone(choices);
    for (const s of steps) {
      if (tap.value === false) {
        delete decided[s];
        continue;
      }
      decided[s] = true;
      if (s === "purpose" || s === "kind") Object.assign(next, { format: rec.format, family: rec.family });
      if (s === "purpose") decided.kind = true;
      if (s === "where") next.platforms = [...rec.platforms];
      if (s === "length") next.seconds = rec.seconds;
      if (s === "look") next.style = { ...rec.style };
      if (s === "more") Object.assign(next, { answers: { ...rec.answers }, tools: [...rec.tools] });
    }
    next.decided = decided;
    return { choices: next };
  }
  // While Claude has the look, a tap on a look starts the user's own pick from that look alone.
  const from = tap?.field === "style" && decided.look ? { ...choices, style: { primary: null, secondary: null } } : choices;
  const r = change(from, tap, ctx);
  if (r.error) return r;
  for (const s of STEPS_OF[tap.field] ?? []) delete decided[s];
  r.choices.decided = decided;
  return r;
}

function change(choices, tap, { specs, shown, tools = [], questions = [], lockFormat = false }) {
  const next = structuredClone(choices);
  const fail = (error) => ({ choices, error });
  const style = (id) => shown.find((s) => s.id === id);
  switch (tap?.field) {
    case "format": {
      const f = specs.formats[tap.value];
      if (!f) return fail(`unknown kind of video "${tap.value}"`);
      const module = specs.formats[choices.format].module;
      if (lockFormat && f.module !== module) return fail(`this skill makes ${module} videos; for another kind, use the master skill`);
      next.format = tap.value;
      next.family = familyOf(specs, tap.value);
      const allowed = specs.families[next.family].platforms;
      next.platforms = next.platforms.filter((p) => allowed.includes(p));
      if (!next.platforms.length) next.platforms = [allowed[0]];
      return { choices: next };
    }
    case "platforms": {
      const list = [tap.value ?? []].flat();
      if (!list.length) return fail("pick at least one place where it runs");
      const unknown = list.find((p) => !specs.platforms[p]);
      if (unknown) return fail(`unknown platform "${unknown}"`);
      next.platforms = [...new Set(list)];
      return { choices: next };
    }
    case "seconds": {
      if (!(Number(tap.value) > 0)) return fail("a length is a number of seconds");
      next.seconds = Number(tap.value);
      return { choices: next };
    }
    case "style": {
      // A tap on a look picks it (first the main look, then the accent), or unpicks it when it is picked.
      const s = style(tap.value);
      if (!s) return fail(`"${tap.value}" is not one of the styles shown`);
      const { primary, secondary } = next.style;
      if (primary === s.id) next.style = { primary: secondary ?? null, secondary: null };
      else if (secondary === s.id) next.style.secondary = null;
      else if (s.state === "dimmed") return fail(`${s.name}: ${s.missing}`);
      else if (!primary) next.style.primary = s.id;
      else if (!secondary) next.style.secondary = s.id;
      else return fail("two looks at most: tap one of them to remove it");
      return { choices: next };
    }
    case "swap": {
      if (!next.style.secondary) return fail("pick a second look to swap with");
      next.style = { primary: next.style.secondary, secondary: next.style.primary };
      return { choices: next };
    }
    case "tools": {
      const list = [tap.value ?? []].flat();
      const bad = list.find((id) => !tools.some((t) => t.id === id));
      if (bad) return fail(`"${bad}" was not found on this computer`);
      next.tools = [...new Set(list)];
      return { choices: next };
    }
    case "answer": {
      const q = questions.find((x) => x.id === tap.id);
      if (!q) return fail(`unknown question "${tap.id}"`);
      if (!q.options.some((o) => o.id === tap.value)) return fail(`"${tap.value}" is not an answer to "${q.question}"`);
      next.answers = { ...next.answers, [q.id]: tap.value };
      return { choices: next };
    }
    case "note":
      next.note = String(tap.value ?? "").slice(0, 500);
      return { choices: next };
    default:
      return fail(`unknown field "${tap?.field}"`);
  }
}

/** The extra questions on the page, checked: at most three, 2 to 4 answers each, one recommended. */
export function validateQuestions(questions = []) {
  if (!Array.isArray(questions)) return ["questions: a list"];
  const problems = [];
  if (questions.length > LIMITS.questionsMax) problems.push(`at most ${LIMITS.questionsMax} questions on the page; decide the rest as recommendations`);
  for (const q of questions) {
    const id = q?.id ?? "?";
    if (!q?.id || !q.question) problems.push(`question ${id}: needs an id and the question`);
    const n = q?.options?.length ?? 0;
    if (n < 2 || n > 4) problems.push(`question ${id}: 2 to 4 answers`);
    if (!q?.options?.some((o) => o.id === q.recommended)) problems.push(`question ${id}: name the recommended answer by its id`);
  }
  return problems;
}

export const lastStyle = (prefs) => prefs?.films?.findLast((f) => f.style?.primary)?.style ?? null;

/** The brand's preferences with this film's choices added; a film chosen again replaces its entry. A step handed to Claude is stored as null: it was never the user's pick. */
export function addFilm(prefs, choices, { film, at }) {
  const d = choices.decided ?? {};
  const entry = {
    film, at,
    format: d.purpose || d.kind ? null : choices.format,
    platforms: d.where ? null : choices.platforms,
    seconds: d.length ? null : choices.seconds,
    style: d.look ? null : choices.style,
    tools: d.more ? null : choices.tools,
  };
  return { films: [...(prefs?.films ?? []).filter((f) => f.film !== film), entry] };
}

/** A look as shown in a language: that language's poster and loop when it has its own (a sample with words in it). */
export function inLanguage(style, lang = "en") {
  if (!style) return style;
  const own = style?.i18n?.[String(lang).split("-")[0]];
  return { ...style, poster: own?.poster ?? style.poster, loop: own?.loop ?? style.loop, loops: own?.loops ?? style.loops };
}

/** The frame shapes a sample film comes in, besides wide. */
export const SHAPES = ["tall", "square", "portrait"];

/** The film for a shape ("wide" or one of SHAPES); wide when the look has none in that shape. */
export function loopFor(style, shape = "wide") {
  return (shape !== "wide" && style?.loops?.[shape]) || style?.loop;
}

/** Writes each loop's sha256 and size, read from the files in dir, into the library file; a language's own loop too. */
export function hashLoops(lib, dir) {
  const raw = JSON.parse(readFileSync(lib.file, "utf8"));
  const done = [];
  const hash = (loop) => {
    const f = join(dir, loop.file);
    if (!existsSync(f)) return false;
    const buf = readFileSync(f);
    loop.sha256 = createHash("sha256").update(buf).digest("hex");
    loop.bytes = buf.length;
    return true;
  };
  for (const s of raw.styles) {
    if (hash(s.loop)) done.push(s.id);
    for (const l of Object.values(s.loops ?? {})) if (!hash(l)) throw new Error(`${s.id}: no ${l.file}`);
    for (const [lang, own] of Object.entries(s.i18n ?? {})) {
      if (own.loop && !hash(own.loop)) throw new Error(`${s.id}: no ${own.loop.file} for ${lang}`);
      for (const l of Object.values(own.loops ?? {})) if (!hash(l)) throw new Error(`${s.id}: no ${l.file} for ${lang}`);
    }
  }
  writeFileSync(lib.file, `${JSON.stringify(raw, null, 2)}\n`);
  return done;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const lib = loadStyles();
  const hash = process.argv.find((a) => a.startsWith("--hash="))?.slice(7);
  if (hash) {
    const done = hashLoops(lib, resolve(hash));
    console.log(`hashed ${done.length} of ${lib.styles.length}: ${done.join(", ")}`);
    process.exit(done.length === lib.styles.length ? 0 : 1);
  }
  for (const s of lib.styles) console.log(`${s.id}: ${s.name}. ${s.line}${s.missing ? ` (${s.missing})` : ""}`);
}
