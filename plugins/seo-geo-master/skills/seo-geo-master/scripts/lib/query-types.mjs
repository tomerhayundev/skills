// Query types: what kind of search a query is, read from its words, in English and Hebrew.
//
// Each pattern is written once and used twice: the script tags queries with it, and the report prints it for
// the owner to paste into Search Console (Performance > Add filter > Query > Custom (regex)). It must stay
// valid in both JavaScript and RE2, the syntax Search Console uses: no lookarounds, no backreferences.
// Search Console matches without regard to case and anywhere in the query unless the pattern is anchored.
// RE2's \b knows only ASCII letters, so it never falls between two Hebrew letters and a space: the Hebrew
// half of every pattern ends on (\s|$) instead, and allows one attached prefix letter (ו, ב, ל, ה, מ, ש)
// where a word can carry one.

const HE_PREFIX = '[ובלהמש]?';

export const QUERY_TYPES = [
  {
    id: 'question',
    name: 'Questions',
    regex: '^(who|what|when|where|why|how|which|can|could|should|would|will|do|does|did|is|are|was|were|has|have)\\b'
      + '|^(מה|מהו|מהי|מהם|מהן|איך|כיצד|למה|מדוע|כמה|האם|מתי|איפה|היכן|מי|מיהו|מיהי|איזה|איזו|אילו|אפשר|ניתן)(\\s|$)'
      + '|\\?',
  },
  {
    id: 'prompt',
    name: 'Prompt-style',
    regex: '^(give me|show me|help me|explain|recommend|suggest|summari[sz]e|list|compare|find me|tell me)\\b'
      + '|^(תן לי|תני לי|תנו לי|הראה לי|תראה לי|תסביר|הסבר|תמליץ|המלץ|תציע|הצע|תשווה|השווה|תמצא לי|ספר לי|תסכם|סכם)(\\s|$)',
  },
  {
    id: 'comparison',
    name: 'Comparison',
    regex: '\\b(vs|versus|compare|compared|comparison|alternatives?|instead of|better than|difference between)\\b'
      + `|(^|\\s)${HE_PREFIX}(מול|לעומת|השוואה|השוואת|להשוות|הבדל|הבדלים|חלופה|חלופות|אלטרנטיבה|אלטרנטיבות|עדיף)(\\s|$)`,
  },
  {
    id: 'pricing',
    name: 'Price and cost',
    regex: '\\b(prices?|pricing|costs?|fees?|how much|cheap|cheaper|cheapest|per month|quotes?)\\b'
      + `|(^|\\s)${HE_PREFIX}(מחיר|מחירים|מחירון|עלות|עלויות|זול|זולה|זולים)(\\s|$)|כמה (זה )?עול(ה|ים)`,
  },
  {
    id: 'problem',
    name: 'Problem and fix',
    regex: "\\b(fix|fixing|errors?|issues?|problems?|not working|broken|troubleshoot(ing)?|failed|doesn'?t work)\\b"
      + `|(^|\\s)${HE_PREFIX}(תקלה|תקלות|בעיה|בעיות|שגיאה|תיקון|לתקן|נתקע|נתקעת)(\\s|$)|לא עוב(ד|דת|דים)`,
  },
  {
    id: 'long',
    name: '8 words or more',
    regex: '^(\\S+\\s+){7,}\\S+$',
  },
];

const COMPILED = QUERY_TYPES.map(t => [t.id, new RegExp(t.regex, 'i')]);

// The ids of every type a query matches, in the order of QUERY_TYPES; a query can be several at once.
export function typesOf(query) {
  const q = String(query ?? '').trim().replace(/\s+/g, ' ');
  if (!q) return [];
  return COMPILED.filter(([, re]) => re.test(q)).map(([id]) => id);
}

// Totals per type, and the questions worth answering: question or prompt-style queries with at least `floor`
// impressions at positions up to 20, the most impressions first. A row is below the curve when its CTR is
// under 70% of the median CTR of its own position bucket (the same test as the low CTR list); `medianOf` gives
// that median for a position, or null when the bucket has too few rows.
export function queryTypes(rows, { floor = 10, medianOf = () => null, ctrOf } = {}) {
  const ctr = ctrOf ?? (r => (r.impressions > 0 ? (r.clicks || 0) / r.impressions : 0));
  const totals = Object.fromEntries(QUERY_TYPES.map(t => [t.id, { queries: 0, impressions: 0, clicks: 0 }]));
  const all = { queries: 0, impressions: 0, clicks: 0 };
  const questions = [];
  for (const r of rows) {
    if (!r || !r.query) continue;
    all.queries++; all.impressions += r.impressions || 0; all.clicks += r.clicks || 0;
    const types = typesOf(r.query);
    for (const id of types) {
      const t = totals[id];
      t.queries++; t.impressions += r.impressions || 0; t.clicks += r.clicks || 0;
    }
    const asks = types.includes('question') || types.includes('prompt');
    if (asks && r.impressions >= floor && Number.isFinite(r.position) && r.position < 20.5) {
      const c = ctr(r);
      const m = medianOf(r.position);
      questions.push({ query: r.query, types, position: r.position, impressions: r.impressions, clicks: r.clicks || 0, ctr: c, bucketMedian: m, belowCurve: m === null || m === undefined ? null : c < m * 0.7 });
    }
  }
  questions.sort((a, b) => b.impressions - a.impressions || (a.query < b.query ? -1 : a.query > b.query ? 1 : 0));
  return {
    total: all,
    types: QUERY_TYPES.map(t => ({ id: t.id, name: t.name, regex: t.regex, ...totals[t.id] })),
    questions,
  };
}

// The page with the most impressions for each query, from a query+page export.
export function topPageByQuery(qpRows) {
  const best = new Map();
  for (const r of qpRows) {
    if (!r || !r.query || !r.page) continue;
    const key = `${r.query}\u0000${r.page}`;
    best.set(key, (best.get(key) || 0) + (r.impressions || 0));
  }
  const out = new Map();
  for (const [key, impressions] of best) {
    const [query, page] = key.split('\u0000');
    const cur = out.get(query);
    if (!cur || impressions > cur.impressions || (impressions === cur.impressions && page < cur.page)) out.set(query, { page, impressions });
  }
  return new Map([...out].map(([q, v]) => [q, v.page]));
}
