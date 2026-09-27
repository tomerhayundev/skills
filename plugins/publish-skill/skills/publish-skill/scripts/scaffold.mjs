#!/usr/bin/env node
/**
 * Adds a plugin to a Claude Code marketplace repo: files, plugin.json, the
 * marketplace.json entry, and the README table row. Idempotent: run it again
 * after editing to refresh the entry.
 *
 *   node scaffold.mjs --repo <marketplace-repo> --name <kebab-name>
 *        [--from <skill folder or plugin folder>] --description "<what it does, one line>"
 *        [--bump patch|minor|major] [--version x.y.z] [--category development] [--keywords a,b,c]
 *
 * Every entry is a full plugin, because Cowork installs only entries whose
 * source is a folder with its own .claude-plugin/plugin.json; it silently skips
 * skill-only entries ({ source: "./", strict: false, skills: [...] }).
 *
 *   plugins/<name>/.claude-plugin/plugin.json    name, version, description, author
 *   plugins/<name>/skills/<name>/SKILL.md        (+ references/, scripts/, assets/)
 *   entry { source: "./plugins/<name>" }         no strict, no skills key
 *
 * --from a bare skill (SKILL.md at its root) lands in plugins/<name>/skills/<name>/;
 * --from a plugin (has .claude-plugin/plugin.json) lands in plugins/<name>/.
 * Without --from, writes a SKILL.md template to fill in.
 *
 * --description is required on first add: the catalog and README describe what
 * the plugin does, while a SKILL.md description is a "Use when" trigger.
 * --bump raises plugin.json's version; every change needs one, or installed
 * copies (CLI and Cowork) never update. New plugins start at 0.1.0.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(`--${k}`);
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--")) return argv[i + 1];
  return argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
};
const repo = opt("repo") && resolve(opt("repo"));
const name = opt("name");
const from = opt("from") && resolve(opt("from"));
const fail = (m) => {
  console.error(`error: ${m}`);
  process.exit(1);
};

if (!repo || !name) fail("usage: scaffold.mjs --repo <dir> --name <kebab-name> [--from <dir>] --description ... [--bump patch|minor|major]");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) fail(`name "${name}" must be 1-64 lowercase letters, digits and single hyphens`);
const marketPath = join(repo, ".claude-plugin", "marketplace.json");
if (!existsSync(marketPath)) fail(`${marketPath} not found; --repo must be a marketplace repo root`);
if (from && !existsSync(from)) fail(`--from ${from} does not exist`);
if (opt("bump") && !["patch", "minor", "major"].includes(opt("bump"))) fail("--bump takes patch, minor or major");
if (opt("version") && !/^\d+\.\d+\.\d+$/.test(opt("version"))) fail("--version takes x.y.z");

const rel = `plugins/${name}`;
const dest = join(repo, rel);
const skillDir = join(dest, "skills", name);
const legacy = join(repo, "skills", name);
if (!from && !existsSync(dest) && existsSync(join(legacy, "SKILL.md"))) {
  fail(`skills/${name} uses the old skill-only layout. Move it first: git mv skills/${name} ${rel}/skills/${name}`);
}

/** Reads `name` and `description` from SKILL.md frontmatter (quoted, plain, or folded block). */
function frontmatter(file) {
  if (!existsSync(file)) return {};
  const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") return {};
  const out = {};
  for (let i = 1; i < lines.length && lines[i] !== "---"; i++) {
    const m = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    if (/^[>|]-?$/.test(v)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].trim());
      v = block.join(" ");
    } else v = v.replace(/^["']|["']$/g, "");
    out[k] = v;
  }
  return out;
}

// The catalog and README say what it DOES; a SKILL.md description says when
// to load it ("Use when..."), which reads wrong there. Settled before any write.
const market = JSON.parse(readFileSync(marketPath, "utf8"));
const existingEntry = market.plugins.find((p) => p.name === name);
const fromIsPlugin = from && existsSync(join(from, ".claude-plugin", "plugin.json"));
const srcManifest = fromIsPlugin ? JSON.parse(readFileSync(join(from, ".claude-plugin", "plugin.json"), "utf8")) : null;
const description = opt("description") ?? srcManifest?.description ?? existingEntry?.description;
if (!description || /^use when/i.test(description)) {
  fail(`pass --description "<one line: what it does>" for the catalog and README (a SKILL.md description is a "Use when" trigger)`);
}
if (from && !fromIsPlugin && !existsSync(join(from, "SKILL.md"))) fail(`--from ${from} holds neither SKILL.md nor .claude-plugin/plugin.json`);

// 1. Files
const copy = (src, dst) => {
  if (resolve(src) !== resolve(dst)) cpSync(src, dst, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s) });
};
if (fromIsPlugin) copy(from, dest);
else if (from) copy(from, skillDir);
else if (!existsSync(dest)) {
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when TODO: the situations and symptoms that should load this skill.\n---\n\n# ${name}\n\nTODO: the core rule or technique in one or two sentences.\n\n## When to use\n\n## How\n\n## Common mistakes\n`,
  );
}
if (existsSync(join(dest, "SKILL.md"))) fail(`${rel}/SKILL.md sits at the plugin root; a skill belongs in ${rel}/skills/${name}/`);

// Each skill's frontmatter must name the folder it lives in.
const skillsRoot = join(dest, "skills");
const skillFolders = existsSync(skillsRoot) ? readdirSync(skillsRoot).filter((d) => existsSync(join(skillsRoot, d, "SKILL.md"))) : [];
for (const dir of skillFolders) {
  const file = join(skillsRoot, dir, "SKILL.md");
  const fm = frontmatter(file);
  if (fm.name && fm.name !== dir) {
    writeFileSync(file, readFileSync(file, "utf8").replace(/^name:.*$/m, `name: ${dir}`));
    console.log(`renamed frontmatter name "${fm.name}" -> "${dir}" in skills/${dir}/SKILL.md to match its folder`);
  }
}

