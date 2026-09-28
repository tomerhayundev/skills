#!/usr/bin/env node
/**
 * Scans a skill or plugin folder before it is published.
 *
 *   node scan.mjs <folder> [--public]
 *
 * errors (exit 1): anything that looks like a credential; with --public, also
 *   content its owner marked as not public (it belongs in the private repo).
 * warnings: personal absolute paths, email addresses, em dashes (house style),
 *   and, without --public, those not-public markers.
 *
 * Blocked names: when the folder sits in a repo with scripts/names.mjs (the public
 * skills repo), a real company, client, product or competitor name on its list is
 * an error with --public and a warning without. The list is salted hashes only;
 * findings give the place, never the name.
 *
 * A line containing "scan:allow" is skipped (for rules that must name the words,
 * like this file's own patterns). A clean scan is necessary, not sufficient:
 * read what you are publishing.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--"));
const isPublic = args.includes("--public");
if (!root) {
  console.error("usage: node scan.mjs <skill-or-plugin-folder> [--public]");
  process.exit(2);
}

const SECRETS = [
  [/\bsk_(live|test)_[A-Za-z0-9]{10,}/, "Stripe-style secret key"],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{20,}/, "OpenAI/Anthropic-style API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/, "GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{30,}/, "Google API key"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\b[A-Z0-9_]*(API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*[:=]\s*["']?(?!your|<|\$|\{|xxx|placeholder|example|changeme|process\.env|os\.environ|os\.getenv|getenv|import\.meta\.env|Deno\.env|env\.|secrets\.|config\.|settings\.)[A-Za-z0-9_\-./+]{12,}/i, "credential assignment"],
];
const CONFIDENTIAL = /\b(confidential|proprietary|internal[- ]only|do not share|trade secret|under NDA|not for (redistribution|publication))\b/i; // scan:allow
const PERSONAL_PATH = /\b[A-Za-z]:[\\/]Users[\\/][^\\/\s`'"]+|\/Users\/[a-z][\w.-]*\/|\/home\/[a-z][\w.-]*\//;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const EM_DASH = String.fromCharCode(0x2014);
const TEXT = /\.(md|mdx|txt|json|ya?ml|toml|js|mjs|cjs|ts|tsx|jsx|py|sh|ps1|html|css|env|ini|cfg)$/i;

const errors = [];
const warnings = [];

// The repo this folder belongs to may keep a list of names that must never appear.
let names = null;
for (let dir = resolve(root); ; dir = dirname(dir)) {
  if (existsSync(join(dir, "scripts", "names.mjs"))) {
    const lib = await import(pathToFileURL(join(dir, "scripts", "names.mjs")).href);
    names = { find: lib.findNames, hashes: lib.loadHashes(dir) };
    break;
  }
  if (dirname(dir) === dir) break;
}

function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === ".git" || e.name === "node_modules") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (TEXT.test(e.name) || e.name.startsWith(".env")) scanFile(p);
    else if (statSync(p).size > 5 * 1024 * 1024) warnings.push(`${relative(root, p)}: ${Math.round(statSync(p).size / 1048576)} MB binary; make sure you may redistribute it`);
  }
}

function scanFile(p) {
  const rel = relative(root, p);
  if (/^\.env/.test(p.split(/[\\/]/).pop())) errors.push(`${rel}: an env file; never publish one`);
  const text = readFileSync(p, "utf8");
  for (const hit of names?.find(text, names.hashes) ?? []) {
    (isPublic ? errors : warnings).push(`${rel}:${hit.line}:${hit.column}: a blocked company or product name; describe the case by category`);
  }
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes("scan:allow")) return;
    const at = `${rel}:${i + 1}`;
    for (const [re, what] of SECRETS) if (re.test(line)) errors.push(`${at}: ${what}: ${line.trim().slice(0, 90)}`);
    if (CONFIDENTIAL.test(line)) (isPublic ? errors : warnings).push(`${at}: marked confidential/proprietary${isPublic ? " (belongs in the private repo)" : ""}: ${line.trim().slice(0, 90)}`); // scan:allow
    if (PERSONAL_PATH.test(line)) warnings.push(`${at}: personal absolute path: ${line.match(PERSONAL_PATH)[0]}`);
    if (EMAIL.test(line) && !/noreply|example\.(com|org)/i.test(line)) warnings.push(`${at}: email address: ${line.match(EMAIL)[0]}`);
    if (line.includes(EM_DASH)) warnings.push(`${at}: em dash (house style: use a comma, colon or semicolon)`);
  });
}

walk(root);
for (const w of warnings) console.log(`warn   ${w}`);
for (const e of errors) console.log(`error  ${e}`);
console.log(`\n${errors.length} errors, ${warnings.length} warnings${isPublic ? " (public rules)" : ""}`);
process.exit(errors.length ? 1 : 0);
