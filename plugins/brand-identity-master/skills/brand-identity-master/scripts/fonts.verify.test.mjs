import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import https from 'node:https';
import { readJson, SKILL_DIR } from './lib/cli.mjs';

const run = process.env.BRAND_NET === '1';
const fonts = readJson(path.join(SKILL_DIR, 'data', 'fonts.json'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': UA } }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

for (const f of fonts.families) {
  test(`${f.family}: weights and scripts exist on Google Fonts`, { skip: !run && 'set BRAND_NET=1 to check against Google Fonts' }, async () => {
    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${f.weights.join(';')}&display=swap`;
    const res = await get(url);
    assert.equal(res.status, 200, `${f.family} ${f.weights.join(',')}: HTTP ${res.status}`);
    for (const s of f.scripts) assert.match(res.body, new RegExp(`/\\* ${s} \\*/`), `${f.family} has no ${s} subset`);
  });
}
