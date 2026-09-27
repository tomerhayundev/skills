#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook that keeps AI agents out of production.
 * Copy to .claude/hooks/deploy-guard.mjs and register it in .claude/settings.json.
 *
 * deny: pushing to a protected branch, deploys, rollbacks, remote D1 migrations,
 *       secret changes, deleting Workers or their resources.
 * ask:  merging a PR, dispatching a workflow, remote D1 queries, and editing
 *       .github/workflows/, Wrangler config files, or this guard's registration.
 * anything else: no opinion, the normal permission flow applies.
 *
 * It reads commands the way a shell does (quotes, heredocs, &&, ;, |, sh -c),
 * so a commit message or grep that merely mentions "wrangler deploy" passes.
 * It is a guard against mistakes, not a security boundary: the GitHub ruleset
 * is that. Any internal error exits 0, so a bug here never blocks other work.
 *
 * Try it: echo '{"tool_name":"Bash","tool_input":{"command":"npx wrangler deploy"}}' | node deploy-guard.mjs
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const PROTECTED_BRANCHES = ["main", "production"];
const PROTECTED_PATHS = [".github/workflows/", ".claude/settings.json", ".claude/settings.local.json", ".claude/hooks/deploy-guard.mjs"];
const VIA_CI = "All deploys go through GitHub Actions: push a branch, open a PR, and let the pipeline deploy.";

let verdict = null;
/** Records a decision; deny outranks ask, and the first reason of a rank wins. */
function flag(decision, reason) {
  if (!verdict || (decision === "deny" && verdict.decision !== "deny")) verdict = { decision, reason };
}

