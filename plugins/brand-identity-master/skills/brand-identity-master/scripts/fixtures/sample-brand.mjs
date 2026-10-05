// A complete, valid brand for tests: a fictional boutique hotel with a gold ring-and-letter mark.
import fs from 'node:fs';
import path from 'node:path';
import { sha256File, writeJson } from '../lib/cli.mjs';
import { hexToRgb, contrast } from '../lib/color.mjs';
import { buildScale } from '../lib/palette.mjs';

export const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><circle cx="100" cy="100" r="80" fill="none" stroke="#C9A24B" stroke-width="6"/><path d="M100 50 L140 150 H122 L100 92 L78 150 H60 Z" fill="#C9A24B"/></svg>\n';

const ROLES = {
  primary: ['#C9A24B', 'Aurelle Gold', 'logo', '#15120E', 0.3],
  secondary: ['#7A6230', 'Antique Brass', 'derived', '#F4EFE6', 0.1],
  neutralDark: ['#15120E', 'Night Umber', 'derived', '#F4EFE6', null],
  neutralLight: ['#F4EFE6', 'Bone', 'derived', '#15120E', null],
  surface: ['#15120E', 'Night Umber', 'derived', '#F4EFE6', 0.6],
  text: ['#F4EFE6', 'Bone', 'derived', '#15120E', null],
};

export function sampleBrand() {
  return {
    version: 1,
    identity: {
      name: 'Aurelle',
      sector: 'boutique hotel',
      audience: 'Guests who choose quiet over spectacle',
      direction: 'quiet-luxury',
      runnerUp: 'trusted-authority',
      axes: { luxury: 5, tech: 1, warmth: 3, energy: 1, authority: 3 },
      basis: {
        sector: { kind: 'read', from: 'the about page' },
        audience: { kind: 'inferred', from: 'the about page and the serif monogram' },
        direction: { kind: 'inferred', from: 'gold on dark, a fine ring, a serif capital' },
      },
    },
    atmosphere: { mood: ['quiet', 'warm metal', 'unhurried'], avoid: ['loud', 'glossy', 'crowded'], feelsLike: 'A lamp left on in a quiet hall.' },
    logo: {
      original: { path: 'logo/original.svg', sha256: '', width: 200, height: 200 },
      versions: {},
      clearSpace: 0.25,
      minSize: { screenPx: 48, printMm: 12 },
      allowedBackgrounds: ['surface', 'primary', 'neutralLight'],
      misuse: ['Do not stretch the logo', 'Do not recolour it outside the palette', 'Do not place it on a busy ground'],
    },
    color: {
      roles: Object.fromEntries(Object.entries(ROLES).map(([k, [hex, name, source, on, share]]) => [k, { hex, name, source, rgb: hexToRgb(hex), on, contrast: contrast(hex, on), share }])),
      primitives: { primary: buildScale('#C9A24B'), neutral: buildScale('#15120E') },
    },
    type: {
      script: 'latin',
      display: { family: 'Gloock', weights: [400], fallback: 'Georgia, serif', source: 'bundled', license: 'OFL-1.1' },
      text: { family: 'Instrument Sans', weights: [400, 700], fallback: 'Arial, sans-serif', source: 'bundled', license: 'OFL-1.1' },
      label: { family: 'Instrument Sans', weights: [400], fallback: 'Arial, sans-serif', source: 'bundled', license: 'OFL-1.1' },
      scale: { ratio: 1.25, base: 17 },
    },
    shape: { radius: 2, strokeWeight: 1.5, pattern: { recipe: 'stroke-rings', params: { gap: 36 } }, iconStyle: { stroke: 1.5, caps: 'round' } },
    voice: {
      weAre: ['calm', 'precise', 'warm'],
      weAreNot: ['loud', 'salesy', 'cold'],
      doSay: [{ text: 'Your room is ready when you are.', source: 'example' }, { text: 'A small house for slow weekends.', source: 'url' }],
      dontSay: ['Unbeatable deals, book now!', 'Luxury like never before'],
      tone: { welcome: 'warm and brief', service: 'precise' },
    },
    copy: [{ text: 'A small house for slow weekends.', source: 'url', url: 'https://aurelle.example.test/about' }],
    read: { quotes: [{ text: 'A small house for slow weekends.', url: 'https://aurelle.example.test/about', scope: 'whole brand' }], inferred: ['audience', 'direction'] },
  };
}

export function writeSampleBrand(dir) {
  fs.mkdirSync(path.join(dir, 'logo'), { recursive: true });
  const logo = path.join(dir, 'logo', 'original.svg');
  fs.writeFileSync(logo, SAMPLE_SVG);
  const brand = sampleBrand();
  brand.logo.original.sha256 = sha256File(logo);
  for (const v of ['monoDark', 'monoLight', 'reversed', 'tint']) {
    const p = path.join(dir, 'logo', `${v}.svg`);
    fs.writeFileSync(p, SAMPLE_SVG);
    brand.logo.versions[v] = { path: `logo/${v}.svg`, sha256: sha256File(p) };
  }
  writeJson(path.join(dir, 'brand.json'), brand);
  return brand;
}
