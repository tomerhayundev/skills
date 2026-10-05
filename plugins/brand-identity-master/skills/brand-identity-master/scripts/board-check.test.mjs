import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkBoard } from './board-check.mjs';
import { loadData } from './lib/brand.mjs';
import { sha256File } from './lib/cli.mjs';

const { fonts } = loadData();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-'));
fs.mkdirSync(path.join(dir, 'logo'));
fs.writeFileSync(path.join(dir, 'logo', 'original.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"/>');
fs.writeFileSync(path.join(dir, 'logo', 'other.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><g/></svg>');
const brand = { logo: { original: { sha256: sha256File(path.join(dir, 'logo', 'original.svg')) }, versions: {}, minSize: { screenPx: 48 } }, type: { script: 'latin' } };

const T = (over = {}) => ({ i: 0, parent: null, text: 'Palette', rect: { x: 100, y: 100, w: 120, h: 20 }, size: 17, weight: 400, color: 'rgb(244, 239, 230)', ground: { color: 'rgb(21, 18, 14)' }, family: 'Instrument Sans', dir: 'ltr', system: false, misuse: false, example: false, mockup: false, clipped: false, ...over });
const L = (over = {}) => ({ tag: 'img', src: 'logo/original.svg', natural: { w: 200, h: 100 }, box: { x: 0, y: 0, w: 200, h: 100 }, content: { x: 0, y: 0, w: 200, h: 100 }, misuse: false, mockup: false, ...over });
const M = (over = {}) => ({ file: path.join(dir, 'board.html'), doc: { width: 1600, height: 2000, viewport: 1600, dir: 'ltr', fonts: [] }, texts: [T()], logos: [L(), L({ misuse: true })], swatches: [{ declared: '#C9A24B', bg: 'rgb(201, 162, 75)', printed: ['#C9A24B'] }], blocks: [{ id: 'a', rect: { x: 0, y: 0, w: 1600, h: 500 } }, { id: 'b', rect: { x: 0, y: 600, w: 1600, h: 500 } }], ...over });
const codes = (m, b = brand) => checkBoard(m, b, { fonts }).filter((f) => f.level === 'fail').map((f) => f.code);

test('a clean board has no failures', () => {
  assert.deepEqual(codes(M()), []);
});

const cases = [
  ['a logo that is not an img', { logos: [L({ tag: 'div' })] }, 'LOGO_NOT_IMG'],
  ['a logo file that is not the original or a version', { logos: [L({ src: 'logo/other.svg' })] }, 'LOGO_CHANGED'],
  ['a logo as a data URI', { logos: [L({ src: 'data:image/png;base64,AAAA' })] }, 'LOGO_FILE'],
  ['a stretched logo', { logos: [L({ content: { x: 0, y: 0, w: 300, h: 100 } })] }, 'LOGO_DISTORTED'],
  ['a logo under its minimum size', { logos: [L({ content: { x: 0, y: 0, w: 40, h: 20 } })] }, 'LOGO_TOO_SMALL'],
  ['a swatch drawn in another colour', { swatches: [{ declared: '#C9A24B', bg: 'rgb(184, 145, 58)', printed: ['#C9A24B'] }] }, 'SWATCH_MISMATCH'],
  ['a printed code that is not the swatch', { swatches: [{ declared: '#C9A24B', bg: 'rgb(201, 162, 75)', printed: ['#C9A24C'] }] }, 'HEX_MISMATCH'],
  ['text that fails contrast', { texts: [T({ color: 'rgb(58, 52, 44)' })] }, 'CONTRAST'],
  ['text under 12 px', { texts: [T({ size: 9 })] }, 'TEXT_TOO_SMALL'],
  ['clipped text', { texts: [T({ clipped: true })] }, 'CLIPPED'],
  ['two texts on top of each other', { texts: [T(), T({ i: 1, text: 'Colour', rect: { x: 110, y: 104, w: 120, h: 20 } })] }, 'OVERLAP'],
  ['two blocks on top of each other', { blocks: [{ id: 'a', rect: { x: 0, y: 0, w: 1600, h: 500 } }, { id: 'b', rect: { x: 0, y: 400, w: 1600, h: 500 } }] }, 'BLOCK_OVERLAP'],
  ['text running off the page', { texts: [T({ rect: { x: 1580, y: 0, w: 80, h: 20 } })] }, 'OFF_PAGE'],
  ['a page wider than the window', { doc: { width: 1700, height: 2000, viewport: 1600, dir: 'ltr', fonts: [] } }, 'OFF_PAGE'],
  ['a font that failed to load', { doc: { width: 1600, height: 2000, viewport: 1600, dir: 'ltr', fonts: [{ family: 'Gloock', weight: '400', status: 'error' }] } }, 'FONT_FAILED'],
];

for (const [name, over, code] of cases) {
  test(`fails ${name} (${code})`, () => {
    assert.ok(codes(M(over)).includes(code), JSON.stringify(checkBoard(M(over), brand, { fonts })));
  });
}

test('a nested text inside its parent is not an overlap', () => {
  assert.deepEqual(codes(M({ texts: [T(), T({ i: 1, parent: 0, text: 'Gold', rect: { x: 110, y: 104, w: 40, h: 20 } })] })), []);
});

test('misuse tiles and mockups are exempt or softened', () => {
  const f = checkBoard(M({ logos: [L({ misuse: true, content: { x: 0, y: 0, w: 300, h: 100 } }), L({ mockup: true, content: { x: 0, y: 0, w: 30, h: 15 } })] }), brand, { fonts });
  assert.deepEqual(f.filter((x) => x.level === 'fail'), []);
  assert.ok(f.some((x) => x.code === 'LOGO_TOO_SMALL' && x.level === 'warn'));
});

test('a Hebrew brand needs a right-to-left page and a Hebrew font', () => {
  const he = { ...brand, type: { script: 'hebrew' } };
  const c = codes(M({ texts: [T({ text: 'פלטה', family: 'Gloock, serif' })] }), he);
  assert.ok(c.includes('RTL') && c.includes('RTL_FONT'));
  assert.deepEqual(codes(M({ doc: { width: 1600, height: 2000, viewport: 1600, dir: 'rtl', fonts: [] }, texts: [T({ text: 'פלטה', dir: 'rtl', family: '"Heebo", sans-serif' })] }), he), []);
});

test('a brand font the page never declares fails; an unused one warns', () => {
  const b = { ...brand, type: { script: 'latin', display: { family: 'Gloock' }, text: { family: 'Instrument Sans' } } };
  const f = checkBoard(M({ doc: { width: 1600, height: 2000, viewport: 1600, dir: 'ltr', fonts: [{ family: 'Instrument Sans', weight: '400', status: 'unloaded' }] } }), b, { fonts });
  assert.ok(f.some((x) => x.code === 'FONT_MISSING' && x.level === 'fail' && /Gloock/.test(x.message)));
  assert.ok(f.some((x) => x.code === 'FONT_NOT_LOADED' && x.level === 'warn'));
});

test('a detail figure may crop the original; an unknown font with Hebrew only warns', () => {
  assert.deepEqual(codes(M({ logos: [L({ detail: true, content: { x: 0, y: 0, w: 300, h: 60 } }), L({ misuse: true })] })), []);
  const he = { ...brand, type: { script: 'hebrew' } };
  const f = checkBoard(M({ doc: { width: 1600, height: 2000, viewport: 1600, dir: 'rtl', fonts: [] }, texts: [T({ text: 'פלטה', dir: 'rtl', family: 'Arial, sans-serif' })] }), he, { fonts });
  assert.ok(f.some((x) => x.code === 'RTL_FONT' && x.level === 'warn'));
  assert.ok(!f.some((x) => x.level === 'fail'));
});

test('a board over 4600 px tall gets a length warning; 4200 does not', () => {
  assert.ok(!checkBoard(M({ doc: { width: 1600, height: 4200, viewport: 1600, dir: 'ltr', fonts: [] } }), brand, { fonts }).some((x) => x.code === 'BOARD_LONG'));
  const f = checkBoard(M({ doc: { width: 1600, height: 4700, viewport: 1600, dir: 'ltr', fonts: [] } }), brand, { fonts });
  assert.ok(f.some((x) => x.code === 'BOARD_LONG' && x.level === 'warn'));
});

test('cards with the page ground and no edge warn that they melt into the page', () => {
  const f = checkBoard(M({ page: 'rgb(21, 18, 14)', cards: [{ cls: 'card', bg: 'rgb(21, 18, 14)', image: false, edge: false }, { cls: 'card', bg: 'rgb(201, 162, 75)', image: false, edge: false }] }), brand, { fonts });
  assert.ok(f.some((x) => x.code === 'CARD_BLENDS' && /1 card/.test(x.message)));
});

test('the original with a solid ground warns when a clear version exists, except in a detail crop', () => {
  const b = { ...brand, logo: { ...brand.logo, versions: { clear: { path: 'logo/clear.png', sha256: 'x' } } } };
  const f = checkBoard(M(), b, { fonts });
  assert.ok(f.some((x) => x.code === 'LOGO_BOXED' && x.level === 'warn'));
  assert.ok(!checkBoard(M({ logos: [L({ detail: true }), L({ misuse: true })] }), b, { fonts }).some((x) => x.code === 'LOGO_BOXED'));
  assert.ok(!checkBoard(M(), brand, { fonts }).some((x) => x.code === 'LOGO_BOXED'));
});

test('a pattern behind a logo fails; in a mockup it warns; away from the logo it passes', () => {
  const ring = { kind: 'pattern', cls: 'pattern p-stroke-rings', rect: { x: -40, y: -40, w: 300, h: 200 }, mockup: false };
  assert.ok(codes(M({ decor: [ring] })).includes('LOGO_CROWDED'));
  const f = checkBoard(M({ logos: [L({ mockup: true }), L({ misuse: true })], decor: [ring] }), brand, { fonts });
  assert.ok(f.some((x) => x.code === 'LOGO_CROWDED' && x.level === 'warn'));
  assert.ok(!checkBoard(M({ decor: [{ ...ring, rect: { x: 600, y: 0, w: 300, h: 200 } }] }), brand, { fonts }).some((x) => x.code === 'LOGO_CROWDED'));
  assert.ok(!checkBoard(M({ logos: [L({ proposed: true }), L({ misuse: true })], decor: [ring] }), brand, { fonts }).some((x) => x.code === 'LOGO_CROWDED'));
});
