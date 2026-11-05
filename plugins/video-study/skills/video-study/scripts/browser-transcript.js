// Run in a video watch page (paste, then call). Opens the page's own transcript panel and keeps the text in the page,
// one line per segment with its timestamp. The panel can render twice; repeated lines are dropped, order is kept.
// While an ad plays the panel stays empty: the call presses Skip if it can and returns { ad: true }; call it again.
// Returns the first chunk; read the rest with __tx.slice(from, to).
async () => {
  const SEL = 'ytd-transcript-segment-renderer, transcript-segment-view-model';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const player = document.querySelector('#movie_player');
  if (player?.classList.contains('ad-showing')) {
    document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button')?.click();
    return { ad: true, note: 'an ad is playing; wait a few seconds and call again' };
  }
  let segs = [...document.querySelectorAll(SEL)];
  if (!segs.length) {
    const label = (b) => (b.getAttribute('aria-label') || b.textContent).trim();
    const find = () => {
      const buttons = [...document.querySelectorAll('button')];
      return buttons.find((b) => /^show transcript$/i.test(label(b))) || buttons.find((b) => /transcript/i.test(label(b)) && !/close/i.test(label(b)));
    };
    // The description and its transcript button can draw 10-20 s after the page loads (slower after reloads).
    // 25 s here plus 12 s for the lines stays under a 45 s browser-tool limit.
    let btn = find();
    for (let i = 0; i < 50 && !btn; i++) { await wait(500); document.querySelector('#expand')?.click(); btn = find(); }
    btn?.click();
    for (let i = 0; i < 24 && !segs.length; i++) { await wait(500); segs = [...document.querySelectorAll(SEL)]; }
    if (!segs.length) return { lines: 0, button: !!btn, note: btn ? 'the panel did not fill; call again' : 'no transcript button: the video may have no captions' };
  }
  const seen = new Set();
  const lines = [];
  for (const s of segs) {
    const line = s.innerText.replace(/\s+/g, ' ').trim();
    if (line && !seen.has(line)) { seen.add(line); lines.push(line); }
  }
  window.__tx = lines.join('\n');
  const v = document.querySelector('video');
  return { title: document.title, duration: v && Math.round(v.duration), lines: lines.length, chars: __tx.length,
    first: lines[0], last: lines[lines.length - 1], chunk: __tx.slice(0, 9000) };
}