/** Splits a shell command into simple commands (arrays of words). Honors quotes, escapes and heredocs. */
function simpleCommands(src) {
  const commands = [];
  const heredocs = [];
  let words = [];
  let word = "";
  let inWord = false;
  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "'") {
      const close = src.indexOf("'", i + 1);
      const end = close < 0 ? src.length : close;
      word += src.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (c === '"') {
      inWord = true;
      for (i++; i < src.length && src[i] !== '"'; i++) {
        if (src[i] === "\\" && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) i++;
        word += src[i];
      }
    } else if (c === "\\" && i + 1 < src.length) {
      if (src[i + 1] !== "\n") word += src[i + 1];
      inWord = true;
      i++;
    } else if (c === "<" && src[i + 1] === "<" && src[i + 2] !== "<") {
      // heredoc: remember its delimiter; the body (after the next newline) is data
      endWord();
      const m = /^<<[-~]?\s*(['"]?)([A-Za-z0-9_]+)\1/.exec(src.slice(i));
      if (m) {
        heredocs.push(m[2]);
        i += m[0].length - 1;
      } else i++;
    } else if (c === "\n") {
      endCommand();
      while (heredocs.length) {
        const delimiter = heredocs.shift();
        let next = src.indexOf("\n", i + 1);
        while (next !== -1 && src.slice(i + 1, next).trim() !== delimiter) {
          i = next;
          next = src.indexOf("\n", i + 1);
        }
        i = next === -1 ? src.length : next;
      }
    } else if (" \t\r".includes(c)) {
      endWord();
    } else if (";&|()".includes(c)) {
      endCommand();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const WRAPPERS = new Set(["sudo", "env", "time", "nohup", "exec", "command", "builtin", "!"]);
const stripPrefixes = (words) => {
  let i = 0;
  while (i < words.length && (WRAPPERS.has(words[i]) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]))) i++;
  return words.slice(i);
};
const base = (w) => w.replace(/\\/g, "/").split("/").pop().replace(/\.(cmd|exe|ps1|js|mjs)$/i, "").toLowerCase();
const binName = (w) => base(w).replace(/(.)@.*$/, "$1");

const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"];
// package-manager and runner flags that take a separate value: npm -w api, pnpm --filter api, npx -p wrangler
const VALUE_FLAGS = /^(-w|--workspace|--prefix|-C|--cwd|--dir|-F|--filter|-p|--package|-c|--call)$/;

/** Drops leading flags (and their values) such as `--prefix worker` or `-w api`. */
function skipFlags(args) {
  while (args.length && args[0].startsWith("-") && args[0] !== "--") args = args.slice(VALUE_FLAGS.test(args[0]) ? 2 : 1);
  return args[0] === "--" ? args.slice(1) : args;
}

/** Resolves package runners (npx x, pnpm exec x, npm exec -w api -- x, node .../wrangler.js) to [binary, ...args]. */
function resolveBinary(words) {
  const [cmd, ...rest] = words;
  const name = base(cmd);
  let args;
  if (["npx", "bunx", "pnpx"].includes(name)) args = rest;
  else if (PACKAGE_MANAGERS.includes(name)) {
    const afterFlags = skipFlags(rest);
    if (["exec", "dlx", "x"].includes(afterFlags[0])) args = afterFlags.slice(1);
    else if (name !== "npm" && afterFlags[0]) args = afterFlags;
    else return [name, ...rest];
  } else if (name === "node" && rest[0] && /wrangler/i.test(rest[0])) return ["wrangler", ...rest.slice(1)];
  else return [binName(cmd), ...rest];
  args = skipFlags(args);
  return args.length ? [binName(args[0]), ...args.slice(1)] : [name];
}

function currentBranch(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function checkGit(args, cwd) {
  let dir = cwd;
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    if (args[i] === "-C" && args[i + 1]) dir = /^([A-Za-z]:|[\\/])/.test(args[++i]) ? args[i] : `${cwd}/${args[i]}`;
    else if (["-c", "--git-dir", "--work-tree", "--namespace"].includes(args[i])) i++;
    i++;
  }
  if (args[i] !== "push") return;
  const positional = [];
  for (let j = i + 1; j < args.length; j++) {
    const a = args[j];
    if (a === "-n" || a === "--dry-run") return;
    if (a === "--all" || a === "--mirror" || a === "--branches") return flag("deny", `\`git push ${a}\` would push protected branches. Push only your feature branch.`);
    if (["-o", "--push-option", "--repo", "--receive-pack", "--exec"].includes(a)) j++;
    else if (!a.startsWith("-")) positional.push(a);
  }
  const branch = currentBranch(dir);
  const refspecs = positional.slice(1);
  const targets = refspecs.length
    ? refspecs.map((spec) => {
        const dst = spec.replace(/^\+/, "").split(":").pop();
        return dst === "HEAD" || dst === "@" ? branch : dst.replace(/^refs\/heads\//, "");
      })
    : [branch];
  const hit = targets.find((t) => t && PROTECTED_BRANCHES.includes(t));
  if (hit) flag("deny", `pushing to '${hit}' is blocked. Create a branch (git switch -c feature/<name>), push it, and open a PR with gh pr create.`);
}

function checkWrangler(args) {
  const a = args.filter((w) => !w.startsWith("-"));
  const has = (f) => args.some((w) => w === f || w.startsWith(`${f}=`));
  const [sub, sub2, sub3] = a;
  const secretVerb = a[a.indexOf("secret") + 1];
  if (sub === "deploy" && !has("--dry-run")) flag("deny", `\`wrangler deploy\` is blocked. ${VIA_CI}`);
  else if (sub === "rollback") flag("deny", "`wrangler rollback` is blocked. A human runs the Rollback Production workflow from the Actions tab.");
  else if ((sub === "versions" || sub === "triggers") && sub2 === "deploy") flag("deny", `\`wrangler ${sub} deploy\` is blocked. ${VIA_CI}`);
  else if (sub === "pages" && (sub2 === "deploy" || sub2 === "publish")) flag("deny", `\`wrangler pages ${sub2}\` is blocked. ${VIA_CI}`);
  else if (sub === "pages" && a.includes("delete")) flag("deny", "deleting a Pages project or deployment is blocked.");
  else if (a.includes("secret") && ["put", "delete", "bulk"].includes(secretVerb)) flag("deny", "changing secrets is blocked. Ask the human to run it; secret values never pass through an agent.");
  else if (sub === "d1" && sub2 === "migrations" && sub3 === "apply" && has("--remote")) flag("deny", `remote D1 migrations run in CI, after the build and before the deploy. Use --local here. ${VIA_CI}`);
  else if (sub === "d1" && sub2 === "time-travel" && sub3 === "restore") flag("deny", "restoring a D1 database is a human decision.");
  else if (sub === "d1" && sub2 === "execute" && has("--remote")) flag("ask", "this runs SQL against a remote D1 database. Confirm it is read-only or intended.");
  else if (sub === "delete") flag("deny", "deleting a Worker is blocked.");
  else if (["d1", "kv", "r2", "queues", "vectorize", "hyperdrive"].includes(sub) && a.slice(1, 3).includes("delete") && sub2 !== "key" && sub2 !== "object") {
    flag("deny", `deleting a ${sub} resource is blocked.`);
  }
}

function checkCommand(words, cwd, depth) {
  words = stripPrefixes(words);
  if (!words.length) return;
  const name = base(words[0]);
  if (["sh", "bash", "zsh", "dash", "pwsh", "powershell"].includes(name)) {
    const k = words.findIndex((w, idx) => idx > 0 && /^-(c|command)$/i.test(w));
    if (depth < 3 && k > 0 && words[k + 1]) for (const inner of simpleCommands(words[k + 1])) checkCommand(inner, cwd, depth + 1);
    return;
  }
  if (name === "git") return checkGit(words.slice(1), cwd);
  if (name === "gh") {
    if (words[1] === "pr" && words[2] === "merge") flag("ask", "merging a PR deploys it (main to staging, production to production). Confirm this merge.");
    if (words[1] === "workflow" && words[2] === "run") flag("ask", "dispatching a workflow can deploy or roll back. Confirm this run.");
    return;
  }
  if (PACKAGE_MANAGERS.includes(name)) {
    const sub = skipFlags(words.slice(1));
    const script = ["run", "run-script"].includes(sub[0]) ? skipFlags(sub.slice(1))[0] : sub[0];
    const pnpmBuiltin = name === "pnpm" && sub[0] === "deploy";
    if (/^deploy(:|$)/.test(script ?? "") && !pnpmBuiltin) return flag("deny", `\`${words.join(" ")}\` runs a deploy script. ${VIA_CI}`);
  }
  const [bin, ...args] = resolveBinary(words);
  if (bin === "wrangler") checkWrangler(args);
  else if (bin === "opennextjs-cloudflare" && args[0] === "deploy") flag("deny", `\`opennextjs-cloudflare deploy\` is blocked. ${VIA_CI}`);
  else if (bin === "vercel" && args.includes("--prod")) flag("deny", `\`vercel --prod\` is blocked. ${VIA_CI}`);
  else if (bin === "netlify" && args[0] === "deploy" && args.includes("--prod")) flag("deny", `\`netlify deploy --prod\` is blocked. ${VIA_CI}`);
}

// wrangler.jsonc, wrangler.toml, wrangler.staging.jsonc, wrangler.preview-migrations.jsonc: production bindings, routes, DB IDs
const WRANGLER_CONFIG = /(?:^|[\/\s"'=])(wrangler(?:\.[\w-]+)*\.(?:jsonc?|toml))(?=$|[\s"';|&)])/;

const protectedPathIn = (text) => {
  const t = text.replace(/\\/g, "/");
  return PROTECTED_PATHS.find((p) => t.includes(p)) ?? WRANGLER_CONFIG.exec(t)?.[1];
};
const SHELL_WRITE = /(?<![\d>&])>{1,2}(?!&)|\bsed\s+(-\w*i|--in-place)|\btee\b|\b(rm|mv|cp|truncate)\s|\bgit\s+(rm|mv|checkout|restore)\b|\b(Set-Content|Add-Content|Out-File|Remove-Item|Move-Item|Copy-Item|New-Item)\b/i;

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const toolInput = input.tool_input ?? {};
  const cwd = input.cwd || process.cwd();
  if (input.tool_name === "Bash" || input.tool_name === "PowerShell") {
    const command = String(toolInput.command ?? "");
    for (const words of simpleCommands(command)) checkCommand(words, cwd, 0);
    const path = protectedPathIn(command);
    if (path && SHELL_WRITE.test(command)) flag("ask", `this command may change ${path}, which controls deploys or this guard. A human approves those changes.`);
  } else if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(input.tool_name)) {
    const path = protectedPathIn(String(toolInput.file_path ?? toolInput.notebook_path ?? ""));
    if (path) flag("ask", `${path} controls deploys or this guard. A human approves changes to it.`);
  }
  if (verdict) {
    const hookSpecificOutput = { hookEventName: "PreToolUse", permissionDecision: verdict.decision, permissionDecisionReason: `deploy-guard: ${verdict.reason}` };
    process.stdout.write(JSON.stringify({ hookSpecificOutput }));
  }
} catch {
  // never block work because the guard itself failed
}
process.exit(0);
