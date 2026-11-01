// Slop rules: the dated tells in assets/slop-catalogue.json, judged from probe-slop.js facts on the main pass.
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from '../lib/cli.mjs';

const CAT = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'assets', 'slop-catalogue.json'), 'utf8'));
const FONTS = new Set(CAT.overusedFonts.list.map((f) => f.toLowerCase()));
const COPY = [...CAT.copy.en, ...CAT.copy.he].map((s) => s.toLowerCase());
const BUTTONS = new Set([...CAT.buttonText.en, ...CAT.buttonText.he].map((s) => s.toLowerCase()));
const AI_HEX = new Set(CAT.aiHexes);

export function rgbOf(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str || '');
  if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r, g, b, a };
}
export function hsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let hh = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  hh *= 60;
  return { h: (hh + 360) % 360, s, l };
}
const hex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const violet = (c) => { const x = hsl(c); return x.h >= 244 && x.h <= 295 && x.s >= 0.4 && x.l > 0.25 && x.l < 0.85; };

// Shadows as [{ color, x, y, blur }]: the computed form puts the colour first.
export function parseShadows(str) {
  if (!str || str === 'none') return [];
  return str.split(/,(?![^(]*\))/).map((s) => {
    const color = rgbOf(s);
    const nums = s.replace(/rgba?\([^)]+\)/, '').trim().split(/\s+/).map(parseFloat).filter((n) => !Number.isNaN(n));
    return { color, x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0 };
  });
}

export function slopRules(f, { pass, brief }) {
  if (pass !== 'main' || !f.extra) return [];
  const x = f.extra;
  const out = [];
  const add = (id, detail, selector) => out.push({ id, detail, selector });

  for (const g of x.gradText || []) add('GRADIENT_TEXT', 'text filled with a gradient', g.sel);
  for (const g of x.gradients || []) {
    const stops = g.stops.map(rgbOf).filter((c) => c && c.a > 0.2);
    const sat = stops.filter((c) => hsl(c).s >= 0.25);
    let gap = 0;
    for (let i = 0; i < sat.length; i++) for (let j = i + 1; j < sat.length; j++) gap = Math.max(gap, hueGap(hsl(sat[i]).h, hsl(sat[j]).h));
    if (gap > 60) add('HUE_GRADIENT', `gradient stops ${Math.round(gap)} degrees of hue apart`, g.sel);
    if (stops.some(violet)) add('AI_PALETTE', 'violet-indigo gradient', g.sel);
  }
  for (const c of x.colors || []) {
    const rgb = rgbOf(c);
    if (rgb && AI_HEX.has(hex(rgb))) add('AI_PALETTE', `default indigo ${hex(rgb)} as a fill`);
  }
  let wide = 0;
  for (const s of x.shadows || []) {
    for (const sh of [...parseShadows(s.box), ...parseShadows(s.text)]) {
      if (sh.color && sh.x === 0 && sh.y === 0 && sh.blur >= 3 && hsl(sh.color).s >= 0.3 && sh.color.a > 0.15) { add('GLOW_SHADOW', `coloured glow ${sh.blur}px`, s.sel); break; }
    }
    if (s.border === 1 && parseShadows(s.box).some((sh) => sh.blur >= 20)) wide++;
  }
  if (wide >= 3) add('HAIRLINE_WIDE_SHADOW', `${wide} panels with a hairline and a wide shadow`);
  for (const c of x.nestedCards || []) add('NESTED_CARDS', `panel inside ${c.outer}`, c.inner);
  if ((x.iconTiles || 0) >= 3) add('ICON_TILE_ROW', `${x.iconTiles} icon tiles above headings`);
  for (const e of x.eyebrows || []) add('EYEBROW', `label "${e.text}" above a heading`, e.sel);

  const main = (f.text || []).filter((t) => t.inMain);
  const total = main.reduce((s, t) => s + t.chars, 0);
  const centred = main.filter((t) => t.align === 'center').reduce((s, t) => s + t.chars, 0);
  if (total > 200 && centred / total > 0.72) add('CENTRED_SHARE', `${Math.round((centred / total) * 100)}% of the text is centred`);

  const brand = new Set((brief?.brandFonts || []).map((s) => s.toLowerCase()));
  for (const fam of new Set((f.text || []).map((t) => t.family))) if (FONTS.has(fam.toLowerCase()) && !brand.has(fam.toLowerCase())) add('OVERUSED_FONT', `${fam} is on the overused list (reviewed ${CAT.overusedFonts.reviewed})`);
  for (const m of x.mixedHeadlines || []) add('MIXED_FONT_HEADLINE', `"${m.part}" set apart from its headline`, m.sel);

  const copy = (x.copy || '').toLowerCase();
  for (const phrase of COPY) if (copy.includes(phrase)) add('BANNED_COPY', `"${phrase}"`);
  const groups = {};
  for (const b of x.filled || []) (groups[b.group] ||= []).push(b.text);
  for (const [g, texts] of Object.entries(groups)) if (texts.length > 1) add('PRIMARY_PER_VIEW', `${texts.length} filled buttons: ${texts.join(' / ')}`, g);
  for (const b of x.buttons || []) if (BUTTONS.has(b.text.toLowerCase())) add('BUTTON_TEXT', `button says only "${b.text}"`, b.sel);
  return out;
}
