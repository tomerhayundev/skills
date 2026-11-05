// The visual system as one page (/_system/ in a development build): every colour with its role and the contrast
// of the text set on it, every type size in its real face with the site's own words, the space steps, the
// corners and the motion. Drawn from the site's own variables, so the page shows what the pages are made of.
// The user sees it with the directions; the critic judges every page against it.
import { contrast } from './lib/color.mjs';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Text colour on surface colour: the pairs a page actually sets.
const PAIRS = [['ink', 'ground'], ['ink', 'surface'], ['ink-muted', 'ground'], ['accent-ink', 'accent'], ['accent', 'ground'], ['danger', 'ground'], ['success', 'ground']];

export function systemSheet(tokens, site) {
  const color = tokens.color || {};
  const steps = tokens.type?.steps || {};
  const families = tokens.type?.families || [];
  const faceOf = (step) => (['display', 'h1', 'h2', 'h3'].includes(step) && families.some((f) => f.role === 'display') ? 'display' : 'body');
  const sample = esc(site.name || 'Sample');
  const words = esc([site.name, site.pages?.[0]?.description].filter(Boolean).join(': ') || 'Sample text');
  const leading = tokens.type?.leading || {};
  const leadOf = (step) => (step === 'display' ? leading.display : ['h1', 'h2', 'h3'].includes(step) ? leading.heading || leading.display || 1.15 : leading.body) || 1.4;
  const out = [];
  const L = (s) => out.push(s);
  // The page's own words are English and read left to right; the samples keep the site's language and direction.
  const own = `lang="${esc(site.lang || 'en')}" dir="${esc(site.dir || 'auto')}"`;
  L('<section class="review system" lang="en" dir="ltr">');
  L('  <h1>What every page is made from</h1>');
  L('  <p>This page exists only in the development build. Every colour, size, space and corner on the site comes from here; anything on a page that is not here is a mistake to name and fix.</p>');
  L('  <h2>Colours</h2>');
  L('  <ul class="system-swatches" style="list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: var(--space-3, 12px)">');
  for (const [role, hex] of Object.entries(color)) {
    L(`    <li><span data-role="${esc(role)}" style="background: var(--color-${esc(role)}); display: block; block-size: 4rem; border: 1px solid var(--color-border, #ccc)"></span><b>${esc(role)}</b> ${esc(hex)}</li>`);
  }
  L('  </ul>');
  const pairs = PAIRS.filter(([fg, bg]) => color[fg] && color[bg]);
  if (pairs.length) {
    L('  <h3>Text on colour</h3>');
    L('  <ul class="system-pairs" style="list-style: none; padding: 0">');
    for (const [fg, bg] of pairs) L(`    <li style="background: var(--color-${bg}); color: var(--color-${fg}); padding: var(--space-2, 8px) var(--space-3, 12px)">${fg} on ${bg} ${contrast(color[fg], color[bg]).toFixed(2)}:1</li>`);
    L('  </ul>');
  }
  L('  <h2>Type</h2>');
  for (const f of families) L(`  <p><b>${esc(f.role)}</b>: ${esc(f.name)} (${esc((f.scripts || []).join(', ') || 'latin')})</p>`);
  for (const [step, px] of Object.entries(steps)) {
    L(`  <p ${own} style="font-family: var(--font-${faceOf(step)}); font-size: var(--step-${step}); line-height: ${leadOf(step)}; margin: 0">${['body', 'small'].includes(step) ? words : sample}</p>`);
    L(`  <p class="system-label"><code>${step} ${px}px</code></p>`);
  }
  L('  <h2>Space</h2>');
  L('  <ul class="system-space" style="list-style: none; padding: 0">');
  (tokens.space || []).forEach((v, i) => L(`    <li><span style="display: inline-block; inline-size: var(--space-${i + 1}); block-size: 12px; background: var(--color-accent)"></span> <code>space-${i + 1} ${v}px</code></li>`));
  L('  </ul>');
  L('  <h2>Corners</h2>');
  L('  <p class="review-row">');
  (tokens.radius || []).forEach((v, i) => L(`    <span style="display: inline-block; inline-size: 6rem; block-size: 4rem; border: 2px solid var(--color-ink); border-radius: var(--radius-${i + 1})"></span> <code>corner ${v}px</code>`));
  L('  </p>');
  if (tokens.motion) {
    L('  <h2>Motion</h2>');
    L('  <ul style="list-style: none; padding: 0">');
    for (const [k, v] of Object.entries(tokens.motion)) L(`    <li><code>motion-${esc(k)} ${esc(v)}</code></li>`);
    L('  </ul>');
  }
  L('</section>');
  return `${out.join('\n')}\n`;
}
