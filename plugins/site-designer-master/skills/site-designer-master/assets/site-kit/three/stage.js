/* The 3D stage: runs every [data-scene] on the page so each scene only draws.
   Markup: <div class="scene" data-scene="points" data-points="32.08,34.78"><img src="poster.webp" alt="" width height></div>
   The poster is the page's own picture of the scene: it shows first, stays when motion is reduced, WebGL is
   missing or the scene fails, and is what readers, search engines and printers get. The scene starts after the
   page has loaded (or when it nears the screen), fades in over the poster, draws only while on screen and the tab
   is visible, at a pixel ratio of at most 2, and reads its colours from the brand tokens (--color-<name>).
   A scene file (scenes/<name>.js, classic script) registers itself:
     SDMStage.scene(name, { three: true }, function (ctx) { return { render(f), resize(w, h, dpr), dispose(), ready } })
     ready (optional): a promise; nothing is drawn until it resolves, and the poster stays if it rejects
     ctx: el, canvas, params (data-* values), color(name) '#rrggbb', rgb(name) [r,g,b] 0-1, quad(frag, uniforms),
          THREE (when asked for), still (true when drawing one frame for a poster)
     f:   t seconds, dt, pointer { x, y } -1..1 (0 when away), progress 0..1 (the scene's way through the screen)
     resize also gets the canvas size in device pixels: resize(w, h, dpr, canvasWidth, canvasHeight)
   window.SDM_STILL = <seconds>: draw one frame at that time over the poster and stop, whatever the visitor's
     settings (poster.mjs uses it).
   window.SDM_ONE_FRAME = <seconds>: what a visitor would get, but one frame and no loop (the meter and the critic
     set it: their browsers run on a virtual clock where a drawing loop never lets the page finish). */
