// Runs inside a live library page (after page-clean.js) and reads its design as exact values, so a pick reaches
// the build as numbers, not only a picture and a sentence: palette with roles (background, text, accent and the
// rest by share of the first screens), the type ramp (family, size, weight, line height, tracking per role),
// the most used spacing steps, the content width and the corner radii. Facts only; nothing is judged here.
(function () {
  var W = innerWidth, LIMIT = innerHeight * 3;
  var visible = function (el, cs) { var r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.1 && r.width > 0 && r.height > 0 && r.top < LIMIT; };
  var hex = function (c) {
    var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || '');
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.5)) return null;
    return '#' + [m[1], m[2], m[3]].map(function (v) { return ('0' + Math.round(Number(v)).toString(16)).slice(-2); }).join('');
  };
  var family = function (f) { return (f || '').split(',')[0].replace(/["']/g, '').trim(); };
  var px = function (v) { return parseFloat(v) || 0; };
  var round = function (v, n) { var k = Math.pow(10, n); return Math.round(v * k) / k; };
  var all = [].filter.call(document.querySelectorAll('body, body *'), function (el) { return visible(el, getComputedStyle(el)); });

  // Palette: background by painted area on the first screen, text by amount of text, accent from filled buttons and links.
  var bg = {}, text = {}, accent = {};
  var add = function (m, k, v) { if (k) m[k] = (m[k] || 0) + v; };
  all.forEach(function (el) {
    var cs = getComputedStyle(el), r = el.getBoundingClientRect();
    // The background is what fills the first screen: each box counts for the part of it inside the first screen.
    var seen = Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    add(bg, hex(cs.backgroundColor), seen / (el === document.body || el === document.documentElement ? 4 : 1));
    var own = [].filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }).map(function (n) { return n.textContent.trim(); }).join(' ');
    if (own) add(text, hex(cs.color), own.length);
    if (el.matches('button, a, [role=button], input[type=submit]')) {
      var b = hex(cs.backgroundColor);
      if (b && Math.max(r.width, r.height) < 600) add(accent, b, 3);
      else if (own) add(accent, hex(cs.color), 1);
    }
  });
  var ranked = function (m) { return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }); };
  var bgs = ranked(bg), texts = ranked(text);
  var background = bgs[0] || '#ffffff', ink = texts.filter(function (c) { return c !== background; })[0] || '#000000';
  var acc = ranked(accent).filter(function (c) { return c !== background && c !== ink; })[0] || null;
  var palette = [{ role: 'background', hex: background }, { role: 'text', hex: ink }];
  if (acc) palette.push({ role: 'accent', hex: acc });
  bgs.concat(texts).forEach(function (c) { if (palette.length < 8 && !palette.some(function (p) { return p.hex === c; })) palette.push({ role: bg[c] ? 'surface' : 'text-2', hex: c }); });

  // Type ramp: the first visible element of each role, and the most common body paragraph.
  var typeOf = function (role, el) {
    var cs = getComputedStyle(el), size = px(cs.fontSize);
    var lh = cs.lineHeight === 'normal' ? 1.2 : round(px(cs.lineHeight) / size, 2);
    return { role: role, family: family(cs.fontFamily), size: round(size, 1), weight: Number(cs.fontWeight), lineHeight: lh, tracking: cs.letterSpacing === 'normal' ? 0 : round(px(cs.letterSpacing) / size, 3) };
  };
  var type = [];
  ['h1', 'h2', 'h3'].forEach(function (tag) { var el = all.filter(function (e) { return e.matches(tag); })[0]; if (el) type.push(typeOf(tag, el)); });
  var paras = all.filter(function (e) { return e.matches('p, li') && (e.innerText || '').trim().length > 12; });
  var bySize = {};
  paras.forEach(function (e) { var k = getComputedStyle(e).fontSize + '|' + getComputedStyle(e).fontFamily; bySize[k] = (bySize[k] || []).concat(e); });
  var common = Object.keys(bySize).sort(function (a, b) { return bySize[b].length - bySize[a].length; })[0];
  if (common) type.push(typeOf('body', bySize[common][0]));
  // Display: the biggest words on the first screen, whatever tag holds them (often not a heading at all).
  var big = all.filter(function (e) {
    var r = e.getBoundingClientRect();
    return r.top < innerHeight && [].some.call(e.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 1; });
  }).sort(function (a, b) { return px(getComputedStyle(b).fontSize) - px(getComputedStyle(a).fontSize); })[0];
  var btn = all.filter(function (e) { return e.matches('button, a[class*=btn], a[class*=button], [role=button]') && (e.innerText || '').trim(); })[0];
  if (btn) type.push(typeOf('button', btn));

  // Spacing: the most used paddings, margins and gaps on layout boxes, rounded to whole pixels.
  var steps = {};
  all.forEach(function (el) {
    var cs = getComputedStyle(el);
    ['paddingTop', 'paddingLeft', 'marginBottom', 'marginTop', 'rowGap', 'columnGap'].forEach(function (k) { var v = Math.round(px(cs[k])); if (v >= 4 && v <= 240) steps[v] = (steps[v] || 0) + 1; });
  });
  var spacing = Object.keys(steps).map(Number).sort(function (a, b) { return steps[b] - steps[a]; }).slice(0, 8).sort(function (a, b) { return a - b; });

  // Content width: the most common width of boxes held in by a max-width, else the widest text column.
  var widths = {};
  all.forEach(function (el) { var cs = getComputedStyle(el); if (cs.maxWidth !== 'none' && px(cs.maxWidth) > 480 && px(cs.maxWidth) < W) widths[Math.round(px(cs.maxWidth))] = (widths[Math.round(px(cs.maxWidth))] || 0) + 1; });
  var container = Object.keys(widths).map(Number).sort(function (a, b) { return widths[b] - widths[a] || b - a; })[0] || null;

  // Corners: radii on buttons, cards and pictures (999 stands for a full pill).
  var radii = {};
  all.forEach(function (el) {
    var r = getComputedStyle(el).borderTopLeftRadius; if (!r || r === '0px') return;
    var v = Math.round(px(r)); if (v >= 200 || /%/.test(r)) v = 999;
    radii[v] = (radii[v] || 0) + 1;
  });
  var radius = Object.keys(radii).map(Number).sort(function (a, b) { return radii[b] - radii[a]; }).slice(0, 4).sort(function (a, b) { return a - b; });

  // Reported only when it is bigger than the body: a title drawn as a picture leaves only small words to find.
  var body = type.filter(function (t) { return t.role === 'body'; })[0];
  if (big) { var disp = typeOf('display', big); if (!body || disp.size > body.size * 1.5) type.unshift(disp); }
  return { palette: palette, type: type, spacing: spacing, container: container, radius: radius, measuredAt: W };
})()
