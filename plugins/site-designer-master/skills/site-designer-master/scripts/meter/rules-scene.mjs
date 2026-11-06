// 3D scene rules (three/stage.js): a scene draws something real or does not ship, its poster is there whenever
// the scene is not (reduced motion, no WebGL), one 3D idea per page, and no canvas that a screen reader lands on.
export function sceneRules(f, { pass }) {
  const out = [];
  const x = f.extra || {};
  const scenes = x.scenes || [];
  for (const s of scenes) {
    if (!s.poster || s.posterLazy) out.push({ id: 'SCENE_POSTER', detail: `scene ${s.name}: ${!s.poster ? 'no poster picture first inside it' : 'the poster is lazy'}`, selector: s.sel });
    if (pass === 'main') {
      if (s.state === 'error') out.push({ id: 'SCENE_BLANK', detail: `scene ${s.name} failed to start; visitors get only its poster`, selector: s.sel });
      else if ((s.state === 'running' || s.state === 'still') && s.sample && !s.sample.error && s.sample.distinct <= 2) out.push({ id: 'SCENE_BLANK', detail: `scene ${s.name} draws one flat colour`, selector: s.sel });
      else if (s.state === 'poster' || s.state === 'no stage') out.push({ id: 'SCENE_UNCHECKED', detail: `scene ${s.name} did not run in the checking browser (${s.state}); look at it yourself`, selector: s.sel });
      if (!s.canvasHidden) out.push({ id: 'CANVAS_ARIA', detail: `scene ${s.name}: its canvas is not hidden from screen readers`, selector: s.sel });
    }
    if ((pass === 'motion' || pass === 'nowebgl') && (s.canvas || !s.posterShown)) {
      const why = pass === 'motion' ? 'with reduced motion' : 'without WebGL';
      out.push({ id: 'SCENE_FALLBACK', detail: `scene ${s.name} ${why}: ${s.canvas ? 'still draws' : 'its poster does not show'}`, selector: s.sel });
    }
  }
  if (pass === 'main' && scenes.length > 1) out.push({ id: 'SCENE_COUNT', detail: `${scenes.length} scenes on one page; one 3D idea per page` });
  if (pass === 'main') for (const c of x.canvases || []) out.push({ id: 'CANVAS_ARIA', detail: 'a canvas screen readers reach: aria-hidden="true", or role="img" with a label', selector: c.sel });
  return out;
}
