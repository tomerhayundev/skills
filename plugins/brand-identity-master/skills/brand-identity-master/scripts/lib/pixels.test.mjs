import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyze, detectBackground } from './pixels.mjs';
import { deltaOk } from './color.mjs';
import { makeImage, fillRect, fillCircle, addNoise } from '../fixtures/draw.mjs';

const CLEAR = [0, 0, 0, 0];
const WHITE = [255, 255, 255, 255];
const GOLD = [201, 162, 75, 255];

test('a transparent ground is detected', () => {
  const img = makeImage(100, 100, CLEAR);
  fillCircle(img, 50, 50, 30, GOLD);
  assert.equal(detectBackground(img).kind, 'transparent');
});

test('a white ground is the background, never a brand colour, and its fringe is ignored', () => {
  const img = makeImage(120, 120, WHITE);
  fillCircle(img, 60, 60, 40, [230, 120, 30, 255]);
  const a = analyze(img);
  assert.equal(a.background.kind, 'solid');
  assert.equal(a.background.hex, '#FFFFFF');
  assert.equal(a.inks.length, 1);
  assert.ok(deltaOk(a.inks[0].hex, '#E6781E') < 0.02, a.inks[0].hex);
});

test('two colours keep their order and rough shares', () => {
  const img = makeImage(100, 100, CLEAR);
  fillRect(img, 0, 0, 70, 100, [30, 64, 175, 255]);
  fillRect(img, 70, 0, 100, 100, [16, 185, 129, 255]);
  const { inks } = analyze(img);
  assert.equal(inks.length, 2);
  assert.ok(deltaOk(inks[0].hex, '#1E40AF') < 0.02 && inks[0].share > 0.6);
  assert.ok(deltaOk(inks[1].hex, '#10B981') < 0.02);
});

test('compression-like noise does not split one colour into many', () => {
  const img = makeImage(100, 100, CLEAR);
  fillRect(img, 10, 10, 90, 90, [230, 120, 30, 255]);
  addNoise(img, 4);
  assert.equal(analyze(img).inks.length, 1);
});

test('gold on black: the black is the ground and gold the only ink', () => {
  const img = makeImage(100, 100, [11, 10, 9, 255]);
  fillCircle(img, 50, 50, 35, GOLD);
  const a = analyze(img);
  assert.equal(a.background.kind, 'solid');
  assert.equal(a.inks.length, 1);
  assert.ok(deltaOk(a.inks[0].hex, '#C9A24B') < 0.02);
});

test('stroke width is measured', () => {
  const img = makeImage(100, 100, CLEAR);
  fillRect(img, 10, 10, 90, 13, GOLD);
  fillRect(img, 10, 87, 90, 90, GOLD);
  fillRect(img, 10, 10, 13, 90, GOLD);
  fillRect(img, 87, 10, 90, 90, GOLD);
  assert.equal(analyze(img).shape.strokeMinPx, 3);
});

test('a symbol above a wordmark reads as two stacked parts; a disc is symmetric', () => {
  const img = makeImage(100, 100, CLEAR);
  fillCircle(img, 50, 25, 18, GOLD);
  fillRect(img, 10, 70, 90, 85, GOLD);
  const s = analyze(img).shape;
  assert.equal(s.parts, 2);
  assert.equal(s.split, 'stacked');
  assert.ok(s.mirrorX > 0.95);
});
