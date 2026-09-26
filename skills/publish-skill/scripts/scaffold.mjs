#!/usr/bin/env node
/**
 * Adds a skill or plugin to a Claude Code marketplace repo: files, the
 * marketplace.json entry, and the README table row. Idempotent: run it again
 * after editing to refresh the entry.
 *
 *   node scaffold.mjs --repo <marketplace-repo> --name <kebab-name>
 *        [--from <existing skill or plugin folder>] [--plugin]
 *        --description "<what it does, one line>" [--category development] [--keywords a,b,c]
 *
 * --description is required on first add: the catalog and README describe what
 * the skill does, while its SKILL.md description is a "Use when" trigger.
 *
 * Skill (default): skills/<name>/SKILL.md, entry { source: "./", strict: false,
 *   skills: ["./skills/<name>"] }.
 * Plugin (--plugin, or --from a folder holding .claude-plugin/plugin.json):
 *   plugins/<name>/ with its plugin.json (version 0.1.0 if missing), entry
 *   { source: "./plugins/<name>" }.
 * Without --from, writes a SKILL.md template to fill in.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

if (!repo || !name) fail("usage: scaffold.mjs --repo <dir> --name <kebab-name> [--from <dir>] [--plugin] [--description ...]");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) fail(`name "${name}" must be 1-64 lowercase letters, digits and single hyphens`);
const marketPath = join(repo, ".claude-plugin", "marketplace.json");
if (!existsSync(marketPath)) fail(`${marketPath} not found; --repo must be a marketplace repo root`);
if (from && !existsSync(from)) fail(`--from ${from} does not exist`);

const isPlugin = argv.includes("--plugin") || (from && existsSync(join(from, ".claude-plugin", "plugin.json")));
const rel = isPlugin ? `plugins/${name}` : `skills/${name}`;
const dest = join(repo, rel);

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
const srcManifestPath = from && join(from, ".claude-plugin", "plugin.json");
const srcManifest = srcManifestPath && existsSync(srcManifestPath) ? JSON.parse(readFileSync(srcManifestPath, "utf8")) : null;
const description = opt("description") ?? srcManifest?.description ?? existingEntry?.description;
if (!description || /^use when/i.test(description)) {
  fail(`pass --description "<one line: what it does>" for the catalog and README (a SKILL.md description is a "Use when" trigger)`);
}

// 1. Files
if (from) {
  if (resolve(from) !== resolve(dest)) cpSync(from, dest, { recursive: true, filter: (s) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(s) });
} else if (!existsSync(dest)) {
  const skillDir = isPlugin ? join(dest, "skills", name) : dest;
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: Use when TODO: the situations and symptoms that should load this skill.\n---\n\n# ${name}\n\nTODO: the core rule or technique in one or two sentences.\n\n## When to use\n\n## How\n\n## Common mistakes\n`,
  );
}

// Plugin manifest: name must match the entry; a version so installs update on
// bump; description and author, or `claude plugin validate --strict` fails.
let pluginManifest = null;
if (isPlugin) {
  const pj = join(dest, ".claude-plugin", "plugin.json");
  pluginManifest = existsSync(pj) ? JSON.parse(readFileSync(pj, "utf8")) : {};
  if (pluginManifest.name && pluginManifest.name !== name) fail(`${pj} says name "${pluginManifest.name}", expected "${name}"`);
  pluginManifest = {
    name,
    version: "0.1.0",
    description,
    author: market.owner,
    ...pluginManifest,
  };
  mkdirSync(join(dest, ".claude-plugin"), { recursive: true });
  writeFileSync(pj, JSON.stringify(pluginManifest, null, 2) + "\n");
}

// Skill frontmatter must name the folder it lives in.
const skillMd = isPlugin ? join(dest, "skills", name, "SKILL.md") : join(dest, "SKILL.md");
const fm = frontmatter(skillMd);
if (!isPlugin && fm.name && fm.name !== name) {
  const text = readFileSync(skillMd, "utf8").replace(/^name:.*$/m, `name: ${name}`);
  writeFileSync(skillMd, text);
  console.log(`renamed frontmatter name "${fm.name}" -> "${name}" to match the folder`);
}

// 2. Marketplace entry
let homepage;
try {
  const url = execFileSync("git", ["-C", repo, "remote", "get-url", "origin"], { encoding: "utf8" }).trim();
  const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  if (m) homepage = `https://github.com/${m[1]}/tree/main/${rel}`;
} catch {
  /* no origin: no homepage */
}
const license = existsSync(join(repo, "LICENSE")) && /MIT License/.test(readFileSync(join(repo, "LICENSE"), "utf8")) ? "MIT" : undefined;
const entry = {
  name,
  description,
  source: isPlugin ? `./${rel}` : "./",
  ...(isPlugin ? {} : { strict: false, skills: [`./${rel}`] }),
  author: market.owner,
  category: opt("category") ?? "development",
  ...(opt("keywords") ? { keywords: opt("keywords").split(",").map((k) => k.trim()) } : {}),
  ...(homepage ? { homepage } : {}),
  ...(license ? { license } : {}),
};
// The whole file is re-serialized with JSON.stringify(…, 2). Repos are kept in
// that format so this never reformats other entries.
const at = market.plugins.findIndex((p) => p.name === name);
if (at >= 0) market.plugins[at] = { ...market.plugins[at], ...entry };
else market.plugins.push(entry);
writeFileSync(marketPath, JSON.stringify(market, null, 2) + "\n");

// 3. README row, in the table under a "What's here" heading
const readmePath = join(repo, "README.md");
if (existsSync(readmePath)) {
  const lines = readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n").split("\n");
  const h = lines.findIndex((l) => /^#+\s+what'?s here/i.test(l));
  const head = h < 0 ? -1 : lines.findIndex((l, i) => i > h && l.startsWith("|"));
  if (head < 0) console.log("README: no table under a \"What's here\" heading; add the row by hand");
  else {
    const cols = lines[head].split("|").length - 2;
    const link = `[${name}](${isPlugin ? `${rel}/README.md` : `${rel}/SKILL.md`})`;
    const row = cols >= 3 ? `| ${link} | ${isPlugin ? "plugin" : "skill"} | ${description} |` : `| ${link} | ${description} |`;
    let end = head;
    while (end + 1 < lines.length && lines[end + 1].startsWith("|")) end++;
    const existing = lines.slice(head, end + 1).findIndex((l) => l.startsWith(`| [${name}](`));
    if (existing >= 0) lines[head + existing] = row;
    else lines.splice(end + 1, 0, row);
    writeFileSync(readmePath, lines.join("\n"));
  }
}

console.log(`${at >= 0 ? "updated" : "added"} ${isPlugin ? "plugin" : "skill"} "${name}" at ${rel}`);
console.log(`next: fill in SKILL.md if it's a template, then run the scan, the repo checks, and test-install.mjs`);
