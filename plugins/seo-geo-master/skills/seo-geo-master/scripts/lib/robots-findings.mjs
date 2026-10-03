// The findings about the robots.txt fetch itself (not about its rules), in one place so that
// robots-check.mjs and crawl.mjs word them the same way. The caller has already mapped the fetch
// result with policyForFetch (lib/robots.mjs); this only builds the findings.
import { finding } from './report.mjs';
import { NOT_CHECKED_REASONS, ROBOTS_MAX_REDIRECTS } from './robots.mjs';

// url, policy, status, error, hops (redirects followed), contentType, isHtml and rulesRead describe
// the fetch. notCheckedNote is an extra sentence for 'not-checked' (what the caller did about it);
// rulesPhrase says where the rules of an HTML-typed file with real rules went (robots-check prints
// them in its table, the crawler does not).
export function robotsFetchFindings({ url, policy, status, error, hops, contentType, isHtml, rulesRead, notCheckedNote = '', rulesPhrase = 'the rules below were read and are shown' }) {
  const F = [];
  if (policy === 'not-checked') {
    F.push(finding('ROBOTS_NOT_CHECKED', 'high', 'D', `robots.txt was not checked (${error}: ${NOT_CHECKED_REASONS[error]}), so nothing could be concluded about what crawlers may fetch.${notCheckedNote ? ` ${notCheckedNote}` : ''} This is a limit of this check, not a finding about the site`, { urls: [url] }));
  }
  if (policy === 'disallow-all') {
    F.push(finding('ROBOTS_UNAVAILABLE', 'critical', 'D', `robots.txt ${error ? `could not be fetched (${error})` : `returned HTTP ${status}`}: Google treats this as "disallow everything" and pauses crawling`, { urls: [url] }));
  }
  if (policy === 'allow-all') {
    F.push(finding('ROBOTS_MISSING', 'info', 'D', error
      ? `robots.txt: the redirects never reached a robots.txt (${error}${hops ? ` after ${hops} redirect${hops === 1 ? '' : 's'}` : ''}; Google follows at most ${ROBOTS_MAX_REDIRECTS}), so crawlers treat it as no rules and may fetch everything`
      : `robots.txt returned HTTP ${status}: crawlers may fetch everything`, { urls: [url] }));
  }
  // The body is still parsed (it shows what Google will do with it), so the message depends on whether
  // anything was read: an HTML page has no rules, but a real robots.txt sent with the wrong content type has.
  if (isHtml && !rulesRead) {
    F.push(finding('ROBOTS_IS_HTML', 'medium', 'D', `${url} returned an HTML page instead of a robots.txt, so crawlers read it as no rules; any blocking the owner intended is not in effect`, { urls: [url], contentType, rulesRead }));
  } else if (isHtml) {
    const htmlType = /html/i.test(contentType || '');
    const what = htmlType ? 'is served with an HTML content type' : 'starts with HTML markup';
    const fix = htmlType ? 'serve it as text/plain' : 'remove the HTML markup';
    F.push(finding('ROBOTS_IS_HTML', 'low', 'D', `${url} ${what}; ${rulesPhrase}, but ${fix} so every crawler reads it the same way`, { urls: [url], contentType, rulesRead }));
  }
  return F;
}
