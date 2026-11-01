// Content-safety rules: text that stays hidden when scroll reveals never fire, motion that ignores the reduced
// motion setting, and numbers the brief cannot back.

const NUM = /(\d[\d,.:]*\d|\d)(\+|%|x\b)?/g;
const norm = (s) => s.replace(/[,]/g, '').replace(/\.$/, '');

// Every number written anywhere in the brief counts as sourced.
export function briefNumbers(brief) {
  return new Set([...JSON.stringify(brief || {}).matchAll(NUM)].map((m) => norm(m[1])));
}

export function contentRules(f, { pass, brief }) {
  const out = [];
  const x = f.extra || {};
  if (pass === 'stubio') for (const h of x.hidden || []) out.push({ id: 'CONTENT_HIDDEN_AT_REST', detail: `"${h.sample}" stays invisible without its scroll trigger`, selector: h.sel });
  if (pass === 'motion') for (const a of x.running || []) out.push({ id: 'REDUCED_MOTION', detail: `${a.infinite ? 'endless ' : ''}animation still running with reduced motion on`, selector: a.sel });
  if (pass === 'main' && brief && x.numbersText) {
    const ok = briefNumbers(brief);
    const seen = new Set();
    for (const m of x.numbersText.matchAll(NUM)) {
      const n = norm(m[1]);
      const token = m[0].trim();
      if (seen.has(token)) continue;
      seen.add(token);
      if (!m[2] && /^\d+$/.test(n) && Number(n) <= 12) continue; // small counts: steps, items, months
      if (ok.has(n)) continue;
      out.push({ id: 'UNSOURCED_NUMBER', detail: `"${token}" is not in the brief` });
    }
  }
  // A quote is someone's words: it must come from the brief (a review, a customer's line), never be written for them.
  if (pass === 'main' && brief) {
    // Curly or straight quotes and apostrophes are the same words.
    const plain = (s) => String(s).replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/[\u201c\u201d\u201e\u00ab\u00bb"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const held = plain(JSON.stringify(brief).replace(/\\"/g, ''));
    for (const q of x.quotes || []) if (!held.includes(plain(q))) out.push({ id: 'UNSOURCED_QUOTE', detail: `"${q.slice(0, 60)}" is quoted but not in the brief` });
  }
  return out;
}
