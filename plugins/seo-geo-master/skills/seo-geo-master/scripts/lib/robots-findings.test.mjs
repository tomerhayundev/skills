import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robotsFetchFindings } from './robots-findings.mjs';

const URL_ = 'https://a.test/robots.txt';
const base = { url: URL_, contentType: 'text/plain', isHtml: false, rulesRead: true };

test('a readable robots.txt raises nothing', () => {
  assert.deepEqual(robotsFetchFindings({ ...base, policy: 'parse', status: 200 }), []);
});

test('not-checked says it is a limit of the check, and takes the caller\'s extra sentence', () => {
  const [f, ...rest] = robotsFetchFindings({ ...base, policy: 'not-checked', error: 'blocked-private-address' });
  assert.equal(rest.length, 0);
  assert.equal(f.code, 'ROBOTS_NOT_CHECKED');
  assert.equal(f.severity, 'high');
  assert.equal(f.label, 'D');
  assert.match(f.message, /blocked-private-address/);
  assert.match(f.message, /This is a limit of this check, not a finding about the site$/);
  assert.deepEqual(f.evidence, { urls: [URL_] });
  const [g] = robotsFetchFindings({ ...base, policy: 'not-checked', error: 'blocked-private-address', notCheckedNote: 'Nothing was fetched.' });
  assert.match(g.message, /about what crawlers may fetch\. Nothing was fetched\. This is a limit/);
});

test('disallow-all is critical and names the status or the error', () => {
  const [a] = robotsFetchFindings({ ...base, policy: 'disallow-all', status: 503 });
  assert.equal(a.code, 'ROBOTS_UNAVAILABLE');
  assert.equal(a.severity, 'critical');
  assert.match(a.message, /returned HTTP 503/);
  const [b] = robotsFetchFindings({ ...base, policy: 'disallow-all', error: 'ECONNRESET' });
  assert.match(b.message, /could not be fetched \(ECONNRESET\)/);
});

test('allow-all: a missing file, or redirects that never reached one', () => {
  const [a] = robotsFetchFindings({ ...base, policy: 'allow-all', status: 404 });
  assert.equal(a.code, 'ROBOTS_MISSING');
  assert.equal(a.severity, 'info');
  assert.match(a.message, /returned HTTP 404/);
  const [b] = robotsFetchFindings({ ...base, policy: 'allow-all', error: 'too-many-redirects', hops: 6 });
  assert.match(b.message, /too-many-redirects after 6 redirects; Google follows at most 5/);
  const [c] = robotsFetchFindings({ ...base, policy: 'allow-all', error: 'redirect-loop', hops: 1 });
  assert.match(c.message, /after 1 redirect;/);
});

test('an HTML robots.txt: medium with no rules, low with rules, and the fix depends on what is wrong', () => {
  const none = robotsFetchFindings({ ...base, policy: 'parse', status: 200, contentType: 'text/html', isHtml: true, rulesRead: false });
  assert.equal(none.length, 1);
  assert.equal(none[0].code, 'ROBOTS_IS_HTML');
  assert.equal(none[0].severity, 'medium');
  assert.deepEqual(none[0].evidence, { urls: [URL_], contentType: 'text/html', rulesRead: false });
  const typed = robotsFetchFindings({ ...base, policy: 'parse', status: 200, contentType: 'text/html', isHtml: true })[0];
  assert.equal(typed.severity, 'low');
  assert.match(typed.message, /served with an HTML content type.*serve it as text\/plain/);
  const markup = robotsFetchFindings({ ...base, policy: 'parse', status: 200, isHtml: true })[0];
  assert.match(markup.message, /starts with HTML markup.*remove the HTML markup/);
  const own = robotsFetchFindings({ ...base, policy: 'parse', status: 200, isHtml: true, rulesPhrase: 'its rules were read' })[0];
  assert.match(own.message, /; its rules were read, but remove/);
});
