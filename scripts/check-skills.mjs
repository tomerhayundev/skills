#!/usr/bin/env node
/**
 * Repo checks that `claude plugin validate` does not cover, because it only
 * reads what the marketplace lists. Node 18+, no dependencies.
 *
 *   node scripts/check-skills.mjs
 *
 * Errors (exit 1):
 * - a marketplace entry that is not a full plugin: its source must be
 *   "./plugins/<name>" with no "strict" or "skills" key, because Cowork installs
 *   only full plugins and silently skips skill-only entries;
 * - a plugin folder without .claude-plugin/plugin.json, or whose plugin.json lacks
 *   name (= folder), version, description or author; one with no skill, command,
 *   agent, hook or MCP server; a SKILL.md at the plugin root instead of skills/<name>/;
 * - a plugin whose files differ from origin/main while its version does not
 *   (installed copies never update); set CHECK_BASE_REF to compare elsewhere;
 * - a SKILL.md whose frontmatter is not the first thing in the file, whose name
 *   is invalid or doesn't match its folder, whose description is missing or over
 *   1024 characters;
 * - a plugin the README's catalog does not list (a table row, or a card for a
 *   plugin presented on its own, e.g. a master), or lists without its exact
 *   install command; a relative markdown link to a file that does not exist; a
 *   script that doesn't parse;
 * - with scripts/sync.mjs present: a specialist, catalog entry or README family
 *   table out of step with its master, or a specialist edited by hand;
 * - with scripts/names.mjs present: a real company, client, product or competitor
 *   name from scripts/blocked-names.txt (salted hashes) anywhere in the repo;
 * - with scripts/sources.mjs present: a sources/catalog.json entry out of its format
 *   or its vocab.
 * Warnings: a plugin no marketplace entry installs, a frontmatter key outside the
 * known set, an em dash (house style), SSH-style install instructions.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

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

const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const subdirs = (p) => (isDir(p) ? readdirSync(p).filter((d) => isDir(join(p, d))) : []);
const git = (args) => {
  const r = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
};

function checkSkill(file) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const dir = file.replace(/\\/g, "/").split("/").at(-2);
  if (!existsSync(file)) return errors.push(`${rel}: missing`);
  const text = readFileSync(file, "utf8");
  const fm = frontmatter(text);
  if (!fm) return errors.push(`${rel}: frontmatter must open on line 1 with --- and close with ---`);
  // Claude Code tolerates an unquoted value containing ": " or " #", strict YAML parsers
  // (npx skills, other agents) reject the whole file and skip the skill.
  for (const line of text.replace(/\r\n/g, "\n").split("\n---\n")[0].split("\n").slice(1)) {
    const m = line.match(/^([A-Za-z_][\w-]*):\s+(.*)$/);
    if (m && !/^(["'>|[{]|$)/.test(m[2]) && /: | #/.test(m[2])) {
      errors.push(`${rel}: "${m[1]}" is invalid YAML (an unquoted ": " or " #"); write it as a folded block (${m[1]}: >-) or quote it`);
    }
  }
  if (fm.name !== dir) errors.push(`${rel}: name "${fm.name}" must match its folder "${dir}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? "") || (fm.name ?? "").length > 64) {
    errors.push(`${rel}: name must be 1-64 lowercase letters, digits and single hyphens`);
  }
  if (!fm.description) errors.push(`${rel}: description is required`);
  else if (fm.description.length > 1024) errors.push(`${rel}: description is ${fm.description.length} chars, max 1024`);
  for (const key of Object.keys(fm)) if (!KNOWN_KEYS.has(key)) warnings.push(`${rel}: unknown frontmatter key "${key}"`);
}

// Marketplace: every entry is a full plugin under plugins/<name>. Cowork installs
// nothing else and gives no error for what it skips.
const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
for (const p of market.plugins) {
  const where = `marketplace "${p.name}"`;
  if (p.source !== `./plugins/${p.name}`) errors.push(`${where}: source must be "./plugins/${p.name}" (Cowork installs only full plugins), not ${JSON.stringify(p.source)}`);
  if ("strict" in p || "skills" in p) errors.push(`${where}: remove the "strict" and "skills" keys; the plugin folder carries its skills`);
}
if (isDir(join(ROOT, "skills"))) errors.push("skills/: skill-only layout. Move each skill to plugins/<name>/skills/<name>/ and give it a plugin.json");

// Plugins
const baseRef = process.env.CHECK_BASE_REF || "origin/main";
const haveBase = git(["rev-parse", "--verify", "-q", `${baseRef}^{commit}`]) !== null;
const pluginNames = subdirs(join(ROOT, "plugins"));
let skillCount = 0;
for (const dir of pluginNames) {
  const rel = `plugins/${dir}`;
  const base = join(ROOT, rel);
  if (!market.plugins.some((p) => p.source === `./${rel}`)) warnings.push(`${rel}: no marketplace entry installs it`);
  if (existsSync(join(base, "SKILL.md"))) errors.push(`${rel}/SKILL.md: a skill goes in ${rel}/skills/${dir}/, not at the plugin root`);

  const skills = subdirs(join(base, "skills"));
  for (const s of skills) checkSkill(join(base, "skills", s, "SKILL.md"));
  skillCount += skills.length;

  const pjPath = join(base, ".claude-plugin", "plugin.json");
  if (!existsSync(pjPath)) {
    errors.push(`${rel}: missing .claude-plugin/plugin.json`);
    continue;
  }
  let pj;
  try {
    pj = JSON.parse(readFileSync(pjPath, "utf8"));
  } catch (e) {
    errors.push(`${rel}/.claude-plugin/plugin.json: ${e.message}`);
    continue;
  }
  if (pj.name !== dir) errors.push(`${rel}/.claude-plugin/plugin.json: name "${pj.name}" must match its folder "${dir}"`);
  if (!/^\d+\.\d+\.\d+/.test(pj.version ?? "")) errors.push(`${rel}/.claude-plugin/plugin.json: needs a "version" (x.y.z), or installed copies never update`);
  if (!pj.description) errors.push(`${rel}/.claude-plugin/plugin.json: needs a "description"`);
  if (!pj.author) errors.push(`${rel}/.claude-plugin/plugin.json: needs an "author"`);

  const hasMd = (d) => isDir(join(base, d)) && readdirSync(join(base, d)).some((f) => f.endsWith(".md"));
  const components = skills.length || hasMd("commands") || hasMd("agents") || existsSync(join(base, "hooks", "hooks.json")) || pj.hooks || existsSync(join(base, ".mcp.json")) || pj.mcpServers;
  if (!components) errors.push(`${rel}: has no skills/<name>/SKILL.md, commands, agents, hooks or MCP servers`);

  // A change that keeps the version never reaches installed copies.
  if (haveBase && pj.version) {
    const old = git(["show", `${baseRef}:${rel}/.claude-plugin/plugin.json`]);
    if (old) {
      const changed = (git(["diff", "--name-only", baseRef, "--", rel]) ?? "") + (git(["ls-files", "--others", "--exclude-standard", "--", rel]) ?? "");
      let oldVersion;
      try {
        oldVersion = JSON.parse(old).version;
      } catch {
        /* unreadable old manifest: nothing to compare */
      }
      if (changed.trim() && oldVersion === pj.version) {
        errors.push(`${rel}: files changed since ${baseRef} but version is still ${pj.version}; bump it (scaffold.mjs --bump patch)`);
      }
    }
  }
}

