// node --test scripts/sync.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sync } from "./sync.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "sync.mjs");
const owner = { name: "Tester", url: "https://example.com" };

/** A marketplace repo with one master (a full module and a stub on it) and one ordinary plugin, committed. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sync-"));
  const w = (p, s) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), s);
  };
  const plugin = (name, version, extra = {}) => JSON.stringify({ name, version, description: `${name} does things.`, author: owner, homepage: `https://github.com/t/skills/tree/main/plugins/${name}`, license: "MIT", keywords: ["video", "alpha", "beta", "extra"], ...extra }, null, 2) + "\n";
  const entry = (name) => ({ name, description: `${name} does things.`, source: `./plugins/${name}`, author: owner, category: "media" });
  w(".claude-plugin/marketplace.json", JSON.stringify({ name: "t-skills", owner, plugins: [entry("vid-master"), entry("other")] }, null, 2) + "\n");
  w("README.md", "# Skills\n\n## What's here\n\n<!-- family:vid-master -->\n<!-- /family:vid-master -->\n\n### More\n");
  w("plugins/vid-master/.claude-plugin/plugin.json", plugin("vid-master", "1.0.0"));
  w(
    "plugins/vid-master/skills/vid-master/SKILL.md",
    [
      "---",
      "name: vid-master",
      "description: Use when making any video.",
      "compatibility: Node 18+.",
      "---",
      "",
      "<!-- master-only -->",
      "# Video master",
      "",
      "Every kind: [alpha](formats/alpha/FORMAT.md), [beta](formats/beta/FORMAT.md).",
      "<!-- /master-only -->",
      "<!-- specialist",
      "# {{Kind}} video, from {{master}}",
      "",
      "Read [the module]({{path}}) ({{name}}, {{module}}, {{kind}}).",
      "-->",
      "",
      "## Shared",
      "",
      "Engine rules for {{not a marker}}.",
      "",
    ].join("\n"),
  );
  w("plugins/vid-master/skills/vid-master/references/guide.md", "# Guide\n\n<!-- master-only -->\nPick a format.\n<!-- /master-only -->\nShared text.\n");
  w("plugins/vid-master/skills/vid-master/formats/_template.md", "# Template\n");
  w("plugins/vid-master/skills/vid-master/formats/alpha/FORMAT.md", "---\nname: vid-alpha\ndescription: Use when making an alpha video.\nsummary: >-\n  Alpha videos: the full module.\n---\n\n# Alpha thing\n\nStatus: full\n");
  w("plugins/vid-master/skills/vid-master/formats/beta/FORMAT.md", "---\nname: vid-beta\ndescription: Use when making a beta video.\nsummary: Beta videos, early.\n---\n\n# Beta\n\nStatus: stub (nearest: alpha). Read [alpha](../alpha/FORMAT.md).\n");
  w("plugins/vid-master/skills/vid-master/assets/tone.bin", Buffer.from([0, 1, 2, 0, 255]));
  w("plugins/other/.claude-plugin/plugin.json", plugin("other", "0.1.0"));
  w("plugins/other/skills/other/SKILL.md", "---\nname: other\ndescription: Use when other.\n---\n\n# Other\n");
  const git = (...a) => spawnSync("git", ["-C", root, ...a], { encoding: "utf8" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "-A");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init");
  const base = git("rev-parse", "HEAD").stdout.trim();
  return { root, base, read: (p) => readFileSync(join(root, p), "utf8"), w, has: (p) => existsSync(join(root, p)) };
}

test("generates each specialist from the master", () => {
  const f = fixture();
  const r = sync(f.root, { since: f.base });
  assert.deepEqual(r.errors, []);
  const alpha = f.read("plugins/vid-alpha/skills/vid-alpha/SKILL.md");
  assert.match(alpha, /^---\nname: vid-alpha\ndescription: Use when making an alpha video\.\ncompatibility: Node 18\+\.\n---\n/);
  assert.match(alpha, /<!-- Generated from vid-master 1\.0\.0 by scripts\/sync\.mjs\..*fingerprint: [0-9a-f]{12} -->/);
  assert.match(alpha, /# Alpha thing video, from vid-master/);
  assert.match(alpha, /Read \[the module\]\(formats\/alpha\/FORMAT\.md\) \(vid-alpha, alpha, alpha thing\)\./);
  assert.doesNotMatch(alpha, /master-only|Video master|<!-- specialist/);
  assert.match(alpha, /Engine rules for \{\{not a marker\}\}/, "only specialist blocks are templated");
  assert.equal(f.read("plugins/vid-alpha/skills/vid-alpha/references/guide.md"), "# Guide\n\nShared text.\n");
  assert.deepEqual([...readFileSync(join(f.root, "plugins/vid-alpha/skills/vid-alpha/assets/tone.bin"))], [0, 1, 2, 0, 255]);
  // Only its own module; a stub also ships the module it builds on; never the template.
  assert.ok(f.has("plugins/vid-alpha/skills/vid-alpha/formats/alpha/FORMAT.md"));
  assert.ok(!f.has("plugins/vid-alpha/skills/vid-alpha/formats/beta"));
  assert.ok(!f.has("plugins/vid-alpha/skills/vid-alpha/formats/_template.md"));
  assert.ok(f.has("plugins/vid-beta/skills/vid-beta/formats/alpha/FORMAT.md"));
  const pj = JSON.parse(f.read("plugins/vid-beta/.claude-plugin/plugin.json"));
  assert.equal(pj.version, "1.0.0");
  assert.match(pj.description, /^Beta videos, early\. Early single-purpose specialist of vid-master, built on its alpha module\.$/);
  assert.deepEqual(pj.keywords, ["video", "extra", "beta"]);
  assert.equal(pj.homepage, "https://github.com/t/skills/tree/main/plugins/vid-beta");
  const market = JSON.parse(f.read(".claude-plugin/marketplace.json"));
  assert.deepEqual(market.plugins.map((p) => p.name), ["vid-master", "vid-alpha", "vid-beta", "other"]);
  assert.equal(market.plugins[1].source, "./plugins/vid-alpha");
  const readme = f.read("README.md");
  assert.match(readme, /<!-- family:vid-master -->\n\| Skill \| Role \| What it does \| Install \|\n\| --- \| --- \| --- \| --- \|\n\| \[vid-master\]\(plugins\/vid-master\/skills\/vid-master\/SKILL\.md\) \| \*\*Master\*\*/);
  assert.match(readme, /\| \[vid-beta\]\(plugins\/vid-beta\/skills\/vid-beta\/SKILL\.md\) \| Specialist: beta \(early, built on alpha thing\) \| Beta videos, early\. \| `claude plugin install vid-beta@t-skills` \|\n<!-- \/family:vid-master -->/);
});

