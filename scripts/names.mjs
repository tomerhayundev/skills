#!/usr/bin/env node
/**
 * Keeps real company, client, product and competitor names out of this repo
 * without writing them into it: scripts/blocked-names.txt holds only salted
 * hashes. A name is caught however it is written ("Qworbly Crates",
 * "qworbly-crates", "QworblyCrates", "qworblycrates.com"): text is split into words,
 * and every run of 1 to 4 consecutive words is joined, lowercased and hashed.
 *
 *   node scripts/names.mjs add "<name>"     add a name (only its hash is stored)
 *   node scripts/names.mjs check [<path>]   find blocked names in files (default: the repo)
 *
 * check-skills.mjs runs the check on every push; publish-skill's scan runs it on
 * a folder before it is published. Findings print the place, never the name.
 * Add a name as it is written. A name that is also an ordinary word goes in only
 * with the rest of its full name (the word plus its country or trade), or
 * ordinary text matches it.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SALT = "tomerhayundev-skills/blocked-names/v1";
const MAX_WORDS = 4;
export const HASH_FILE = "scripts/blocked-names.txt";

const normalize = (s) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "");
export const hashName = (name) => createHash("sha256").update(`${SALT}:${normalize(name)}`).digest("hex").slice(0, 24);

/** The hashes in a repo's blocked-names file (comment lines start with #). */
export function loadHashes(root) {
  const file = join(root, HASH_FILE);
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[0-9a-f]{24}$/.test(l)));
}

/** Every line and column where a blocked name occurs in the text. */
export function findNames(text, hashes) {
  if (!hashes.size) return [];
  const found = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const words = [...line.matchAll(/[\p{L}\p{N}]+/gu)];
    for (let a = 0; a < words.length; a++) {
      let joined = "";
      for (let b = a; b < Math.min(words.length, a + MAX_WORDS); b++) {
        joined += words[b][0];
        if (hashes.has(hashName(joined))) {
          found.push({ line: i + 1, column: words[a].index + 1 });
          break;
        }
      }
    }
  });
  return found;
}

const SKIP = /(^|[\\/])(\.git|node_modules)([\\/]|$)/;
const TEXT = /\.(md|mdx|txt|json|mjs|js|ts|tsx|yml|yaml|html|svg|css|sh|srt|csv)$/i;

/** Blocked names in every text file under `path`, as { file, line, column }. */
export function scanPath(path, hashes, root = path) {
  const out = [];
  const visit = (p) => {
    if (SKIP.test(relative(root, p))) return;
    if (statSync(p).isDirectory()) return readdirSync(p).forEach((e) => visit(join(p, e)));
    if (!TEXT.test(p) || p.endsWith(HASH_FILE.split("/").pop())) return;
    for (const f of findNames(readFileSync(p, "utf8"), hashes)) out.push({ file: relative(root, p).replace(/\\/g, "/") || p, ...f });
  };
  visit(path);
  return out;
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (cmd === "add" && arg) {
    const hashes = loadHashes(root);
    const h = hashName(arg);
    if (!normalize(arg)) return console.error("error: the name has no letters or digits"), process.exit(2);
    if (hashes.has(h)) return console.log("already blocked");
    if (!existsSync(join(root, HASH_FILE))) appendFileSync(join(root, HASH_FILE), "# Salted hashes of names that must never appear in this repo. Add with: node scripts/names.mjs add \"<name>\"\n");
    appendFileSync(join(root, HASH_FILE), `${h}\n`);
    const hits = scanPath(root, new Set([h]));
    console.log(`blocked (${hashes.size + 1} names).${hits.length ? ` It already appears ${hits.length} time(s): run node scripts/names.mjs check` : " It appears nowhere in the repo."}`);
    return;
  }
  if (cmd === "check") {
    const hits = scanPath(arg ? resolve(arg) : root, loadHashes(root), arg ? resolve(arg) : root);
    for (const h of hits) console.log(`${h.file}:${h.line}:${h.column}: a blocked company or product name`);
    console.log(hits.length ? `\n${hits.length} blocked name(s). Describe the case by category instead.` : "no blocked names");
    process.exit(hits.length ? 1 : 0);
  }
  console.error('usage: node scripts/names.mjs add "<name>" | check [<path>]');
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
