// The inspiration library: shelves of entries (sites, sections, motion, icons, type, colour), each with a
// picture in the pack. Loads and checks the shelves, then filters, sorts and pages them for the picker.
// No card without a picture: an entry whose preview file is missing or empty is never loaded.
// Industry is never a facet: a bakery may take from an architect's site.
import fs from 'node:fs';
import path from 'node:path';

export const SHELVES = ['sites', 'sections', 'motion', 'icons', 'type', 'colour'];
export const FACETS = ['family', 'mood', 'density', 'colour', 'type', 'layout', 'motion', 'section', 'rtl', 'bestUse'];
export const PAGE = 50;
const REQUIRED = ['id', 'shelf', 'url', 'description', 'bestUse', 'tags', 'added', 'preview'];

export function loadLibrary(dir) {
  const entries = [];
  const errors = [];
  for (const shelf of SHELVES) {
    const file = path.join(dir, `${shelf}.json`);
    if (!fs.existsSync(file)) continue;
    for (const e of JSON.parse(fs.readFileSync(file, 'utf8')).entries || []) {
      const missing = REQUIRED.filter((k) => e[k] === undefined);
      if (missing.length) { errors.push(`${e.id || '?'}: missing ${missing.join(', ')}`); continue; }
      if (e.hidden) continue; // curation: the picture is a loader, a banner or a blocked page
      const pic = path.join(dir, 'pack', e.preview);
      const st = fs.existsSync(pic) ? fs.statSync(pic) : null;
      if (!st || st.size === 0) continue;
      entries.push(e);
    }
  }
  return { entries, errors };
}

const valuesOf = (e, facet) => {
  if (facet === 'bestUse') return e.bestUse;
  const v = e.tags?.[facet];
  return v === undefined ? [] : Array.isArray(v) ? v.map(String) : [String(v)];
};

export function facets(entries) {
  const out = {};
  for (const f of FACETS) {
    const counts = {};
    for (const e of entries) for (const v of valuesOf(e, f)) counts[v] = (counts[v] || 0) + 1;
    if (Object.keys(counts).length) out[f] = counts;
  }
  return out;
}

const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3);

// How well an entry fits this ask: the site type and page modes against its best uses, the dials against its
// density, loudness and motion, and a penalty when it carries the category's rut. The business itself is never read.
export function recommendScore(e, { brief = {}, dials = {} } = {}) {
  let s = 0;
  const uses = e.bestUse.map((u) => u.toLowerCase());
  if (brief.siteType && uses.includes(String(brief.siteType).toLowerCase())) s += 3;
  for (const mode of new Set(Object.values(brief.modes || {}))) if (uses.some((u) => u.includes(mode))) s += 1;
  if (dials.density !== undefined && e.tags.density !== undefined) s -= 2 * Math.abs(e.tags.density - dials.density) / 4;
  if (dials.motion !== undefined && e.tags.motion !== undefined) s -= 2 * Math.abs(e.tags.motion - dials.motion) / 3;
  if (dials.loudness !== undefined) {
    const mood = e.tags.mood || [];
    if (dials.loudness >= 4 && mood.includes('loud')) s += 1;
    if (dials.loudness <= 2 && mood.includes('quiet')) s += 1;
  }
  const rut = new Set(words(brief.rut));
  if (rut.size && words(`${e.description} ${JSON.stringify(e.tags)}`).some((w) => rut.has(w))) s -= 2;
  return s;
}

export function queryLibrary(entries, { shelf = 'sites', sort = 'recommended', filters = {}, q = '', offset = 0, limit = PAGE, brief, dials, history = {} } = {}) {
  let list = entries.filter((e) => e.shelf === shelf);
  for (const [facet, wanted] of Object.entries(filters)) {
    if (!wanted?.length) continue;
    const want = new Set(wanted.map(String));
    list = list.filter((e) => valuesOf(e, facet).some((v) => want.has(v)));
  }
  const needle = q.trim().toLowerCase();
  if (needle) list = list.filter((e) => JSON.stringify([e.description, e.bestUse, e.tags]).toLowerCase().includes(needle));
  const by = {
    recommended: (a, b) => recommendScore(b, { brief, dials }) - recommendScore(a, { brief, dials }),
    newest: (a, b) => String(b.added).localeCompare(String(a.added)),
    picked: (a, b) => (history[b.id] || 0) - (history[a.id] || 0) || recommendScore(b, { brief, dials }) - recommendScore(a, { brief, dials }),
    bestUse: (a, b) => String(a.bestUse[0]).localeCompare(String(b.bestUse[0])) || recommendScore(b, { brief, dials }) - recommendScore(a, { brief, dials }),
  }[sort] || (() => 0);
  list = [...list].sort((a, b) => by(a, b) || a.id.localeCompare(b.id));
  return { items: list.slice(offset, offset + limit), total: list.length, offset, limit };
}
