import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexToRgb, rgbToHex, rgbToOklab, hexToOklch, oklchToHex, deltaOk, contrast, parseCssColor, blendOver, mixOklab } from './color.mjs';

test('hex and rgb round trip, uppercase out', () => {
  assert.deepEqual(hexToRgb('#c9a24b'), [201, 162, 75]);
  assert.equal(rgbToHex([201, 162, 75]), '#C9A24B');
  assert.throws(() => hexToRgb('gold'), /hex/);
});

test('contrast matches WCAG values', () => {
  assert.equal(contrast('#000000', '#FFFFFF'), 21);
  assert.equal(contrast('#777777', '#FFFFFF'), 4.48);
  assert.equal(contrast('#C9A24B', '#15120E'), 7.78);
});

test('OKLab of white is L 1 and a colour survives the OKLCH round trip', () => {
  assert.ok(Math.abs(rgbToOklab([255, 255, 255])[0] - 1) < 1e-3);
  const back = oklchToHex(hexToOklch('#C9A24B'));
  assert.ok(deltaOk(back, '#C9A24B') < 0.005, back);
});

test('oklchToHex brings an impossible chroma back into gamut', () => {
  assert.match(oklchToHex([0.7, 0.4, 150]), /^#[0-9A-F]{6}$/);
});

test('deltaOk is zero for the same colour and grows with difference', () => {
  assert.equal(deltaOk('#1E40AF', '#1E40AF'), 0);
  assert.ok(deltaOk('#1E40AF', '#60A5FA') > 0.25);
});

test('parseCssColor reads computed style colours', () => {
  assert.deepEqual(parseCssColor('rgb(201, 162, 75)'), { hex: '#C9A24B', alpha: 1 });
  assert.deepEqual(parseCssColor('rgba(0, 0, 0, 0)'), { hex: '#000000', alpha: 0 });
  assert.deepEqual(parseCssColor('rgb(201 162 75 / 0.5)'), { hex: '#C9A24B', alpha: 0.5 });
  assert.deepEqual(parseCssColor('#15120e'), { hex: '#15120E', alpha: 1 });
  assert.equal(parseCssColor('transparent'), null);
});

test('blendOver and mixOklab', () => {
  assert.equal(blendOver('#FFFFFF', 0.5, '#000000'), '#808080');
  assert.equal(mixOklab('#15120E', '#F4EFE6', 0), '#15120E');
  assert.equal(mixOklab('#15120E', '#F4EFE6', 1), '#F4EFE6');
});
