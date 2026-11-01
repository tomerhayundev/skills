// The picker app. One page, panels as steps; every change saves the full state to the local server, so a
// reload or a second tab never loses picks. No card is ever drawn without its picture.
// Every action answers three questions in the same place on every panel (the notice at the bottom): what just
// happened, how to take it back, and what comes next.
(function () {
  var S = null; // strings
  var state = null;
  var view = { tab: 'brief', shelf: 'sites', sort: 'recommended', q: '', filters: {}, offset: 0, items: [], total: 0 };
  var GALLERY = ['sites', 'sections', 'motion', 'icons'];
  var EAGER = 6; // the first row of pictures loads at once; the rest as they come near
  var $ = function (id) { return document.getElementById(id); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'on') for (var ev in attrs.on) e.addEventListener(ev, attrs.on[ev]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) e.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fmt(s, vars) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] !== undefined ? vars[k] : m; }); }
  var pad = function (n) { return ('00' + n).slice(-3); };
  // A card's words in the picker's language when the library has them, else the English.
  function words(item) {
    var t = (item && item[state.lang.slice(0, 2)]) || {};
    // The library's best-use words are also what the ranking matches; on a card they read in plain words.
    var plain = S.useWords || {};
    return { description: t.description || item.description, bestUse: t.bestUse || item.bestUse.map(function (u) { return plain[u] || u; }) };
  }

  // The notice: one place, one look, for every action on every panel.
  var toastTimer = null, failed = false;
  function notice(text, undo, next) {
    if (failed) return;
    var t = $('toast'); t.textContent = '';
    t.className = 'toast';
    t.appendChild(el('span', { text: text }));
    if (undo) t.appendChild(el('button', { type: 'button', class: 'link', text: S.undo, on: { click: function () { undo(); hideNotice(); } } }));
    if (next) t.appendChild(el('a', { href: '#' + next, text: fmt(S.next, { name: S.tabs[next] }) }));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideNotice, 7000);
  }
  function hideNotice() { if (!failed) $('toast').hidden = true; }
  // A save that did not go through stays on screen until one does: nothing typed is lost, the page says why.
  function saveProblem(on) {
    var t = $('toast');
    if (on) { failed = true; clearTimeout(toastTimer); t.textContent = ''; t.className = 'toast is-problem'; t.appendChild(el('span', { text: S.saveFailed })); t.hidden = false; }
    else if (failed) { failed = false; t.hidden = true; }
  }

  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      fetch('/_picker/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (res) {
          saveProblem(false);
          if (res.status === 200) state.rev = res.j.rev;
          // Another tab saved first: take its state and redraw, rather than overwrite it.
          if (res.status === 409) { var s = res.j.state; ['picks', 'dials', 'hates', 'avoid', 'notes', 'images', 'answers', 'rev'].forEach(function (k) { state[k] = s[k]; }); drawTray(); go(view.tab); }
        })
        .catch(function () { saveProblem(true); });
    }, 250);
  }
  function payload() { return { brief: state.brief, picks: state.picks, dials: state.dials, hates: state.hates, avoid: state.avoid, notes: state.notes, images: state.images, answers: state.answers, rev: state.rev || 0 }; }
  var picked = function (id) { return state.picks.filter(function (p) { return p.id === id; })[0]; };
  function nextTab(tab) { var t = tabs(); var i = t.indexOf(tab); return i >= 0 && i < t.length - 1 ? t[i + 1] : 'done'; }
  function togglePick(item) {
    var before = state.picks.slice();
    var undo = function () { state.picks = before; save(); drawTray(); drawCards(true); };
    if (picked(item.id)) {
      state.picks = state.picks.filter(function (p) { return p.id !== item.id; });
      notice(S.unpickedNotice, undo);
    } else {
      state.picks.push({ id: item.id, shelf: item.shelf, liked: '', preview: item.preview, description: words(item).description });
      notice(fmt(S.pickedNotice, { n: state.picks.length }), undo, nextTab(view.tab));
    }
    save(); drawTray();
  }

  function tabs() {
    // A shelf with no pictured entries gets no tab: an empty gallery helps nobody.
    return GALLERY.filter(function (g) { return (state.counts || {})[g]; }).concat(['dials']);
  }
  function drawTabs() {
    var ol = $('tabs'); ol.textContent = '';
    tabs().forEach(function (t, i) {
      var a = el('a', { href: '#' + t, 'aria-current': view.tab === t ? 'page' : null }, [el('span', { class: 'mono', text: ('0' + (i + 1)).slice(-2) }), S.tabs[t]]);
      ol.appendChild(el('li', {}, [a]));
    });
    var done = $('done-tab');
    var n = state.picks.length ? ' · ' + state.picks.length : '';
    done.textContent = '';
    done.appendChild(el('span', { class: 'long', text: S.tabs.done + n }));
    done.appendChild(el('span', { class: 'short', 'aria-hidden': 'true', text: S.doneShort + n }));
    if (view.tab === 'done') done.setAttribute('aria-current', 'page'); else done.removeAttribute('aria-current');
  }
  function drawTray() {
    var ul = $('tray-list'); ul.textContent = '';
    $('tray-empty').hidden = state.picks.length > 0;
    $('tray').classList.toggle('is-empty', !state.picks.length);
    $('tray-count').textContent = state.picks.length ? fmt(S.trayCount, { n: state.picks.length }) : '';
    state.picks.forEach(function (p) {
      ul.appendChild(el('li', {}, [
        p.preview ? el('img', { src: p.preview, alt: '', width: 72, height: 45 }) : null,
        el('span', { text: p.description || p.id }),
        el('button', { type: 'button', class: 'link remove', 'aria-label': S.remove + ': ' + (p.description || p.id), on: { click: function () {
          var before = state.picks.slice();
          state.picks = state.picks.filter(function (x) { return x.id !== p.id; });
          save(); drawTray(); if (GALLERY.indexOf(view.tab) >= 0) drawCards(true);
          notice(S.unpickedNotice, function () { state.picks = before; save(); drawTray(); if (GALLERY.indexOf(view.tab) >= 0) drawCards(true); });
        } } }, [el('span', { class: 'remove-text', text: S.remove })]),
      ]));
    });
    drawTabs();
  }

  // first: the opening draw. Focus stays at the top then, so the first Tab reaches the skip link.
  function go(tab, first) {
    view.tab = tab;
    if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab);
    drawTabs();
    var c = state.counts || {};
    $('h1').textContent = (S.leads || {})[tab] || S.tabs[tab];
    $('intro').textContent = fmt((S.panelIntro || {})[tab] || '', { sites: c.sites || 0, motion: c.motion || 0, icons: c.icons || 0 });
    var current = document.querySelector('.tabs [aria-current="page"]');
    // The current step is brought into the strip only when it is out of view, by the amount it is out (either direction).
    if (current) {
      var bar = current.closest('nav'), nr = bar.getBoundingClientRect(), cr = current.getBoundingClientRect();
      var rtl = document.documentElement.dir === 'rtl';
      // Its starting edge first (right in Hebrew): a step wider than the strip still shows where its words begin.
      if (rtl ? cr.right > nr.right : cr.left < nr.left) bar.scrollLeft += rtl ? cr.right - nr.right : cr.left - nr.left;
      else if (rtl ? cr.left < nr.left : cr.right > nr.right) bar.scrollLeft += rtl ? -(nr.left - cr.left + 24) : cr.right - nr.right + 24;
    }
    var panel = $('panel'); panel.textContent = '';
    if (GALLERY.indexOf(tab) >= 0) { view.shelf = tab; view.offset = 0; view.items = []; view.filters = {}; view.q = ''; drawGallery(panel); load(); }
    else if (tab === 'dials') drawDials(panel);
    else drawDone(panel);
    if (tab !== 'done') panel.appendChild(nextRow(tab));
    if (!first) $('main').focus({ preventScroll: true });
    scrollTo(0, 0);
  }
  // The way on sits in the same place at the end of every panel.
  function nextRow(tab) {
    var to = nextTab(tab);
    return el('div', { class: 'next-row' }, [el('a', { class: 'next', href: '#' + to }, [fmt(S.next, { name: S.tabs[to] }), el('span', { class: 'arrow', 'aria-hidden': 'true', text: ' →' })])]);
  }

  function field(id, label, value, onInput, long) {
    var input = el(long ? 'textarea' : 'input', { id: id, dir: 'auto', rows: long ? 2 : null, on: { input: function () { onInput(input.value); save(); } } });
    input.value = value || '';
    return el('div', { class: 'field' }, [el('label', { for: id, text: label }), input]);
  }
  function drawBrief(panel) {
    panel.appendChild(el('h2', { text: S.tabs.brief }));
    panel.appendChild(field('b-business', S.brief.business, state.brief.business, function (v) { state.brief.business = v; }, true));
    panel.appendChild(field('b-action', S.brief.action, state.brief.primaryAction, function (v) { state.brief.primaryAction = v; }));
    if (state.brief.redesign) {
      var fs = el('fieldset', { class: 'choice' }, [el('legend', { text: S.brief.redesign })]);
      ['keep', 'rethink'].forEach(function (k) {
        var id = 'r-' + k;
        var r = el('input', { type: 'radio', name: 'redesign', id: id, value: k, checked: (state.answers.redesign || state.brief.redesign.mode) === k, on: { change: function () { state.answers.redesign = k; save(); } } });
        fs.appendChild(el('div', { class: 'radio' }, [r, el('label', { for: id, text: S.brief[k] })]));
      });
      panel.appendChild(fs);
    }
  }

  function drawGallery(panel) {
    // Motion is a short shelf: grouped by topic, each demo plays only when pointed at or tapped.
    if (view.shelf === 'motion') {
      panel.appendChild(el('div', { id: 'cards', class: 'groups' }));
      panel.appendChild(el('p', { id: 'empty', class: 'empty', hidden: true, text: S.empty }));
      panel.appendChild(el('div', { class: 'more', hidden: true }, [el('p', { id: 'count' }), el('button', { id: 'more', type: 'button', text: S.loadMore })]));
      return;
    }
    var search = el('input', { id: 'q', type: 'search', value: view.q, on: { input: function () { view.q = search.value; reload(); } } });
    var sort = el('select', { id: 'sort', on: { change: function () { view.sort = sort.value; reload(); } } });
    Object.keys(S.sorts).forEach(function (k) { sort.appendChild(el('option', { value: k, text: S.sorts[k], selected: view.sort === k })); });
    // On a phone the search, sort and filters fold under one control, so the pictures come first.
    var body = el('div', { id: 'refine-body', class: 'refine-body' }, [
      el('div', { class: 'toolbar' }, [
        el('div', { class: 'field' }, [el('label', { for: 'q', text: S.search }), search]),
        el('div', { class: 'field' }, [el('label', { for: 'sort', text: S.sort }), sort]),
      ]),
      el('div', { id: 'facets', class: 'facets', role: 'group', 'aria-label': S.filters }),
    ]);
    var refine = el('div', { class: 'refine' });
    var toggle = el('button', { type: 'button', class: 'refine-toggle', 'aria-expanded': 'false', 'aria-controls': 'refine-body', text: S.refine, on: { click: function () {
      var open = refine.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open));
    } } });
    refine.appendChild(toggle); refine.appendChild(body);
    panel.appendChild(refine);
    drawFacets();
    panel.appendChild(el('ul', { id: 'cards', class: 'cards' }));
    panel.appendChild(el('div', { id: 'empty', class: 'empty', hidden: true }));
    panel.appendChild(el('div', { class: 'more' }, [el('p', { id: 'count', class: 'mono muted', role: 'status' }), el('button', { id: 'more', type: 'button', text: S.loadMore, on: { click: function () { view.offset += 50; load(); } } })]));
  }
  function clearAll() { view.filters = {}; view.q = ''; var q = $('q'); if (q) q.value = ''; drawFacets(); reload(); }
  function drawFacets() {
    var box = $('facets'); if (!box) return; box.textContent = '';
    var f = (state.shelves || {})[view.shelf] || {};
    // Each filter is a small collapsible group with readable values; it says how many of its values are on.
    var label = function (facet, v) { return ((S.values || {})[facet] || {})[v] || v; };
    Object.keys(f).forEach(function (facet) {
      var values = Object.keys(f[facet]);
      if (values.length < 2) return;
      var active = (view.filters[facet] || []).length;
      var group = el('details', { class: 'facet', open: view.openFacet === facet }, [el('summary', { text: (S.facetNames[facet] || facet) + (active ? ' (' + active + ')' : '') })]);
      group.addEventListener('toggle', function () { if (group.open) view.openFacet = facet; else if (view.openFacet === facet) view.openFacet = null; });
      var chips = el('div', { class: 'chips' });
      group.appendChild(chips);
      values.sort(function (a, b) { return f[facet][b] - f[facet][a]; }).forEach(function (v) {
        var on = (view.filters[facet] || []).indexOf(v) >= 0;
        chips.appendChild(el('button', { type: 'button', class: 'chip', 'aria-pressed': String(on), text: label(facet, v) + ' · ' + f[facet][v], on: { click: function () {
          var cur = view.filters[facet] || [];
          view.filters[facet] = on ? cur.filter(function (x) { return x !== v; }) : cur.concat(v);
          drawFacets(); reload();
        } } }));
      });
      box.appendChild(group);
    });
    var active = Object.keys(view.filters).some(function (k) { return view.filters[k].length; });
    if (active) box.appendChild(el('button', { type: 'button', class: 'link', text: S.clear, on: { click: clearAll } }));
  }
  var loadTimer = null;
  function reload() { clearTimeout(loadTimer); loadTimer = setTimeout(function () { view.offset = 0; view.items = []; load(); }, 200); }
  function load() {
    var p = new URLSearchParams({ shelf: view.shelf, sort: view.sort, q: view.q, offset: view.offset });
    Object.keys(view.filters).forEach(function (k) { if (view.filters[k].length) p.set('f.' + k, view.filters[k].join(',')); });
    fetch('/_picker/api/library?' + p).then(function (r) { return r.json(); }).then(function (r) {
      view.items = view.offset ? view.items.concat(r.items) : r.items;
      view.total = r.total;
      drawCards(view.offset === 0);
    }).catch(function () { saveProblem(true); });
  }
  function card(item, n) {
    var mark = picked(item.id);
    var eager = n <= EAGER;
    var img = function () { return el('img', { src: item.preview, alt: '', width: 640, height: 400, loading: eager ? 'eager' : 'lazy', fetchpriority: n === 1 ? 'high' : null }); };
    var w = words(item);
    // The whole picture is the pick (the way people pick in any gallery); its badge always says the state.
    // Motion cards play their demo inside the same button.
    var pick = el('button', { type: 'button', class: 'pick', 'aria-pressed': String(!!mark), 'aria-label': (mark ? S.liked : S.like) + ': ' + w.description, on: { click: function () { togglePick(item); drawCards(true); } } }, [
      item.demo ? demoMedia(item, img()) : img(),
      el('span', { class: 'badge', 'aria-hidden': 'true', text: mark ? '\u2713' : '+' }),
    ]);
    var tools = [el('a', { href: item.url, target: '_blank', rel: 'noopener', text: item.demo ? S.openDemo : S.open })];
    if (!item.demo) tools.unshift(el('button', { type: 'button', class: 'link', text: S.bigger, 'aria-label': S.bigger + ': ' + w.description, on: { click: function () { showLarge(item, w); } } }));
    var kids = [
      el('p', { class: 'num mono' }, [el('span', { text: fmt(S.cardNo, { n: pad(n) }) }), el('span', { class: 'state', text: mark ? '\u2713 ' + S.liked : S.tapToPick })]),
      el('div', { class: 'media' }, [pick]),
      el('h2', { class: 'desc', text: w.description }),
      el('p', { class: 'uses' }, [S.bestFor + ': ' + w.bestUse.join(' · ')]),
    ];
    if (mark) {
      var id = 'like-' + item.id;
      var t = el('input', { id: id, dir: 'auto', value: mark.liked || '', on: { input: function () { mark.liked = t.value; save(); } } });
      kids.push(el('div', { class: 'field' }, [el('label', { for: id, text: S.likeWhat }), t]));
    }
    kids.push(el('div', { class: 'actions' }, tools));
    return el('li', { class: 'card' + (mark ? ' is-picked' : '') }, kids);
  }
  // Every demo plays on its own, in a loop, so they can be compared side by side without pointing at each one.
  // The still picture sits underneath until the demo loads; with reduced motion asked for, only the still shows.
  function demoMedia(item, still) {
    var box = el('span', { class: 'demo' }, [still]);
    if (!reduce) box.appendChild(el('iframe', { src: item.demo, title: words(item).description, tabindex: '-1', 'aria-hidden': 'true', loading: 'lazy', width: 640, height: 400 }));
    return box;
  }
  function showLarge(item, w) {
    var d = $('large');
    d.textContent = '';
    // Desktop and phone side by side when the site was captured at both widths.
    d.appendChild(el('div', { class: 'pair' + (item.phone ? ' has-phone' : '') }, [
      el('figure', {}, [el('img', { src: item.large || item.preview, alt: w.description, width: 1280, height: 800 }), item.phone ? el('figcaption', { class: 'mono muted', text: S.onDesktop }) : null]),
      item.phone ? el('figure', { class: 'phone' }, [el('img', { src: item.phone, alt: '', width: 390, height: 844 }), el('figcaption', { class: 'mono muted', text: S.onPhone })]) : null,
    ]));
    d.appendChild(el('p', { text: w.description }));
    d.appendChild(el('form', { method: 'dialog' }, [el('button', { type: 'submit', text: '×', 'aria-label': S.close || 'Close' })]));
    d.showModal();
  }
  // No results: say so, say how many there are without the search and filters, and offer the way back.
  function drawEmpty() {
    var box = $('empty'); if (!box) return;
    box.hidden = view.total > 0;
    if (view.total > 0) return;
    box.textContent = '';
    var said = el('p', { text: S.empty });
    box.appendChild(said);
    box.appendChild(el('button', { type: 'button', text: S.clear, on: { click: clearAll } }));
    fetch('/_picker/api/library?' + new URLSearchParams({ shelf: view.shelf, offset: 0 })).then(function (r) { return r.json(); }).then(function (r) {
      if (r.total) said.textContent = fmt(S.emptyWithout, { n: r.total });
    }).catch(function () {});
  }
  function drawCards(all) {
    var ul = $('cards'); if (!ul) return;
    if (view.shelf === 'motion') {
      ul.textContent = '';
      var n = 0;
      (state.motionTopics || []).forEach(function (topic) {
        var items = view.items.filter(function (it) { return (it.tags || {}).topic === topic; });
        if (!items.length) return;
        var list = el('ul', { class: 'cards' });
        items.forEach(function (it) { list.appendChild(card(it, ++n)); });
        ul.appendChild(el('section', { class: 'group' }, [el('h2', { class: 'group-title', text: S.motionTopics[topic] }), list]));
      });
      $('empty').hidden = view.total > 0;
      return;
    }
    if (all) ul.textContent = '';
    var from = all ? 0 : ul.children.length;
    view.items.slice(from).forEach(function (it, i) { ul.appendChild(card(it, from + i + 1)); });
    drawEmpty();
    $('count').textContent = view.total ? fmt(S.count, { shown: view.items.length, total: view.total }) : '';
    $('more').hidden = view.items.length >= view.total;
  }

  // The feel: three sliders beside an abstract sketch of a page that changes as they move, so the effect is
  // seen, not guessed. It is a sketch of a feeling, never a draft of the site.
  function drawSketch(sk) {
    var d = state.dials.density, l = state.dials.loudness, m = state.dials.motion;
    sk.style.setProperty('--gap', (34 - d * 6) + 'px');
    sk.style.setProperty('--head', (14 + l * 7) + 'px');
    sk.style.setProperty('--accent', ['#9aa59e', '#7d9488', '#4f7c69', '#d0662e', '#ee4b1c'][l - 1]);
    sk.style.setProperty('--accent-share', (10 + l * 9) + '%');
    sk.style.setProperty('--speed', m ? (4.2 - m) + 's' : '0s');
    sk.dataset.motion = String(m);
    sk.dataset.loud = String(l);
    // Replay the arrival so the motion level is seen, not only the looping parts.
    sk.classList.remove('replay'); void sk.offsetWidth; sk.classList.add('replay');
    var cards = sk.querySelector('.sk-cards');
    cards.textContent = '';
    for (var i = 0; i < d + 1; i++) cards.appendChild(el('div', { class: 'sk-card' }));
    var lines = sk.querySelector('.sk-lines');
    lines.textContent = '';
    for (var k = 0; k < d; k++) lines.appendChild(el('div', { class: 'sk-line' }));
  }
  function drawDials(panel) {
    panel.appendChild(el('h2', { text: S.feelTitle }));
    panel.appendChild(el('p', { class: 'muted', text: S.feelHint }));
    var sketch = el('div', { class: 'sketch', 'aria-hidden': 'true' }, [
      el('div', { class: 'sk-bar' }), el('div', { class: 'sk-head' }), el('div', { class: 'sk-lines' }),
      el('div', { class: 'sk-row' }, [el('div', { class: 'sk-pic' }, [el('div', { class: 'sk-pic-in' })]), el('div', { class: 'sk-accent' }, [el('div', { class: 'sk-btn' })])]), el('div', { class: 'sk-cards' }),
      el('div', { class: 'sk-band' }),
    ]);
    var replay = setInterval(function () {
      if (!document.body.contains(sketch)) return clearInterval(replay);
      if (state.dials.motion > 0) { sketch.classList.remove('replay'); void sketch.offsetWidth; sketch.classList.add('replay'); }
    }, 4500);
    var sliders = el('div', { class: 'sliders' });
    [['density', 1, 5], ['loudness', 1, 5], ['motion', 0, 3]].forEach(function (d) {
      var id = 'dial-' + d[0];
      // The usual answer is already set: the middle, and a little motion.
      if (state.dials[d[0]] === undefined) state.dials[d[0]] = d[0] === 'motion' ? 1 : 3;
      // Each level also says in words what it means.
      var said = el('p', { class: 'level', id: id + '-says', 'aria-live': 'polite' });
      var tell = function () { said.textContent = S.levels[d[0]][state.dials[d[0]] - d[1]]; r.setAttribute('aria-valuetext', said.textContent); };
      var r = el('input', { id: id, type: 'range', min: d[1], max: d[2], step: 1, value: state.dials[d[0]], 'aria-describedby': id + '-says', on: { input: function () { state.dials[d[0]] = Number(r.value); tell(); drawSketch(sketch); save(); } } });
      sliders.appendChild(el('div', { class: 'dial' }, [el('label', { for: id, class: 'visually-hidden', text: S.dials[d[0]].join(' - ') }), el('span', { 'aria-hidden': 'true', text: S.dials[d[0]][0] }), r, el('span', { 'aria-hidden': 'true', text: S.dials[d[0]][1] })]));
      sliders.appendChild(said);
      tell();
    });
    panel.appendChild(el('div', { class: 'feel' }, [sliders, sketch]));
    drawSketch(sketch);

    // Dislikes as pictures: each tile draws what the words mean. The AI tells start as avoided.
    panel.appendChild(el('h2', { text: S.dislikesTitle }));
    panel.appendChild(el('p', { class: 'muted', text: S.dislikesHint }));
    state.avoid = state.avoid || [];
    var grid = el('ul', { class: 'dislikes' });
    (state.dislikes || []).forEach(function (dl) {
      var words = S.dislikes[dl.id] || { name: dl.id, why: '' };
      // A two-way switch: the chosen side is filled and ticked, and the tile says the result in words.
      var status = el('p', { class: 'dl-status' });
      var sample = el('div', { class: 'sample s-' + dl.sample, 'aria-hidden': 'true' }, sampleKids(dl.sample));
      var avoidBtn = el('button', { type: 'button', role: 'radio', class: 'seg seg-avoid' });
      var allowBtn = el('button', { type: 'button', role: 'radio', class: 'seg seg-allow' });
      var tile = el('li', { class: 'dislike' }, [
        sample,
        el('h3', { class: 'dl-name' }, [words.name, dl.ai ? el('span', { class: 'ai-badge', text: S.aiLook }) : null]),
        el('p', { class: 'dl-why', text: words.why }),
        el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': words.name }, [avoidBtn, allowBtn]), status,
      ]);
      var show = function () {
        var on = state.avoid.indexOf(dl.id) >= 0;
        avoidBtn.setAttribute('aria-checked', String(on)); allowBtn.setAttribute('aria-checked', String(!on));
        // The chosen side reads as a done state (Avoided / Allowed); the other side reads as the action that switches.
        avoidBtn.textContent = on ? '✕ ' + S.avoided : S.avoid;
        allowBtn.textContent = !on ? '✓ ' + S.allowed : S.allow;
        status.textContent = on ? S.avoidState : (dl.ai ? S.allowState : S.neutralState);
        tile.classList.toggle('is-avoided', on); tile.classList.toggle('is-allowed', !on);
      };
      var set = function (avoid) {
        var was = state.avoid.indexOf(dl.id) >= 0;
        if (was === avoid) return;
        state.avoid = state.avoid.filter(function (x) { return x !== dl.id; }).concat(avoid ? [dl.id] : []);
        show(); save();
        notice(words.name + ': ' + (avoid ? S.avoidState : (dl.ai ? S.allowState : S.neutralState)), function () { set(was); });
      };
      avoidBtn.addEventListener('click', function () { set(true); });
      allowBtn.addEventListener('click', function () { set(false); });
      show();
      grid.appendChild(tile);
    });
    panel.appendChild(grid);
    var other = el('input', { id: 'hate-other', on: { change: function () { if (other.value.trim()) { state.hates.push(other.value.trim()); other.value = ''; save(); drawHates(); } } } });
    panel.appendChild(el('div', { class: 'field' }, [el('label', { for: 'hate-other', text: S.hateOther }), other]));
    var hateList = el('ul', { class: 'hate-list' });
    panel.appendChild(hateList);
    function drawHates() {
      hateList.textContent = '';
      state.hates.forEach(function (h, i) {
        hateList.appendChild(el('li', {}, [el('span', { text: h }), el('button', { type: 'button', class: 'link', text: S.remove, 'aria-label': S.remove + ': ' + h, on: { click: function () { state.hates.splice(i, 1); save(); drawHates(); } } })]));
      });
    }
    drawHates();

    // Pictures: where they come from. Tools are offered only when found, by the name of their key.
    panel.appendChild(el('h2', { text: S.picturesTitle }));
    panel.appendChild(el('p', { class: 'muted', text: S.picturesHint }));
    state.images = state.images || { own: false, ownFolder: '', free: true, generate: [], other: '' };
    var im = state.images;
    var check = function (id, label, value, onChange) {
      var c = el('input', { type: 'checkbox', id: id, checked: !!value, on: { change: function () { onChange(c.checked); save(); } } });
      return el('div', { class: 'radio' }, [c, el('label', { for: id, text: label })]);
    };
    var pics = el('fieldset', { class: 'choice' }, [el('legend', { class: 'visually-hidden', text: S.picturesTitle })]);
    pics.appendChild(check('img-own', S.ownPhotos, im.own, function (v) { im.own = v; }));
    var folder = el('input', { id: 'img-folder', value: im.ownFolder || '', on: { input: function () { im.ownFolder = folder.value; save(); } } });
    pics.appendChild(el('div', { class: 'field' }, [el('label', { for: 'img-folder', text: S.ownFolder }), folder]));
    pics.appendChild(check('img-free', S.freePhotos, im.free, function (v) { im.free = v; }));
    pics.appendChild(el('p', { class: 'dl-name', text: S.generate }));
    if (!(state.imageTools || []).length) pics.appendChild(el('p', { class: 'muted', text: S.noTools }));
    (state.imageTools || []).forEach(function (t) {
      pics.appendChild(check('img-' + t.id, t.name + ' (' + (t.how === 'key' ? S.keyFound : S.connectedTool) + ')', (im.generate || []).indexOf(t.id) >= 0, function (v) {
        im.generate = (im.generate || []).filter(function (x) { return x !== t.id; }).concat(v ? [t.id] : []);
      }));
    });
    var otherTool = el('input', { id: 'img-other', value: im.other || '', autocomplete: 'off', on: { input: function () { im.other = otherTool.value; save(); } } });
    pics.appendChild(el('div', { class: 'field' }, [el('label', { for: 'img-other', text: S.otherTool }), otherTool]));
    panel.appendChild(pics);

    // Notes: anything the panels did not ask.
    panel.appendChild(el('h2', { text: S.notesTitle }));
    var notes = el('textarea', { id: 'notes', rows: 5 });
    notes.value = state.notes || '';
    notes.addEventListener('input', function () { state.notes = notes.value; save(); });
    panel.appendChild(el('div', { class: 'field wide' }, [el('label', { for: 'notes', text: S.notesHint }), notes]));
  }
  // The small drawings inside the dislike tiles: plain shapes, coloured by the sample's class in app.css.
  function sampleKids(kind) {
    var n = { 'icon-boxes': 3, nested: 1, carousel: 3, busy: 6, centred: 3, tiny: 4, eyebrow: 1 }[kind] || 0;
    var kids = [];
    if (kind === 'gradient-text') kids.push(el('span', { text: 'Aa' }));
    if (kind === 'buzzwords') kids.push(el('span', { text: '“Seamless”' }));
    if (kind === 'numbers') kids.push(el('span', { text: '500+' }));
    if (kind === 'glow') kids.push(el('span', { class: 'btn' }));
    if (kind === 'popup') kids.push(el('span', { class: 'box' }));
    if (kind === 'stock') kids.push(el('span', { class: 'head' }), el('span', { class: 'body' }));
    for (var i = 0; i < n; i++) kids.push(el('span', { class: 'part' }));
    return kids;
  }

  // Done: what goes to Claude, in plain lines, and one button that says what it will do.
  function drawDone(panel) {
    var lv = function (k) { return state.dials[k] === undefined ? '' : S.levels[k][state.dials[k] - (k === 'motion' ? 0 : 1)]; };
    var im = state.images || {};
    var pics = ['own', 'free'].filter(function (k) { return im[k]; }).map(function (k) { return S.picturesSummary[k]; })
      .concat((im.generate || []).length ? [S.picturesSummary.generate] : []);
    drawBrief(panel);
    panel.appendChild(el('h2', { text: S.summary.title }));
    var rows = [
      [S.summary.picks, String(state.picks.length), '#' + tabs()[0]],
      [S.dials.density.join(' \u2013 '), lv('density') || S.none, '#dials'],
      [S.dials.loudness.join(' \u2013 '), lv('loudness') || S.none, '#dials'],
      [S.dials.motion.join(' \u2013 '), lv('motion') || S.none, '#dials'],
      [S.summary.avoided, String((state.avoid || []).length + (state.hates || []).length), '#dials'],
      [S.summary.pictures, pics.join(', ') || S.none, '#dials'],
      [S.summary.notes, (state.notes || '').trim() ? S.yes : S.none, '#dials'],
    ];
    var list = el('dl', { class: 'summary' });
    rows.forEach(function (r) { list.appendChild(el('div', {}, [el('dt', { text: r[0] }), el('dd', { text: r[1] }), el('dd', { class: 'change-cell' }, [el('a', { href: r[2], class: 'change', text: S.change, 'aria-label': S.change + ': ' + r[0] })])])); });
    panel.appendChild(list);
    var n = state.picks.length;
    var label = n === 0 ? S.doneButtonNone : n === 1 ? S.doneButtonOne : fmt(S.doneButton, { n: n });
    panel.appendChild(el('h2', { text: S.nextTitle }));
    panel.appendChild(el('ol', { class: 'after' }, S.after.map(function (t) { return el('li', { text: t }); })));
    var msg = el('p', { role: 'status', class: 'sent' });
    var btn = el('button', { type: 'button', class: 'primary', text: label, on: { click: function () {
      btn.setAttribute('aria-busy', 'true'); btn.disabled = true;
      clearTimeout(saveTimer);
      fetch('/_picker/api/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload()) })
        .then(function () { return fetch('/_picker/api/done', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); })
        .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
        .then(function () { msg.className = 'sent'; msg.textContent = S.doneSent; btn.removeAttribute('aria-busy'); })
        .catch(function () { msg.className = 'sent is-problem'; msg.textContent = S.doneFailed || S.saveFailed; btn.disabled = false; btn.removeAttribute('aria-busy'); });
    } } });
    panel.appendChild(el('p', {}, [btn]));
    panel.appendChild(msg);
  }

  fetch('/_picker/api/state').then(function (r) { return r.json(); }).then(function (s) {
    state = s; S = s.strings;
    state.answers = state.answers || {}; state.dials = state.dials || {}; state.hates = state.hates || []; state.avoid = state.avoid || [];
    document.documentElement.lang = s.lang; document.documentElement.dir = s.dir;
    document.title = S.title;
    $('brand').textContent = S.brandName; $('tray-name').textContent = S.tray; $('tray-empty').textContent = S.trayEmpty;
    drawTray();
    var fromHash = function () { var t = (location.hash || '').slice(1); if (t === 'brief') return 'done'; return tabs().concat('done').indexOf(t) >= 0 ? t : tabs()[0]; };
    // Back and forward move between panels, because each panel has its own address.
    addEventListener('hashchange', function () { var t = fromHash(); if (t !== view.tab) go(t); });
    go(fromHash(), true);
    // Shown once the panel and its fonts are ready, so no text jumps from one face to another.
    var shown = function () { document.documentElement.classList.remove('is-loading'); };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(shown, shown);
    setTimeout(shown, 1500);
  }).catch(function () { document.documentElement.classList.remove('is-loading'); $('h1').textContent = 'The picker on this computer is not running.'; });
})();
