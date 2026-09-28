#!/usr/bin/env node
/**
 * Turns a video goal and its platforms into the brief's numbers: the length to
 * offer (recommended first), deliverables per platform, safe zones, captions and
 * warnings. Reads ../assets/specs.json. Node 18+, no dependencies.
 *
 *   node recommend.mjs --format=tutorial --platforms=youtube,reels [--steps=4] [--today=2026-09-28] [--json]
 *   node recommend.mjs --list        formats and platforms it knows
 *
 * How the length is chosen: the format's own range (its default and min-max),
 * narrowed by every platform's hard limits (upload or placement caps: must) and
 * soft limits (the platform's recommendation: should), rounded to the grid.
 * When no length suits every platform, the answer is a master at the format's
 * length plus a cutdown per platform that cannot carry it.
 *
 * --steps (tutorial, onboarding): the steps set the length instead of the
 * format's default, perStep seconds a step plus stepOverhead for the outcome and
 * the recap. It is never padded up to the format's range; past its maximum, the
 * answer says to split the task.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const loadSpecs = () => JSON.parse(readFileSync(join(here, "..", "assets", "specs.json"), "utf8"));

const intersect = (a, b) => [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
const empty = (r) => r[0] > r[1];
const clamp = (v, r) => Math.min(r[1], Math.max(r[0], v));

function describeZone(zone) {
  if (!zone) return null;
  const f = (v) => (zone.unit === "fraction" ? `${Math.round(v * 100)}%` : `${v}px`);
  const text = `keep text out of top ${f(zone.top)}, bottom ${f(zone.bottom)}, left ${f(zone.left)}, right ${f(zone.right)}`;
  return zone.unverified ? `${text} (approximate, unverified)` : text;
}

/** The recommendation as data. Throws on unknown format or platform names. */
export function recommend(specs, { format, platforms, steps, today = new Date().toISOString().slice(0, 10) }) {
  const f = specs.formats[format];
  if (!f) throw new Error(`unknown format "${format}"; known: ${Object.keys(specs.formats).join(", ")}`);
  if (!platforms?.length) throw new Error("pass at least one platform");
  const unit = specs.grid.unitFrames / specs.grid.fps; // seconds per grid unit
  const snap = (s) => Math.round(s / unit) * unit;

  const ps = platforms.map((id) => {
    const p = specs.platforms[id];
    if (!p) throw new Error(`unknown platform "${id}"; known: ${Object.keys(specs.platforms).join(", ")}`);
    const hard = [p.hardMin ?? 0, p.hardMax ?? Infinity];
    const soft = intersect(hard, [p.softMin ?? 0, p.softMax ?? Infinity]);
    return { id, ...p, hard, soft };
  });

  const warnings = [];
  let range = [f.min, f.max];
  let target = f.default;
  let basis = f.basis;
  if (steps !== undefined) {
    const stepFormats = Object.keys(specs.formats).filter((k) => specs.formats[k].perStep);
    if (!f.perStep) throw new Error(`--steps applies to step-by-step formats (${stepFormats.join(", ")}), not "${format}"`);
    if (!Number.isInteger(steps) || steps < 1) throw new Error("--steps takes a whole number of steps, 1 or more");
    const [lo, hi] = f.perStep;
    const extra = f.stepOverhead ?? 0;
    range = [steps * lo + extra, steps * hi + extra];
    target = steps * ((lo + hi) / 2) + extra;
    basis = `${steps} step${steps === 1 ? "" : "s"} at ${lo}-${hi} s each plus ${extra} s for the outcome and the recap; never padded`;
    if (target > f.max) warnings.push(`${steps} steps run past ${f.max} s: split it into chapters or several videos, one task each`);
  }
  const allowed = ps.reduce((r, p) => intersect(r, p.hard), [0, Infinity]);
  // A long-form format never goes whole into a short-video feed: those get a teaser instead.
  const squeezed = (p) => f.longForm && p.feed;
  const preferred = ps.some(squeezed) ? [1, 0] : ps.reduce((r, p) => intersect(r, p.soft), intersect(range, allowed));

  let length;
  if (!empty(preferred)) {
    const rec = snap(clamp(target, preferred));
    const options = [{ seconds: rec, label: "Recommended", why: basis }];
    const lo = snap(preferred[0]);
    const hi = snap(Math.min(preferred[1], range[1]));
    if (lo !== rec) options.push({ seconds: lo, label: "Short end", why: "the shortest length every chosen platform and the format support" });
    if (hi !== rec && hi !== lo && Number.isFinite(hi)) options.push({ seconds: hi, label: "Long end", why: "the longest length that still suits every chosen platform" });
    length = { mode: "single", options };
  } else {
    // No single length suits everyone: a master where the full format fits, cutdowns elsewhere.
    const fits = ps.filter((p) => !squeezed(p) && !empty(intersect(range, p.soft)));
    const masterRange = fits.reduce((r, p) => intersect(r, intersect(p.soft, p.hard)), range);
    const master = snap(clamp(target, empty(masterRange) ? range : masterRange));
    const cutdowns = ps
      .filter((p) => !fits.includes(p))
      .map((p) =>
        squeezed(p)
          ? { platform: p.id, seconds: snap(clamp(p.feedCutdown ?? p.soft[1], p.soft)), why: `a ${f.label.toLowerCase()} does not go whole into a short-video feed: a teaser that points to the full video` }
          : { platform: p.id, seconds: snap(clamp(Math.min(master, p.soft[1]), p.soft)), why: p.softNote ?? `${p.label} limit` },
      );
    if (!fits.length) warnings.push(`none of the chosen platforms carries a full ${f.label.toLowerCase()}; host the master on YouTube or the landing page and post the cutdowns`);
    length = { mode: "master+cutdowns", master: { seconds: master, hostedOn: fits.map((p) => p.id) }, cutdowns };
  }

  const deliverables = ps.map((p) => ({
    platform: p.id,
    label: p.label,
    aspect: p.aspect,
    otherAspects: p.aspects?.filter((a) => a !== p.aspect) ?? [],
    px: p.px,
    fps: Math.min(specs.grid.fps, p.fpsCap ?? specs.grid.fps),
    limit: Number.isFinite(p.hard[1]) ? `${p.hard[0] > 0 ? `${p.hard[0]}-` : "up to "}${p.hard[1]} s` : "no hard limit",
    safeZone: describeZone(specs.safeZones[p.safeZone ?? "titleSafe"]),
    mutedAutoplay: p.mutedAutoplay,
    note: p.softNote ?? null,
  }));

  // A player that shows an SRT in muted autoplay (YouTube) needs the SRT, not burned subtitles.
  const burn = ps.filter((p) => String(p.captions).includes("burned")).map((p) => p.label);
  const srt = ps.filter((p) => String(p.captions).includes("srt")).map((p) => p.label);
  const captions = [
    ...(burn.length ? [`burn captions in for ${burn.join(", ")}${ps.some((p) => p.mutedAutoplay && String(p.captions).includes("burned")) ? " (autoplays muted)" : ""}`] : []),
    ...(srt.length ? [`an SRT for ${srt.join(", ")}: the player shows it, so a voice's subtitles are not also burned into that master`] : []),
    // Only a step-by-step format keeps a quiet bed when nobody speaks; everything else is music-led.
    f.voice
      ? `caption-led (no voice): the lines are on-screen text, burned in by design; ${f.quietBed ? "the bed sits quiet, about -24 to -20 LUFS, so it never competes with reading the steps" : "the bed stays music-led at about -16 LUFS, its lift on the payoff"}`
      : "music-led (no voice): statement captions burned in, the bed carries the sound at about -16 LUFS with its lift on the payoff",
  ];

  const verifiedAge = (Date.parse(today) - Date.parse(specs.verified)) / 86400000;
  if (verifiedAge > 183) warnings.push(`platform specs were verified on ${specs.verified}, over 6 months before ${today}: re-check the official pages before shipping`);
  for (const p of ps) {
    const zone = specs.safeZones[p.safeZone];
    if (zone?.unverified) warnings.push(`${p.label} safe zone is approximate (${zone.source})`);
    if (p.mutedAutoplayUnverified) warnings.push(`${p.label} muted autoplay is unverified; captions cover it either way`);
  }
  if (f.loop) warnings.push("a loop carries no music, and its last frame must match the first in position and velocity");
  if (format === "app-store-preview") warnings.push("app store previews use in-app footage only; re-read Apple's app preview rules before submitting");

  return {
    format: { id: format, ...f },
    platforms: ps.map((p) => p.id),
    verified: specs.verified,
    length,
    deliverables,
    captions,
    voice: f.voice
      ? `this format usually carries a voiceover. ${process.env.ELEVENLABS_API_KEY ? "An AI voice key is set." : "No AI voice key is set: offer captions only (recommended), the user's own recording, or a draft machine voice."}`
      : "no voiceover by default: music bed and captions",
    hook: "state the key message in the first 3 s",
    warnings,
  };
}