// README: every entry is listed in the catalog part of the README, which is the
// text between <!-- catalog --> and <!-- /catalog --> when those markers exist,
// otherwise everything under a "What's here" heading up to the next level-2
// heading (so skills can be grouped in several tables). Listed means a table row
// that links to a real file and, when its table has an Install column, carries
// the entry's exact install command; or, for a plugin presented on its own (a
// master's card), a link into plugins/<name>/ plus that install command.
const readme = existsSync(join(ROOT, "README.md")) ? readFileSync(join(ROOT, "README.md"), "utf8").replace(/\r\n/g, "\n").split("\n") : [];
const rows = []; // { line, installCol }
let catalog = [];
{
  const start = readme.indexOf("<!-- catalog -->");
  const end = readme.indexOf("<!-- /catalog -->");
  const h = readme.findIndex((l) => /^#+\s+what'?s here/i.test(l));
  const [from, to] = start >= 0 && end > start ? [start + 1, end] : [h + 1, h < 0 ? 0 : readme.findIndex((l, i) => i > h && /^##\s/.test(l)) >>> 0];
  catalog = readme.slice(from, Math.min(to, readme.length));
  let installCol = -1;
  for (let i = 0; i < catalog.length; i++) {
    if (!catalog[i].startsWith("|")) continue;
    if (!catalog[i - 1]?.startsWith("|")) {
      installCol = catalog[i].split("|").slice(1, -1).map((c) => c.trim().toLowerCase()).indexOf("install");
      i++; // skip the --- separator row
      continue;
    }
    rows.push({ line: catalog[i], installCol });
  }
  if (!catalog.length) errors.push(`README.md: no catalog; list the plugins between <!-- catalog --> and <!-- /catalog --> or under a "What's here" heading`);
}
const catalogText = catalog.join("\n");
for (const p of market.plugins) {
  const row = rows.find((r) => r.line.startsWith(`| [${p.name}](`));
  const install = `claude plugin install ${p.name}@${market.name}`;
  if (!row) {
    const card = catalogText.includes(`](plugins/${p.name}/`) && catalogText.includes(install);
    if (!card) errors.push(`README.md: "${p.name}" is not listed: give it a row (a link to its SKILL.md and \`${install}\`) or a card with both`);
  } else if (row.installCol >= 0 && !row.line.split("|")[row.installCol + 1]?.includes(`plugin install ${p.name}@${market.name}`)) {
    errors.push(`README.md: the "${p.name}" row's Install cell must read \`${install}\``);
  }
}
for (const r of rows) {
  const name = r.line.match(/^\| \[([^\]]+)\]/)?.[1];
  if (name && !market.plugins.some((p) => p.name === name)) errors.push(`README.md: row "${name}" has no marketplace entry`);
}

// Names: no real company, client, product or competitor name anywhere in the repo. The
// list is salted hashes (scripts/names.mjs); findings give the place, never the name.
if (existsSync(join(ROOT, "scripts", "names.mjs"))) {
  const { loadHashes, scanPath } = await import(pathToFileURL(join(ROOT, "scripts", "names.mjs")).href);
  for (const h of scanPath(ROOT, loadHashes(ROOT))) {
    errors.push(`${h.file}:${h.line}:${h.column}: a blocked company or product name; describe the case by category`);
  }
}

// The sources library: the catalog keeps its format and its vocab (scripts/sources.mjs).
if (existsSync(join(ROOT, "scripts", "sources.mjs")) && existsSync(join(ROOT, "sources", "catalog.json"))) {
  const { validateCatalog } = await import(pathToFileURL(join(ROOT, "scripts", "sources.mjs")).href);
  try {
    for (const e of validateCatalog(JSON.parse(readFileSync(join(ROOT, "sources", "catalog.json"), "utf8")))) errors.push(`sources/catalog.json: ${e}`);
  } catch (e) {
    errors.push(`sources/catalog.json: ${e.message}`);
  }
}

// Specialists generated from a master: in step with it, and never edited by hand.
if (existsSync(join(ROOT, "scripts", "sync.mjs"))) {
  const r = spawnSync(process.execPath, [join(ROOT, "scripts", "sync.mjs"), "--check", "--no-bump"], { encoding: "utf8" });
  if (r.status !== 0) {
    for (const l of r.stdout.split("\n").filter((l) => /^(error|stale) /.test(l))) errors.push(`sync: ${l.replace(/^\w+\s+/, "")}`);
    errors.push("sync: generated files are out of step; run node scripts/sync.mjs (it never overwrites a hand edit)");
  }
}

// Scripts parse; relative links resolve; house style (no em dashes)
const EM_DASH = String.fromCharCode(0x2014);
walk(ROOT, (p) => {
  const rel = relative(ROOT, p).replace(/\\/g, "/");
  if (p.endsWith(".mjs") || p.endsWith(".js")) {
    const r = spawnSync(process.execPath, ["--check", p], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${rel}: ${r.stderr.trim().split("\n").pop()}`);
  }
  if (p.endsWith(".sh") && process.platform !== "win32") {
    const r = spawnSync("bash", ["-n", p], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`${rel}: ${r.stderr.trim()}`);
  }
  if (/\.(md|json|sh|mjs|ts)$/.test(p) && readFileSync(p, "utf8").includes(EM_DASH)) warnings.push(`${rel}: contains an em dash`);
  if (/\.(md|sh)$/.test(p)) {
    const text = readFileSync(p, "utf8");
    // `marketplace add owner/repo` clones over SSH and fails on machines without
    // a GitHub SSH key; instructions give the HTTPS URL.
    text.split(/\r?\n/).forEach((line, i) => {
      if (/marketplace add\s+(?!https?:\/\/|<|\.|\/|[A-Za-z]:)[\w.-]+\/[\w.-]+/.test(line)) {
        warnings.push(`${rel}:${i + 1}: \`marketplace add owner/repo\` is SSH; give https://github.com/owner/repo.git`);
      }
    });
    // Moving a folder breaks relative links silently; outside code fences, every one must resolve.
    if (p.endsWith(".md")) {
      // HTML comments render as nothing; a master's <!-- specialist ... --> templates link to {{path}}.
      const prose = text.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/`[^`\n]*`/g, "");
      for (const m of prose.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1].split("#")[0];
        if (!target || /^[a-z][\w+.-]*:/i.test(target) || target.startsWith("<")) continue;
        if (!existsSync(join(dirname(p), decodeURIComponent(target)))) errors.push(`${rel}: link to ${m[1]} points to nothing`);
      }
    }
  }
});

for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
console.log(`\n${pluginNames.length} plugins, ${skillCount} skills, ${market.plugins.length} marketplace entries, ${errors.length} errors, ${warnings.length} warnings`);
process.exit(errors.length ? 1 : 0);