test("a second run changes nothing, and --check agrees", () => {
  const f = fixture();
  sync(f.root, { since: f.base });
  assert.deepEqual(sync(f.root, { since: f.base }).changes, []);
  // The CLI syncs the repo it lives in, so run a copy placed inside the fixture.
  cpSync(SCRIPT, join(f.root, "scripts", "sync.mjs"));
  const cli = (...a) => spawnSync(process.execPath, [join(f.root, "scripts", "sync.mjs"), ...a], { encoding: "utf8" });
  const clean = cli("--check", `--since=${f.base}`);
  assert.equal(clean.status, 0, clean.stdout);
  assert.match(clean.stdout, /Everything is in step/);
  f.w("plugins/vid-master/skills/vid-master/references/guide.md", "# Guide\n\nChanged.\n");
  const stale = cli("--check", "--no-bump");
  assert.equal(stale.status, 1, stale.stdout);
  assert.match(stale.stdout, /stale  plugins\/vid-alpha: \d+ file\(s\) regenerated/);
});

test("a master edited without a bump: patch bump, specialists follow with its version", () => {
  const f = fixture();
  sync(f.root, { since: f.base });
  f.w("plugins/vid-master/skills/vid-master/references/guide.md", "# Guide\n\nShared text, sharper.\n");
  const pending = sync(f.root, { since: f.base, check: true });
  assert.ok(pending.changes.some((c) => /plugins\/vid-master: version 1\.0\.0 -> 1\.0\.1/.test(c)), pending.changes.join("\n"));
  assert.equal(JSON.parse(f.read("plugins/vid-master/.claude-plugin/plugin.json")).version, "1.0.0", "check writes nothing");
  sync(f.root, { since: f.base });
  assert.equal(JSON.parse(f.read("plugins/vid-master/.claude-plugin/plugin.json")).version, "1.0.1");
  assert.equal(JSON.parse(f.read("plugins/vid-alpha/.claude-plugin/plugin.json")).version, "1.0.1");
  assert.equal(f.read("plugins/vid-alpha/skills/vid-alpha/references/guide.md"), "# Guide\n\nShared text, sharper.\n");
  assert.match(f.read("plugins/vid-alpha/skills/vid-alpha/SKILL.md"), /Generated from vid-master 1\.0\.1/);
});

test("a version set by hand is kept; an unchanged plugin is not bumped", () => {
  const f = fixture();
  f.w("plugins/vid-master/.claude-plugin/plugin.json", f.read("plugins/vid-master/.claude-plugin/plugin.json").replace("1.0.0", "1.1.0"));
  f.w("plugins/vid-master/skills/vid-master/formats/alpha/FORMAT.md", f.read("plugins/vid-master/skills/vid-master/formats/alpha/FORMAT.md") + "\nMore.\n");
  const r = sync(f.root, { since: f.base });
  assert.ok(!r.changes.some((c) => /version/.test(c)), r.changes.join("\n"));
  assert.equal(JSON.parse(f.read("plugins/vid-beta/.claude-plugin/plugin.json")).version, "1.1.0");
  assert.equal(JSON.parse(f.read("plugins/other/.claude-plugin/plugin.json")).version, "0.1.0");
});

