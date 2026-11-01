import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { SKILL_DIR, readJson } from './lib/cli.mjs';

const rules = () => readJson(path.join(SKILL_DIR, 'assets', 'rules.json'));

test('rules.json tests the five widths', () => {
  assert.deepEqual(rules().widths, [320, 375, 768, 1024, 1440]);
});

test('every rule has an area, a category, a severity and a date', () => {
  for (const [id, r] of Object.entries(rules().rules)) {
    assert.match(id, /^[A-Z0-9_]+$/, id);
    assert.ok(r.area, `${id} area`);
    assert.ok(['quality', 'slop'].includes(r.category), `${id} category`);
    assert.ok(['fail', 'warn'].includes(r.severity), `${id} severity`);
    assert.match(r.since, /^\d{4}-\d{2}-\d{2}$/, `${id} since`);
    assert.ok(r.source, `${id} source`);
  }
});

test('the floors carry the technical-system numbers', () => {
  const t = rules().thresholds;
  assert.deepEqual(t, {
    BODY_MIN_PX: 16, TEXT_MIN_PX: 13, UI_TEXT_MIN_PX: 11,
    CONTRAST_TEXT: 4.5, CONTRAST_LARGE: 3, CONTRAST_UI: 3,
    TARGET_MIN_PX: 24, TARGET_TOUCH_PX: 44, MEASURE_MAX_CH: 80,
    LEADING_MIN: 1.3, SCALE_RATIO_MIN: 1.25, SCALE_RATIO_MIN_DENSE: 1.2,
    CENTRED_SHARE_WARN: 0.72, SPACE_BASE_PX: 4,
    TRACKING_MIN_EM: -0.04, TRACKING_BODY_MAX_EM: 0.05,
    LCP_MS: 2500, CLS: 0.1, MAX_FAMILIES: 2, DISPLAY_MAX_PX: 96,
    Z_SCALE: [0, 10, 100, 200, 300, 400, 500],
  });
});
