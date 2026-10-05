import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SKILL_DIR } from './lib/cli.mjs';

const NEED = {
  'logo-read': ['## What the script measures', '## The read by eye', '## The five axes', '## Basis', '## Hard cases'],
  'brand-read': ['## Collect the brand\'s own words', '## Scope', '## Colours and fonts the site already uses', '## What goes into brand.json'],
  'brand-file': ['## identity', '## atmosphere', '## logo', '## color', '## type', '## shape', '## voice', '## copy', '## read'],
  board: ['## Blocks', '## Conventions the checks read', '## Layout', '## Sizes and space', '## The one bold move'],
  mockups: ['## Choosing', '## Building', '## Content'],
  patterns: ['## mark-tile', '## mark-crop', '## stroke-lines', '## stroke-rings', '## proportion-grid', '## detail-dots'],
  copy: ['## What the board may say', '## Text bars', '## Never'],
  checks: ['## Running them', '## board-check codes', '## facts-check codes'],
  rtl: ['## Page', '## Type', '## Layout', '## Mixed text'],
};

for (const [name, heads] of Object.entries(NEED)) {
  test(`references/${name}.md has its sections and fits`, () => {
    const t = fs.readFileSync(path.join(SKILL_DIR, 'references', `${name}.md`), 'utf8');
    const lines = t.split('\n').length;
    assert.ok(lines >= 40 && lines <= 160, `${lines} lines`);
    assert.match(t, /^# .+\n\n.+/);
    for (const h of heads) assert.ok(t.includes(h), h);
  });
}

test('checks.md explains every check code', () => {
  const t = fs.readFileSync(path.join(SKILL_DIR, 'references', 'checks.md'), 'utf8');
  for (const c of ['LOGO_NOT_IMG', 'LOGO_FILE', 'LOGO_CHANGED', 'LOGO_DISTORTED', 'LOGO_TOO_SMALL', 'SWATCH_MISMATCH', 'HEX_MISMATCH', 'TEXT_TOO_SMALL', 'CLIPPED', 'GROUND_UNKNOWN', 'CONTRAST', 'OVERLAP', 'BLOCK_OVERLAP', 'OFF_PAGE', 'FONT_FAILED', 'RTL', 'RTL_FONT', 'EMOJI', 'CLICHE', 'FACT_NUMBER', 'FACT_SINCE', 'UNSOURCED', 'EXAMPLE_UNMARKED']) assert.ok(t.includes(c), c);
});