function toText(r) {
  const lines = [`${r.format.label} for ${r.deliverables.map((d) => d.label).join(", ")} (specs verified ${r.verified})`, "", "Length:"];
  if (r.length.mode === "single") {
    r.length.options.forEach((o, i) => lines.push(`  ${i + 1}. ${o.seconds} s${o.label === "Recommended" ? " (Recommended)" : ` (${o.label.toLowerCase()})`}: ${o.why}`));
  } else {
    lines.push(`  Master ${r.length.master.seconds} s${r.length.master.hostedOn.length ? ` for ${r.length.master.hostedOn.join(", ")}` : ""}, plus cutdowns:`);
    for (const c of r.length.cutdowns) lines.push(`    ${c.platform}: ${c.seconds} s (${c.why})`);
  }
  lines.push("", "Deliverables:");
  for (const d of r.deliverables) {
    lines.push(`  ${d.label}: ${d.aspect} ${d.px.join("x")}, ${d.fps} fps, ${d.limit}${d.otherAspects.length ? `; also accepts ${d.otherAspects.join(", ")}` : ""}${d.mutedAutoplay ? "; autoplays muted" : ""}`);
    if (d.safeZone) lines.push(`    safe zone: ${d.safeZone}`);
    if (d.note) lines.push(`    ${d.note}`);
  }
  lines.push("", `Captions: ${r.captions.join("; ")}`, `Voice: ${r.voice}`, `Hook: ${r.hook}`);
  if (r.warnings.length) lines.push("", "Warnings:", ...r.warnings.map((w) => `  - ${w}`));
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const specs = loadSpecs();
  if (process.argv.includes("--list")) {
    for (const [id, fam] of Object.entries(specs.families)) {
      console.log(`${fam.label} (${id})`);
      for (const fid of fam.formats) console.log(`  ${fid}: ${specs.formats[fid].label}, ${specs.formats[fid].default} s (${specs.formats[fid].min}-${specs.formats[fid].max})`);
      console.log(`  platforms: ${fam.platforms.join(", ")}`);
    }
    process.exit(0);
  }
  try {
    const steps = arg("steps") === undefined ? undefined : Number(arg("steps"));
    const r = recommend(specs, { format: arg("format"), platforms: (arg("platforms") ?? "").split(",").filter(Boolean), steps, today: arg("today") });
    console.log(process.argv.includes("--json") ? JSON.stringify(r, null, 2) : toText(r));
  } catch (e) {
    console.error(`error: ${e.message}\nusage: node recommend.mjs --format=<id> --platforms=<id,id> [--steps=<n>] [--today=YYYY-MM-DD] [--json] | --list`);
    process.exit(2);
  }
}
