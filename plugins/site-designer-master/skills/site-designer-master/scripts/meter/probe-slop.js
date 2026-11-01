// Extra facts for the slop and content rules. Injected before probe.js, which calls window.__SDM_EXTRA
// with its helpers once the page has settled. Facts only; rules-slop.mjs and rules-content.mjs judge them.
window.__SDM_EXTRA = async function (h) {
  var PASS = (window.__SDM_OPTS || {}).pass || 'main';
  var all = [].slice.call(document.querySelectorAll('body *')).filter(function (e) { return !/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEAD|META|LINK)$/.test(e.tagName); });
  var px = function (v) { return parseFloat(v) || 0; };

  if (PASS === 'stubio') {
    // Scroll-triggered reveals never fire here: text that is still invisible would stay invisible for anyone whose script fails.
    var hidden = [];
    document.querySelectorAll('main *').forEach(function (el) {
      var own = [].filter.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 0; }).map(function (n) { return n.textContent; }).join(' ').trim();
      if (own.length < 12) return;
      var op = 1, vis = true;
      for (var e = el; e && e !== document.body; e = e.parentElement) {
        var cs = getComputedStyle(e);
        op *= Number(cs.opacity);
        if (cs.visibility === 'hidden') vis = false;
        if (cs.display === 'none' || e.hidden) return; // deliberately hidden (a sent message, a closed panel) is fine
      }
      if (op < 0.1 || !vis) hidden.push({ sel: h.sel(el), sample: own.slice(0, 50) });
    });
    return { hidden: hidden };
  }

  if (PASS === 'motion') {
    var running = [];
    try {
      document.getAnimations().forEach(function (a) {
        if (a.playState !== 'running') return;
        var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
        if (t.iterations === Infinity || (t.duration || 0) > 100) running.push({ sel: a.effect && a.effect.target ? h.sel(a.effect.target) : '?', name: a.animationName || a.id || a.constructor.name, infinite: t.iterations === Infinity });
      });
    } catch (e) { /* no animations API */ }
    return { running: running };
  }

  var gradText = [], gradients = [], shadows = [], cards = [], tiles = 0, eyebrows = [], filled = [], buttons = [], mixed = [], colors = {};
  var isCard = function (el) {
    if (!/^(DIV|ARTICLE|LI|ASIDE|A|FIGURE)$/.test(el.tagName)) return false;
    var cs = getComputedStyle(el);
    var bordered = ['Top', 'Right', 'Bottom', 'Left'].every(function (s) { return px(cs['border' + s + 'Width']) >= 1; });
    return (bordered || cs.boxShadow !== 'none') && px(cs.paddingTop) >= 8 && h.visible(el);
  };
  all.forEach(function (el) {
    if (!h.visible(el)) return;
    var cs = getComputedStyle(el);
    var bgImg = cs.backgroundImage || '';
    if (/gradient/.test(bgImg)) {
      if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') gradText.push({ sel: h.sel(el) });
      gradients.push({ sel: h.sel(el), stops: bgImg.match(/rgba?\([^)]+\)/g) || [] });
    }
    if (cs.boxShadow !== 'none' || cs.textShadow !== 'none') shadows.push({ sel: h.sel(el), box: cs.boxShadow, text: cs.textShadow, border: px(cs.borderTopWidth) });
    var bg = h.parseColor(cs.backgroundColor);
    if (bg && bg.a > 0) colors[cs.backgroundColor] = (colors[cs.backgroundColor] || 0) + 1;
    if (isCard(el)) {
      for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) if (isCard(p)) { cards.push({ outer: h.sel(p), inner: h.sel(el) }); break; }
    }
    var r = el.getBoundingClientRect();
    var next = el.nextElementSibling;
    if (next && /^H[2-4]$/.test(next.tagName) && r.width >= 24 && r.width <= 72 && r.height >= 24 && r.height <= 72 && r.width / r.height > 0.8 && r.width / r.height < 1.25 &&
        px(cs.borderTopLeftRadius) > 0 && ((bg && bg.a > 0) || px(cs.borderTopWidth) > 0) && (el.querySelector('svg,img') || el.textContent.trim().length <= 2)) tiles++;
    if (next && /^H[1-3]$/.test(next.tagName) && !/^H\d$/.test(el.tagName)) {
      var size = px(cs.fontSize), track = px(cs.letterSpacing) / size, txt = el.textContent.trim();
      if (size <= 14 && txt.length > 0 && txt.length <= 40 && (cs.textTransform === 'uppercase' || track > 0.05)) eyebrows.push({ sel: h.sel(el), text: txt });
    }
    if (/^(A|BUTTON)$/.test(el.tagName) && bg && bg.a > 0 && r.height >= 32) {
      var behind = h.background(el.parentElement || document.body);
      var diff = behind ? Math.abs(bg.r - behind.r) + Math.abs(bg.g - behind.g) + Math.abs(bg.b - behind.b) : 0;
      if (diff > 60) { var box = el.closest('section,header,footer,form,aside') || document.body; filled.push({ group: h.sel(box), text: el.textContent.trim().slice(0, 40) }); }
    }
    if (el.matches('button,input[type=submit],input[type=button],a.button,[role=button]')) buttons.push({ sel: h.sel(el), text: (el.value || el.textContent || '').trim() });
    if (/^H[1-3]$/.test(el.tagName)) {
      var fam = cs.fontFamily.split(',')[0], ital = cs.fontStyle;
      [].forEach.call(el.querySelectorAll('*'), function (c) {
        var cc = getComputedStyle(c);
        if (c.textContent.trim() && (cc.fontFamily.split(',')[0] !== fam || cc.fontStyle !== ital)) mixed.push({ sel: h.sel(el), part: c.textContent.trim().slice(0, 30) });
      });
    }
  });

  // Copy as a reader sees it, and the same copy without phone and mail links and without the copyright line, for the number check.
  var clone = document.body.cloneNode(true);
  // The page's words as a visitor reads them, without drawings hidden from assistive tech (a sample of a tell
  // drawn in a picker is a picture of the words, not the page saying them).
  function visibleCopy() {
    var text = document.body.innerText;
    [].forEach.call(document.querySelectorAll('[aria-hidden=true]'), function (n) {
      var t = n.innerText && n.innerText.trim();
      if (t) text = text.replace(t, ' ');
    });
    return text;
  }
  [].forEach.call(clone.querySelectorAll('script,style,noscript,template,[hidden],[aria-hidden=true],a[href^="tel:"],a[href^="mailto:"]'), function (n) { n.remove(); });
  [].forEach.call(clone.querySelectorAll('footer p, footer small, footer div'), function (n) { if (/©|&copy;|copyright/i.test(n.textContent)) n.remove(); });
  return {
    gradText: gradText, gradients: gradients, shadows: shadows, nestedCards: cards, iconTiles: tiles, eyebrows: eyebrows, filled: filled,
    buttons: buttons, mixedHeadlines: mixed, colors: Object.keys(colors),
    // The quoted words only: the attribution (footer, cite, caption) is not part of the quote.
    quotes: [].map.call(document.querySelectorAll('main blockquote, main q'), function (q) { var c = q.cloneNode(true); [].forEach.call(c.querySelectorAll('footer, cite, figcaption'), function (n) { n.remove(); }); return c.textContent.replace(/\s+/g, ' ').trim(); }).filter(Boolean),
    copy: visibleCopy(), numbersText: clone.textContent.replace(/\s+/g, ' '),
  };
};
