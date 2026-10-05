#!/usr/bin/env node
// Checks a rendered board from its measurements: the logo is unchanged, every swatch is true, every text passes
// contrast, nothing overlaps or runs off, fonts loaded, and right-to-left brands are set right to left.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, readJson, writeJson, sha256File } from './lib/cli.mjs';
import { parseCssColor, contrast, blendOver, deltaOk } from './lib/color.mjs';
import { loadData } from './lib/brand.mjs';

const RTL_CHARS = /[\u0590-\u05FF\u0600-\u06FF]/;
const overlapArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const short = (s) => (s.length > 40 ? s.slice(0, 40) + '...' : s);
const firstFamily = (stack) => (stack || '').split(',')[0].trim().replace(/["']/g, '');

export function checkBoard(m, brand, { fonts }) {
  const out = [];
  const add = (level, code, message, evidence) => out.push({ level, code, message, ...(evidence ? { evidence } : {}) });
  const pageDir = path.dirname(m.file);
  const allowed = new Set([brand.logo.original.sha256, ...Object.values(brand.logo.versions || {}).map((v) => v.sha256)]);
  const hashes = new Map();

  for (const l of m.logos) {
    const where = l.mockup ? 'in a mockup' : l.misuse ? 'in a misuse example' : 'on the board';
    if (l.tag !== 'img') { add('fail', 'LOGO_NOT_IMG', `A logo ${where} is a <${l.tag}>, not an <img> of the logo file`, { src: l.src }); continue; }
    const file = l.src && !/^data:/i.test(l.src) ? path.resolve(pageDir, decodeURI(l.src)) : null;
    if (!file || !fs.existsSync(file)) { add('fail', 'LOGO_FILE', `A logo ${where} does not point to a logo file next to the board`, { src: l.src && l.src.slice(0, 60) }); continue; }
    if (!hashes.has(file)) hashes.set(file, sha256File(file));
    if (!allowed.has(hashes.get(file))) add('fail', 'LOGO_CHANGED', `A logo ${where} uses a file that is neither the original nor a recorded version`, { src: l.src });
    // Misuse examples distort on purpose; detail figures crop the original to show one part of it.
    if (l.misuse || l.detail) continue;
    const level = l.mockup ? 'warn' : 'fail';
    const natural = l.natural.w / l.natural.h;
    const shown = l.content.w / l.content.h;
    if (Math.abs(shown / natural - 1) > 0.01) add(level, 'LOGO_DISTORTED', `A logo ${where} is shown at ratio ${shown.toFixed(3)}, not its own ${natural.toFixed(3)}`, { src: l.src });
    if (l.content.w + 0.5 < brand.logo.minSize.screenPx) add(level, 'LOGO_TOO_SMALL', `A logo ${where} is ${Math.round(l.content.w)} px wide, under its minimum of ${brand.logo.minSize.screenPx} px`, { src: l.src });
  }
  if (!m.logos.some((l) => l.misuse)) add('warn', 'MISUSE_MISSING', 'The board shows no "never do this" examples');

  for (const s of m.swatches) {
    const declared = s.declared.toUpperCase();
    const drawn = parseCssColor(s.bg)?.hex;
    if (drawn !== declared) add('fail', 'SWATCH_MISMATCH', `A swatch says ${declared} but is drawn as ${drawn}`);
    for (const p of s.printed) {
      const hex = /#[0-9A-F]{6}/i.exec(p)?.[0]?.toUpperCase();
      if (hex && hex !== declared) add('fail', 'HEX_MISMATCH', `The code ${hex} is printed on a swatch drawn as ${declared}`);
    }
    if (!s.printed.length) add('warn', 'HEX_MISSING', `The swatch ${declared} has no printed code`);
  }

  for (const t of m.texts) {
    if (t.misuse) continue;
    if (t.size < 12) add('fail', 'TEXT_TOO_SMALL', `Text at ${t.size} px is under 12 px: "${short(t.text)}"`);
    if (t.clipped) add('fail', 'CLIPPED', `Text is cut off by its box: "${short(t.text)}"`);
    if (t.ground.image) { add('warn', 'GROUND_UNKNOWN', `Text sits on a pattern or gradient with no data-ground: "${short(t.text)}"`); continue; }
    const fg = parseCssColor(t.color), bg = parseCssColor(t.ground.color);
    if (!fg || !bg) continue;
    const shown = fg.alpha < 1 ? blendOver(fg.hex, fg.alpha, bg.hex) : fg.hex;
    const ratio = contrast(shown, bg.hex);
    const need = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700) ? 3 : 4.5;
    if (ratio < need) add('fail', 'CONTRAST', `"${short(t.text)}" is ${ratio}:1 on its ground, under ${need}:1`, { color: shown, ground: bg.hex });
  }

  const visible = m.texts.filter((t) => !t.misuse);
  const byIndex = new Map(m.texts.map((t) => [t.i, t]));
  const isAncestor = (a, b) => { for (let p = b.parent; p != null; p = byIndex.get(p)?.parent ?? null) if (p === a.i) return true; return false; };
  for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
    const a = visible[i], b = visible[j];
    if (overlapArea(a.rect, b.rect) > 4 && !isAncestor(a, b) && !isAncestor(b, a)) add('fail', 'OVERLAP', `"${short(a.text)}" overlaps "${short(b.text)}"`);
  }
  for (let i = 0; i < m.blocks.length; i++) for (let j = i + 1; j < m.blocks.length; j++) {
    if (overlapArea(m.blocks[i].rect, m.blocks[j].rect) > 4) add('fail', 'BLOCK_OVERLAP', `Block "${m.blocks[i].id}" overlaps block "${m.blocks[j].id}"`);
  }

  // Cards that melt into the page: the same ground as the page and no edge to separate them.
  const pageHex = parseCssColor(m.page || '')?.hex;
  if (pageHex && m.cards) {
    const melt = m.cards.filter((k) => { const c = parseCssColor(k.bg); const clear = !c || c.alpha < 0.05; return !k.edge && !k.image && (clear || deltaOk(c.hex, pageHex) < 0.03); });
    if (melt.length) add('warn', 'CARD_BLENDS', `${melt.length} card(s) have the page's own ground and no edge, so they melt into the page: set them on a ground that contrasts with --page, or give them an outline`);
  }
  if (m.doc.height > 5600) add('warn', 'BOARD_LONG', `The board is ${Math.round(m.doc.height)} px tall; aim for 5200 or less: merge rows, cut a weak card or mockup`);
  if (m.doc.width > m.doc.viewport + 1) add('fail', 'OFF_PAGE', `The page is ${m.doc.width} px wide, wider than its ${m.doc.viewport} px window`);
  for (const t of visible) if (t.rect.x < -1 || t.rect.x + t.rect.w > m.doc.viewport + 1) add('fail', 'OFF_PAGE', `Text runs off the page: "${short(t.text)}"`);

  for (const f of m.doc.fonts || []) if (f.status === 'error') add('fail', 'FONT_FAILED', `The font ${f.family} ${f.weight} failed to load`);
  const declared = new Set((m.doc.fonts || []).map((f) => f.family));
  const loaded = new Set((m.doc.fonts || []).filter((f) => f.status === 'loaded').map((f) => f.family));
  for (const r of ['display', 'text']) {
    const fam = brand.type?.[r]?.family;
    if (!fam) continue;
    if (!declared.has(fam)) add('fail', 'FONT_MISSING', `The ${r} font ${fam} is never declared, so the board shows a fallback: put the link tokens.mjs prints in the <head>, or use a bundled pairing`);
    else if (!loaded.has(fam)) add('warn', 'FONT_NOT_LOADED', `The ${r} font ${fam} is declared but not used on the page`);
  }

  const rtl = ['hebrew', 'arabic'].includes(brand.type?.script);
  if (rtl && m.doc.dir !== 'rtl') add('fail', 'RTL', 'The brand reads right to left but the page is not dir="rtl"');
  const covers = new Map(fonts.families.map((f) => [f.family, f.scripts]));
  for (const t of visible) {
    if (!RTL_CHARS.test(t.text)) continue;
    if (t.dir !== 'rtl') add('fail', 'RTL', `Right-to-left text is set left to right: "${short(t.text)}"`);
    const fam = firstFamily(t.family);
    const script = /[\u0590-\u05FF]/.test(t.text) ? 'hebrew' : 'arabic';
    if (!covers.has(fam)) add('warn', 'RTL_FONT', `"${short(t.text)}" is set in ${fam}, which is not in data/fonts.json: check its ${script} letters by eye`);
    else if (!covers.get(fam).includes(script)) add('fail', 'RTL_FONT', `"${short(t.text)}" is set in ${fam}, which has no ${script}`);
  }
  return out;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help || typeof args.brand !== 'string') { console.log('Usage: node board-check.mjs brand/board.metrics.json --brand brand/brand.json'); process.exit(file ? 0 : 1); }
  const findings = checkBoard(readJson(file), readJson(args.brand), { fonts: loadData().fonts });
  const fails = findings.filter((f) => f.level === 'fail');
  writeJson(path.join(path.dirname(path.resolve(file)), 'board-check.json'), findings);
  for (const f of findings) console.log(`${f.level === 'fail' ? 'FAIL' : 'warn'} ${f.code}: ${f.message}`);
  console.log(`board-check: ${fails.length} failure(s), ${findings.length - fails.length} warning(s).`);
  process.exit(fails.length ? 1 : 0);
}
