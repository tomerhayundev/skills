// Run in a video watch page (paste, then call with optional step seconds). Steps through the whole video, drops a frame
// that barely differs from the last kept one, tiles 12 per sheet (3 across, 4 down) with timestamps, and keeps the
// sheets in the page. It runs in the background (a browser tool gives up on a call after about 45 s): the call returns
// at once; read __sheetsState until done is true. Then __show(i) puts sheet i over the page for a screenshot;
// __show(-1) removes it. If an ad is playing it returns { ad: true } without starting; call again after it.
(step = 4) => {
  if (document.querySelector('#movie_player')?.classList.contains('ad-showing')) {
    document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')?.click();
    return { ad: true, note: 'an ad is playing; wait a few seconds and call again' };
  }
  window.__sheetsState = { done: false, grabbed: 0, kept: 0, sheets: 0 };
  (async () => {
  const v = document.querySelector('video');
  v.pause(); v.muted = true;
  const W = 400, H = 225, cols = 3, rows = 4, per = cols * rows;
  const tiny = document.createElement('canvas'); tiny.width = 64; tiny.height = 36;
  const tg = tiny.getContext('2d', { willReadFrequently: true });
  const seek = (t) => new Promise((r) => { const d = () => { v.removeEventListener('seeked', d); r(); }; v.addEventListener('seeked', d); v.currentTime = t; setTimeout(d, 4000); });
  let last = null, grabbed = 0;
  const kept = [];
  const duration = v.duration;
  for (let t = Math.min(2, step / 2); t < duration - 0.5; t += step) {
    // A mid-roll ad plays in the same video element: wait it out so no ad frame lands on a sheet.
    while (document.querySelector('#movie_player')?.classList.contains('ad-showing')) {
      window.__sheetsState.ad = true;
      document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')?.click();
      await new Promise((r) => setTimeout(r, 1000));
    }
    window.__sheetsState.ad = false;
    await seek(t);
    await new Promise((r) => setTimeout(r, 300));
    grabbed++; window.__sheetsState.grabbed = grabbed; window.__sheetsState.at = Math.round(t);
    tg.drawImage(v, 0, 0, 64, 36);
    const px = tg.getImageData(0, 0, 64, 36).data;
    const g = new Float32Array(64 * 36);
    for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] + px[i * 4 + 1] + px[i * 4 + 2]) / 3;
    if (last) { let s = 0; for (let i = 0; i < g.length; i++) s += Math.abs(g[i] - last[i]); if (s / g.length < 6) continue; }
    last = g;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.getContext('2d').drawImage(v, 0, 0, W, H);
    kept.push({ t, c }); window.__sheetsState.kept = kept.length;
  }
  const stamp = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
  window.__sheets = [];
  for (let i = 0; i < kept.length; i += per) {
    const s = document.createElement('canvas'); s.width = cols * W; s.height = rows * (H + 20);
    const g = s.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, s.width, s.height); g.font = 'bold 15px sans-serif';
    kept.slice(i, i + per).forEach((k, j) => {
      const x = (j % cols) * W, y = Math.floor(j / cols) * (H + 20);
      g.drawImage(k.c, x, y + 20); g.fillStyle = '#000'; g.fillText(stamp(k.t), x + 6, y + 15);
    });
    window.__sheets.push(s.toDataURL('image/jpeg', 0.85));
  }
  // Resolves once the sheet is painted: a screenshot taken straight after setting src shows the page underneath.
  window.__show = async (i) => {
    let o = document.getElementById('__sheet');
    if (i < 0) { o?.remove(); return 'removed'; }
    if (!o) { o = document.createElement('img'); o.id = '__sheet'; o.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain;background:#fff;z-index:2147483647'; document.body.appendChild(o); }
    o.src = window.__sheets[i];
    await o.decode();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return `sheet ${i + 1} of ${window.__sheets.length}`;
  };
  window.__sheetsState = { done: true, duration: Math.round(duration), grabbed, kept: kept.length, sheets: window.__sheets.length };
  })().catch((e) => { window.__sheetsState = { done: true, error: String(e) }; });
  return { started: true, duration: Math.round(document.querySelector('video').duration), note: 'read __sheetsState until done' };
}
