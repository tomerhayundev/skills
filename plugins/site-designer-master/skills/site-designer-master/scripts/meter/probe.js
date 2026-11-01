// Runs inside a built page (injected by meter.mjs) and reports what the page really renders.
// It reports facts only; meter.mjs and the rule modules decide what passes. Options arrive in window.__SDM_OPTS.
(async function () {
  var OPTS = window.__SDM_OPTS || {};
  var perf = { cls: 0, lcp: 0 };
  var shifts = [];
  try {
    new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) shifts.push(e); }); }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) perf.lcp = e[e.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (e) { /* older engine: no numbers */ }

  // Shifts count from the moment the page's render-blocking styles arrived (see meter.mjs): an unstyled first paint
  // is how a page read from files can load, never how a served page looks.
  function styledShifts() {
    var from = window.__sdmStyles || 0;
    return shifts.reduce(function (sum, e) { return e.startTime >= from ? sum + e.value : sum; }, 0);
  }

  if (document.readyState !== 'complete') await new Promise(function (r) { addEventListener('load', r, { once: true }); });
  try { await document.fonts.ready; } catch (e) { /* no font loading API */ }
  await new Promise(function (r) { setTimeout(r, OPTS.settleMs || 300); });

  function visible(el) {
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    if (r.bottom + scrollY < 0 || r.right < -50) return false; // parked off screen, like a skip link at rest
    for (var p = el; p; p = p.parentElement) {
      var c = getComputedStyle(p);
      if (Number(c.opacity) === 0 || c.visibility === 'hidden') return false;
      if (p.getAttribute && p.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  }
  function sel(el) {
    var parts = [];
    for (var e = el; e && e.nodeType === 1 && parts.length < 4; e = e.parentElement) {
      var s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(s + '#' + e.id); break; }
      if (e.classList.length) s += '.' + e.classList[0];
      parts.unshift(s);
    }
    return parts.join(' > ');
  }
  // Any colour syntax (rgb, oklch, color-mix...) is turned into sRGB by painting one pixel.
  var cv = document.createElement('canvas'); cv.width = cv.height = 1;
  var cx = cv.getContext('2d', { willReadFrequently: true });
  function parseColor(str) {
    if (!str) return null;
    if (str === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1);
    var d = cx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }
  function opacityChain(el) { var o = 1; for (var e = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; }
  function lum(c) {
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function over(fg, bg) { var a = fg.a; return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 }; }
  // The colour behind an element: the first solid background up the tree, blended; null when an image or gradient is in the way.
  function background(el) {
    var layers = [];
    for (var e = el; e; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      var c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    var base = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }

  var HEB = /[֐-׿]/, ARAB = /[؀-ۿ]/, CYR = /[Ѐ-ӿ]/;
  var faces = [];
  try { document.fonts.forEach(function (f) { faces.push({ family: f.family.replace(/^['"]|['"]$/g, ''), range: f.unicodeRange, status: f.status }); }); } catch (e) { /* none */ }
  function rangeCovers(range, cp) {
    return String(range || 'U+0-10FFFF').split(',').some(function (part) {
      var m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(part.trim());
      if (!m) return false;
      var lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16);
      return cp >= lo && cp <= hi;
    });
  }

  // One entry per element that owns visible text.
  var owners = new Map();
  var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (var n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    var el = n.parentElement;
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
    owners.set(el, (owners.get(el) || '') + n.textContent);
  }
  var text = [], contrast = [], fontIssues = [], unmeasured = 0;
  owners.forEach(function (str, el) {
    if (!visible(el)) return;
    var cs = getComputedStyle(el);
    var size = parseFloat(cs.fontSize);
    var lh = cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / size;
    var r = el.getBoundingClientRect();
    var lines = Math.max(1, Math.round(r.height / (lh * size)));
    var weight = Number(cs.fontWeight) || 400;
    var t = str.replace(/\s+/g, ' ').trim();
    text.push({
      sel: sel(el), tag: el.tagName.toLowerCase(), size: size, leading: Math.round(lh * 100) / 100,
      tracking: Math.round((parseFloat(cs.letterSpacing) || 0) / size * 1000) / 1000, upper: cs.textTransform === 'uppercase',
      weight: weight, lines: lines, chars: t.length, perLine: Math.round(t.length / lines), align: cs.textAlign,
      family: cs.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, ''), inMain: !!el.closest('main'),
      interactive: !!el.closest('a,button,label,input,select,textarea,summary,[role=button]'), sample: t.slice(0, 60),
    });
    var fg = parseColor(cs.color), bg = background(el);
    if (fg) fg.a *= opacityChain(el);
    if (fg && !bg) unmeasured++;
    if (fg && bg) {
      var c = over(fg, bg), l1 = lum(c), l2 = lum(bg);
      var ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      var large = size >= 24 || (size >= 18.66 && weight >= 700);
      contrast.push({ sel: sel(el), ratio: Math.round(ratio * 100) / 100, large: large, sample: t.slice(0, 40) });
    }
    var fam = cs.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    var famFaces = faces.filter(function (f) { return f.family === fam; });
    // The designed face must carry the script: the first family of the stack, as the design chose it. A face whose
    // files failed to load carries nothing, whatever its range says.
    var failed = famFaces.length && famFaces.every(function (f) { return f.status === 'error'; });
    [[HEB, 0x5D0, 'hebrew'], [ARAB, 0x627, 'arabic'], [CYR, 0x430, 'cyrillic']].forEach(function (s) {
      if (s[0].test(t) && famFaces.length && (failed || !famFaces.some(function (f) { return rangeCovers(f.range, s[1]); }))) fontIssues.push({ sel: sel(el), family: fam, script: s[2], failed: !!failed });
    });
  });

  var targets = [];
  document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]').forEach(function (el) {
    if (!visible(el)) return;
    var r = el.getBoundingClientRect();
    var inline = el.tagName === 'A' && el.parentElement && /^(P|LI|TD|DD|SPAN|EM|STRONG)$/.test(el.parentElement.tagName) && el.parentElement.textContent.trim().length > el.textContent.trim().length + 2;
    targets.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), inline: inline, tag: el.tagName.toLowerCase() });
  });

  var images = [];
  document.querySelectorAll('img').forEach(function (img, i) {
    var r = img.getBoundingClientRect();
    images.push({ sel: sel(img), src: img.getAttribute('src'), alt: img.hasAttribute('alt') ? img.getAttribute('alt') : null, dims: img.hasAttribute('width') && img.hasAttribute('height') || getComputedStyle(img).aspectRatio !== 'auto', lazy: img.loading === 'lazy', aboveFold: r.top < innerHeight, broken: img.complete && img.naturalWidth === 0 });
  });

  var headings = [].map.call(document.querySelectorAll('h1,h2,h3,h4,h5,h6'), function (h) { return { level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 60), visible: visible(h) }; });
  var landmarks = { main: document.querySelectorAll('main,[role=main]').length, header: document.querySelectorAll('body > header, [role=banner]').length, nav: document.querySelectorAll('nav').length, footer: document.querySelectorAll('body > footer,[role=contentinfo]').length };

  var axeOut = [];
  if (OPTS.axe && window.axe) {
    try {
      var res = await window.axe.run(document, { resultTypes: ['violations'] });
      axeOut = res.violations.filter(function (v) { return v.impact === 'serious' || v.impact === 'critical'; }).map(function (v) { return { id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(function (n) { return n.target.join(' '); }) }; });
    } catch (e) { axeOut = [{ id: 'axe-error', impact: 'serious', help: String(e && e.message), nodes: [] }]; }
  }

  var extra = {};
  if (window.__SDM_EXTRA) { try { extra = await window.__SDM_EXTRA({ visible: visible, sel: sel, parseColor: parseColor, background: background }); } catch (e) { extra = { error: String(e && e.message) }; } }

  window.__emit({
    lang: document.documentElement.getAttribute('lang') || '', dir: document.documentElement.getAttribute('dir') || '',
    overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, innerWidth: innerWidth,
    h1: document.querySelectorAll('h1').length, headings: headings, landmarks: landmarks,
    text: text, contrast: contrast, unmeasured: unmeasured, targets: targets, images: images, fonts: fontIssues, axe: axeOut,
    perf: { cls: Math.round(styledShifts() * 1000) / 1000, lcp: Math.round(perf.lcp) }, extra: extra,
  });
})();
