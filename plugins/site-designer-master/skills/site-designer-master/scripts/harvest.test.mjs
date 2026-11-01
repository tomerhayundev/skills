import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromSeed, colourClass, typeClass } from './harvest.mjs';

const seed = {
  id: 'x-one', name: 'Brand Name Here', url: 'https://one.example/', source: 'Some Gallery', kind: 'restaurant', score: 8.1,
  idea: 'Their own sentence about the idea that must never be copied.',
  mood: ['warm', 'editorial', 'calm'], archetype: 'fullbleed-media-overlay',
  hero: 'Their own long description of the hero.', type: 'A wedge-serif display at 96px and a grotesk sans at 16px for body.',
  colour: '#f4efe6 #1b1b1b #b4462e Warm paper ground with dark ink.', imagery: 'x', layout: 'Wide photo bands and a narrow text column, calm and airy.',
  sections: [{ role: 'intro' }, { role: 'menu' }], steal: 'x', media: 'x', motion: 'Slow fades on scroll, a pinned photo.',
};

test('a seed entry becomes ours: our words, our facets, no name, no copied prose', () => {
  const e = fromSeed(seed, '2026-11-01');
  assert.equal(e.id, 'x-one');
  assert.equal(e.shelf, 'sites');
  assert.equal(e.url, 'https://one.example/');
  assert.equal('title' in e, false);
  for (const theirs of [seed.name, seed.idea, seed.hero, seed.layout, seed.source]) assert.equal(JSON.stringify(e).includes(theirs), false, theirs);
  assert.match(e.description, /photo|video/i);
  assert.deepEqual(e.bestUse, ['brochure', 'photo or video-led first screen']);
  assert.equal(e.tags.family, 'fullbleed-media-overlay');
  assert.equal(e.tags.layout, 'full-bleed');
  assert.equal(e.tags.colour, 'light');
  assert.equal(e.tags.type, 'mixed');
  assert.deepEqual(e.tags.mood, ['warm', 'editorial', 'calm']);
  assert.equal(e.tags.motion, 2);
  assert.equal(e.tags.density, 2);
  assert.equal(e.preview, 'sites/x-one.webp');
  assert.equal(e.large, 'sites/x-one-large.webp');
  assert.equal(e.rights, 'pack');
});

test('colour and type classes come from the structured fields', () => {
  assert.equal(colourClass('#0a0a0a #f2f2f2 Black ground.'), 'dark');
  assert.equal(colourClass('#ffffff #ff2d55 #1fd1a5 #ffd400 #3b5bff Loud.'), 'colourful');
  assert.equal(colourClass('#e8eef7 #1c3b6e #4a6fa5 Blues.'), 'one-hue');
  assert.equal(typeClass('A monospace at 14px only.'), 'mono');
  assert.equal(typeClass('A tall condensed display face for titles.'), 'display');
  assert.equal(typeClass('A transitional serif throughout.'), 'serif');
  assert.equal(typeClass('A neo-grotesk sans for everything.'), 'sans');
});

test('an unknown archetype keeps a family of "other" and a neutral hint', () => {
  const e = fromSeed({ ...seed, archetype: 'other: a thing', kind: 'other' }, '2026-11-01');
  assert.equal(e.tags.family, 'other');
  assert.deepEqual(e.bestUse, ['brochure', 'a one-off idea']);
});
