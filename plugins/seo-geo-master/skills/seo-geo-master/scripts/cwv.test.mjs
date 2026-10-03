import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THRESHOLDS, rate, psiRun, cruxQuery, runCwv, cwvMarkdown, InputError } from './cwv.mjs';

// Fake keys are built at run time, so that no line of this file reads as a real credential to a scanner.
const GOOGLE_KEY_PREFIX = ['AI', 'za'].join('');
const fakeKey = rest => `${GOOGLE_KEY_PREFIX}${rest}`;

function fakeFetch({ lcps = [3000, 2000, 2500], cruxStatus = 200 } = {}) {
  let psiCalls = 0;
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (url.includes('pagespeedonline')) {
      const lcp = lcps[psiCalls++ % lcps.length];
      return { ok: true, status: 200, json: async () => ({ lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: lcp }, 'cumulative-layout-shift': { numericValue: 0.05 }, 'total-blocking-time': { numericValue: 150 } }, categories: { performance: { score: 0.91 } } } }) };
    }
    if (url.includes('chromeuxreport')) {
      if (cruxStatus !== 200) return { ok: false, status: cruxStatus, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2600 } }, interaction_to_next_paint: { percentiles: { p75: 180 } }, cumulative_layout_shift: { percentiles: { p75: '0.12' } } } } }) };
    }
    return { ok: false, status: 500, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

test('rates against the published thresholds', () => {
  assert.equal(rate('lcp', 2500), 'good');
  assert.equal(rate('lcp', 2600), 'needs improvement');
  assert.equal(rate('inp', 501), 'poor');
  assert.equal(rate('cls', 0.1), 'good');
  assert.equal(rate('cls', null), 'unknown');
});

test('lab is the median of PSI runs; field comes from CrUX when a key is set', async () => {
  const f = fakeFetch();
  const r = await runCwv({ url: 'https://shop.test/', runs: 3, cruxKey: 'k', psiKey: undefined, fetchImpl: f });
  assert.equal(r.lab.lcp, 2500);
  assert.equal(r.lab.runs, 3);
  assert.equal(r.ratings.lab.lcp, 'good');
  assert.equal(r.field.url.lcp, 2600);
  assert.equal(r.ratings.fieldUrl.lcp, 'needs improvement');
  assert.equal(r.ratings.fieldUrl.inp, 'good');
  assert.equal(r.ratings.fieldUrl.cls, 'needs improvement');
  assert.ok(f.calls.some(c => c.url.includes('chromeuxreport') && JSON.parse(c.init.body).origin === 'https://shop.test'));
  assert.match(cwvMarkdown(r), /\| LCP \| 2500 ms \(good\)/);
});

test('without a CrUX key the field data is skipped with a pointer; no data is reported honestly', async () => {
  const r = await runCwv({ url: 'https://shop.test/', runs: 1, cruxKey: undefined, fetchImpl: fakeFetch() });
  assert.match(r.field.skipped, /CRUX_API_KEY/);
  const none = await runCwv({ url: 'https://shop.test/', runs: 1, cruxKey: 'k', fetchImpl: fakeFetch({ cruxStatus: 404 }) });
  assert.equal(none.field.url.noData, true);
});

// ---- Beyond the brief ------------------------------------------------------------------------------

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const lighthouse = ({ lcp = 2500, cls = 0.05, tbt = 150, score = 0.91 } = {}) => ({
  lighthouseResult: {
    audits: { 'largest-contentful-paint': { numericValue: lcp }, 'cumulative-layout-shift': { numericValue: cls }, 'total-blocking-time': { numericValue: tbt } },
    categories: { performance: { score } },
  },
});
const cruxBody = (p75s = {}) => ({
  record: {
    metrics: Object.fromEntries(Object.entries({ largest_contentful_paint: p75s.lcp, interaction_to_next_paint: p75s.inp, cumulative_layout_shift: p75s.cls }).filter(([, v]) => v !== undefined).map(([k, v]) => [k, { percentiles: { p75: v } }])),
  },
});

// psi(i, url, init) answers the i-th PSI call, crux(url, init) every CrUX call. Either may throw.
function scripted({ psi = () => reply(200, lighthouse()), crux = () => reply(404, {}) } = {}) {
  const calls = [];
  let n = 0;
  const fn = async (url, init) => {
    calls.push({ url: String(url), init });
    return String(url).includes('pagespeedonline') ? psi(n++, String(url), init) : crux(String(url), init);
  };
  fn.calls = calls;
  fn.psiCalls = () => calls.filter(c => c.url.includes('pagespeedonline')).length;
  return fn;
}

const U = 'https://shop.test/';
const run = (opts, fetchImpl) => runCwv({ url: U, runs: 1, psiKey: undefined, cruxKey: undefined, fetchImpl, ...opts });

test('rate: edges belong to the better rating, and anything that is not a number is unknown, never good', () => {
  assert.deepEqual(THRESHOLDS, { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] });
  for (const [metric, value, want] of [
    ['lcp', 0, 'good'], ['lcp', 4000, 'needs improvement'], ['lcp', 4001, 'poor'],
    ['inp', 200, 'good'], ['inp', 500, 'needs improvement'],
    ['cls', 0.25, 'needs improvement'], ['cls', 0.2501, 'poor'], ['cls', '0.12', 'needs improvement'], ['cls', '0.1', 'good'],
  ]) assert.equal(rate(metric, value), want, `${metric} ${value}`);
  for (const v of ['', '  ', 'abc', NaN, Infinity, undefined, null, true, {}, []]) assert.equal(rate('lcp', v), 'unknown', String(v));
  for (const bad of ['ttfb', 'constructor', '__proto__']) assert.throws(() => rate(bad, 100), /unknown metric/);
});

