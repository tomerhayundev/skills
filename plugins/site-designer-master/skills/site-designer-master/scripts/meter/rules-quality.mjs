// Quality rules: objective floors from the technical system (structure, type, contrast, targets, images,
// fonts, performance, accessibility). Each rule turns one page's probe facts into findings.
// A finding is { id, detail, selector? }; meter.mjs adds the page, the width and the severity.

const RTL_LANGS = /^(he|ar|fa|ur|yi)\b/;

export function qualityRules(f, { width, t, pass = 'main' }) {
  if (pass !== 'main') return [];
  const out = [];
  const add = (id, detail, selector) => out.push({ id, detail, selector });

  if (f.overflow) add('H_OVERFLOW', `page is ${f.scrollWidth}px wide in a ${f.innerWidth}px window`);
  if (f.h1 !== 1) add('H1_COUNT', `${f.h1} h1 elements (exactly one per page)`);
  let prev = 0;
  for (const h of f.headings || []) {
    if (prev && h.level > prev + 1) add('HEADING_SKIP', `h${prev} is followed by h${h.level} ("${h.text}")`);
    prev = h.level;
  }
  if ((f.landmarks?.main ?? 0) !== 1) add('LANDMARKS', `${f.landmarks?.main ?? 0} main landmarks (exactly one)`);
  if (!f.lang) add('LANG_DIR', 'the html element has no lang');
  else if (RTL_LANGS.test(f.lang) && f.dir !== 'rtl') add('LANG_DIR', `lang ${f.lang} needs dir="rtl"`);

  for (const x of f.text || []) {
    const running = ['p', 'li', 'dd', 'blockquote', 'td'].includes(x.tag);
    if (running && x.inMain && !x.interactive && x.size < t.BODY_MIN_PX) add('BODY_SIZE', `${x.size}px running text ("${x.sample}")`, x.sel);
    else if (x.interactive && x.size < t.UI_TEXT_MIN_PX) add('UI_TEXT_MIN', `${x.size}px control text ("${x.sample}")`, x.sel);
    else if (!x.interactive && x.size < t.TEXT_MIN_PX) add('TEXT_MIN', `${x.size}px text ("${x.sample}")`, x.sel);
    // Display type may set tight (0.95-1.1); the leading floor is for running text under 24px.
    if (x.lines > 1 && x.size < 24 && x.leading < t.LEADING_MIN) add('LEADING', `line height ${x.leading} on ${x.size}px text`, x.sel);
    if (x.tracking < t.TRACKING_MIN_EM || (x.size < 20 && x.tracking < 0)) add('TRACKING', `letter spacing ${x.tracking}em on ${x.size}px text`, x.sel);
    else if (!x.upper && x.size < 24 && x.tracking > t.TRACKING_BODY_MAX_EM) add('TRACKING_WIDE', `letter spacing ${x.tracking}em on ${x.size}px text`, x.sel);
    if (x.tag === 'p' && x.lines >= 2 && x.perLine > t.MEASURE_MAX_CH) add('MEASURE', `about ${x.perLine} characters a line`, x.sel);
  }
  for (const c of f.contrast || []) {
    const floor = c.large ? t.CONTRAST_LARGE : t.CONTRAST_TEXT;
    if (c.ratio < floor) add('CONTRAST', `${c.ratio}:1 below ${floor}:1 ("${c.sample}")`, c.sel);
  }
  for (const g of f.targets || []) {
    if (!g.inline && (g.w < t.TARGET_MIN_PX || g.h < t.TARGET_MIN_PX)) add('TARGET_SIZE', `${g.w}x${g.h}px ${g.tag}`, g.sel);
    else if (width <= 768 && ['button', 'input', 'select'].includes(g.tag) && g.h < t.TARGET_TOUCH_PX) add('TARGET_TOUCH', `${g.h}px tall ${g.tag} on a touch width`, g.sel);
  }
  for (const im of f.images || []) {
    if (im.alt === null) add('IMG_ALT', `no alt on ${im.src}`, im.sel);
    if (im.broken) add('IMG_BROKEN', `${im.src} did not load`, im.sel);
    if (!im.dims) add('IMG_DIMENSIONS', `${im.src} has no width and height or aspect-ratio`, im.sel);
    if (im.lazy && im.aboveFold) add('HERO_LAZY', `${im.src} is lazy but on the first screen`, im.sel);
  }
  for (const fi of f.fonts || []) add('FONT_SCRIPT_COVERAGE', fi.failed ? `${fi.family} did not load, so its ${fi.script} text falls back` : `${fi.family} has no ${fi.script} glyphs`, fi.sel);
  if (f.unmeasured) add('CONTRAST_UNMEASURED', `${f.unmeasured} text blocks sit on a picture or gradient: check their contrast by eye`);
  if (f.perf?.cls > t.CLS) add('CLS', `layout shift ${f.perf.cls} above ${t.CLS}`);
  if (f.perf?.lcp > t.LCP_MS) add('LCP', `largest paint at ${f.perf.lcp}ms (local, indicative)`);
  for (const a of f.axe || []) add('AXE_SERIOUS', `${a.id}: ${a.help}`, a.nodes?.[0]);
  return out;
}

// Physical left/right in author CSS breaks right-to-left pages. Selectors marked .no-flip are allowed.
const PHYSICAL = /(?:^|;)\s*(?:(?:margin|padding|border)-(?:left|right)\b|(?:left|right)\s*:|text-align\s*:\s*(?:left|right)\b|float\s*:\s*(?:left|right)\b|clear\s*:\s*(?:left|right)\b)/;
// left and right set together (a full-width stretch) mean the same in both directions.
const PAIR = (decls) => /(?:^|;)\s*left\s*:/.test(decls) && /(?:^|;)\s*right\s*:/.test(decls);
const physical = (decls) => PHYSICAL.test(PAIR(decls) ? decls.replace(/(?:^|;)\s*(?:left|right)\s*:[^;]*/g, ';') : decls);

export function cssRules(files) {
  const out = [];
  for (const { name, css, page = 'css' } of files) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim();
      if (selector.startsWith('@font-face') || selector.includes('no-flip')) continue;
      if (physical(m[2])) out.push({ id: 'PHYSICAL_PROPS', detail: `${name}: ${selector} uses left/right; use inline-start/inline-end`, selector, page });
    }
  }
  return out;
}