(function () {
  'use strict';
  var me = document.currentScript && document.currentScript.src;
  var base = me ? me.replace(/[^/]*$/, '') : 'three/';
  var factories = {};
  var waiting = {};
  var STILL = typeof window.SDM_STILL === 'number' ? window.SDM_STILL : null;
  var ONE = typeof window.SDM_ONE_FRAME === 'number' ? window.SDM_ONE_FRAME : null;
  var FIXED = STILL !== null ? STILL : ONE;
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = function () { reject(new Error('could not load ' + src)); };
      document.head.appendChild(s);
    });
  }
  var threeReady = null;
  function three() {
    if (window.THREE) return Promise.resolve(window.THREE);
    threeReady = threeReady || load(base + 'three.min.js').then(function () { return window.THREE; });
    return threeReady;
  }
  function factoryFor(name) {
    if (factories[name]) return Promise.resolve(factories[name]);
    if (!/^[a-z0-9-]+$/.test(name)) return Promise.reject(new Error('bad scene name ' + name));
    waiting[name] = waiting[name] || load(base + 'scenes/' + name + '.js').then(function () {
      if (!factories[name]) throw new Error('scenes/' + name + '.js did not register ' + name);
      return factories[name];
    });
    return waiting[name];
  }

  function webgl2() {
    try { var c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
  }

  // Any CSS colour, as the page sees it, turned into #rrggbb by painting one pixel.
  var px = document.createElement('canvas'); px.width = px.height = 1;
  var pc = px.getContext('2d', { willReadFrequently: true });
  function toHex(css) {
    pc.clearRect(0, 0, 1, 1); pc.fillStyle = '#000'; pc.fillStyle = css || '#000'; pc.fillRect(0, 0, 1, 1);
    var d = pc.getImageData(0, 0, 1, 1).data;
    return '#' + [d[0], d[1], d[2]].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  // A full-screen fragment shader (GLSL ES 3.00). The source gets uTime, uRes (pixels) and outColor for free.
  function quad(canvas, frag, uniforms) {
    var gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl2');
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nuniform float uTime; uniform vec2 uRes; out vec4 outColor;\n' + frag));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(p, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var units = {};
    function set(name, v) {
      var u = gl.getUniformLocation(p, name);
      if (!u) return;
      if (v instanceof WebGLTexture) {
        if (!(name in units)) units[name] = Object.keys(units).length;
        gl.activeTexture(gl.TEXTURE0 + units[name]); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(u, units[name]);
      } else if (typeof v === 'number') gl.uniform1f(u, v);
      else if (v.length === 2) gl.uniform2fv(u, v);
      else if (v.length === 3) gl.uniform3fv(u, v);
      else if (v.length === 4) gl.uniform4fv(u, v);
    }
    var fixed = uniforms || {};
    var w = 1, h = 1;
    return {
      gl: gl,
      // An image (already loaded, same origin) as a texture for the shader.
      texture: function (img) {
        var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      },
      resize: function (cw, ch) { w = cw; h = ch; gl.viewport(0, 0, cw, ch); },
      draw: function (vals) {
        gl.useProgram(p);
        set('uRes', [w, h]);
        var k;
        for (k in fixed) set(k, fixed[k]);
        for (k in vals || {}) set(k, vals[k]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  function start(el) {
    var api = { state: 'waiting', frames: 0, color: function (n) { return toHex(getComputedStyle(el).getPropertyValue('--color-' + n).trim()); } };
    el.__sdm = api;
    var poster = el.querySelector('img');
    if (STILL === null && reduced) { api.state = 'poster'; return; }
    if (!webgl2()) { api.state = 'poster'; return; }

    var canvas, inst, raf = 0, onScreen = false, t0 = 0, last = 0, pointer = { x: 0, y: 0 }, size = { w: 0, h: 0, dpr: 1 };
    var ro, io, check, faded = false;

    function giveBack(state, err) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      try { if (inst && inst.dispose) inst.dispose(); } catch (e) { /* already broken */ }
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      if (check) { removeEventListener('scroll', check); removeEventListener('resize', check); }
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      if (poster) poster.style.visibility = '';
      inst = null;
      api.sample = null;
      api.state = state;
      if (err) console.warn('scene ' + el.getAttribute('data-scene') + ': ' + (err && err.message || err));
    }
    function progress() {
      var r = el.getBoundingClientRect(), vh = innerHeight || 1;
      return Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
    }
    function measure() {
      var r = el.getBoundingClientRect();
      var coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      var dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);
      var w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
      if (w === size.w && h === size.h && dpr === size.dpr) return;
      size = { w: w, h: h, dpr: dpr };
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      if (inst.resize) inst.resize(w, h, dpr, canvas.width, canvas.height);
    }
    function draw(now) {
      var t = FIXED !== null ? FIXED : (now - t0) / 1000;
      var dt = FIXED !== null ? 0 : Math.min(0.1, (now - last) / 1000 || 0);
      last = now;
      inst.render({ t: t, dt: dt, pointer: pointer, progress: progress() });
      api.frames++;
      if (!faded) {
        faded = true;
        if (FIXED !== null) { canvas.style.opacity = '1'; if (poster) poster.style.visibility = 'hidden'; }
        else {
          canvas.style.transition = 'opacity 600ms ease-out';
          requestAnimationFrame(function () { canvas.style.opacity = '1'; });
          setTimeout(function () { if (inst && poster) poster.style.visibility = 'hidden'; }, 650);
        }
      }
    }
    function loop(now) {
      raf = 0;
      if (!inst) return;
      try { draw(now); } catch (e) { return giveBack('error', e); }
      if (onScreen && !document.hidden) raf = requestAnimationFrame(loop);
    }
    function wake() {
      if (!raf && inst && onScreen && !document.hidden && STILL === null) { last = performance.now(); raf = requestAnimationFrame(loop); }
    }

    api.state = 'loading';
    var name = el.getAttribute('data-scene');
    factoryFor(name).then(function (f) {
      return (f.opts.three ? three() : Promise.resolve(null)).then(function (T) { return { f: f, T: T }; });
    }).then(function (got) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('role', 'presentation');
      canvas.style.opacity = '0';
      el.appendChild(canvas);
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); giveBack('poster', 'the graphics context was lost'); });
      var params = {};
      for (var k in el.dataset) params[k] = el.dataset[k];
      var ctx = {
        el: el, canvas: canvas, params: params, THREE: got.T, still: STILL !== null,
        color: api.color,
        rgb: function (n) { var h = api.color(n); return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; }); },
        quad: function (frag, u) { return quad(canvas, frag, u); },
      };
      inst = got.f.make(ctx);
      if (!inst || typeof inst.render !== 'function') throw new Error('the scene returned nothing to render');
      api.sample = function () {
        // For the meter: draw once and read the whole frame back (a sparse scene, fine dots on a clear ground, slips
        // through any sample grid); distinct is the number of different colours seen, counted up to 64.
        draw(performance.now());
        var gl = canvas.getContext('webgl2');
        var w = canvas.width, h = canvas.height, px = new Uint8Array(w * h * 4), seen = {}, distinct = 0;
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        for (var i = 0; i < px.length && distinct < 64; i += 4) {
          var key = (px[i] >> 3) + ',' + (px[i + 1] >> 3) + ',' + (px[i + 2] >> 3) + ',' + (px[i + 3] >> 3);
          if (!seen[key]) { seen[key] = 1; distinct++; }
        }
        return { distinct: distinct, width: w, height: h };
      };
      // A scene with something to fetch first (a model) says so with a ready promise: nothing is drawn, and the
      // poster stays, until it is there; if it never arrives, the poster stays for good.
      return Promise.resolve(inst.ready).then(go);
    }).catch(function (e) { giveBack('error', e); });

    function go() {
      if (!inst) return;
      measure();
      if (FIXED !== null) { draw(performance.now()); api.state = STILL !== null ? 'still' : 'running'; return; }
      api.state = 'running';
      t0 = last = performance.now();
      ro = window.ResizeObserver ? new ResizeObserver(function () { try { measure(); } catch (e) { giveBack('error', e); } }) : null;
      if (ro) ro.observe(el);
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      }, { passive: true });
      el.addEventListener('pointerleave', function () { pointer.x = 0; pointer.y = 0; }, { passive: true });
      // Whether the scene is on screen is measured directly (at start and on every scroll and resize) and observed.
      // Both must agree: the measurement alone cannot see the screen when the page sits in a frame, and an
      // observer alone can stay silent until the browser paints again.
      var observed = true;
      check = function () { var r = el.getBoundingClientRect(); onScreen = observed && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; wake(); };
      io = new IntersectionObserver(function (es) { observed = es[es.length - 1].isIntersecting; check(); });
      io.observe(el);
      addEventListener('scroll', check, { passive: true });
      addEventListener('resize', check, { passive: true });
      document.addEventListener('visibilitychange', wake);
      check();
    }
  }

  function boot() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-scene]'));
    if (!els.length) return;
    if (FIXED !== null) { els.forEach(start); return; }
    // A scene near the first screen starts once the page is idle; one further down starts as it approaches.
    var pending = els.slice();
    var near = function () {
      pending = pending.filter(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom > -innerHeight / 2 && r.top < innerHeight * 1.5) { start(el); return false; }
        return true;
      });
      if (!pending.length) removeEventListener('scroll', near);
    };
    els.forEach(function (el) { el.__sdm = { state: 'waiting', frames: 0 }; });
    addEventListener('scroll', near, { passive: true });
    near();
  }

  window.SDMStage = {
    scene: function (name, opts, make) { factories[name] = { opts: opts || {}, make: make }; },
    version: 1,
  };
  function whenIdle(fn) {
    var done = false, go = function () { if (!done) { done = true; fn(); } };
    if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 1200 });
    setTimeout(go, 1300);
  }
  if (FIXED !== null) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); }
  else if (document.readyState === 'complete') whenIdle(boot);
  else addEventListener('load', function () { whenIdle(boot); });
})();
