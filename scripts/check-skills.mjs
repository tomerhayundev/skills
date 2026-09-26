#!/usr/bin/env node
/**
 * Repo checks that `claude plugin validate` does not cover, because it only
 * reads what the marketplace lists. Node 18+, no dependencies.
 *
 *   node scripts/check-skills.mjs
 *
 * Errors (exit 1): a SKILL.md whose frontmatter is not the first thing in the
 * file, whose name is invalid or doesn't match its folder, whose description is
 * missing or over 1024 characters; a marketplace entry pointing at a path that
 * doesn't exist; a script that doesn't parse.
 * Warnings: a skill no marketplace entry installs, a frontmatter key outside
 * the known set, an em dash (house style).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const errors = [];
const warnings = [];

const KNOWN_KEYS = new Set([
  // Agent Skills standard
  "name", "description", "license", "compatibility", "metadata", "allowed-tools",
  // Claude Code extensions
  "when_to_use", "argument-hint", "disable-model-invocation", "user-invocable", "context", "paths", "model",
]);

/** Minimal frontmatter reader: top-level keys, quoted/plain scalars and folded/literal blocks. */
function frontmatter(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const out = {};
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) continue;
    let [, key, value] = m;
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (i + 1 < end && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim());
      value = block.join(value.startsWith(">") ? " " : "\n");
    } else if (/^["'].*["']$/.test(value)) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function walk(dir, visit) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, visit);
    else visit(p);
  }
}

// Skills
const skillsDir = join(ROOT, "skills");
const skillNames = readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory());
for (const dir of skillNames) {
  const file = join(skillsDir, dir, "SKILL.md");
  const rel = relative(ROOT, file);
  if (!existsSync(file)) {
    errors.push(`${rel}: missing`);
    continue;
  }
  const fm = frontmatter(readFileSync(file, "utf8"));
  if (!fm) {
    errors.push(`${rel}: frontmatter must open on line 1 with --- and close with ---`);
    continue;
  }
  if (fm.name !== dir) errors.push(`${rel}: name "${fm.name}" must match its folder "${dir}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? "") || (fm.name ?? "").length > 64) {
    errors.push(`${rel}: name must be 1-64 lowercase letters, digits and single hyphens`);
  }
  if (!fm.description) errors.push(`${rel}: description is required`);
  else if (fm.description.length > 1024) errors.push(`${rel}: description is ${fm.description.length} chars, max 1024`);
  for (const key of Object.keys(fm)) if (!KNOWN_KEYS.has(key)) warnings.push(`${rel}: unknown frontmatter key "${key}"`);
}

// Marketplace
const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
const installable = new Set();
for (const p of market.plugins) {
  const src = join(ROOT, p.source);
  if (!existsSync(src)) errors.push(`marketplace "${p.name}": source ${p.source} does not exist`);
  for (const s of p.skills ?? []) {
    if (!existsSync(join(ROOT, s, "SKILL.md"))) errors.push(`marketplace "${p.name}": ${s}/SKILL.md does not exist`);
    installable.add(s.replace(/^\.\/skills\//, ""));
  }
}
for (const dir of skillNames) if (!installable.has(dir)) warnings.push(`skills/${dir}: no marketplace entry installs it`);

// Scripts parse; house style (no em dashes)
const EM_DASH = String.fromCharCode(0x2014);
walk(ROOT, (p) => {
  const rel = relative(ROOT, p);
  if (p.endsWith(".mjs") || p.endsWith(".js")) {
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${rel}: ${r.stderr.trim().split("\n").pop()}`);
  }
  if (p.endsWith(".sh") && process.platform !== "win32") {
    const r = spawnSync("bash", ["-n", p], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${rel}: ${r.stderr.trim()}`);
  }
  if (/\.(md|json|sh|mjs|ts)$/.test(p) && readFileSync(p, "utf8").includes(EM_DASH)) warnings.push(`${rel}: contains an em dash`);
});

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
console.log(`\n${skillNames.length} skills, ${market.plugins.length} marketplace entries, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
