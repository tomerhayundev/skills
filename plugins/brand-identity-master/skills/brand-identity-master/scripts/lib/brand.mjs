// Loads the skill's data and validates brand.json. Every rule here matches a line of references/brand-file.md.
import fs from 'node:fs';
import path from 'node:path';
import { hexToRgb, contrast, hexToOklch } from './color.mjs';
import { STEPS } from './palette.mjs';
import { sha256File, readJson, SKILL_DIR } from './cli.mjs';

export function loadData(skillDir = SKILL_DIR) {
  const d = (f) => readJson(path.join(skillDir, 'data', f));
  const dirs = d('directions.json');
  return {
    fonts: d('fonts.json'),
    directions: dirs.directions,
    recipes: dirs.recipes,
    labels: d('labels.json').labels,
    deliverables: d('deliverables.json').deliverables,
    cliches: d('banned-copy.json').cliches,
  };
}

const HEX = /^#[0-9A-F]{6}$/;
export const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const AXES = ['luxury', 'tech', 'warmth', 'energy', 'authority'];
const REQUIRED_ROLES = ['primary', 'neutralDark', 'neutralLight', 'surface', 'text'];
const SCRIPTS = ['latin', 'hebrew', 'arabic', 'cyrillic'];
const SECTIONS = ['version', 'identity', 'atmosphere', 'logo', 'color', 'type', 'shape', 'voice', 'copy', 'read'];

const words = (arr, lo, hi) => Array.isArray(arr) && arr.length >= lo && arr.length <= hi && arr.every((s) => typeof s === 'string' && s.trim());
export const clicheRe = (w) => new RegExp(`(^|[^a-z])${w.replace(/-/g, '[- ]')}([^a-z]|$)`, 'i');