test('the lab value is the median: the mean of the middle two for an even number of runs, and the PSI key rides in the query only when set', async () => {
  const f = fakeFetch({ lcps: [2000, 3000] });
  const r = await runCwv({ url: 'https://shop.test/a?x=1', runs: 2, psiKey: 'PSIKEY-PSIKEY', cruxKey: undefined, fetchImpl: f });
  assert.equal(r.lab.lcp, 2500);
  assert.equal(r.lab.cls, 0.05);
  assert.equal(r.lab.tbt, 150);
  assert.equal(r.lab.score, 0.91);
  const q = new URL(f.calls[0].url);
  assert.equal(q.origin + q.pathname, 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  assert.equal(q.searchParams.get('key'), 'PSIKEY-PSIKEY');
  assert.equal(q.searchParams.get('url'), 'https://shop.test/a?x=1');
  assert.equal(q.searchParams.get('strategy'), 'mobile');
  assert.equal(q.searchParams.get('category'), 'performance');
  const keyless = fakeFetch();
  await run({}, keyless);
  assert.ok(!keyless.calls[0].url.includes('key='));
  const blank = await runCwv({ url: U, runs: 1, psiKey: '   ', cruxKey: '', fetchImpl: keyless }); // blank keys are no keys
  assert.match(blank.field.skipped, /CRUX_API_KEY/);
  assert.ok(!keyless.calls.at(-1).url.includes('key='));
});

test('the strategy picks the CrUX form factor; the key stays out of the CrUX body; URL and origin are asked separately', async () => {
  for (const [strategy, formFactor] of [['mobile', 'PHONE'], ['desktop', 'DESKTOP']]) {
    const f = fakeFetch();
    const r = await run({ url: 'https://shop.test/p/1?x=2', strategy, cruxKey: 'CRUX-KEY-123' }, f);
    assert.equal(r.strategy, strategy);
    assert.equal(r.field.formFactor, formFactor);
    assert.equal(new URL(f.calls[0].url).searchParams.get('strategy'), strategy);
    const crux = f.calls.filter(c => c.url.includes('chromeuxreport'));
    assert.equal(crux.length, 2);
    for (const c of crux) {
      assert.equal(c.init.method, 'POST');
      assert.equal(new URL(c.url).searchParams.get('key'), 'CRUX-KEY-123');
      assert.ok(!c.init.body.includes('CRUX-KEY-123'));
      assert.equal(JSON.parse(c.init.body).formFactor, formFactor);
    }
    assert.deepEqual(crux.map(c => Object.keys(JSON.parse(c.init.body)).filter(k => k !== 'formFactor')).sort(), [['origin'], ['url']]);
    assert.ok(crux.some(c => JSON.parse(c.init.body).url === 'https://shop.test/p/1?x=2'));
  }
});

test('INP has no lab value: TBT is reported as a stand-in and is never labelled or rated as INP', async () => {
  const r = await run({ cruxKey: undefined }, fakeFetch());
  assert.ok(!('inp' in r.lab));
  assert.ok(!('inp' in r.ratings.lab));
  assert.ok(!('tbt' in r.ratings.lab));
  assert.match(r.lab.note, /stand-in/);
  const md = cwvMarkdown(r);
  assert.match(md, /INP \| no lab value/);
  const tbt = md.split('\n').find(l => l.startsWith('| TBT'));
  assert.match(tbt, /stand-in/);
  assert.match(tbt, /not INP/);
  assert.match(tbt, /150 ms/);
  const inp = md.split('\n').find(l => l.startsWith('| INP'));
  assert.doesNotMatch(inp, /150/);
});

test('PSI failures are said in words: HTTP errors with the API message, no lighthouseResult, a runtimeError, bad JSON, a network error, a timeout', async () => {
  assert.deepEqual(await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(500, { error: { message: 'Lighthouse returned error: FAILED_DOCUMENT_REQUEST.' } }) })), { error: 'PageSpeed Insights HTTP 500: Lighthouse returned error: FAILED_DOCUMENT_REQUEST.', status: 500 });
  assert.deepEqual(await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(503, null) })), { error: 'PageSpeed Insights HTTP 503', status: 503 });
  assert.match((await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(200, {}) }))).error, /without a lighthouseResult/);
  assert.match((await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(200, null) }))).error, /without a lighthouseResult/);
  assert.match((await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(200, { lighthouseResult: {} }) }))).error, /no metrics/);
  const rt = await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(200, { ...lighthouse(), lighthouseResult: { ...lighthouse().lighthouseResult, runtimeError: { code: 'NO_FCP', message: 'The page did not paint any content.' } } }) }));
  assert.match(rt.error, /Lighthouse could not test the page \(NO_FCP\): The page did not paint any content\./);
  assert.ok(!('lcp' in rt));
  const text = await psiRun(U, 'mobile', undefined, scripted({ psi: () => reply(200, { lighthouseResult: { runtimeError: 'boom' } }) }));
  assert.match(text.error, /could not test the page: boom/);
  const badJson = await psiRun(U, 'mobile', undefined, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
  assert.match(badJson.error, /without a lighthouseResult/);
  assert.match((await psiRun(U, 'mobile', undefined, async () => { throw new TypeError('fetch failed'); })).error, /PageSpeed Insights request failed: fetch failed/);
  const timeout = await psiRun(U, 'mobile', undefined, async () => { const e = new Error('The operation was aborted due to timeout'); e.name = 'TimeoutError'; throw e; });
  assert.match(timeout.error, /did not answer within \d+ s/);
  assert.ok(!('status' in timeout));
});