test("an ordinary plugin changed without a bump gets one", () => {
  const f = fixture();
  f.w("plugins/other/skills/other/SKILL.md", f.read("plugins/other/skills/other/SKILL.md") + "\nA fix.\n");
  sync(f.root, { since: f.base });
  assert.equal(JSON.parse(f.read("plugins/other/.claude-plugin/plugin.json")).version, "0.1.1");
});

test("a hand edit to a specialist stops the sync; --force discards it", () => {
  const f = fixture();
  sync(f.root, { since: f.base });
  const file = "plugins/vid-alpha/skills/vid-alpha/references/guide.md";
  f.w(file, "# Guide\n\nEdited by hand.\n");
  f.w("plugins/vid-master/skills/vid-master/references/guide.md", "# Guide\n\nMaster moved on.\n");
  const r = sync(f.root, { since: f.base });
  assert.ok(r.errors.some((e) => /plugins\/vid-alpha: edited by hand/.test(e)), r.errors.join("\n"));
  assert.equal(f.read(file), "# Guide\n\nEdited by hand.\n", "nothing written");
  assert.equal(JSON.parse(f.read("plugins/vid-master/.claude-plugin/plugin.json")).version, "1.0.0", "no partial write");
  assert.deepEqual(sync(f.root, { since: f.base, force: true }).errors, []);
  assert.equal(f.read(file), "# Guide\n\nMaster moved on.\n");
});

test("CRLF checkouts are not seen as changes", () => {
  const f = fixture();
  sync(f.root, { since: f.base });
  const file = "plugins/vid-alpha/skills/vid-alpha/references/guide.md";
  f.w(file, f.read(file).replace(/\n/g, "\r\n"));
  const master = "plugins/vid-master/skills/vid-master/SKILL.md";
  f.w(master, f.read(master).replace(/\n/g, "\r\n"));
  const r = sync(f.root, { since: f.base, bump: false, check: true });
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.changes, []);
});

test("a module removed from the master: specialist gone, renamed to the master", () => {
  const f = fixture();
  sync(f.root, { since: f.base });
  rmSync(join(f.root, "plugins/vid-master/skills/vid-master/formats/beta"), { recursive: true });
  const r = sync(f.root, { since: f.base, bump: false });
  assert.deepEqual(r.errors, []);
  assert.ok(!f.has("plugins/vid-beta"));
  const market = JSON.parse(f.read(".claude-plugin/marketplace.json"));
  assert.deepEqual(market.plugins.map((p) => p.name), ["vid-master", "vid-alpha", "other"]);
  assert.equal(market.renames["vid-beta"], "vid-master");
  assert.doesNotMatch(f.read("README.md"), /vid-beta/);
  // Bringing the module back revives it and drops the rename.
  f.w("plugins/vid-master/skills/vid-master/formats/beta/FORMAT.md", "---\nname: vid-beta\ndescription: Use when making a beta video.\nsummary: Beta again.\n---\n\n# Beta\n\nStatus: full\n");
  sync(f.root, { since: f.base, bump: false });
  assert.ok(f.has("plugins/vid-beta/skills/vid-beta/SKILL.md"));
  assert.equal(JSON.parse(f.read(".claude-plugin/marketplace.json")).renames, undefined);
});

test("broken input is refused with a reason", () => {
  const f = fixture();
  f.w("plugins/vid-master/skills/vid-master/formats/alpha/FORMAT.md", "---\nname: vid-alpha\ndescription: Use when alpha.\n---\n\n# Alpha\n");
  f.w("plugins/vid-master/skills/vid-master/references/guide.md", "<!-- master-only -->\nno end\n");
  const r = sync(f.root, { since: f.base });
  assert.ok(r.errors.some((e) => /alpha\/FORMAT\.md: needs a summary/.test(e)), r.errors.join("\n"));
  const g = fixture();
  g.w("plugins/vid-master/skills/vid-master/references/guide.md", "<!-- master-only -->\nno end\n");
  const r2 = sync(g.root, { since: g.base });
  assert.ok(r2.errors.some((e) => /guide\.md: 1 "<!-- master-only -->" line\(s\) but 0/.test(e)), r2.errors.join("\n"));
  assert.ok(!g.has("plugins/vid-alpha"), "nothing written on error");
  const h = fixture();
  h.w("README.md", "# Skills\n");
  assert.ok(sync(h.root, { since: h.base }).errors.some((e) => /add the lines "<!-- family:vid-master -->"/.test(e)));
});
