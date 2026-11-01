// A measured design comes from a live site the skill does not control. Only clean values pass: a colour is a
// six-digit hex, a number is a real number, a role is one we know, a font name is short and made of name
// characters. Anything else is dropped, so text a site planted in a font name never reaches the build prompt.
const HEX = /^#[0-9a-f]{6}$/;
const FAMILY = /^[\p{L}\p{N} _-]{1,40}$/u;
// Real font names never hold these words; an instruction short enough to pass the shape check usually does.
const ORDERS = /\b(ignore|instructions?|previous|prompt|you|your|must|should|please|never|always|write|add|remove|delete|brief|user|assistant|claude)\b/i;
const PALETTE_ROLES = ['background', 'text', 'accent', 'surface', 'text-2'];
const TYPE_ROLES = ['display', 'h1', 'h2', 'h3', 'body', 'button'];
const num = (n) => typeof n === 'number' && Number.isFinite(n);
const hex = (h) => typeof h === 'string' && HEX.test(h.toLowerCase());

export function cleanDesign(d) {
  if (!d || typeof d !== 'object') return null;
  const out = {};
  out.palette = (Array.isArray(d.palette) ? d.palette : []).filter((c) => c && PALETTE_ROLES.includes(c.role) && hex(c.hex))
    .map((c) => ({ role: c.role, hex: c.hex.toLowerCase() }));
  out.type = (Array.isArray(d.type) ? d.type : []).filter((t) => t && TYPE_ROLES.includes(t.role) && typeof t.family === 'string'
    && FAMILY.test(t.family.trim()) && !ORDERS.test(t.family) && num(t.size) && num(t.weight) && num(t.lineHeight) && (t.tracking == null || num(t.tracking)))
    .map((t) => ({ role: t.role, family: t.family.trim(), size: t.size, weight: t.weight, lineHeight: t.lineHeight, tracking: t.tracking || 0 }));
  out.spacing = (Array.isArray(d.spacing) ? d.spacing : []).filter(num);
  if (num(d.container)) out.container = d.container;
  out.radius = (Array.isArray(d.radius) ? d.radius : []).filter(num);
  if (Array.isArray(d.shown)) out.shown = d.shown.filter((c) => c && hex(c.hex) && num(c.share)).map((c) => ({ hex: c.hex.toLowerCase(), share: c.share }));
  if (typeof d.measuredAt === 'string' && /^[\dT:.Z-]{10,30}$/.test(d.measuredAt)) out.measuredAt = d.measuredAt;
  return out;
}