test('a PSI request carries a time limit', async () => {
  let signal;
  await psiRun(U, 'mobile', undefined, async (url, init) => { signal = init.signal; return reply(200, lighthouse()); });
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
  signal = undefined;
  await cruxQuery({ url: U, formFactor: 'PHONE' }, 'K'.repeat(12), async (url, init) => { signal = init.signal; return reply(404, {}); });
  assert.ok(signal instanceof AbortSignal);
});

test('every run failing leaves a lab error and no ratings; a refusal (400, 403, 429) is not repeated, a server error is retried by the next run', async () => {
  const down = scripted({ psi: () => reply(500, { error: { message: 'Backend Error' } }) });
  const r = await run({ runs: 3 }, down);
  assert.equal(down.psiCalls(), 3);
  assert.equal(r.lab.runs, 0);
  assert.equal(r.lab.requested, 3);
  assert.equal(r.lab.error, 'PageSpeed Insights HTTP 500: Backend Error');
  assert.equal(r.ratings.lab, null);
  assert.match(cwvMarkdown(r), /Lab data unavailable: PageSpeed Insights HTTP 500: Backend Error/);
  for (const status of [400, 403, 429]) {
    const refused = scripted({ psi: () => reply(status, { error: { message: 'Quota exceeded' } }) });
    const x = await run({ runs: 3 }, refused);
    assert.equal(refused.psiCalls(), 1, `HTTP ${status} is not repeated`);
    assert.match(x.lab.error, new RegExp(`HTTP ${status}: Quota exceeded`));
  }
  const flaky = scripted({ psi: i => (i === 0 ? reply(500, {}) : reply(200, lighthouse({ lcp: 2100 }))) });
  const ok = await run({ runs: 3 }, flaky);
  assert.equal(flaky.psiCalls(), 3);
  assert.equal(ok.lab.runs, 2);
  assert.equal(ok.lab.lcp, 2100);
});

