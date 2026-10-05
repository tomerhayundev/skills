#!/usr/bin/env node
// Writes DESIGN.md, the readable companion of brand.json. Never edit DESIGN.md by hand.
import path from 'node:path';
import { parseArgs, isMain, readJson, writeText } from './lib/cli.mjs';
import { loadData } from './lib/brand.mjs';

const RECIPES = {
  'mark-tile': 'the mark repeated as a quiet tiled ground, in a tint of the surface',
  'mark-crop': 'an oversize crop of the mark, used as a frame or a corner',
  'stroke-lines': "parallel lines drawn at the logo's own stroke weight",
  'stroke-rings': "concentric rings drawn at the logo's own stroke weight",
  'proportion-grid': "a grid built from the logo's own proportions",
  'detail-dots': "a dot field sized from the logo's smallest detail",
};

const ROLE_WORDS = { primary: 'primary', secondary: 'secondary', accent: 'accent', neutralDark: 'dark neutral', neutralLight: 'light neutral', surface: 'surface, the main ground', text: 'text' };

function radiusWords(r) {
  if (r === 0) return 'squared-off corners';
  if (r <= 4) return 'crisp corners, barely softened';
  if (r <= 12) return 'gently rounded corners';
  return 'soft, pill-like corners';
}

const sentence = (s) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function designMd(brand, data) {
  const dir = (id) => data.directions.find((d) => d.id === id)?.name ?? id;
  const { identity: id, atmosphere: at, color, type, shape, logo, voice } = brand;
  const pattern = RECIPES[shape.pattern.recipe] ?? shape.pattern.recipe;
  const L = [];
  L.push(`# ${id.name}: design system`, '', 'Generated from brand.json by scripts/design-md.mjs. Change brand.json, then run it again.', '');
  L.push('## Visual theme', '', sentence(at.feelsLike), '', `**Mood:** ${at.mood.join(', ')}. **Avoid:** ${at.avoid.join(', ')}.`, '', `**Direction:** ${dir(id.direction)}${id.runnerUp ? ` (runner-up: ${dir(id.runnerUp)})` : ''}.`, '');
  L.push('### Key characteristics', '');
  L.push(`- Ground: ${color.roles.surface.name} (${color.roles.surface.hex}), text in ${color.roles.text.name} (${color.roles.text.hex}).`);
  L.push(`- Lines at ${shape.strokeWeight} px, taken from the logo's stroke; ${radiusWords(shape.radius)}.`);
  L.push(`- Pattern: ${pattern}.`);
  L.push(`- Type: ${type.display.family} for display, ${type.text.family} for text, scale ratio ${type.scale.ratio}.`, '');
  L.push('## Colour', '');
  for (const [name, r] of Object.entries(color.roles)) {
    const from = r.source === 'derived' ? 'the palette rules' : `the ${r.source}`;
    L.push(`- **${r.name} (${r.hex})**: ${ROLE_WORDS[name] ?? name}; text on it ${r.on} (${r.contrast}:1); from ${from}${r.share != null ? `; about ${Math.round(r.share * 100)}% of a layout` : ''}.${r.why ? ` ${sentence(r.why)}` : ''}`);
  }
  L.push('', '## Typography', '');
  for (const r of ['display', 'text', 'label']) {
    const t = type[r];
    L.push(`- ${r[0].toUpperCase() + r.slice(1)}: ${t.family} (${t.weights.join(', ')}), fallback ${t.fallback}; licence ${t.license}.${t.why ? ` ${sentence(t.why)}` : ''}`);
  }
  L.push('', `Each size is the one below it times ${type.scale.ratio}.`, '');
  L.push('## Shape and pattern', '', `- Corners: ${radiusWords(shape.radius)} (${shape.radius} px).`, `- Pattern: ${pattern}.`, `- Icons: outline, ${shape.iconStyle.stroke ?? shape.strokeWeight} px stroke, ${shape.iconStyle.caps} caps.`, '');
  L.push('## Logo', '', `- Clear space: ${logo.clearSpace} of the mark's height on every side.`, `- Minimum size: ${logo.minSize.screenPx} px wide on screen, ${logo.minSize.printMm} mm in print.`, `- Allowed grounds: ${logo.allowedBackgrounds.map((b) => color.roles[b]?.name ?? b).join(', ')}.`);
  for (const m of logo.misuse) L.push(`- ${sentence(m)}`);
  L.push('', '## Voice', '', `We are ${voice.weAre.join(', ')}. We are not ${voice.weAreNot.join(', ')}.`, '', 'Say:', ...voice.doSay.map((d) => `- "${d.text}"${d.source === 'example' ? ' (example)' : ''}`), '', "Don't say:", ...voice.dontSay.map((d) => `- "${d}"`), '');
  L.push('## Language to use', '', ...at.mood.map((m) => `- ${m}`), '');
  L.push('## Anti-patterns', '', ...at.avoid.map((a) => `- Anything ${a}.`), ...logo.misuse.map((m) => `- ${sentence(m)}`), '');
  return L.join('\n');
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const file = args._[0];
  if (!file || args.help) { console.log('Usage: node design-md.mjs brand/brand.json'); process.exit(file ? 0 : 1); }
  const out = path.join(path.dirname(path.resolve(file)), 'DESIGN.md');
  writeText(out, designMd(readJson(file), loadData()));
  console.log(`Wrote ${out}`);
}
