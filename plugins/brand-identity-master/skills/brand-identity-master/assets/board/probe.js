// Injected by render.mjs into a temporary copy of a board. Measures what the checks read and writes it into the page.
(async () => {
  const emit = (o) => {
    const s = document.createElement('script');
    s.type = 'application/json';
    s.id = '__probe_out';
    s.textContent = JSON.stringify(o).replace(/</g, '\\u003c');
    document.body.appendChild(s);
  };
  try {
    await document.fonts.ready;
    await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
    const rect = (e) => { const r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; };
    const solid = (c) => {
      const m = /rgba?\(([^)]+)\)/.exec(c);
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      return p.length < 4 || p[3] >= 0.99 ? `rgb(${p[0]}, ${p[1]}, ${p[2]})` : null;
    };
    const ground = (e) => {
      for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
        if (n.dataset && n.dataset.ground) return { color: n.dataset.ground };
        const s = getComputedStyle(n);
        if (s.backgroundImage && s.backgroundImage !== 'none') return { image: true };
        const c = solid(s.backgroundColor);
        if (c) return { color: c };
      }
      return { color: 'rgb(255, 255, 255)' };
    };
    const ids = new Map();
    const texts = [];
    for (const e of document.body.querySelectorAll('*')) {
      if (e.closest('script, style, [data-probe-skip]')) continue;
      const inSvg = !!e.closest('svg');
      if (inSvg && !/^(text|textPath|tspan)$/i.test(e.tagName)) continue;
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
      if (!own) continue;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      let parent = null;
      for (let n = e.parentElement; n; n = n.parentElement) if (ids.has(n)) { parent = ids.get(n); break; }
      ids.set(e, texts.length);
      texts.push({
        i: texts.length, parent, text: own, rect: rect(e), size: parseFloat(s.fontSize), weight: Number(s.fontWeight) || 400,
        color: s.color, ground: ground(e), family: s.fontFamily, dir: s.direction,
        system: !!e.closest('[data-system]'), note: !!e.closest('[data-note]'), svg: inSvg, placeholder: !!e.closest('[data-placeholder]'), proposed: !!e.closest('[data-proposed]'), misuse: !!e.closest('[data-misuse]'), example: !!e.closest('[data-example]'), mockup: !!e.closest('[data-mockup]'),
        clipped: s.overflow !== 'visible' && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1),
      });
    }
    const logos = [...document.querySelectorAll('[data-logo]')].map((e) => {
      const box = rect(e);
      const isImg = e.tagName === 'IMG';
      let content = box;
      if (isImg && e.naturalWidth && /contain|scale-down/.test(getComputedStyle(e).objectFit)) {
        const k = Math.min(box.w / e.naturalWidth, box.h / e.naturalHeight);
        content = { ...box, w: e.naturalWidth * k, h: e.naturalHeight * k };
      }
      return { tag: e.tagName.toLowerCase(), src: e.getAttribute('src'), natural: isImg ? { w: e.naturalWidth, h: e.naturalHeight } : null, box, content, misuse: !!e.closest('[data-misuse]'), mockup: !!e.closest('[data-mockup]'), proposed: !!e.closest('[data-proposed]'), detail: !!e.closest('[data-detail]') };
    });
    // Patterns, drawings and textures, so the checks can keep them out of every logo's clear space.
    const decor = [];
    for (const e of document.body.querySelectorAll('*')) {
      if (e.matches('[data-logo]') || e.closest('script, style, [data-probe-skip], [data-misuse], [data-detail], [data-construction]')) continue;
      if (e.parentElement && e.parentElement.closest('svg')) continue;
      const s = getComputedStyle(e);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
      const bg = s.backgroundImage || 'none';
      let kind = null;
      if (e.matches('.pattern, [data-pattern]') || e.tagName.toLowerCase() === 'svg' || /repeating-radial|url\(/.test(bg)) kind = 'pattern';
      else if (/repeating-/.test(bg)) kind = 'texture';
      if (kind) decor.push({ kind, cls: String(e.getAttribute('class') || e.tagName.toLowerCase()).slice(0, 40), rect: rect(e), mockup: !!e.closest('[data-mockup]') });
    }
    const swatches = [...document.querySelectorAll('[data-swatch]')].map((e) => {
      const card = e.closest('[data-swatch-card]') || e;
      return { declared: e.dataset.swatch, bg: getComputedStyle(e).backgroundColor, printed: [...card.querySelectorAll('[data-hex]')].map((h) => h.textContent.trim()) };
    });
    const cards = [...document.querySelectorAll('.card, .scene, .tile, .collage, .hero-name, .hero')].map((e) => { const s = getComputedStyle(e); return { cls: e.className, bg: s.backgroundColor, image: s.backgroundImage !== 'none', edge: s.boxShadow !== 'none' || (s.borderTopStyle !== 'none' && parseFloat(s.borderTopWidth) > 0) || (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) }; });
    const blocks = [...document.querySelectorAll('[data-block]')].map((e) => ({ id: e.dataset.block, rect: rect(e) }));
    const de = document.documentElement;
    emit({
      ok: true,
      doc: { width: de.scrollWidth, height: de.scrollHeight, viewport: innerWidth, dir: getComputedStyle(document.body).direction, lang: de.lang, placeholderNote: !!document.querySelector('[data-placeholder-note]'), fonts: [...document.fonts].map((f) => ({ family: f.family.replace(/["']/g, ''), weight: f.weight, status: f.status })) },
      texts, logos, swatches, blocks, cards, decor, page: getComputedStyle(document.body).backgroundColor,
    });
  } catch (err) {
    emit({ ok: false, error: String((err && err.stack) || err) });
  }
})();