test('some runs failing: the median uses the runs that worked, and the report says how many and why', async () => {
  const f = scripted({ psi: i => (i === 1 ? reply(200, { lighthouseResult: { runtimeError: { code: 'PROTOCOL_TIMEOUT', message: 'Timed out.' } } }) : reply(200, lighthouse({ lcp: i === 0 ? 3000 : 2000 }))) });
  const r = await run({ runs: 3 }, f);
  assert.equal(r.lab.runs, 2);
  assert.equal(r.lab.requested, 3);
  assert.equal(r.lab.lcp, 2500);
  assert.deepEqual(r.lab.errors, ['Lighthouse could not test the page (PROTOCOL_TIMEOUT): Timed out.']);
  const md = cwvMarkdown(r);
  assert.match(md, /median of 2 of 3 runs/);
  assert.match(md, /PROTOCOL_TIMEOUT/);
  const clean = await run({ runs: 3 }, fakeFetch());
  assert.ok(!('errors' in clean.lab));
  assert.match(cwvMarkdown(clean), /median of 3 runs/);
});

test('a metric Lighthouse did not measure is "not measured", never undefined or NaN', async () => {
  const partial = scripted({ psi: () => reply(200, { lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 2400 }, 'cumulative-layout-shift': { scoreDisplayMode: 'error' } }, categories: {} } }) });
  const r = await run({}, partial);
  assert.equal(r.lab.lcp, 2400);
  assert.equal(r.lab.cls, null);
  assert.equal(r.lab.tbt, null);
  assert.equal(r.lab.score, null);
  assert.equal(r.ratings.lab.cls, 'unknown');
  const md = cwvMarkdown(r);
  assert.match(md, /\| CLS \| not measured \|/);
  assert.match(md, /\| TBT.*not measured/);
  assert.match(md, /\| Performance score \| not measured \|/);
  assert.match(md, /\| LCP \| 2400 ms \(good\)/);
  const strings = scripted({ psi: () => reply(200, { lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: '2400' }, 'cumulative-layout-shift': { numericValue: 'abc' }, 'total-blocking-time': { numericValue: null } } } }) });
  const s = await run({}, strings);
  assert.equal(s.lab.lcp, 2400);
  assert.equal(s.lab.cls, null);
});

test('the performance score is shown out of 100 and CLS is not shown with floating-point noise', async () => {
  const f = scripted({ psi: i => reply(200, lighthouse({ cls: [0.0556, 0.0556000000001][i % 2], score: 0.9149999 })) });
  const md = cwvMarkdown(await run({ runs: 2 }, f));
  assert.match(md, /\| Performance score \| 91 \/ 100 \|/);
  assert.match(md, /\| CLS \| 0\.056 \(good\) \|/);
});

