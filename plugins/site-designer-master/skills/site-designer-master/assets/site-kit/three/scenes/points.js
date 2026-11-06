/* points: a sphere of evenly spread dots, for "where we are, where we deliver, who we connect". three.js.
   data-points   places as "lat,lon" separated by ";" (real ones from the brief), drawn in the accent, larger;
                 consecutive places are joined by a soft arc
   data-count    dots on the sphere, 400-6000 (default 2400)
   data-colors   "<dots> <places>" token names (default "ink-muted accent")
   data-motion   idle (a slow turn) | scroll (turns as the page passes) | still
   Dots on the far side fade out, so the sphere reads as round with no lighting at all. */
SDMStage.scene('points', { three: true }, function (ctx) {
  var T = ctx.THREE, P = ctx.params;
  var renderer = new T.WebGLRenderer({ canvas: ctx.canvas, antialias: true, alpha: true });
  var scene = new T.Scene(), camera = new T.PerspectiveCamera(30, 1, 0.1, 50);
  var names = (P.colors || 'ink-muted accent').split(/\s+/);
  var dotColour = new T.Color(ctx.color(names[0])), placeColour = new T.Color(ctx.color(names[1] || 'accent'));
  var n = Math.min(6000, Math.max(400, parseInt(P.count || '2400', 10)));
  var globe = new T.Group();
  scene.add(globe);

  // Even spread: the Fibonacci sphere.
  var pos = new Float32Array(n * 3), golden = Math.PI * (3 - Math.sqrt(5));
  for (var i = 0; i < n; i++) {
    var y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * golden;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(a) * r;
  }
  function dots(positions, colour, size, pulse) {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(positions, 3));
    var m = new T.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: colour }, uSize: { value: size }, uDpr: { value: 1 }, uTime: { value: 0 }, uPulse: { value: pulse ? 1 : 0 } },
      vertexShader: [
        'uniform float uSize; uniform float uDpr; uniform float uTime; uniform float uPulse; varying float vFacing;',
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vec3 n = normalize(normalMatrix * position); vFacing = dot(n, normalize(-mv.xyz));',
        '  float s = uSize * (1.0 + uPulse * 0.25 * sin(uTime * 2.0 + position.x * 9.0));',
        '  gl_PointSize = s * uDpr * (4.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 uColor; varying float vFacing;',
        'void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard;',
        '  float edge = 1.0 - smoothstep(0.38, 0.5, d); float far = smoothstep(-0.25, 0.35, vFacing);',
        '  gl_FragColor = vec4(uColor, edge * mix(0.12, 1.0, far));',
        '#include <colorspace_fragment>',
        '}',
      ].join('\n'),
    });
    return new T.Points(g, m);
  }
  var field = dots(pos, dotColour, 2.2, false);
  globe.add(field);

  var places = (P.points || '').split(';').map(function (s) { return s.split(',').map(Number); })
    .filter(function (p) { return p.length === 2 && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180; });
  function onSphere(lat, lon, rad) {
    var phi = (90 - lat) * Math.PI / 180, th = (lon + 180) * Math.PI / 180;
    return new T.Vector3(-rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
  }
  var marks = null, arcs = [];
  if (places.length) {
    var mp = new Float32Array(places.length * 3);
    places.forEach(function (p, k) { var v = onSphere(p[0], p[1], 1.01); mp[k * 3] = v.x; mp[k * 3 + 1] = v.y; mp[k * 3 + 2] = v.z; });
    marks = dots(mp, placeColour, 9, true);
    globe.add(marks);
    for (var k = 1; k < places.length; k++) {
      var a0 = onSphere(places[k - 1][0], places[k - 1][1], 1).normalize(), a1 = onSphere(places[k][0], places[k][1], 1).normalize();
      var lift = 1 + 0.25 * a0.angleTo(a1) / Math.PI, pts = [];
      for (var s = 0; s <= 48; s++) {
        var t = s / 48, v = new T.Vector3().copy(a0).lerp(a1, t).normalize();
        pts.push(v.multiplyScalar(1 + (lift - 1) * Math.sin(Math.PI * t)));
      }
      var line = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: placeColour, transparent: true, opacity: 0.7 }));
      arcs.push(line);
      globe.add(line);
    }
    // Turn the first place towards the viewer at rest.
    var first = onSphere(places[0][0], places[0][1], 1);
    globe.rotation.y = -Math.atan2(first.x, first.z);
  }
  var rest = globe.rotation.y;
  // Tilt so the places sit near the middle of the view, not on the rim.
  var meanLat = places.length ? places.reduce(function (s, p) { return s + p[0]; }, 0) / places.length : 20;
  globe.rotation.x = Math.max(-0.9, Math.min(0.9, meanLat * Math.PI / 180 * 0.85));

  var motion = P.motion || 'idle';
  return {
    render: function (f) {
      if (motion === 'scroll') globe.rotation.y = rest - 0.8 + f.progress * 1.6;
      else if (motion === 'idle') globe.rotation.y = rest + f.t * 0.06;
      if (marks) marks.material.uniforms.uTime.value = f.t;
      renderer.render(scene, camera);
    },
    resize: function (w, h, dpr) {
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      var fov = camera.fov * Math.PI / 180, fit = (arcs.length ? 1.3 : 1.12) / Math.sin(Math.min(fov, fov * camera.aspect) / 2);
      camera.position.set(0, 0, fit);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      field.material.uniforms.uDpr.value = dpr;
      if (marks) marks.material.uniforms.uDpr.value = dpr;
    },
    dispose: function () { renderer.dispose(); },
  };
});
