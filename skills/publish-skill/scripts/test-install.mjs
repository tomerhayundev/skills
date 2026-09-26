#!/usr/bin/env node
/**
 * Installs plugins from a marketplace into a throwaway Claude Code config and
 * reports what loaded, so a broken entry fails here and not on someone's
 * machine. Never touches your real config.
 *
 *   node test-install.mjs --repo <marketplace-repo> [--plugin <name>]... [--remote <git-url>]
 *
 * Default source is the local repo folder (tests uncommitted work). --remote
 * tests what is actually pushed, e.g. https://github.com/owner/skills.git.
 * Without --plugin, installs every entry. Exit 1 on any failure.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const all = (k) => argv.flatMap((a, i) => (a === `--${k}` && argv[i + 1] ? [argv[i + 1]] : a.startsWith(`--${k}=`) ? [a.slice(k.length + 3)] : []));
const repo = all("repo")[0] && resolve(all("repo")[0]);
const remote = all("remote")[0];
if (!repo) {
  console.error("usage: test-install.mjs --repo <dir> [--plugin <name>]... [--remote <git-url>]");
  process.exit(2);
}

const market = JSON.parse(readFileSync(join(repo, ".claude-plugin", "marketplace.json"), "utf8"));
const plugins = all("plugin").length ? all("plugin") : market.plugins.map((p) => p.name);

// Short path on purpose: git on Windows fails past 260 characters, and the
// plugin cache nests deep.
const config = mkdtempSync(join(tmpdir(), "cct-"));
const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_CODE_PLUGIN_PREFER_HTTPS: "1" };
const claude = (...a) => spawnSync("claude", a, { env, encoding: "utf8", shell: process.platform === "win32" });

let failed = false;
try {
  const add = claude("plugin", "marketplace", "add", remote ?? repo);
  const addOut = (add.stdout + add.stderr).trim().split("\n").pop();
  console.log(`marketplace add ${remote ?? repo}\n  ${addOut}`);
  if (add.status !== 0 || !/Successfully/.test(addOut)) throw new Error("marketplace add failed");

  for (const p of plugins) {
    const id = `${p}@${market.name}`;
    const inst = claude("plugin", "install", id);
    const instOut = (inst.stdout + inst.stderr).trim().split("\n").pop();
    const ok = inst.status === 0 && /Successfully/.test(instOut);
    console.log(`\n${ok ? "ok  " : "FAIL"} ${id}\n  ${instOut}`);
    if (!ok) {
      failed = true;
      continue;
    }
    const details = claude("plugin", "details", id).stdout;
    const inventory = details.split("\n").filter((l) => /^\s+(Skills|Agents|Hooks|MCP servers|LSP servers)\s*\(/.test(l));
    for (const l of inventory) console.log(`  ${l.trim()}`);
    if (!inventory.some((l) => !/\(0\)/.test(l))) {
      console.log("  FAIL: installed but loaded no components");
      failed = true;
    }
  }
} catch (e) {
  console.log(`FAIL: ${e.message}`);
  failed = true;
} finally {
  rmSync(config, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