test('CrUX: no data (404, or a record with no metrics), a missing metric, and API errors are each said honestly', async () => {
  const key = 'CRUXKEY-0123456789';
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(404, { error: { message: 'chrome ux report data not found' } }) })), { noData: true });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(200, {}) })), { noData: true });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(200, cruxBody({})) })), { noData: true });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(200, cruxBody({ lcp: 2100, cls: '0.04' })) })), { lcp: 2100, inp: null, cls: 0.04 });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(200, cruxBody({ lcp: 'abc', inp: '', cls: null, })) })), { noData: true });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(403, { error: { message: 'Chrome UX Report API has not been used in project 1 before or it is disabled.' } }) })), { error: 'CrUX HTTP 403: Chrome UX Report API has not been used in project 1 before or it is disabled.', status: 403 });
  assert.deepEqual(await cruxQuery({ url: U }, key, scripted({ crux: () => reply(400, null) })), { error: 'CrUX HTTP 400', status: 400 });
  assert.match((await cruxQuery({ url: U }, key, async () => { throw new TypeError('fetch failed'); })).error, /CrUX request failed: fetch failed/);
  assert.match((await cruxQuery({ url: U }, key, async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad json'); } }))).error, /could not be read/);
});

test('a low-traffic origin often has no INP: the report says INP is not reported and rates it unknown', async () => {
  const f = scripted({ crux: (url, init) => (JSON.parse(init.body).origin ? reply(200, cruxBody({ lcp: 2300, cls: '0.02' })) : reply(404, {})) });
  const r = await run({ cruxKey: 'CRUX-KEY-123' }, f);
  assert.equal(r.field.url.noData, true);
  assert.equal(r.field.origin.inp, null);
  assert.equal(r.ratings.fieldUrl, null);
  assert.deepEqual(r.ratings.fieldOrigin, { lcp: 'good', inp: 'unknown', cls: 'good' });
  const md = cwvMarkdown(r);
  assert.match(md, /Field \(URL\)[^\n]*not enough real-user data/);
  assert.match(md, /Field \(origin\)[^\n]*LCP 2300 ms \(good\)[^\n]*INP not reported[^\n]*CLS 0\.02 \(good\)/);
  assert.doesNotMatch(md, /INP null|INP undefined/);
});

test('CrUX with no data for both URL and origin points to Search Console', async () => {
  const md = cwvMarkdown(await run({ cruxKey: 'CRUX-KEY-123' }, scripted({ crux: () => reply(404, {}) })));
  assert.match(md, /Field \(URL\)[^\n]*not enough real-user data/);
  assert.match(md, /Field \(origin\)[^\n]*not enough real-user data/);
  assert.match(md, /Search Console/);
});

test('a CrUX error is reported for URL and origin and does not hide the lab data', async () => {
  const r = await run({ cruxKey: 'CRUX-KEY-123' }, scripted({ crux: () => reply(403, { error: { message: 'API key not valid. Please pass a valid API key.' } }) }));
  assert.equal(r.lab.runs, 1);
  assert.equal(r.field.url.error, 'CrUX HTTP 403: API key not valid. Please pass a valid API key.');
  assert.equal(r.ratings.fieldUrl, null);
  const md = cwvMarkdown(r);
  assert.match(md, /Field \(URL\): CrUX HTTP 403/);
  assert.match(md, /\| LCP \| 2500 ms \(good\)/);
});

test('the Markdown names the lab and field data, the thresholds, and that field data is what Google uses', async () => {
  const md = cwvMarkdown(await run({ cruxKey: 'CRUX-KEY-123' }, fakeFetch()));
  assert.match(md, /^# Core Web Vitals: https:\/\/shop\.test\/ \(mobile\)/);
  assert.match(md, /LCP 2\.5 s/);
  assert.match(md, /INP 200 ms/);
  assert.match(md, /CLS 0\.1/);
  assert.match(md, /Google uses/);
  assert.match(md, /Field \(URL\)[^\n]*LCP 2600 ms \(needs improvement\)[^\n]*INP 180 ms \(good\)[^\n]*CLS 0\.12 \(needs improvement\)/);
  assert.ok(md.endsWith('\n'));
});

test('the Markdown never prints undefined, NaN, null or [object Object], whatever the APIs answer', async () => {
  const scenarios = {
    ok: fakeFetch(),
    allDown: scripted({ psi: () => reply(500, {}), crux: () => reply(500, {}) }),
    throws: scripted({ psi: () => { throw new Error('x'); }, crux: () => { throw new Error('y'); } }),
    empty: scripted({ psi: () => reply(200, {}), crux: () => reply(200, {}) }),
    nulls: scripted({ psi: () => reply(200, { lighthouseResult: { audits: { 'largest-contentful-paint': null, 'total-blocking-time': { numericValue: 12 } } } }), crux: () => reply(200, { record: { metrics: { largest_contentful_paint: null, interaction_to_next_paint: { percentiles: null }, cumulative_layout_shift: { percentiles: { p75: 'x' } } } } }) }),
    weird: scripted({ psi: () => reply(200, { lighthouseResult: { audits: [], categories: 7, runtimeError: { code: null } } }), crux: () => reply(200, { record: [] }) }),
    inpOnly: scripted({ crux: () => reply(200, cruxBody({ inp: 350 })) }),
  };
  for (const [name, f] of Object.entries(scenarios)) {
    for (const cruxKey of [undefined, 'CRUX-KEY-123']) {
      const r = await run({ cruxKey, runs: 2 }, f);
      const md = cwvMarkdown(r);
      assert.doesNotMatch(md, /undefined|NaN|\bnull\b|\[object/, `${name} ${cruxKey}\n${md}`);
      JSON.parse(JSON.stringify(r));
    }
  }
});

test('keys never reach the result, the Markdown or an error, even when the network or the API echoes them back', async () => {
  const PSI = fakeKey('PSI-secret-0123456789abcdefghijklmn');
  const CRUX = fakeKey('CRUX-secret-0123456789abcdefghijklm');
  const variants = {
    ok: scripted({ crux: () => reply(200, cruxBody({ lcp: 1000 })) }),
    networkErrorsWithTheUrl: scripted({ psi: (i, url) => { throw new Error(`connect ECONNREFUSED while fetching ${url}`); }, crux: url => { throw new Error(`proxy refused ${url}`); } }),
    apiEchoesTheKey: scripted({
      psi: () => reply(403, { error: { message: `API key not valid: ${PSI}. Request was https://www.googleapis.com/x?url=a&key=${PSI}&strategy=mobile` } }),
      crux: () => reply(403, { error: { message: `bad key ${CRUX} (key=${encodeURIComponent(CRUX)}), x-goog-api-key: ${CRUX}` } }),
    }),
    runtimeErrorEchoes: scripted({ psi: () => reply(200, { lighthouseResult: { runtimeError: { code: 'X', message: `see ?key=${PSI}` } } }) }),
  };
  for (const [name, f] of Object.entries(variants)) {
    const r = await runCwv({ url: U, runs: 2, psiKey: PSI, cruxKey: CRUX, fetchImpl: f });
    const out = `${JSON.stringify(r)}\n${cwvMarkdown(r)}`;
    assert.ok(!out.includes(PSI) && !out.includes(CRUX), name);
    assert.ok(!/AIza|[?&]key=(?!\[key\])/i.test(out), `${name}\n${out}`);
    assert.ok(f.calls.some(c => c.url.includes(`key=${PSI}`)), `${name}: the PSI key is sent`); // the test is not vacuous
    assert.ok(f.calls.some(c => c.url.includes('chromeuxreport') && c.url.includes(`key=${CRUX}`)), `${name}: the CrUX key is sent`);
    for (const direct of [await psiRun(U, 'mobile', PSI, f), await cruxQuery({ url: U }, CRUX, f)]) assert.ok(!JSON.stringify(direct).includes('AIza'), name);
  }
  const r = await runCwv({ url: U, runs: 1, psiKey: PSI, cruxKey: CRUX, fetchImpl: variants.apiEchoesTheKey });
  assert.match(r.lab.error, /^PageSpeed Insights HTTP 403: API key not valid: \[key\]\./);
  assert.match(r.field.url.error, /bad key \[key\]/);
});

test('a short test key is not replaced inside ordinary words, but a key= value in a message is always hidden', async () => {
  const f = scripted({ crux: () => reply(403, { error: { message: 'API key not valid' } }) });
  const r = await run({ cruxKey: 'k' }, f);
  assert.equal(r.field.url.error, 'CrUX HTTP 403: API key not valid');
  const g = scripted({ crux: url => { throw new Error(`failed: ${url}`); } });
  const x = await run({ cruxKey: 'k' }, g);
  assert.match(x.field.url.error, /records:queryRecord\?key=\[key\]$/);
});

test('only http(s) URLs are accepted, without credentials and not on this machine; runs and strategy are checked before anything is fetched', async () => {
  const f = fakeFetch();
  const bad = ['ftp://shop.test/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'shop.test/x', '', '   ', undefined, null, 42, 'https://', 'http://', 'https://user:hunter2@shop.test/', 'https://:hunter2@shop.test/'];
  for (const url of bad) {
    await assert.rejects(() => runCwv({ url, runs: 1, fetchImpl: f }), e => e instanceof InputError && e instanceof TypeError && !/hunter2/.test(e.message), String(url));
  }
  for (const url of ['http://localhost:3000/', 'http://127.0.0.1/', 'http://[::1]:8080/', 'http://app.localhost/']) {
    await assert.rejects(() => runCwv({ url, runs: 1, fetchImpl: f }), e => e instanceof InputError && /localhost|this machine|cannot reach/i.test(e.message), url);
  }
  for (const runs of [0, -1, 1.5, '3', NaN, 11, null]) await assert.rejects(() => runCwv({ url: U, runs, fetchImpl: f }), e => e instanceof InputError && /runs/.test(e.message), String(runs));
  for (const strategy of ['tablet', 'Mobile', '', null]) await assert.rejects(() => runCwv({ url: U, strategy, fetchImpl: f }), e => e instanceof InputError && /mobile or desktop/.test(e.message), String(strategy));
  assert.equal(f.calls.length, 0);
  const ok = await run({ url: 'HTTPS://Shop.Test' }, fakeFetch());
  assert.equal(ok.url, 'https://shop.test/');
});

test('without options the keys come from the environment; an explicit undefined means no key', async () => {
  const ENV_PSI = 'ENV-PSI-7';
  const ENV_CRUX = 'ENV-CRUX-7';
  const had = { psi: process.env.PSI_API_KEY, crux: process.env.CRUX_API_KEY };
  process.env.PSI_API_KEY = ENV_PSI;
  process.env.CRUX_API_KEY = ENV_CRUX;
  try {
    const f = fakeFetch();
    const fromEnv = await runCwv({ url: U, runs: 1, fetchImpl: f });
    assert.ok(f.calls[0].url.includes(`key=${ENV_PSI}`));
    assert.ok(f.calls.some(c => c.url.includes('chromeuxreport') && c.url.includes(`key=${ENV_CRUX}`)));
    assert.ok(!fromEnv.field.skipped);
    const g = fakeFetch();
    const none = await runCwv({ url: U, runs: 1, psiKey: undefined, cruxKey: undefined, fetchImpl: g });
    assert.ok(!g.calls[0].url.includes('key='));
    assert.match(none.field.skipped, /CRUX_API_KEY/);
    assert.ok(!(`${JSON.stringify(fromEnv)}${cwvMarkdown(fromEnv)}`).includes('ENV-'));
  } finally {
    for (const [name, v] of [['PSI_API_KEY', had.psi], ['CRUX_API_KEY', had.crux]]) { if (v === undefined) delete process.env[name]; else process.env[name] = v; }
  }
});

// ---- The command line, with the network replaced by a preloaded fake fetch -------------------------

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cwv.mjs');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cwv-'));
after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
const preload = path.join(sandbox, 'fake-fetch.mjs');
fs.writeFileSync(preload, `
const mode = process.env.FAKE_CWV || 'ok';
const body = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => json });
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  const key = u.searchParams.get('key');
  if (mode === 'throw') throw new Error('connect failed for ' + url);
  const isPsi = u.hostname === 'www.googleapis.com';
  if (!isPsi && u.hostname !== 'chromeuxreport.googleapis.com') throw new Error('unexpected host ' + u.hostname);
  if (mode === 'down' || (mode === 'psi-down' && isPsi)) return body(503, { error: { message: 'Backend unavailable (key=' + key + ')' } });
  if (isPsi) return body(200, { lighthouseResult: { audits: { 'largest-contentful-paint': { numericValue: 2200 }, 'cumulative-layout-shift': { numericValue: 0.02 }, 'total-blocking-time': { numericValue: 90 } }, categories: { performance: { score: 0.95 } } } });
  return body(200, { record: { metrics: { largest_contentful_paint: { percentiles: { p75: 2100 } }, cumulative_layout_shift: { percentiles: { p75: '0.03' } } } } });
};
`);
const baseEnv = (() => { const e = { ...process.env }; delete e.PSI_API_KEY; delete e.CRUX_API_KEY; delete e.FAKE_CWV; return e; })();
const cli = (args, { env = {}, fake = false } = {}) => new Promise(resolve => execFile(process.execPath, [...(fake ? ['--import', pathToFileURL(preload).href] : []), script, ...args], { timeout: 60000, env: { ...baseEnv, ...env } }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
let n = 0;
const outDir = () => path.join(sandbox, `out${n++}`);
const PSI_KEY = fakeKey('CLI-psi-secret-0123456789abcdefghij');
const CRUX_KEY = fakeKey('CLI-crux-secret-0123456789abcdefghi');
const KEYS = { PSI_API_KEY: PSI_KEY, CRUX_API_KEY: CRUX_KEY };
const noKeyLeak = (...texts) => texts.forEach(t => assert.ok(!String(t).includes('AIza') && !String(t).includes('secret'), `a key leaked:\n${t}`));

test('--help prints usage and exits 0; a missing URL, unknown options and bad values are usage errors (exit 1)', async () => {
  const h = await cli(['--help']);
  assert.equal(h.code, 0);
  assert.match(h.stdout, /Usage: node cwv\.mjs/);
  assert.match(h.stdout, /PSI_API_KEY/);
  assert.match(h.stdout, /CRUX_API_KEY/);
  assert.match(h.stdout, /Search Console/);
  assert.match(h.stdout, /TBT/);
  assert.match(h.stdout, /MSYS_NO_PATHCONV/);
  assert.doesNotMatch(h.stdout, /\u2014/);
  const none = await cli([]);
  assert.equal(none.code, 1);
  assert.match(none.stdout, /Usage/);
  for (const [args, re] of [
    [[U, '--strat', 'mobile'], /Unknown option --strat\b/],
    [[U, '--strategy', 'tablet'], /--strategy .*mobile or desktop/],
    [[U, '--strategy'], /--strategy needs/],
    [[U, '--runs', '0'], /--runs/],
    [[U, '--runs', 'abc'], /--runs/],
    [[U, '--runs=2.5'], /--runs/],
    [[U, '--runs', '11'], /--runs/],
    [[U, '--runs'], /--runs needs/],
    [[U, '--out'], /--out needs/],
    [['ftp://shop.test/'], /http\(s\)/],
    [['shop.test/page'], /https:\/\//],
    [['http://localhost:3000/'], /localhost|this machine|cannot reach/i],
    [[U, 'https://other.test/'], /one URL/],
  ]) {
    const r = await cli(args, { env: KEYS, fake: true });
    assert.equal(r.code, 1, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, re, args.join(' '));
    noKeyLeak(r.stdout, r.stderr);
  }
});

test('an --out that Git Bash rewrote from a /path is refused with the hint', async () => {
  const r = await cli([U, '--out', 'C:/Program Files/Git/zzz-no-such-folder/seo'], { fake: true });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /MSYS_NO_PATHCONV/);
});

test('a run writes cwv.json and cwv.md; with both keys set neither file, nor any output, holds a key', async () => {
  const out = outDir();
  const r = await cli([U, '--out', out], { env: KEYS, fake: true });
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'cwv.json'), 'utf8'));
  const md = fs.readFileSync(path.join(out, 'cwv.md'), 'utf8');
  assert.equal(json.url, U);
  assert.equal(json.strategy, 'mobile');
  assert.equal(json.lab.runs, 3);
  assert.equal(json.lab.lcp, 2200);
  assert.equal(json.field.url.lcp, 2100);
  assert.equal(json.field.url.inp, null);
  assert.match(md, /\| LCP \| 2200 ms \(good\)/);
  assert.match(md, /INP not reported/);
  assert.match(r.stdout, /Wrote /);
  assert.match(r.stdout, /cwv\.md/);
  noKeyLeak(JSON.stringify(json), md, r.stdout, r.stderr);
});

test('--strategy desktop and --runs are honoured, and without a CrUX key the report points to Search Console', async () => {
  const out = outDir();
  const r = await cli([U, '--strategy', 'desktop', '--runs', '1', '--out', out], { env: { PSI_API_KEY: PSI_KEY }, fake: true });
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'cwv.json'), 'utf8'));
  assert.equal(json.strategy, 'desktop');
  assert.equal(json.lab.runs, 1);
  assert.match(json.field.skipped, /CRUX_API_KEY/);
  const md = fs.readFileSync(path.join(out, 'cwv.md'), 'utf8');
  assert.match(md, /\(desktop\)/);
  assert.match(md, /Search Console/);
  noKeyLeak(JSON.stringify(json), md, r.stdout, r.stderr);
});

