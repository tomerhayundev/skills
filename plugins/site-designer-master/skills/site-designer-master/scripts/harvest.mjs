#!/usr/bin/env node
// Builds the sites shelf from an open-licence studied-sites seed (MIT, credited in CREDITS.md). Only its
// structured fields are read (address, kind, layout type, mood words, type, colours, motion); every sentence in
// our entries is written here, never copied, and no site name is kept.
//   node harvest.mjs --seed=<sites.json> --out=<assets/library/sites.json> [--added=YYYY-MM-DD]
import path from 'node:path';
import { parseArgs, isMain, readJson, writeJson } from './lib/cli.mjs';
import { hexToRgb } from './lib/color.mjs';
import { hsl } from './meter/rules-slop.mjs';

const KIND = {
  'personal-portfolio': 'portfolio', 'studio-portfolio': 'portfolio', agency: 'portfolio', architecture: 'portfolio',
  'physical-product': 'shop', ecommerce: 'shop', fashion: 'shop',
  saas: 'saas', 'ai-product': 'saas', 'dev-tool': 'saas', 'consumer-app': 'saas', finance: 'saas',
  event: 'event', music: 'event', culture: 'content',
  restaurant: 'brochure', hospitality: 'brochure', 'real-estate': 'brochure', health: 'brochure', other: 'brochure',
};
// Per layout type: the facet value, our description of the first screen, and what it is best used for.
const ARCH = {
  'fullbleed-media-overlay': ['full-bleed', 'A full-bleed photo or video first screen with the type set over it', 'photo or video-led first screen'],
  'type-poster': ['editorial', 'Type as the picture: a poster-like first screen built from words', 'type-led page with few pictures'],
  'giant-wordmark': ['editorial', 'A giant name across the first screen', 'a strong name as the hero'],
  'immersive-webgl': ['full-bleed', 'An immersive 3D or shader scene as the first screen', 'a launch or a showpiece'],
  'centred-statement-media-below': ['centred', 'A short centred statement with a large picture below it', 'one strong product'],
  'product-object-centre': ['centred', 'One object in the centre, the product as the hero', 'one physical product'],
  'split-text-media': ['split', 'Words on one side, a picture on the other', 'one clear offer with a picture'],
  'collage-scatter': ['asymmetric', 'A playful scatter of pictures and words', 'many small pictures, a playful brand'],
  'bottom-anchored-type': ['asymmetric', 'A big picture with the headline anchored at the bottom edge', 'photo-led local business'],
  'left-statement-quiet': ['asymmetric', 'A quiet statement on the reading side with a lot of space', 'calm services'],
  'editorial-masthead': ['editorial', 'A magazine masthead over stories', 'long reading and stories'],
  'grid-index': ['grid', 'An index or grid of works from the first screen', 'many works or items'],
  'video-reel': ['full-bleed', 'A running reel as the first screen', 'film and motion work'],
  'illustration-led': ['asymmetric', 'An illustration that carries the first screen', 'an illustrated brand'],
};
const MOODS = new Set(['playful', 'warm', 'confident', 'technical', 'dark', 'editorial', 'cinematic', 'precise', 'calm', 'bold', 'quiet', 'nocturnal', 'friendly', 'tactile', 'loud', 'clean', 'minimal', 'soft', 'luxurious', 'restrained', 'graphic', 'polished', 'glossy', 'cool', 'stark', 'airy', 'witty', 'retro', 'raw', 'elegant']);

export function colourClass(text) {
  const cols = [...String(text).matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => { const [r, g, b] = hexToRgb(m[0]); return hsl({ r, g, b }); });
  if (!cols.length) return 'light';
  const ground = cols[0];
  if (ground.l < 0.25) return 'dark';
  const sat = cols.slice(1).filter((c) => c.s >= 0.3 && c.l > 0.15 && c.l < 0.85);
  const gap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const spread = sat.length > 1 ? Math.max(...sat.flatMap((a) => sat.map((b) => gap(a.h, b.h)))) : 0;
  if (sat.length >= 3 && spread > 60) return 'colourful';
  if (sat.length >= 2 && spread <= 30 && ground.s >= 0.25 && sat.every((c) => gap(c.h, ground.h) <= 30)) return 'one-hue';
  return 'light';
}

export function typeClass(text) {
  const t = String(text).toLowerCase();
  const serif = /(^|[^-])serif|slab|didone|transitional|wedge/.test(t.replace(/sans-serif/g, ''));
  const sans = /\bsans\b|grotesk|grotesque|geometric|neo-grotesk|humanist sans/.test(t);
  if (serif && sans) return 'mixed';
  if (serif) return 'serif';
  if (sans) return 'sans';
  if (/mono/.test(t)) return 'mono';
  if (/display|condensed|stencil|script/.test(t)) return 'display';
  return 'sans';
}

function motionLevel(text) {
  const t = String(text || '').toLowerCase();
  if (/webgl|three|shader|3d|particle/.test(t)) return 3;
  if (/fade|reveal|pinned|scroll|slide|parallax|marquee/.test(t)) return 2;
  if (/none|static|no motion|still/.test(t)) return 0;
  return 1;
}

function density(s) {
  const t = `${s.layout || ''} ${(s.mood || []).join(' ')}`.toLowerCase();
  if (/dense|grid|index|catalogue|packed|many/.test(t)) return 4;
  if (/airy|calm|quiet|minimal|restrained|spacious/.test(t)) return 2;
  return 3;
}

export function fromSeed(s, added) {
  const archKey = String(s.archetype || '').startsWith('other') ? 'other' : s.archetype;
  const [layout, first, hint] = ARCH[archKey] || ['asymmetric', 'A one-off first screen', 'a one-off idea'];
  const type = typeClass(s.type);
  const colour = colourClass(s.colour);
  const mood = (s.mood || []).filter((m) => MOODS.has(m)).slice(0, 4);
  const typeWords = { serif: 'serif type', sans: 'sans type', mixed: 'a serif and a sans together', mono: 'monospaced type', display: 'a display face' }[type];
  const colourWords = { light: 'on a light ground', dark: 'on a dark ground', colourful: 'in many colours', 'one-hue': 'in one hue' }[colour];
  return {
    id: s.id, shelf: 'sites', url: s.url,
    description: `${first}, ${typeWords} ${colourWords}${mood.length ? `; ${mood.slice(0, 2).join(' and ')}` : ''}.`,
    bestUse: [KIND[s.kind] || 'brochure', hint],
    tags: { family: archKey === 'other' || !ARCH[archKey] ? 'other' : archKey, mood, density: density(s), colour, type, layout, motion: motionLevel(s.motion), rtl: false },
    licence: 'view', rights: 'pack', added,
    preview: `sites/${s.id}.webp`, large: `sites/${s.id}-large.webp`,
  };
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.seed || !args.out) {
    console.error('usage: node harvest.mjs --seed=<sites.json> --out=<sites.json> [--added=YYYY-MM-DD]');
    process.exit(2);
  }
  const raw = readJson(args.seed);
  const list = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
  const added = args.added || new Date().toISOString().slice(0, 10);
  const entries = list.filter((s) => /^https?:\/\//.test(s.url || '')).map((s) => fromSeed(s, added));
  writeJson(path.resolve(args.out), { shelf: 'sites', about: 'Site inspirations: real sites from any field, described in our words. Pictures live in the pack.', entries });
  console.log(`${entries.length} entries written to ${args.out}`);
}
