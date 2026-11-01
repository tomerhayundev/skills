// Builds a small library folder for tests: entries with varied tags and a tiny preview file for each,
// plus entries whose preview is missing or empty (those must never be shown).
import fs from 'node:fs';
import path from 'node:path';

const pick = (list, i) => list[i % list.length];
const WEBP = Buffer.from('524946461a000000574542505650384c0d0000002f0000000007d0ff0000fe0700', 'hex');

export function makeLibrary(dir, { sites = 0, missing = 0, empty = 0 } = {}) {
  fs.mkdirSync(path.join(dir, 'pack', 'sites'), { recursive: true });
  const entries = [];
  const add = (id, i, withPreview) => {
    entries.push({
      id, shelf: 'sites', url: `https://example.org/${id}/`, title: `Site ${i}`,
      description: pick(['a ledger of prices set in a quiet grid', 'one huge line of type over a photo', 'colour fields that change by chapter', 'a dense catalogue with small type'], i),
      bestUse: [pick(['brochure', 'shop', 'portfolio', 'saas', 'event'], i), pick(['long story page', 'one strong product', 'photo-led local business'], i)],
      he: { description: `תיאור ${i}`, bestUse: ['שימוש', 'עוד שימוש'] },
      tags: {
        family: pick(['quiet-editorial', 'loud-flat', 'specimen', 'photo-led', 'dark-room'], i), mood: [pick(['quiet', 'loud', 'warm', 'precise'], i), pick(['playful', 'calm'], i)],
        density: (i % 5) + 1, colour: pick(['light', 'dark', 'one-hue', 'colourful'], i), type: pick(['serif', 'sans', 'display', 'mixed'], i),
        layout: pick(['centred', 'asymmetric', 'grid', 'editorial', 'full-bleed', 'split'], i), motion: i % 4, rtl: i % 10 === 0,
      },
      licence: 'view', rights: 'pack', added: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
      preview: `sites/${id}.webp`,
    });
    if (withPreview === 'file') fs.writeFileSync(path.join(dir, 'pack', 'sites', `${id}.webp`), WEBP);
    // Every third site also has its phone picture, as a recaptured library does.
    if (withPreview === 'file' && i % 3 === 0) { entries[entries.length - 1].phone = `sites/${id}-phone.webp`; fs.writeFileSync(path.join(dir, 'pack', 'sites', `${id}-phone.webp`), WEBP); }
    if (withPreview === 'empty') fs.writeFileSync(path.join(dir, 'pack', 'sites', `${id}.webp`), '');
  };
  for (let i = 0; i < sites; i++) add(`site-${i}`, i, 'file');
  for (let i = 0; i < missing; i++) add(`site-missing-${i}`, i, 'none');
  for (let i = 0; i < empty; i++) add(`site-empty-${i}`, i, 'empty');
  fs.writeFileSync(path.join(dir, 'sites.json'), JSON.stringify({ shelf: 'sites', entries }, null, 1));
  return dir;
}