test('when nothing could be fetched the report is still written, says why, and the exit code is 2', async () => {
  for (const fake of ['down', 'throw']) {
    const out = outDir();
    const r = await cli([U, '--out', out], { env: { ...KEYS, FAKE_CWV: fake }, fake: true });
    assert.equal(r.code, 2, `${fake}: ${r.stdout}${r.stderr}`);
    const md = fs.readFileSync(path.join(out, 'cwv.md'), 'utf8');
    const json = JSON.parse(fs.readFileSync(path.join(out, 'cwv.json'), 'utf8'));
    assert.match(md, /Lab data unavailable/);
    assert.equal(json.lab.runs, 0);
    assert.match(r.stderr, /No Core Web Vitals data/);
    assert.match(r.stderr, /cwv\.md/);
    assert.doesNotMatch(md, /undefined|NaN|\bnull\b/);
    noKeyLeak(JSON.stringify(json), md, r.stdout, r.stderr);
  }
});

test('lab failing while field data came back is a partial report (exit 0), and says what failed', async () => {
  const out = outDir();
  const r = await cli([U, '--out', out], { env: { ...KEYS, FAKE_CWV: 'psi-down' }, fake: true });
  assert.equal(r.code, 0, r.stderr);
  const md = fs.readFileSync(path.join(out, 'cwv.md'), 'utf8');
  assert.match(md, /Lab data unavailable: PageSpeed Insights HTTP 503/);
  assert.match(md, /Field \(URL\)[^\n]*LCP 2100 ms \(good\)/);
  assert.match(r.stdout, /failed|unavailable/i);
  noKeyLeak(md, r.stdout, r.stderr);
});

test('an --out that cannot be written is a write failure (exit 2)', async () => {
  const blocker = path.join(sandbox, 'a-file');
  fs.writeFileSync(blocker, 'x');
  const r = await cli([U, '--out', path.join(blocker, 'seo')], { env: KEYS, fake: true });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Could not write the report/);
  noKeyLeak(r.stdout, r.stderr);
});