export function validateBrand(brand, { brandDir, data = loadData() }) {
  const errors = [], warnings = [];
  const err = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });
  for (const k of SECTIONS) if (brand[k] === undefined) err('E_MISSING', `brand.json has no "${k}"`);
  if (errors.length) return { errors, warnings };
  const ids = data.directions.map((d) => d.id);
  const { identity: id, atmosphere: at, logo, color, type, shape, voice, copy } = brand;

  if (!id.name?.trim()) err('E_IDENTITY', 'identity.name is empty');
  if (!ids.includes(id.direction)) err('E_DIRECTION', `identity.direction "${id.direction}" is not one of ${ids.join(', ')}`);
  if (id.runnerUp != null && !ids.includes(id.runnerUp)) err('E_DIRECTION', `identity.runnerUp "${id.runnerUp}" is not a direction`);
  for (const a of AXES) if (!Number.isInteger(id.axes?.[a]) || id.axes[a] < 1 || id.axes[a] > 5) err('E_AXES', `identity.axes.${a} must be a whole number from 1 to 5`);
  for (const f of ['sector', 'audience', 'direction']) {
    const b = id.basis?.[f];
    if (!b || !['read', 'inferred'].includes(b.kind) || !b.from?.trim()) err('E_BASIS', `identity.basis.${f} needs kind (read or inferred) and from`);
  }

  if (!words(at.mood, 3, 5)) err('E_ATMOSPHERE', 'atmosphere.mood needs 3 to 5 words');
  if (!words(at.avoid, 3, 5)) err('E_ATMOSPHERE', 'atmosphere.avoid needs 3 to 5 words');
  if (!at.feelsLike?.trim() || at.feelsLike.trim().split(/\s+/).length > 30) err('E_ATMOSPHERE', 'atmosphere.feelsLike needs one sentence of at most 30 words');

  const abs = (p) => path.resolve(brandDir, p);
  if (!logo.original?.path || !fs.existsSync(abs(logo.original.path))) err('E_LOGO', `logo.original.path "${logo.original?.path}" does not exist`);
  else if (sha256File(abs(logo.original.path)) !== logo.original.sha256) err('E_LOGO_CHANGED', 'the logo file does not match logo.original.sha256: the original must stay byte for byte');
  for (const v of ['monoDark', 'monoLight', 'reversed']) {
    const ver = logo.versions?.[v];
    if (!ver?.path || !fs.existsSync(abs(ver.path))) err('E_LOGO_VERSION', `logo.versions.${v} is missing: run make-variants.mjs`);
    else if (sha256File(abs(ver.path)) !== ver.sha256) err('E_LOGO_VERSION', `logo.versions.${v} does not match its sha256`);
  }
  if (!(logo.clearSpace >= 0.1 && logo.clearSpace <= 2)) err('E_LOGO_RULES', 'logo.clearSpace must be between 0.1 and 2 (a share of the mark height)');
  if (!(Number.isInteger(logo.minSize?.screenPx) && logo.minSize.screenPx >= 16)) err('E_LOGO_RULES', 'logo.minSize.screenPx must be a whole number of at least 16');
  if (!(logo.minSize?.printMm >= 5)) err('E_LOGO_RULES', 'logo.minSize.printMm must be at least 5');
  if (!Array.isArray(logo.misuse) || logo.misuse.length < 3) err('E_LOGO_RULES', 'logo.misuse needs at least 3 items');

  const roles = color.roles || {};
  for (const r of REQUIRED_ROLES) if (!roles[r]) err('E_COLOR', `color.roles.${r} is missing`);
  let shareSum = 0;
  for (const [name, role] of Object.entries(roles)) {
    if (!HEX.test(role.hex || '')) { err('E_COLOR', `color.roles.${name}.hex must look like #A1B2C3 (uppercase)`); continue; }
    if (!role.name?.trim()) err('E_COLOR_NAME', `color.roles.${name} needs a descriptive name`);
    if (!['logo', 'site', 'derived'].includes(role.source)) err('E_COLOR', `color.roles.${name}.source must be logo, site or derived`);
    if (JSON.stringify(role.rgb) !== JSON.stringify(hexToRgb(role.hex))) err('E_COLOR', `color.roles.${name}.rgb does not match its hex`);
    if (!HEX.test(role.on || '')) err('E_COLOR', `color.roles.${name}.on must be an uppercase hex colour`);
    else {
      const real = contrast(role.hex, role.on);
      if (Math.abs(real - role.contrast) > 0.05) err('E_CONTRAST_VALUE', `color.roles.${name}.contrast says ${role.contrast}, but ${role.on} on ${role.hex} is ${real}`);
      if (real < 4.5) err('E_CONTRAST', `text on ${name} (${role.on} on ${role.hex}) is ${real}:1, under 4.5:1`);
    }
    if (role.share != null) shareSum += role.share;
  }
  if (shareSum > 1.01) err('E_COLOR', `colour shares add up to ${shareSum}, more than 1`);
  for (const r of ['text', 'neutralDark']) if (roles[r]?.hex === '#000000') err('E_PURE_BLACK', `color.roles.${r} is pure black; use a near-black tinted toward the brand`);
  for (const [scale, steps] of Object.entries(color.primitives || {})) {
    let prev = Infinity;
    for (const s of STEPS) {
      if (!HEX.test(steps[s] || '')) { err('E_SCALE', `color.primitives.${scale}.${s} is not an uppercase hex colour`); break; }
      const L = hexToOklch(steps[s])[0];
      if (L >= prev) err('E_SCALE', `color.primitives.${scale} does not get darker at step ${s}`);
      prev = L;
    }
  }
  for (const [name, hex] of Object.entries(color.dark || {})) if (!HEX.test(hex)) err('E_COLOR', `color.dark.${name} is not an uppercase hex colour`);
  for (const bg of logo.allowedBackgrounds || []) if (!roles[bg]) err('E_LOGO_RULES', `logo.allowedBackgrounds names "${bg}", which is not a colour role`);

  const fam = new Map(data.fonts.families.map((f) => [f.family, f]));
  const bundled = new Map(data.fonts.bundled.map((b) => [b.family, b]));
  if (!SCRIPTS.includes(type.script)) err('E_TYPE', `type.script must be one of ${SCRIPTS.join(', ')}`);
  for (const r of ['display', 'text', 'label']) {
    const t = type[r];
    if (!t) { err('E_TYPE', `type.${r} is missing`); continue; }
    const f = fam.get(t.family);
    if (!f) { err('E_FONT_UNKNOWN', `type.${r}.family "${t.family}" is not in data/fonts.json`); continue; }
    const bad = (t.weights || []).filter((w) => !f.weights.includes(w));
    if (!t.weights?.length || bad.length) err('E_FONT_WEIGHT', `type.${r}: weight ${bad.join(', ') || '(none)'} is not available for ${t.family}`);
    if (t.license !== f.license) err('E_FONT_LICENSE', `type.${r}.license must be ${f.license}`);
    if (!['google', 'bundled'].includes(t.source)) err('E_TYPE', `type.${r}.source must be google or bundled`);
    if (t.source === 'bundled') {
      const b = bundled.get(t.family);
      const have = new Set((b?.files || []).map((x) => x.weight));
      if (!b || (t.weights || []).some((w) => !have.has(w))) err('E_FONT_BUNDLED', `type.${r}: ${t.family} ${(t.weights || []).join(', ')} is not shipped in assets/fonts; use source "google"`);
    }
    if (r !== 'label' && !f.scripts.includes(type.script)) err('E_FONT_SCRIPT', `${t.family} does not cover ${type.script}`);
    if (!t.fallback?.trim()) err('E_TYPE', `type.${r}.fallback is missing`);
  }
  const paired = data.fonts.pairings.some((p) => p.directions.includes(id.direction) && p.display === type.display?.family && p.text === type.text?.family);
  if (!paired) warn('W_PAIRING', `${type.display?.family} with ${type.text?.family} is not a listed pairing of ${id.direction}; keep it only with a reason in type.display.why`);
  if (!(type.scale?.ratio >= 1.1 && type.scale.ratio <= 1.7)) err('E_TYPE', 'type.scale.ratio must be between 1.1 and 1.7');

  if (!data.recipes.includes(shape.pattern?.recipe)) err('E_SHAPE', `shape.pattern.recipe must be one of ${data.recipes.join(', ')}`);
  if (!(shape.radius >= 0)) err('E_SHAPE', 'shape.radius must be a number of px, 0 or more');
  if (!(shape.strokeWeight > 0)) err('E_SHAPE', 'shape.strokeWeight must be more than 0');
  if (!['round', 'square', 'butt'].includes(shape.iconStyle?.caps)) err('E_SHAPE', 'shape.iconStyle.caps must be round, square or butt');

  if (!words(voice.weAre, 3, 3) || !words(voice.weAreNot, 3, 3)) err('E_VOICE', 'voice.weAre and voice.weAreNot need exactly 3 each');
  if (!Array.isArray(voice.doSay) || voice.doSay.length < 2 || voice.doSay.length > 3 || voice.doSay.some((d) => !d.text?.trim() || !['url', 'user', 'example'].includes(d.source))) err('E_VOICE', 'voice.doSay needs 2 to 3 lines, each with text and source (url, user or example)');
  if (!words(voice.dontSay, 2, 3)) err('E_VOICE', 'voice.dontSay needs 2 to 3 lines');

  for (const [i, c] of (copy || []).entries()) {
    if (!c.text?.trim() || !['url', 'user', 'label', 'example'].includes(c.source)) err('E_COPY_SOURCE', `copy[${i}] needs text and source (url, user, label or example)`);
    if (c.source === 'url' && !/^https?:\/\//.test(c.url || '')) err('E_COPY_SOURCE', `copy[${i}] comes from a site but has no url`);
  }

  const strings = [];
  (function walk(v) { if (typeof v === 'string') strings.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); })(brand);
  if (strings.some((s) => EMOJI.test(s))) err('E_EMOJI', 'brand.json contains an emoji');
  const cl = data.cliches.find((w) => strings.some((s) => clicheRe(w).test(s)));
  if (cl) warn('W_CLICHE', `brand.json uses "${cl}", a copy cliche; keep it out of anything shown as the brand's voice`);
  return { errors, warnings };
}
