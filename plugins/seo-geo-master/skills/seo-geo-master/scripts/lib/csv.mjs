// CSV parsing and Search Console export reading (English or Hebrew interface).
export function parseCsv(text) {
  const s = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

const HEADER_RULES = [
  ['ctr', /ctr|שיעור/i],
  ['clicks', /click|קליק/i],
  ['impressions', /impression|חשיפ/i],
  ['position', /position|מיקום/i],
  ['query', /quer|שאיל/i],
  ['page', /page|url|דף|דפים/i],
  ['date', /date|תאריך/i],
  ['country', /countr|מדינ/i],
  ['device', /device|מכשיר/i],
  ['appearance', /appearance|מראה|הופעה/i],
];

export function normalizeHeader(h) {
  for (const [key, re] of HEADER_RULES) if (re.test(String(h))) return key;
  return null;
}

export function parseNumber(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[\s,\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '');
  if (s === '') return null;
  if (s.endsWith('%')) { const n = Number(s.slice(0, -1)); return Number.isFinite(n) ? n / 100 : null; }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NUMERIC = new Set(['clicks', 'impressions', 'ctr', 'position']);

export function readGscTable(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { kind: null, rows: [], capped: false };
  const keys = rows[0].map(normalizeHeader);
  // Resolve each known key to one column once (the last wins), so the work per row is
  // bounded by the ten known keys, not by the header width of an untrusted file.
  const columns = {};
  keys.forEach((k, i) => { if (k) columns[k] = i; });
  const cols = Object.entries(columns);
  const objs = rows.slice(1).map(r => {
    const o = {};
    for (const [k, i] of cols) o[k] = NUMERIC.has(k) ? parseNumber(r[i]) : String(r[i] ?? '').trim();
    return o;
  });
  const has = k => keys.includes(k);
  const kind = has('query') && has('page') ? 'queryPage'
    : has('query') ? 'queries'
    : has('page') ? 'pages'
    : has('date') ? 'dates'
    : has('country') ? 'countries'
    : has('device') ? 'devices'
    : has('appearance') ? 'appearance'
    : null;
  return { kind, rows: objs, capped: objs.length >= 1000 };
}
