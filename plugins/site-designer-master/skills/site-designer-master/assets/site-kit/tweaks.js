// The tweak panel (development builds only): the user steers the look by sight. Every change is applied live
// through CSS custom properties; Save sends the new token values to the local server, which checks them
// against the floors and rebuilds. A value the floors refuse is reported, never saved.
(function () {
  var state = null;
  var floors = { TEXT_MIN_PX: 13, DISPLAY_MAX_PX: 96 };
  var root = document.documentElement;
  var steps = { display: 5, h1: 3, h2: 2, h3: 1, body: 0, small: -1 };

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  // The same limits the server applies when it saves (tokens.mjs scaleSteps).
  function scale(body, ratio) {
    var out = {};
    for (var k in steps) out[k] = Math.round(body * Math.pow(ratio, steps[k]));
    out.small = Math.max(floors.TEXT_MIN_PX, Math.round(body / ratio));
    out.display = Math.max(out.h1, Math.min(out.display, floors.DISPLAY_MAX_PX));
    return out;
  }
  function apply(t) {
    var s = scale(t.type.steps.body, t.type.ratio);
    for (var k in s) root.style.setProperty('--step-' + k, s[k] + 'px');
    root.style.setProperty('--color-accent', t.color.accent);
    root.style.setProperty('--density', t.density || 1);
    (t.radius || []).forEach(function (r, i) { root.style.setProperty('--radius-' + (i + 1), r + 'px'); });
    root.style.setProperty('--motion-scale', (t.motion && t.motion.scale) || 1);
    var fams = t.type.families || [];
    var fam = function (role) { var f = fams.filter(function (x) { return x.role === role; })[0]; return f ? "'" + f.name + "', " + (f.fallback || 'sans-serif') : null; };
    if (t.headingFamily) root.style.setProperty('--font-display', t.headingFamily);
    else if (fam('display')) root.style.setProperty('--font-display', fam('display'));
  }

  function control(label, input, out) {
    var lab = el('label', { for: input.id, text: label });
    if (out) lab.appendChild(out);
    return [lab, input];
  }
  function range(id, min, max, step, value, onInput) {
    var i = el('input', { id: id, type: 'range', min: min, max: max, step: step, value: value });
    var o = el('output', { for: id, text: String(value) });
    i.addEventListener('input', function () { o.textContent = i.value; onInput(Number(i.value)); apply(state); });
    return { input: i, out: o };
  }

  function build(tokens) {
    state = JSON.parse(JSON.stringify(tokens));
    state.density = state.density || 1;
    var panel = el('aside', { class: 'sdm-tweaks', 'aria-label': 'Tweaks', hidden: '' });
    panel.appendChild(el('h2', { text: 'Tweaks' }));
    var ratio = range('sdm-ratio', 1.125, 1.618, 0.005, state.type.ratio, function (v) { state.type.ratio = v; });
    var body = range('sdm-body', 16, 22, 1, state.type.steps.body, function (v) { state.type.steps.body = v; });
    var density = range('sdm-density', 0.75, 1.5, 0.05, state.density, function (v) { state.density = v; });
    var motion = range('sdm-motion', 0, 2, 0.1, (state.motion && state.motion.scale) || 1, function (v) { state.motion = state.motion || {}; state.motion.scale = v; });
    var accent = el('input', { id: 'sdm-accent', type: 'color', value: state.color.accent });
    accent.addEventListener('input', function () { state.color.accent = accent.value; apply(state); });
    var radius = el('select', { id: 'sdm-radius' });
    [['square', [0, 2, 4]], ['soft', [0, 6, 12]], ['round', [0, 16, 999]]].forEach(function (o) {
      var opt = el('option', { value: o[1].join(','), text: o[0] });
      if (String(state.radius) === o[1].join(',')) opt.selected = true;
      radius.appendChild(opt);
    });
    radius.addEventListener('change', function () { state.radius = radius.value.split(',').map(Number); apply(state); });
    var head = el('select', { id: 'sdm-head' });
    (state.type.families || []).forEach(function (f) { head.appendChild(el('option', { value: "'" + f.name + "', " + (f.fallback || 'sans-serif'), text: f.name + ' (' + f.role + ')' })); });
    head.addEventListener('change', function () { state.headingFamily = head.value; apply(state); });

    [].concat(
      control('Heading font', head), control('Type scale', ratio.input, ratio.out), control('Body size (px)', body.input, body.out),
      control('Accent', accent), control('Density', density.input, density.out), control('Corners', radius), control('Motion', motion.input, motion.out)
    ).forEach(function (n) { panel.appendChild(n); });

    var msg = el('p', { class: 'sdm-msg', role: 'status' });
    var save = el('button', { type: 'button', class: 'sdm-save', text: 'Save' });
    var reset = el('button', { type: 'button', text: 'Undo changes' });
    reset.addEventListener('click', function () { location.reload(); });
    save.addEventListener('click', function () {
      var body = { tokens: { type: { ratio: state.type.ratio, steps: { body: state.type.steps.body } }, color: { accent: state.color.accent }, radius: state.radius, density: state.density, motion: state.motion } };
      fetch('/_tweaks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          msg.className = 'sdm-msg' + (res.ok ? '' : ' is-error');
          msg.textContent = res.ok ? 'Saved. The site was rebuilt with these values.' : 'Not saved: ' + res.j.errors.join('; ');
        })
        .catch(function () { msg.className = 'sdm-msg is-error'; msg.textContent = 'Not saved: the local server did not answer.'; });
    });
    panel.appendChild(el('div', { class: 'sdm-actions' }, [save, reset]));
    panel.appendChild(msg);

    var toggle = el('button', { type: 'button', class: 'sdm-tweaks-toggle', 'aria-expanded': 'false', text: 'Tweaks' });
    toggle.addEventListener('click', function () {
      var open = panel.hasAttribute('hidden');
      if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
      toggle.setAttribute('aria-expanded', String(open));
    });
    document.body.appendChild(panel);
    document.body.appendChild(toggle);
  }

  fetch('/_tweaks').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.floors) floors = j.floors; if (j && j.tokens) build(j.tokens); }).catch(function () { /* opened from disk: no panel */ });
})();
