#!/usr/bin/env node
// Builds the icons shelf: open-licence icon sets, each drawn as the same 12 glyphs on one sheet so sets can be
// compared fairly. Fetches the glyphs from the package CDN once (maintainer side), writes the sheets into
// assets/library/demos/icons/, the licences into NOTICE.md there, and the entries into icons.json.
//   node harvest-icons.mjs --library=<assets/library>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, writeJson } from './lib/cli.mjs';

const CDN = 'https://unpkg.com/';
const GLYPHS = ['home', 'search', 'menu', 'arrow', 'heart', 'person', 'cart', 'calendar', 'phone', 'mail', 'pin', 'settings'];
// id, package path template, the 12 names in GLYPHS order, licence, home page, description, family, mood, how it is drawn.
const SETS = [
  ['round-outline-a', 'lucide-static/icons/{n}.svg', ['house', 'search', 'menu', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'mail', 'map-pin', 'settings'], 'ISC', 'https://lucide.dev', 'Rounded outline icons with even 2px strokes', 'outline-rounded', ['friendly', 'clean'], 'stroke'],
  ['round-outline-b', '@tabler/icons/icons/outline/{n}.svg', ['home', 'search', 'menu-2', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'mail', 'map-pin', 'settings'], 'MIT', 'https://tabler.io/icons', 'Rounded outline icons on a 24px grid, slightly geometric', 'outline-rounded', ['clean', 'precise'], 'stroke'],
  ['regular-outline', '@phosphor-icons/core/assets/regular/{n}.svg', ['house', 'magnifying-glass', 'list', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'envelope', 'map-pin', 'gear'], 'MIT', 'https://phosphoricons.com', 'Soft outline icons with generous curves', 'outline-rounded', ['friendly', 'warm'], 'fill'],
  ['thin-outline', '@phosphor-icons/core/assets/thin/{n}-thin.svg', ['house', 'magnifying-glass', 'list', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'envelope', 'map-pin', 'gear'], 'MIT', 'https://phosphoricons.com', 'Hairline icons, very light and elegant', 'outline-thin', ['elegant', 'quiet'], 'fill'],
  ['solid-soft', '@phosphor-icons/core/assets/fill/{n}-fill.svg', ['house', 'magnifying-glass', 'list', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'envelope', 'map-pin', 'gear'], 'MIT', 'https://phosphoricons.com', 'Filled icons with soft corners', 'filled', ['friendly', 'bold'], 'fill'],
  ['outline-ui', 'heroicons/24/outline/{n}.svg', ['home', 'magnifying-glass', 'bars-3', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'envelope', 'map-pin', 'cog-6-tooth'], 'MIT', 'https://heroicons.com', 'Outline interface icons with 1.5px strokes', 'outline-rounded', ['clean', 'polished'], 'stroke'],
  ['solid-ui', 'heroicons/24/solid/{n}.svg', ['home', 'magnifying-glass', 'bars-3', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'envelope', 'map-pin', 'cog-6-tooth'], 'MIT', 'https://heroicons.com', 'Solid interface icons, compact and sturdy', 'filled', ['confident', 'clean'], 'fill'],
  ['simple-line', 'feather-icons/dist/icons/{n}.svg', ['home', 'search', 'menu', 'arrow-right', 'heart', 'user', 'shopping-cart', 'calendar', 'phone', 'mail', 'map-pin', 'settings'], 'MIT', 'https://feathericons.com', 'Simple line icons, the plainest of the outline sets', 'outline-rounded', ['minimal', 'calm'], 'stroke'],
  ['line-geometric', 'iconoir/icons/regular/{n}.svg', ['home', 'search', 'menu', 'arrow-right', 'heart', 'user', 'cart', 'calendar', 'phone', 'mail', 'map-pin', 'settings'], 'MIT', 'https://iconoir.com', 'Geometric line icons with a slightly hand-drawn ease', 'outline-rounded', ['playful', 'warm'], 'stroke'],
  ['classic-ui', 'bootstrap-icons/icons/{n}.svg', ['house', 'search', 'list', 'arrow-right', 'heart', 'person', 'cart', 'calendar', 'telephone', 'envelope', 'geo-alt', 'gear'], 'MIT', 'https://icons.getbootstrap.com', 'Classic interface icons, small and familiar', 'outline-sharp', ['precise', 'technical'], 'fill'],
  ['mobile-outline', 'ionicons/dist/svg/{n}.svg', ['home-outline', 'search-outline', 'menu-outline', 'arrow-forward-outline', 'heart-outline', 'person-outline', 'cart-outline', 'calendar-outline', 'call-outline', 'mail-outline', 'location-outline', 'settings-outline'], 'MIT', 'https://ionic.io/ionicons', 'Rounded outline icons drawn for phone apps', 'outline-rounded', ['friendly', 'soft'], 'fill'],
  ['system-outlined', '@material-symbols/svg-400/outlined/{n}.svg', ['home', 'search', 'menu', 'arrow_forward', 'favorite', 'person', 'shopping_cart', 'calendar_today', 'call', 'mail', 'location_on', 'settings'], 'Apache-2.0', 'https://fonts.google.com/icons', 'System outline icons with crisp corners', 'outline-sharp', ['technical', 'clean'], 'fill'],
  ['system-rounded', '@material-symbols/svg-400/rounded/{n}.svg', ['home', 'search', 'menu', 'arrow_forward', 'favorite', 'person', 'shopping_cart', 'calendar_today', 'call', 'mail', 'location_on', 'settings'], 'Apache-2.0', 'https://fonts.google.com/icons', 'System icons with rounded ends', 'outline-rounded', ['friendly', 'clean'], 'fill'],
  ['soft-outline', 'eva-icons/outline/svg/{n}.svg', ['home-outline', 'search-outline', 'menu-outline', 'arrow-forward-outline', 'heart-outline', 'person-outline', 'shopping-cart-outline', 'calendar-outline', 'phone-outline', 'email-outline', 'pin-outline', 'settings-outline'], 'MIT', 'https://akveo.github.io/eva-icons', 'Soft outline icons with round joins', 'outline-rounded', ['soft', 'friendly'], 'fill'],
  ['office-regular', '@fluentui/svg-icons/icons/{n}.svg', ['home_24_regular', 'search_24_regular', 'navigation_24_regular', 'arrow_right_24_regular', 'heart_24_regular', 'person_24_regular', 'cart_24_regular', 'calendar_ltr_24_regular', 'call_24_regular', 'mail_24_regular', 'location_24_regular', 'settings_24_regular'], 'MIT', 'https://github.com/microsoft/fluentui-system-icons', 'Light office-style outline icons', 'outline-rounded', ['calm', 'polished'], 'fill'],
  ['pixel', 'pixelarticons/svg/{n}.svg', ['home', 'search', 'menu', 'arrow-right', 'heart', 'user', 'cart', 'calendar', 'phone', 'mail', 'pin', 'sliders'], 'MIT', 'https://pixelarticons.com', 'Pixel icons on a 24px grid, retro', 'pixel', ['playful', 'retro'], 'fill'],
  ['dense-outline', '@mdi/svg/svg/{n}.svg', ['home-outline', 'magnify', 'menu', 'arrow-right', 'heart-outline', 'account-outline', 'cart-outline', 'calendar-outline', 'phone-outline', 'email-outline', 'map-marker-outline', 'cog-outline'], 'Apache-2.0', 'https://pictogrammers.com/library/mdi', 'Dense outline icons from a very large set', 'outline-sharp', ['technical', 'precise'], 'fill'],
];

