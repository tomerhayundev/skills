import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, buildScale, buildPalette, isNeutral, hueFamilies } from './palette.mjs';
import { hexToOklch, deltaOk, contrast } from './color.mjs';

test('a scale gets darker at every step and neighbours stay apart', () => {
  const s = buildScale('#C9A24B');
  let prev = Infinity;
  for (let i = 0; i < STEPS.length; i++) {
    const L = hexToOklch(s[STEPS[i]])[0];
    assert.ok(L < prev, `step ${STEPS[i]}`);
    if (i) assert.ok(deltaOk(s[STEPS[i]], s[STEPS[i - 1]]) >= 0.03);
    prev = L;
  }
});

test('gold on a dark ground: gold is primary and its text colour passes', () => {
  const { roles } = buildPalette([{ hex: '#C9A24B', share: 1 }], { ground: 'dark' });
  assert.equal(roles.primary.hex, '#C9A24B');
  assert.ok(roles.primary.contrast >= 4.5);
  assert.equal(roles.surface.hex, roles.neutralDark.hex);
  for (const r of Object.values(roles)) assert.ok(contrast(r.hex, r.on) >= 4.5, r.hex);
});

test('a saturated yellow gets dark text, a deep blue gets light text', () => {
  const y = buildPalette([{ hex: '#FFD400', share: 1 }]).roles.primary;
  assert.ok(hexToOklch(y.on)[0] < 0.4);
  const b = buildPalette([{ hex: '#1E40AF', share: 1 }]).roles;
  assert.equal(b.primary.on, b.neutralLight.hex);
});

test('two distinct blues become primary and secondary', () => {
  const { roles } = buildPalette([{ hex: '#1E40AF', share: 0.6 }, { hex: '#60A5FA', share: 0.4 }]);
  assert.equal(roles.secondary.hex, '#60A5FA');
});

test('a pure black logo never yields pure black or white roles, and says an accent is needed', () => {
  const { roles, notes } = buildPalette([{ hex: '#000000', share: 1 }]);
  for (const r of ['neutralDark', 'neutralLight', 'text', 'surface']) assert.ok(!['#000000', '#FFFFFF'].includes(roles[r].hex), r);
  assert.ok(notes.some((n) => /no chromatic colour/.test(n)));
  assert.ok(isNeutral('#000000'));
});

test('a site colour fills a missing secondary and is marked as from the site', () => {
  const { roles } = buildPalette([{ hex: '#C9A24B', share: 1 }], { siteColors: ['#2F4A3A'] });
  assert.deepEqual([roles.secondary.hex, roles.secondary.source], ['#2F4A3A', 'site']);
});

test('a dark slate wordmark is the dark neutral, not an accent, and tints the neutrals', () => {
  const { roles } = buildPalette([{ hex: '#18C29C', share: 0.47 }, { hex: '#2E5BFF', share: 0.28 }, { hex: '#0F172A', share: 0.24 }]);
  assert.equal(roles.neutralDark.hex, '#0F172A');
  assert.equal(roles.neutralDark.source, 'logo');
  assert.equal(roles.accent, undefined);
  assert.ok(Math.abs(hexToOklch(roles.neutralLight.hex)[2] - hexToOklch('#0F172A')[2]) < 20);
});

test('a logo of one hue family gets support colours; two families get none', () => {
  const one = buildPalette([{ hex: '#C9A24B', share: 1 }]);
  assert.equal(one.support.foils.length, 5);
  for (const f of one.support.foils) assert.ok(deltaOk(f.deep, '#C9A24B') > 0.15, f.deep);
  assert.ok(one.notes.some((n) => /one hue family/.test(n)));
  assert.equal(hueFamilies(['#6B3E26', '#E8833A']), 1);
  assert.ok(buildPalette([{ hex: '#6B3E26', share: 0.9 }, { hex: '#E8833A', share: 0.1 }]).support);
  assert.equal(buildPalette([{ hex: '#1E40AF', share: 0.6 }, { hex: '#E8833A', share: 0.4 }]).support, undefined);
});
