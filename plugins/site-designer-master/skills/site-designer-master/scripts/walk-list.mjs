#!/usr/bin/env node
// The hands-on check list: every surface to look at and every action to perform on the served site before
// anything is called done. Every line starts as ? and is marked by hand as you see and use it:
// a check mark when it works, a cross when it does not, with the tool and the width.
//   node walk-list.mjs <site> [--url=http://127.0.0.1:4321] [--out=walk.md]
// The meter proves no rule is broken; this list is where you prove the site works, by using it.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, isMain, writeText } from './lib/cli.mjs';

function pages(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return pages(p, base);
    return e.name === 'index.html' ? [path.relative(base, p).replace(/\\/g, '/')] : [];
  });
}
const pathOf = (rel) => (rel === 'index.html' ? '/' : `/${rel.replace(/index\.html$/, '')}`);

export function walkList(siteDir, { url = 'http://127.0.0.1:4321' } = {}) {
  const list = pages(siteDir).map((rel) => ({ rel, path: pathOf(rel), html: fs.readFileSync(path.join(siteDir, rel), 'utf8') }));
  list.sort((a, b) => (a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path)));
  const home = list.find((p) => p.path === '/') || list[0];
  const lang = (/<html[^>]*\blang="([^"]+)"/.exec(home?.html || '') || [])[1] || '';
  const rtl = /<html[^>]*\bdir="rtl"/.test(home?.html || '');
  const navLinks = new Set([...(/<nav[^>]*id="site-nav"[\s\S]*?<\/nav>/.exec(home?.html || '') || [''])[0].matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
  const lines = [];
  const L = (s) => lines.push(s);

  L(`# Walk list`);
  L('');
  L(`Site: ${url}  (language: ${lang || 'not set'}${rtl ? ', right to left' : ''})`);
  L('Tool and environment: ____ (real Chrome first; the in-app browser only when Chrome is not connected; say "headless Chromium" when it was headless, never "real Chrome")');
  L('');
  L('Verdict: Not verified yet');
  L('');
  L('Any ✗ makes the verdict Broken. Any ? makes it Not verified yet. Only a list with every line ✓, seen and used this turn, is Verified.');
  L('Mark each line ✓ or ✗ with what you saw; a failed check stays failed, never swapped for one that passed.');
  L('');
  L('## Look: every page, top to bottom to the page end');
  L('');
  for (const p of list) for (const w of [375, 1440]) L(`- ? ${p.path} at ${w}px, top to bottom to the page end`);
  L('');
  L('## Remove');
  L('');
  L('Simple to the maker is not simple to a visitor: read it as a first-time visitor. Cuts go in the report.');
  L('');
  for (const p of list) if (!p.path.startsWith('/_')) L(`- ? ${p.path}: every section names its one job; what has none is cut, or the report says why it stays`);
  L('');
  if (list.some((p) => p.path === '/_system/')) {
    L('## The system');
    L('');
    L('- ? /_system/ at 1440px: every page uses only these colours, sizes and corners; anything else on a page is named and fixed');
    L('');
  }
  L('## Use it');
  L('');
  L(`- ? Every navigation link (${navLinks.size}) reaches its page, by real clicks`);
  if (/class="nav-toggle"/.test(home?.html || '')) L('- ? Phone menu at 375px: opens, Escape closes it, a link tap closes it');
  for (const p of list) {
    for (const m of p.html.matchAll(/<form[^>]*action="\/forms\/([\w-]+)"/g)) {
      if (p.path === '/_review/') continue;
      L(`- ? Form "${m[1]}" on ${p.path}: submit real values; the success block shows; .site-data/submissions.jsonl gains one line`);
      L(`- ? Form "${m[1]}" on ${p.path}: submit it empty or wrong; the error says how to fix it and focus goes to it`);
      L(`- ? Form "${m[1]}" on ${p.path}: the success block is a moment, not a bare "Sent": it thanks in the site's voice and says what happens next and when`);
    }
  }
  L(`- ? 404: ${url}/no-such-page/ shows the 404 page and its links work`);
  L('- ? Keyboard: Tab from the top reaches the skip link first, then every control in visual order, each with a visible focus ring never hidden under the header');
  if (fs.existsSync(path.join(siteDir, 'tweaks.js'))) L('- ? Tweak panel: change the accent, Save, the page reloads with it; a value the floors refuse shows its error and is not saved');
  L('- ? Motion: frames over time (several screenshots or a recording) on every page that moves; with reduced motion on, nothing keeps moving');
  L('- ? Every button and link that promises something does it (a phone link dials, a map link opens the map, a download downloads)');
  L('');
  L('## Break it on purpose');
  L('');
  L('Premium is evidence collected in the bad moments as much as the good ones. Design each of these as carefully as the success screen.');
  L('');
  const forms = [...new Set(list.flatMap((p) => [...p.html.matchAll(/<form[^>]*action="\/forms\/([\w-]+)"/g)].map((m) => m[1])))];
  for (const f of forms) L(`- ? Stop the local server, then send "${f}": the visitor is told it did not go through, nothing typed is lost, and there is a way forward (try again, call, write)`);
  L('- ? Every action answers three questions: what just happened, can I take it back, what do I do next');
  L('- ? Empty every list and every place that can be empty (no dishes in a category, no results): each says what it is and how it fills');
  L('- ? The longest real name, a price of 1,000,000, a 30% longer translation: nothing breaks or overlaps');
  L('- ? The same situation looks and reads the same on every page (one pattern for a sent form, one for an error, one for a limit with its count and date)');
  L('');
  L('## Look hard');
  L('');
  L('- ? Text inside buttons, inputs and placeholders: legible, not clipped, aligned');
  L('- ? Neighbours: siblings in every row aligned and evenly spaced, nothing overlapping, at both widths');
  L('- ? Contrast over images and coloured bands, read by eye');
  L('- ? The console: every error read, none waved off');
  if (rtl) L('- ? Right to left: text runs right to left, email and phone inputs read left to right, panels open from the right, arrows point the reading way');
  L('- ? The page end: the footer is complete and nothing trails off');
  L('- ? The last section before the footer on every page ends the visit on purpose (the primary action or a closing line): people remember a visit by its best moment and its end');
  L('');
  return `${lines.join('\n')}\n`;
}

if (isMain(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args._[0]) {
    console.error('usage: node walk-list.mjs <site> [--url=http://127.0.0.1:4321] [--out=walk.md]');
    process.exit(2);
  }
  const md = walkList(path.resolve(args._[0]), { url: args.url });
  if (args.out) { writeText(args.out, md); console.log(`wrote ${args.out}`); } else process.stdout.write(md);
}
