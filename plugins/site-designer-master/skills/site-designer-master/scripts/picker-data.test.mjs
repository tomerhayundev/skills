import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';
import { detectImageTools, IMAGE_TOOLS } from './picker.mjs';

const lib = (f) => readJson(path.join(SKILL_DIR, 'assets', 'library', f));
const pick = (f) => readJson(path.join(SKILL_DIR, 'assets', 'picker', f));

test('every motion demo belongs to one topic, and every topic has a name in both languages', () => {
  const topics = pick('dislikes.json').motionTopics;
  const strings = pick('strings.json');
  for (const e of lib('motion.json').entries) assert.ok(topics.includes(e.tags.topic), `${e.id}: ${e.tags.topic}`);
  for (const t of topics) for (const l of ['en', 'he']) assert.ok(strings[l].motionTopics[t], `${l} ${t}`);
});

test('every dislike that names an AI tell points at a real tell, and has words in both languages', () => {
  const tells = new Set(readJson(path.join(SKILL_DIR, 'assets', 'slop-catalogue.json')).tells.map((t) => t.id));
  const strings = pick('strings.json');
  const list = pick('dislikes.json').dislikes;
  assert.ok(list.length >= 8);
  for (const d of list) {
    if (d.tell) assert.ok(tells.has(d.tell), `${d.id}: ${d.tell}`);
    for (const l of ['en', 'he']) assert.ok(strings[l].dislikes[d.id]?.name && strings[l].dislikes[d.id]?.why, `${l} ${d.id}`);
  }
  assert.ok(list.filter((d) => d.ai).length >= 5, 'the common AI tells are marked so they start as avoided');
});

test('image tools are found by the name of their key, never its value, plus tools the session says it has', () => {
  const env = { GEMINI_API_KEY: 'placeholder-value', PATH: 'x' };
  const found = detectImageTools(env, ['image']);
  assert.ok(found.some((t) => t.id === 'gemini' && t.how === 'key'));
  assert.ok(found.some((t) => t.id === 'connected' && t.how === 'connected'));
  assert.equal(JSON.stringify(found).includes('placeholder-value'), false);
  assert.deepEqual(detectImageTools({}, []), []);
  assert.ok(IMAGE_TOOLS.every((t) => t.id && t.env.length));
});
