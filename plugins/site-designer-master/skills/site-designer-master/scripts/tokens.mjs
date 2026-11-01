#!/usr/bin/env node
// Checks a site's tokens against the floors in assets/rules.json and writes them as CSS custom properties.
//   node tokens.mjs <tokens.json> --out=<dir>/tokens.css
// Exits 1 and writes nothing when a floor is broken; warnings are printed but do not stop the build.
import path from 'node:path';
import { SKILL_DIR, parseArgs, isMain, readJson, writeText } from './lib/cli.mjs';
import { contrast } from './lib/color.mjs';

export const MODES = ['persuade', 'operate', 'read', 'experience'];
const DENSE = new Set(['operate', 'read']);
// [foreground, background, floor key]: the pairs every site must pass.
const PAIRS = [
  ['ink', 'ground', 'CONTRAST_TEXT'], ['ink', 'surface', 'CONTRAST_TEXT'],
  ['ink-muted', 'ground', 'CONTRAST_TEXT'], ['ink-muted', 'surface', 'CONTRAST_TEXT'],
  ['accent-ink', 'accent', 'CONTRAST_TEXT'],
  ['focus', 'ground', 'CONTRAST_UI'], ['border', 'ground', null],
  ['danger', 'ground', 'CONTRAST_TEXT'], ['success', 'ground', 'CONTRAST_TEXT'], ['warning', 'ground', 'CONTRAST_TEXT'],
];
const COLOR_ROLES = ['ground', 'surface', 'surface-2', 'ink', 'ink-muted', 'border', 'accent', 'accent-ink', 'focus', 'danger', 'success', 'warning'];

const fmt = (n) => String(Math.round(n * 100) / 100);

export function validateTokens(tokens, rules) {
  const t = rules.thresholds;
  const errors = [];
  const warnings = [];
  if (!MODES.includes(tokens.mode)) errors.push(`mode ${tokens.mode} is not one of ${MODES.join(', ')}`);

  for (const s of tokens.space || []) if (s % t.SPACE_BASE_PX !== 0) errors.push(`space ${s} is not a multiple of ${t.SPACE_BASE_PX}`);

  const type = tokens.type || {};
  const min = DENSE.has(tokens.mode) ? t.SCALE_RATIO_MIN_DENSE : t.SCALE_RATIO_MIN;
  if (!(type.ratio >= min)) errors.push(`type ratio ${type.ratio} below ${min} for ${tokens.mode}`);
  const body = type.steps?.body;
  if (!(body >= t.BODY_MIN_PX)) errors.push(`body ${body}px below ${t.BODY_MIN_PX}px`);
  if (type.steps?.small < t.TEXT_MIN_PX) errors.push(`small ${type.steps.small}px below ${t.TEXT_MIN_PX}px`);
  if (type.leading?.body < t.LEADING_MIN) errors.push(`body leading ${type.leading.body} below ${t.LEADING_MIN}`);
  const families = type.families || [];
  const nonMono = families.filter((f) => f.role !== 'mono');
  if (nonMono.length > t.MAX_FAMILIES) errors.push(`${nonMono.length} families (max ${t.MAX_FAMILIES} plus one mono)`);

  const color = tokens.color || {};
  for (const role of COLOR_ROLES) if (!color[role]) errors.push(`color ${role} is missing`);
  for (const [fg, bg, key] of PAIRS) {
    if (!color[fg] || !color[bg] || !key) continue;
    const c = contrast(color[fg], color[bg]);
    if (c < t[key]) errors.push(`${fg} on ${bg} ${(Math.floor(c * 10) / 10).toFixed(1)}:1 below ${t[key]}`);
  }

  for (const z of Object.values(tokens.z || {})) if (!t.Z_SCALE.includes(z)) errors.push(`z ${z} not in scale ${t.Z_SCALE.join(',')}`);
  if ((tokens.radius || []).length > 3) warnings.push(`${tokens.radius.length} radius values (keep at most 3 for panels)`);
  return { ok: errors.length === 0, errors, warnings };
}

// The type scale from a body size and a ratio, kept inside the floors: small text never under the minimum, the
// display size capped (larger only as a deliberate giant-wordmark direction, set by hand in tokens.json).
export function scaleSteps(body, ratio, t) {
  const at = (n) => Math.round(body * ratio ** n);
  const h1 = at(3);
  return { display: Math.max(h1, Math.min(at(5), t.DISPLAY_MAX_PX)), h1, h2: at(2), h3: at(1), body, small: Math.max(t.TEXT_MIN_PX, Math.round(body / ratio)) };
}

const stack = (f) => `'${f.name}', ${f.fallback || 'sans-serif'}`;

export function tokensToCss(tokens) {
  const lines = [];
  (tokens.space || []).forEach((v, i) => lines.push(`--space-${i + 1}: ${v}px`));
  for (const [k, v] of Object.entries(tokens.type?.steps || {})) lines.push(`--step-${k}: ${v}px`);
  for (const [k, v] of Object.entries(tokens.type?.leading || {})) lines.push(`--leading-${k}: ${v}`);
  lines.push(`--type-ratio: ${tokens.type?.ratio}`);
  for (const f of tokens.type?.families || []) lines.push(`--font-${f.role}: ${stack(f)}`);
  for (const [k, v] of Object.entries(tokens.color || {})) lines.push(`--color-${k}: ${v}`);
  (tokens.radius || []).forEach((v, i) => lines.push(`--radius-${i + 1}: ${v}px`));
  for (const [k, v] of Object.entries(tokens.z || {})) lines.push(`--z-${k}: ${v}`);
  if (tokens.motion) for (const [k, v] of Object.entries(tokens.motion)) lines.push(`--motion-${k}: ${v}`);
  if (tokens.density) lines.push(`--density: ${tokens.density}`);
  return `:root {\n${lines.map((l) => `  ${l};`).join('\n')}\n}\n`;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || !args.out) {
    console.error('usage: node tokens.mjs <tokens.json> --out=<dir>/tokens.css');
    process.exit(2);
  }
  const tokens = readJson(file);
  const res = validateTokens(tokens, readJson(path.join(SKILL_DIR, 'assets', 'rules.json')));
  for (const w of res.warnings) console.log(`warn: ${w}`);
  if (!res.ok) {
    for (const e of res.errors) console.log(`fail: ${e}`);
    process.exit(1);
  }
  writeText(args.out, tokensToCss(tokens));
  console.log(`wrote ${args.out}`);
}
