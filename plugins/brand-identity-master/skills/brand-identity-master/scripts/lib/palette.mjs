// Builds colour roles from the logo's inks: even OKLCH scales, tinted neutrals, a text colour per role.
import { hexToOklch, oklchToHex, hexToRgb, contrast, deltaOk } from './color.mjs';

export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const L_STEPS = [0.975, 0.94, 0.88, 0.8, 0.71, 0.62, 0.53, 0.45, 0.37, 0.29, 0.22];

export function buildScale(hex) {
  const [L0, C0, h] = hexToOklch(hex);
  const out = {};
  STEPS.forEach((step, i) => {
    const L = L_STEPS[i];
    const near = 1 - Math.min(1, Math.abs(L - L0) * 1.1);
    out[step] = oklchToHex([L, C0 * (0.35 + 0.65 * near), h]);
  });
  return out;
}

// Near-blacks keep a little chroma (slate, ink blue, umber) and still act as neutrals.
export const isNeutral = (hex) => { const [L, C] = hexToOklch(hex); return C < 0.03 || L < 0.12 || L > 0.96 || (L < 0.3 && C < 0.07); };

export function neutralsFor(hex) {
  const [, C, h] = hexToOklch(hex);
  const c = C < 0.02 ? 0 : 0.012;
  return { dark: oklchToHex([0.2, c * 1.3, h]), light: oklchToHex([0.97, c, h]) };
}

// Hue families among the chromatic inks: inks within 35 degrees of hue are one family (a brown and an orange).
export function hueFamilies(hexes) {
  const fams = [];
  for (const hex of hexes) {
    const h = hexToOklch(hex)[2];
    if (!fams.some((f) => Math.min(Math.abs(f - h), 360 - Math.abs(f - h)) < 35)) fams.push(h);
  }
  return fams.length;
}

// Support colours for a logo of one hue family, so the palette is more than tints of one colour: foils around the
// wheel (deep and soft), and neutrals of stone and sand with a character of their own.
export function supportFor(hex) {
  const [, C, h] = hexToOklch(hex);
  const c = Math.max(0.05, Math.min(0.09, C * 0.6));
  const at = (dh, L, cc) => oklchToHex([L, cc, (h + dh + 360) % 360]);
  const foils = [[75, 'near'], [120, 'third'], [180, 'opposite'], [-120, 'third'], [-75, 'near']].map(([dh, relation]) => ({ relation, hue: Math.round((h + dh + 360) % 360), deep: at(dh, 0.34, c), soft: at(dh, 0.8, c * 0.5) }));
  const neutrals = [{ hint: 'stone', hex: oklchToHex([0.68, 0.012, h]) }, { hint: 'sand', hex: oklchToHex([0.87, 0.03, (h + 10) % 360]) }, { hint: 'linen', hex: oklchToHex([0.93, 0.015, h]) }];
  return { foils, neutrals };
}

export function pickOn(bg, candidates) {
  let best = null;
  for (const c of candidates) {
    const r = contrast(bg, c);
    if (r >= 4.5) return { on: c, contrast: r };
    if (!best || r > best.contrast) best = { on: c, contrast: r };
  }
  return best;
}

export function buildPalette(inks, { siteColors = [], ground = 'light' } = {}) {
  const notes = [];
  const chromatic = inks.filter((i) => !isNeutral(i.hex));
  const neutralInks = inks.filter((i) => isNeutral(i.hex));
  const roles = {};
  const far = (hex, ...others) => others.every((o) => !o || deltaOk(hex, o.hex) >= 0.08);
  if (chromatic.length) {
    roles.primary = { hex: chromatic[0].hex, source: 'logo' };
    const sec = chromatic.slice(1).find((c) => far(c.hex, roles.primary));
    if (sec) roles.secondary = { hex: sec.hex, source: 'logo' };
    const acc = chromatic.slice(1).reverse().find((c) => c !== sec && far(c.hex, roles.primary, roles.secondary));
    if (acc) roles.accent = { hex: acc.hex, source: 'logo' };
  } else {
    const ink = inks[0]?.hex;
    roles.primary = { hex: ink && ink !== '#000000' && ink !== '#FFFFFF' ? ink : '#1F1D1A', source: ink ? 'logo' : 'derived' };
    notes.push('The logo has no chromatic colour. Choose an accent from the direction or the site and mark it "derived" or "site".');
  }
  for (const s of siteColors) {
    const hex = s.toUpperCase();
    if (isNeutral(hex) || !far(hex, roles.primary, roles.secondary, roles.accent)) continue;
    if (!roles.secondary) roles.secondary = { hex, source: 'site' };
    else if (!roles.accent) roles.accent = { hex, source: 'site' };
  }
  const darkInk = neutralInks.find((i) => { const [L, C] = hexToOklch(i.hex); return L >= 0.1 && L < 0.3 && C < 0.07; });
  // The logo's own near-black, when it has one, sets the neutrals' tint; otherwise the primary does.
  const n = neutralsFor(darkInk ? darkInk.hex : roles.primary.hex);
  roles.neutralDark = darkInk ? { hex: darkInk.hex, source: 'logo' } : { hex: n.dark, source: 'derived' };
  roles.neutralLight = { hex: n.light, source: 'derived' };
  roles.surface = { hex: ground === 'dark' ? roles.neutralDark.hex : roles.neutralLight.hex, source: 'derived' };
  roles.text = { hex: ground === 'dark' ? roles.neutralLight.hex : roles.neutralDark.hex, source: 'derived' };
  const primitives = {};
  for (const r of ['primary', 'secondary', 'accent']) if (roles[r]) primitives[r] = buildScale(roles[r].hex);
  primitives.neutral = buildScale(n.dark);
  const ends = [roles.neutralDark.hex, roles.neutralLight.hex, primitives.neutral[950], primitives.neutral[50]];
  const share = { surface: 0.6, primary: 0.3, [roles.secondary ? 'secondary' : 'accent']: 0.1 };
  for (const [name, role] of Object.entries(roles)) {
    const on = pickOn(role.hex, ends);
    Object.assign(role, { name: null, rgb: hexToRgb(role.hex), on: on.on, contrast: on.contrast, share: share[name] ?? null });
    if (on.contrast < 4.5) notes.push(`No text colour reaches 4.5:1 on ${name} ${role.hex}; use it for shapes and large display text only.`);
  }
  let support = null;
  if (chromatic.length && hueFamilies([roles.primary, roles.secondary, roles.accent].filter(Boolean).map((r) => r.hex)) < 2) {
    support = supportFor(roles.primary.hex);
    notes.push('The logo holds one hue family, so its tints alone make a flat palette. Add one support colour from support.foils that suits the direction (deep or soft) as secondary or accent, source "derived", with its why; and name two of support.neutrals.');
  }
  return { roles, primitives, notes, ...(support ? { support } : {}) };
}
