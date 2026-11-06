/* ripple: the poster picture itself answers the pointer with a soft lens that follows it and settles back. At
   rest it is exactly the picture, so the poster and the scene never differ. No library: one shader.
   Use it on one picture that is the point of the page (a portfolio piece, a dish, a room), not on every image.
   data-strength  0.2-1.5 (default 1)
   data-lens      "x,y" 0-1: where the lens sits when one still frame is drawn (a preview); none by default
   The picture must come from the site itself (a picture from another site cannot be drawn into the canvas). */
SDMStage.scene('ripple', {}, function (ctx) {
  var img = ctx.el.querySelector('img');
  if (!img || !img.complete || !img.naturalWidth) throw new Error('ripple needs its picture loaded first');
  var strength = Math.min(1.5, Math.max(0.2, parseFloat(ctx.params.strength || '1')));
  var q = ctx.quad([
    'uniform sampler2D uImg; uniform vec2 uImgSize; uniform vec2 uPointer; uniform float uForce; uniform float uStrength;',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    // object-fit: cover, like the poster.
    '  float ra = uRes.x / uRes.y, ia = uImgSize.x / uImgSize.y; vec2 s = ra > ia ? vec2(1.0, ia / ra) : vec2(ra / ia, 1.0);',
    '  vec2 tuv = (uv - 0.5) * s + 0.5;',
    '  vec2 d = (uv - uPointer) * vec2(ra, 1.0); float r = length(d);',
    '  float lens = uForce * uStrength * exp(-r * r * 18.0);',
    '  vec2 off = -normalize(d + 1e-5) * lens * 0.035 * s;',
    '  vec3 col = vec3(texture(uImg, tuv + off * 1.15).r, texture(uImg, tuv + off).g, texture(uImg, tuv + off * 0.85).b);',
    '  outColor = vec4(col, 1.0);',
    '}',
  ].join('\n'), { uStrength: strength });
  var tex = q.texture(img);
  var px = 0.5, py = 0.5, force = 0;
  var lens = ctx.still && /^[\d.]+,[\d.]+$/.test(ctx.params.lens || '') ? ctx.params.lens.split(',').map(Number) : null;
  if (lens) { px = lens[0]; py = lens[1]; force = 1; }
  return {
    render: function (f) {
      if (lens) return q.draw({ uImg: tex, uImgSize: [img.naturalWidth, img.naturalHeight], uPointer: [px, py], uForce: force });
      var inside = f.pointer.x !== 0 || f.pointer.y !== 0;
      var tx = (f.pointer.x + 1) / 2, ty = (f.pointer.y + 1) / 2;
      px += (tx - px) * Math.min(1, f.dt * 6); py += (ty - py) * Math.min(1, f.dt * 6);
      force += ((inside ? 1 : 0) - force) * Math.min(1, f.dt * 3);
      q.draw({ uImg: tex, uImgSize: [img.naturalWidth, img.naturalHeight], uPointer: [px, py], uForce: force });
    },
    resize: function (w, h, dpr, cw, ch) { q.resize(cw, ch); },
  };
});
