// Runs inside a live page just before its picture is taken: hides what covers the design (cookie and consent
// banners, sign-up and newsletter pop-ups, their dark backdrops, consent frames) and lets the page scroll again.
// A fixed or sticky header bar stays: it is part of the design. Returns how many it hid, and the share of the
// screen still covered by fixed layers afterwards (the capture refuses a picture that is still mostly covered).
(function () {
  var W = innerWidth, H = innerHeight, screen = W * H;
  var WORDS = /cookie|consent|privacy|gdpr|newsletter|subscribe|sign ?up|join our|accept all|we use|your email|discount|unlock|עוגיות|פרטיות|הרשמ|ניוזלטר|הצטרפ/i;
  // A loading screen left over the page (it lifts by itself, later, or on a click): named so in its class or id.
  var LOADER = /preload|loader|loading|splash|intro-?screen|page-?transition/i;
  var FRAMES = /consent|cookie|cmp|privacy|gdpr|usercentrics|onetrust|didomi|cookiebot|quantcast/i;
  var hidden = 0;
  var area = function (r) { return Math.max(0, Math.min(r.right, W) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, 0)); };
  var shows = function (el, cs) { return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05; };
  var hide = function (el) { el.style.setProperty('display', 'none', 'important'); hidden++; };
  // A bar along the top (a header, a thin announcement strip) is design, not a pop-up.
  var isBar = function (r) { return r.top <= 1 && r.height < H * 0.2; };
  var layers = function () {
    return [].filter.call(document.querySelectorAll('body *'), function (el) {
      var cs = getComputedStyle(el);
      return (cs.position === 'fixed' || cs.position === 'sticky') && shows(el, cs);
    });
  };
  layers().forEach(function (el) {
    var r = el.getBoundingClientRect(), share = area(r) / screen;
    if (share < 0.02 || isBar(r)) return;
    var text = (el.innerText || '').trim();
    var dialog = el.matches('[role=dialog],[role=alertdialog],[aria-modal=true],dialog[open]');
    var words = WORDS.test(text) || [].some.call(el.querySelectorAll('iframe'), function (f) { return FRAMES.test(f.src || f.id || f.className); });
    // A backdrop is a see-through wash behind a pop-up: never a picture, a canvas or a scene of its own.
    var alpha = (/rgba\([^)]*,\s*([\d.]+)\)/.exec(getComputedStyle(el).backgroundColor) || [])[1];
    var scrim = share > 0.6 && text.length < 20 && !el.matches('img,video,canvas,svg,picture,iframe') && !el.querySelector('img,video,canvas,svg') && alpha !== undefined && Number(alpha) > 0.05 && Number(alpha) < 0.95;
    var loader = LOADER.test(String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + ' ' + el.id) && share > 0.5;
    if (dialog || words || scrim || loader) hide(el);
  });
  [].forEach.call(document.querySelectorAll('iframe'), function (f) {
    if (FRAMES.test(f.src || '') || FRAMES.test(f.id || '')) { if (getComputedStyle(f).display !== 'none') hide(f); }
  });
  [document.documentElement, document.body].forEach(function (el) {
    if (!el) return;
    el.style.setProperty('overflow', 'visible', 'important');
    el.style.setProperty('position', getComputedStyle(el).position === 'fixed' ? 'static' : getComputedStyle(el).position, 'important');
  });
  // Still covered: points on a 5x5 grid where a fixed layer lies on top of real page content (text or a picture in
  // the normal flow underneath). A page built entirely of fixed layers, or a fixed scene behind the text, is the
  // design itself and does not count.
  var fixedRoot = function (el) {
    for (var e = el; e && e !== document.body; e = e.parentElement) { var p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; }
    return null;
  };
  var content = function (el) {
    if (!el || el === document.body || el === document.documentElement || fixedRoot(el)) return false;
    if (el.matches('img,video,picture,canvas,svg')) return true;
    return [].some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim().length > 1; });
  };
  var blocked = 0, points = 0;
  for (var gy = 1; gy <= 5; gy++) for (var gx = 1; gx <= 5; gx++) {
    var x = W * gx / 6, y = H * gy / 6, stack = document.elementsFromPoint(x, y);
    points++;
    var top = stack[0], layer = top && fixedRoot(top);
    if (!layer || isBar(layer.getBoundingClientRect())) continue;
    if (stack.slice(1).some(function (el) { return !layer.contains(el) && content(el); })) blocked++;
  }
  var covered = blocked / points;
  return { hidden: hidden, covered: Math.round(covered * 1000) / 1000 };
})()