// 2. plugin.json: name matches the folder and the entry; a version so installs
// update when it is bumped; description and author, or `claude plugin validate --strict` fails.
let homepage;
try {
  const url = execFileSync("git", ["-C", repo, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (m) homepage = `https://github.com/${m[1]}/tree/main/${rel}`;
} catch {
  /* no origin: no homepage */
}
const license = existsSync(join(repo, "LICENSE")) && /MIT License/.test(readFileSync(join(repo, "LICENSE"), "utf8")) ? "MIT" : undefined;
const keywords = opt("keywords") ? opt("keywords").split(",").map((k) => k.trim()) : existingEntry?.keywords;

const pjPath = join(dest, ".claude-plugin", "plugin.json");
const oldManifest = existsSync(pjPath) ? JSON.parse(readFileSync(pjPath, "utf8")) : {};
if (oldManifest.name && oldManifest.name !== name) fail(`${pjPath} says name "${oldManifest.name}", expected "${name}"`);
const bump = (v, part) => {
  const [a, b, c] = v.split(".").map(Number);
  return part === "major" ? `${a + 1}.0.0` : part === "minor" ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
};
const baseVersion = oldManifest.version ?? "0.1.0";
const version = opt("version") ?? (opt("bump") && oldManifest.version ? bump(baseVersion, opt("bump")) : baseVersion);
const manifest = {
  ...oldManifest,
  name,
  version,
  description,
  author: oldManifest.author ?? market.owner,
  ...(homepage && !oldManifest.homepage ? { homepage } : {}),
  ...(license && !oldManifest.license ? { license } : {}),
  ...(keywords ? { keywords } : {}),
};
mkdirSync(join(dest, ".claude-plugin"), { recursive: true });
writeFileSync(pjPath, JSON.stringify(manifest, null, 2) + "\n");

// 3. Marketplace entry: source is the plugin folder, with no strict and no skills key.
const entry = {
  name,
  description,
  source: `./${rel}`,
  author: market.owner,
  // Keep an existing entry's category on a re-run; defaulting reset "media" to "development" once.
  category: opt("category") ?? existingEntry?.category ?? "development",
  ...(keywords ? { keywords } : {}),
  ...(homepage ? { homepage } : {}),
  ...(license ? { license } : {}),
};
// The whole file is re-serialized with JSON.stringify(…, 2). Repos are kept in
// that format so this never reformats other entries.
const at = market.plugins.findIndex((p) => p.name === name);
if (at >= 0) {
  const { strict, skills, ...kept } = market.plugins[at];
  market.plugins[at] = { ...kept, ...entry };
} else market.plugins.push(entry);
writeFileSync(marketPath, JSON.stringify(market, null, 2) + "\n");

// 4. README row, in the table under a "What's here" heading. Built from the
// table's own header, so a column like "Install" fills in wherever it sits.
// Type says what a reader gets: "skill" when the plugin only carries skills.
const hasOtherParts = ["commands", "agents", "hooks"].some((d) => existsSync(join(dest, d))) || existsSync(join(dest, ".mcp.json")) || manifest.hooks || manifest.mcpServers;
const readmePath = join(repo, "README.md");
const installCmd = `claude plugin install ${name}@${market.name}`;
if (existsSync(readmePath)) {
  const lines = readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n").split("\n");
  const h = lines.findIndex((l) => /^#+\s+what'?s here/i.test(l));
  const head = h < 0 ? -1 : lines.findIndex((l, i) => i > h && l.startsWith("|"));
  if (head < 0) console.log("README: no table under a \"What's here\" heading; add the row by hand");
  else {
    const target = existsSync(join(dest, "README.md")) ? `${rel}/README.md` : `${rel}/skills/${name}/SKILL.md`;
    let end = head;
    while (end + 1 < lines.length && lines[end + 1].startsWith("|")) end++;
    const existing = lines.slice(head, end + 1).findIndex((l) => l.startsWith(`| [${name}](`));
    // A row's text is often hand-tuned (prerequisites, setup links): keep it unless --description is passed.
    const oldCells = existing >= 0 ? lines[head + existing].split("|").slice(1, -1).map((c) => c.trim()) : [];
    const cols = lines[head].split("|").slice(1, -1).map((c) => c.trim());
    const cell = (col, i) => {
      if (/^name$/i.test(col)) return `[${name}](${target})`;
      if (/^type$/i.test(col)) return hasOtherParts ? "plugin" : "skill";
      if (/install/i.test(col)) return `\`${installCmd}\``;
      return !opt("description") && oldCells[i] ? oldCells[i] : description; // "What it does" / "Description"
    };
    const row = `| ${cols.map(cell).join(" | ")} |`;
    if (existing >= 0) lines[head + existing] = row;
    else lines.splice(end + 1, 0, row);
    writeFileSync(readmePath, lines.join("\n"));
  }
}

console.log(`${at >= 0 ? "updated" : "added"} plugin "${name}" at ${rel} (version ${version})`);
console.log(`install: ${installCmd}`);
if (at >= 0 && !opt("bump") && !opt("version") && version === oldManifest.version) {
  console.log(`reminder: changed the plugin? re-run with --bump patch (or minor/major), or installed copies never update`);
}
console.log(`next: fill in SKILL.md if it's a template, then run the scan, the repo checks, and test-install.mjs`);