function sheet(glyphs, mode) {
  const paint = mode === 'stroke' ? 'svg{fill:none;stroke:currentColor}' : 'svg{fill:currentColor}';
  return `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;block-size:100%}body{display:grid;place-items:center;background:#f4f1ec;color:#1d1b18}.g{display:grid;grid-template-columns:repeat(6,96px);gap:40px 56px}.g div{display:grid;place-items:center;block-size:96px}.g svg{inline-size:56px;block-size:56px}${paint}</style></head><body><div class="g">${glyphs.map((s) => `<div>${s}</div>`).join('')}</div></body></html>\n`;
}

export async function harvestIcons(libraryDir, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const demos = path.join(libraryDir, 'demos', 'icons');
  fs.mkdirSync(demos, { recursive: true });
  const entries = [];
  const notice = ['# Icon sets shown in the picker', '', 'Each sheet in this folder draws 12 unmodified glyphs from one open-licence icon set, fetched from its published package.', ''];
  for (const [id, tpl, names, licence, home, description, family, mood, mode] of SETS) {
    const glyphs = [];
    for (const n of names) {
      const r = await fetchImpl(CDN + tpl.replace('{n}', n)).catch(() => null);
      if (r && r.ok) glyphs.push((await r.text()).replace(/<\?xml[^>]*>/, '').replace(/<!--[\s\S]*?-->/g, '').trim());
    }
    if (glyphs.length < 10) { console.log(`skip ${id}: only ${glyphs.length} glyphs`); continue; }
    fs.writeFileSync(path.join(demos, `${id}.html`), sheet(glyphs, mode));
    notice.push(`- ${id}.html: ${home} (${licence}), package path ${tpl.split('/{n}')[0]}`);
    entries.push({ id: `icons-${id}`, shelf: 'icons', url: home, description: `${description}.`, bestUse: [family === 'pixel' ? 'playful and retro brands' : family === 'filled' ? 'bold brands and small sizes' : family === 'outline-thin' ? 'elegant brands at large sizes' : 'any interface'], tags: { family, mood, density: 3, motion: 0 }, licence, rights: 'pack', added: '2026-11-01', preview: `icons/icons-${id}.webp`, demo: `demos/icons/${id}.html` });
  }
  fs.writeFileSync(path.join(demos, 'NOTICE.md'), `${notice.join('\n')}\n`);
  writeJson(path.join(libraryDir, 'icons.json'), { shelf: 'icons', about: 'Open-licence icon sets, each drawn as the same 12 glyphs.', glyphs: GLYPHS, entries });
  return entries;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.library) { console.error('usage: node harvest-icons.mjs --library=<assets/library>'); process.exit(2); }
  const entries = await harvestIcons(path.resolve(args.library));
  console.log(`${entries.length} icon sets`);
}
