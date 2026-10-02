#!/usr/bin/env node
/**
 * Keeps the files derived from other files in step, so every change is made in
 * one place. Node 18+, no dependencies. Run it after any change; CI runs it on
 * every push to main and commits what it changes.
 *
 *   node scripts/sync.mjs                 bump versions, regenerate specialists, catalog and README
 *   node scripts/sync.mjs --check         change nothing; list what is out of step, exit 1 if anything is
 *   node scripts/sync.mjs --since=<ref>   compare versions against <ref> (default origin/main)
 *   node scripts/sync.mjs --no-bump       skip the version step
 *   node scripts/sync.mjs --force         overwrite a specialist that was edited by hand
 *
 * Versions. A plugin whose files changed since <ref> while its version did not
 * gets a patch bump, or installed copies never update. For a minor or major
 * release, set the version yourself first: the sync never touches a version
 * that already moved.
 *
 * Specialists. A master skill keeps modules in formats/<id>/FORMAT.md, each with
 * frontmatter name, description (its "Use when") and summary (what it does). Every
 * module is also published as its own plugin, plugins/<name>/, generated from the
 * master: the master's files with only this module (plus, for a stub, the module it
 * builds on), and a SKILL.md made from the master's. In the master's .md files,
 * blocks between <!-- master-only --> and <!-- /master-only --> lines are dropped,
 * and each <!-- specialist ... --> comment becomes text, with {{name}}, {{module}},
 * {{kind}}, {{Kind}}, {{path}} and {{master}} filled in. A specialist carries its
 * master's version and a fingerprint of what was generated: a hand edit stops the
 * sync (move the change into the master, or pass --force to discard it). A module
 * removed from the master becomes a rename to the master in the catalog.
 *
 * Catalog and README. Specialists get marketplace entries right after their
 * master. Between <!-- family:<master> --> and <!-- /family:<master> --> the
 * README gets a diagram of the master and its specialists, then the
 * specialists' table; the master's own card above the markers is written by hand.
 *
 * Sources. sources/catalog.json is copied, as assets/sources.json, with
 * sources/find-sources.mjs as scripts/find-sources.mjs, into every skill of each
 * plugin its "consumers" lists; a master passes them on to its specialists. A
 * consumer whose copy changed gets its patch bump like any other change.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GENERATED = "<!-- Generated from ";
const FP_RE = /fingerprint: [0-9a-f]{12} -->/;
const FP_BLANK = "fingerprint: 000000000000 -->";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const posix = (p) => p.replace(/\\/g, "/");
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const subdirs = (p) => (isDir(p) ? readdirSync(p).filter((d) => isDir(join(p, d))).sort() : []);
const lcfirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Every file under dir, as relative posix path -> Buffer. */
function readTree(dir) {
  const out = new Map();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules" || e.name === ".DS_Store") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(posix(relative(dir, p)), readFileSync(p));
    }
  };
  if (isDir(dir)) walk(dir);
  return out;
}

/** Text compares and hashes with LF line ends, whatever the checkout wrote. */
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const norm = (buf) => (isText(buf) ? Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n")) : buf);
const same = (a, b) => norm(a).equals(norm(b));

function fingerprint(files) {
  const h = createHash("sha256");
  for (const k of [...files.keys()].sort()) {
    let buf = norm(files.get(k));
    if (k.endsWith("SKILL.md")) buf = Buffer.from(buf.toString("utf8").replace(FP_RE, FP_BLANK));
    h.update(k).update("\0").update(String(buf.length)).update("\0").update(buf);
  }
  return h.digest("hex").slice(0, 12);
}

/** Frontmatter keys with their raw lines (a folded value keeps its continuation lines), values, and the body. */
function splitFrontmatter(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0] !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const entries = [];
  for (let i = 1; i < end; i++) {
    const m = lines[i].match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!m) {
      entries.at(-1)?.raw.push(lines[i]);
      continue;
    }
    const raw = [lines[i]];
    let value = m[2];
    if (/^[>|]-?$/.test(value)) {
      const block = [];
      while (i + 1 < end && /^\s+/.test(lines[i + 1])) {
        raw.push(lines[++i]);
        block.push(lines[i].trim());
      }
      value = block.join(value.startsWith(">") ? " " : "\n");
    } else if (/^["'].*["']$/.test(value)) value = value.slice(1, -1);
    entries.push({ key: m[1], raw, value });
  }
  return { entries, fields: Object.fromEntries(entries.map((e) => [e.key, e.value])), body: lines.slice(end + 1).join("\n") };
}

/** The master's text as a specialist reads it: master-only blocks out, specialist comments in. */
function transform(text, vars, where, errors) {
  let t = text.replace(/\r\n/g, "\n");
  const opens = (t.match(/^<!-- master-only -->$/gm) ?? []).length;
  const closes = (t.match(/^<!-- \/master-only -->$/gm) ?? []).length;
  if (opens !== closes) {
    errors.push(`${where}: ${opens} "<!-- master-only -->" line(s) but ${closes} "<!-- /master-only -->"`);
    return t;
  }
  t = t.replace(/^<!-- master-only -->\n[\s\S]*?^<!-- \/master-only -->(\n|$)/gm, "");
  t = t.replace(/^<!-- specialist\n([\s\S]*?)\n-->(\n|$)/gm, (_, inner, nl) =>
    inner.replace(/\{\{(\w+)\}\}/g, (m, k) => {
      if (k in vars) return vars[k];
      errors.push(`${where}: unknown {{${k}}} (known: ${Object.keys(vars).join(", ")})`);
      return m;
    }) + nl,
  );
  if (/<!-- \/?master-only|<!-- specialist\b/.test(t)) errors.push(`${where}: a marker is malformed; each goes on its own line (see scripts/sync.mjs)`);
  return t;
}

const git = (root, args) => {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
};

/** The master a plugin folder was generated from, or null for a hand-made plugin. */
function generatedFrom(pluginDir) {
  for (const s of subdirs(join(pluginDir, "skills"))) {
    const f = join(pluginDir, "skills", s, "SKILL.md");
    const m = existsSync(f) && readFileSync(f, "utf8").match(/<!-- Generated from ([a-z0-9-]+) /);
    if (m) return m[1];
  }
  return null;
}

const bumpPatch = (v) => v.replace(/^(\d+)\.(\d+)\.(\d+).*$/, (_, a, b, c) => `${a}.${b}.${Number(c) + 1}`);

/**
 * Plans every write, then applies them (or only reports them with check).
 * Returns { changes, errors, notes }. Nothing is written when there is an error.
 */
export function sync(root, { check = false, since, bump = true, force = false } = {}) {
  const changes = [];
  const errors = [];
  const notes = [];
  const planned = new Map(); // absolute path -> Buffer | string | null (delete)
  const rel = (p) => posix(relative(root, p));
  const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

  const marketPath = join(root, ".claude-plugin", "marketplace.json");
  const market = readJson(marketPath);
  const pluginDirs = subdirs(join(root, "plugins"));

  /** A folder's files as they will be once the planned writes land. */
  const planTree = (dir) => {
    const tree = readTree(dir);
    for (const [p, content] of planned) {
      const r = relative(dir, p);
      if (!r || r.startsWith("..") || isAbsolute(r)) continue;
      if (content === null) tree.delete(posix(r));
      else tree.set(posix(r), Buffer.isBuffer(content) ? content : Buffer.from(content));
    }
    return tree;
  };

  // 0. The sources library: the catalog and its query, copied into every consumer skill.
  const sourcesTouched = new Set();
  const catalogPath = join(root, "sources", "catalog.json");
  if (existsSync(catalogPath)) {
    let consumers = [];
    try {
      consumers = readJson(catalogPath).consumers ?? [];
    } catch (e) {
      errors.push(`sources/catalog.json: ${e.message}`);
    }
    const queryPath = join(root, "sources", "find-sources.mjs");
    if (consumers.length && !existsSync(queryPath)) errors.push("sources/find-sources.mjs is missing; consumers get it with the catalog");
    const copies = [["assets/sources.json", catalogPath], ["scripts/find-sources.mjs", queryPath]].filter(([, from]) => existsSync(from)).map(([to, from]) => [to, norm(readFileSync(from))]);
    for (const name of consumers) {
      const pluginDir = join(root, "plugins", name);
      if (!isDir(pluginDir)) {
        errors.push(`sources/catalog.json: consumer "${name}" has no plugins/${name}`);
        continue;
      }
      if (generatedFrom(pluginDir)) {
        errors.push(`sources/catalog.json: consumer "${name}" is generated; list its master, which passes the library on`);
        continue;
      }
      for (const skill of subdirs(join(pluginDir, "skills"))) {
        for (const [to, buf] of copies) {
          const p = join(pluginDir, "skills", skill, to);
          if (!existsSync(p) || !same(readFileSync(p), buf)) {
            planned.set(p, buf);
            changes.push(`plugins/${name}/skills/${skill}/${to}: from sources/`);
            sourcesTouched.add(name);
          }
        }
      }
    }
  }

  // 1. Versions
  const versions = new Map();
  for (const dir of pluginDirs) {
    const pj = join(root, "plugins", dir, ".claude-plugin", "plugin.json");
    if (existsSync(pj)) versions.set(dir, readJson(pj).version);
  }
  const base = since ?? "origin/main";
  if (bump && git(root, ["rev-parse", "--verify", "-q", `${base}^{commit}`]) === null) {
    notes.push(`versions: ${base} not found, so no version was checked`);
  } else if (bump) {
    for (const dir of pluginDirs) {
      const r = `plugins/${dir}`;
      const pjPath = join(root, r, ".claude-plugin", "plugin.json");
      if (!existsSync(pjPath) || generatedFrom(join(root, r))) continue;
      const old = git(root, ["show", `${base}:${r}/.claude-plugin/plugin.json`]);
      if (!old) continue;
      let oldVersion;
      try {
        oldVersion = JSON.parse(old).version;
      } catch {
        continue;
      }
      const changed = (git(root, ["diff", "--name-only", base, "--", r]) ?? "") + (git(root, ["ls-files", "--others", "--exclude-standard", "--", r]) ?? "");
      const pj = readJson(pjPath);
      if ((changed.trim() || sourcesTouched.has(dir)) && pj.version === oldVersion) {
        const next = bumpPatch(pj.version);
        versions.set(dir, next);
        planned.set(pjPath, JSON.stringify({ ...pj, version: next }, null, 2) + "\n");
        changes.push(`${r}: version ${pj.version} -> ${next} (its files changed since ${base})`);
      }
    }
  }

  // 1b. A skill that states its version ("This is version x.y.z of the skill") states the one in its
  // plugin.json, so a session can say which copy it loaded: an installed copy only changes on update.
  const STAMP = /This is version \d+\.\d+\.\d+ of the skill/;
  for (const dir of pluginDirs) {
    const r = `plugins/${dir}`;
    if (generatedFrom(join(root, r)) || !versions.get(dir)) continue;
    for (const skill of subdirs(join(root, r, "skills"))) {
      const md = join(root, r, "skills", skill, "SKILL.md");
      if (!existsSync(md)) continue;
      const text = readFileSync(md, "utf8");
      const want = `This is version ${versions.get(dir)} of the skill`;
      if (STAMP.test(text) && !text.includes(want)) {
        planned.set(md, text.replace(STAMP, want));
        changes.push(`${r}/skills/${skill}/SKILL.md: states version ${versions.get(dir)}`);
      }
    }
  }

  // 2. Specialists, one per module of each master
  const readmePath = join(root, "README.md");
  let readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n") : null;
  const renames = { ...(market.renames ?? {}) };
  let plugins = [...market.plugins];

  for (const masterPlugin of pluginDirs) {
    const masterRoot = join(root, "plugins", masterPlugin);
    if (generatedFrom(masterRoot)) continue;
    for (const skill of subdirs(join(masterRoot, "skills"))) {
      const dir = join(masterRoot, "skills", skill);
      const ids = subdirs(join(dir, "formats")).filter((m) => existsSync(join(dir, "formats", m, "FORMAT.md")));
      if (!ids.length) continue;

      const masterFm = splitFrontmatter(readFileSync(join(dir, "SKILL.md"), "utf8"));
      const masterPj = readJson(join(masterRoot, ".claude-plugin", "plugin.json"));
      const masterEntry = market.plugins.find((p) => p.name === masterPlugin);
      if (!masterFm || !masterEntry) {
        errors.push(`${rel(dir)}: a master needs SKILL.md frontmatter and a marketplace entry for "${masterPlugin}"`);
        continue;
      }
      const version = versions.get(masterPlugin);

      // Modules, in the order the master's SKILL.md links them, the rest alphabetically.
      const linked = [...masterFm.body.matchAll(/formats\/([a-z0-9-]+)\/FORMAT\.md/g)].map((m) => m[1]);
      const order = (id) => (linked.includes(id) ? linked.indexOf(id) : linked.length);
      const modules = ids.sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((id) => {
        const file = join(dir, "formats", id, "FORMAT.md");
        const fm = splitFrontmatter(readFileSync(file, "utf8"));
        const where = rel(file);
        if (!fm) return errors.push(`${where}: frontmatter must open on line 1`), null;
        const { name, description, summary } = fm.fields;
        if (!NAME_RE.test(name ?? "") || name.length > 64) errors.push(`${where}: name must be 1-64 lowercase letters, digits and single hyphens`);
        if (!/^use when/i.test(description ?? "")) errors.push(`${where}: description is the specialist's trigger and starts "Use when"`);
        if (!summary || /^use when/i.test(summary)) errors.push(`${where}: needs a summary: one line saying what the specialist does (catalog and README)`);
        const title = fm.body.match(/^# (.+)$/m)?.[1]?.trim();
        if (!title) errors.push(`${where}: needs a "# Title"`);
        const nearest = fm.body.match(/^Status:\s*stub\s*\(nearest:\s*([a-z0-9-]+)\)/m)?.[1] ?? null;
        return { id, name, fm, title: title ?? id, nearest, where };
      }).filter(Boolean);
      if (errors.length) continue;

      const specs = [];
      for (const mod of modules) {
        // A stub ships the module it builds on, and that one's, until a full module.
        const ship = new Set([mod.id]);
        for (let m = mod; m.nearest; ) {
          const next = modules.find((x) => x.id === m.nearest);
          if (!next) {
            errors.push(`${mod.where}: its nearest module "${m.nearest}" does not exist`);
            break;
          }
          if (ship.has(next.id)) break;
          ship.add(next.id);
          m = next;
        }
        const nearestTitle = mod.nearest ? lcfirst(modules.find((x) => x.id === mod.nearest)?.title ?? mod.nearest) : null;
        const vars = { name: mod.name, module: mod.id, kind: lcfirst(mod.title), Kind: mod.title, path: `formats/${mod.id}/FORMAT.md`, master: skill };

        const files = new Map();
        const skillRel = `skills/${mod.name}`;
        for (const [r, buf] of planTree(dir)) {
          if (r === "SKILL.md") continue;
          const inFormats = r.match(/^formats\/([^/]+)\//);
          if (r.startsWith("formats/") && !(inFormats && ship.has(inFormats[1]))) continue;
          files.set(`${skillRel}/${r}`, r.endsWith(".md") ? Buffer.from(transform(buf.toString("utf8"), vars, `${rel(dir)}/${r}`, errors)) : norm(buf));
        }
        const own = mod.fm.entries.filter((e) => e.key === "name" || e.key === "description").flatMap((e) => e.raw);
        const inherited = masterFm.entries.filter((e) => e.key !== "name" && e.key !== "description").flatMap((e) => e.raw);
        const stamp = `${GENERATED}${skill} ${version} by scripts/sync.mjs. Do not edit here: change ${skill}, then run the sync. ${FP_BLANK}`;
        files.set(`${skillRel}/SKILL.md`, Buffer.from(["---", ...own, ...inherited, "---", "", stamp, ""].join("\n") + transform(masterFm.body, vars, `${rel(dir)}/SKILL.md`, errors)));

        const otherIds = new Set(modules.map((m) => m.id));
        const keywords = [...new Set([...(masterPj.keywords ?? []).filter((k) => !otherIds.has(k)), mod.id])];
        const homepage = masterPj.homepage?.replace(new RegExp(`/${masterPlugin}$`), `/${mod.name}`);
        const description =
          mod.fm.fields.summary +
          (mod.nearest ? ` Early single-purpose specialist of ${masterPlugin}, built on its ${mod.nearest} module.` : ` Single-purpose specialist of ${masterPlugin}, which covers every format.`);
        const pj = { name: mod.name, version, description, author: masterPj.author, ...(homepage ? { homepage } : {}), ...(masterPj.license ? { license: masterPj.license } : {}), keywords };
        files.set(".claude-plugin/plugin.json", Buffer.from(JSON.stringify(pj, null, 2) + "\n"));

        const skillMd = files.get(`${skillRel}/SKILL.md`).toString("utf8").replace(FP_BLANK, `fingerprint: ${fingerprint(files)} -->`);
        files.set(`${skillRel}/SKILL.md`, Buffer.from(skillMd));

        // Compare with what is on disk; a hand edit stops the sync.
        const target = join(root, "plugins", mod.name);
        const disk = readTree(target);
        if (disk.size) {
          const from = generatedFrom(target);
          if (!from) {
            errors.push(`plugins/${mod.name}: exists and was not generated; rename the module in ${rel(dir)}/formats/${mod.id} or move that plugin away`);
            continue;
          }
          const recorded = [...disk].find(([k]) => k.endsWith("SKILL.md"))?.[1].toString("utf8").match(/fingerprint: ([0-9a-f]{12}) -->/)?.[1];
          if (!force && recorded !== fingerprint(disk)) {
            errors.push(`plugins/${mod.name}: edited by hand since it was generated. Move the change into ${rel(dir)} (its SKILL.md, formats/${mod.id}/FORMAT.md or a shared file), then run the sync; --force discards the hand edit`);
            continue;
          }
        }
        let written = 0;
        let removed = 0;
        for (const [r, buf] of files) {
          if (!disk.has(r) || !same(disk.get(r), buf)) {
            planned.set(join(target, r), buf);
            written++;
          }
        }
        for (const r of disk.keys()) {
          if (!files.has(r)) {
            planned.set(join(target, r), null);
            removed++;
          }
        }
        if (!disk.size) changes.push(`plugins/${mod.name}: new specialist of ${masterPlugin} (${files.size} files)`);
        else if (written || removed) changes.push(`plugins/${mod.name}: ${written} file(s) regenerated, ${removed} removed`);

        delete renames[mod.name];
        specs.push({ name: mod.name, kind: vars.kind, nearestTitle, summary: mod.fm.fields.summary, entry: {
          name: mod.name,
          description,
          source: `./plugins/${mod.name}`,
          author: masterEntry.author ?? market.owner,
          ...(masterEntry.category ? { category: masterEntry.category } : {}),
          keywords,
          ...(homepage ? { homepage } : {}),
          ...(pj.license ? { license: pj.license } : {}),
        } });
      }

      // A specialist whose module is gone: removed, and renamed to the master so installs keep working.
      const names = new Set(specs.map((s) => s.name));
      for (const d of pluginDirs) {
        if (names.has(d) || generatedFrom(join(root, "plugins", d)) !== skill) continue;
        const target = join(root, "plugins", d);
        const disk = readTree(target);
        const recorded = [...disk].find(([k]) => k.endsWith("SKILL.md"))?.[1].toString("utf8").match(/fingerprint: ([0-9a-f]{12}) -->/)?.[1];
        if (!force && recorded !== fingerprint(disk)) {
          errors.push(`plugins/${d}: its module left ${skill}, but it was edited by hand; move the edit into the master first, or pass --force`);
          continue;
        }
        for (const r of disk.keys()) planned.set(join(target, r), null);
        renames[d] = masterPlugin;
        changes.push(`plugins/${d}: removed (no formats/ module in ${skill} any more); installs are renamed to ${masterPlugin}`);
      }

      // Catalog: the master, then its specialists in module order.
      const familyNames = new Set([...names, ...Object.keys(renames).filter((k) => renames[k] === masterPlugin)]);
      plugins = plugins.filter((p) => !familyNames.has(p.name));
      plugins.splice(plugins.findIndex((p) => p.name === masterPlugin) + 1, 0, ...specs.map((s) => s.entry));

      // README: a diagram of the master and its specialists, then the specialists' table.
      // The master itself is presented by hand above the markers (its own card).
      if (readme !== null) {
        const open = `<!-- family:${masterPlugin} -->`;
        const close = `<!-- /family:${masterPlugin} -->`;
        const a = readme.indexOf(open);
        const b = readme.indexOf(close);
        if (a < 0 || b < a) {
          errors.push(`README.md: add the lines "${open}" and "${close}" where the ${masterPlugin} family diagram and table go`);
        } else {
          const esc = (s) => s.replace(/\|/g, "\\|");
          const install = (n) => `\`claude plugin install ${n}@${market.name}\``;
          // Each group is a small grid (rows chained by invisible links), side by side under the master.
          const full = specs.filter((s) => !s.nearestTitle);
          const early = specs.filter((s) => s.nearestTitle);
          const label = (s) => s.kind.charAt(0).toUpperCase() + s.kind.slice(1);
          let node = 0;
          let hidden = 0;
          const groups = [];
          const group = (id, title, list, cls) => {
            if (!list.length) return [];
            groups.push(id);
            const cols = Math.ceil(Math.sqrt(list.length));
            const rows = [];
            for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
            hidden += rows.reduce((n, r) => n + r.length - 1, 0);
            return [`  subgraph ${id}["${title}"]`, "    direction LR", ...rows.map((r) => `    ${r.map((s) => `s${node++}["${label(s)}"]:::${cls}`).join(" ~~~ ")}`), "  end"];
          };
          const lines = [...group("full", "Specialists", full, "spec"), ...group("early", "Early specialists, built on a full one", early, "early")];
          const block = [
            "```mermaid",
            "flowchart TB",
            `  master(["&#11088; THE MASTER<br/>${masterPlugin}<br/>every format in one skill"]):::master`,
            ...lines,
            ...groups.map((g) => `  master ==> ${g}`),
            "  classDef master fill:#6d4aff,stroke:#4a2fd1,stroke-width:3px,color:#ffffff,font-weight:bold",
            "  classDef spec fill:#ece7ff,stroke:#6d4aff,stroke-width:1.5px,color:#2b1d70",
            "  classDef early fill:#f7f5ff,stroke:#8f7bff,stroke-width:1.5px,stroke-dasharray:5 4,color:#4a3a9a",
            ...(full.length ? ["  style full fill:transparent,stroke:#6d4aff"] : []),
            ...(early.length ? ["  style early fill:transparent,stroke:#8f7bff,stroke-dasharray:5 4"] : []),
            ...(groups.length ? [`  linkStyle ${groups.map((_, i) => hidden + i).join(",")} stroke:#6d4aff,stroke-width:2.5px`] : []),
            "```",
            "",
            "| Specialist | What it does | Install |",
            "| --- | --- | --- |",
            ...specs.map((s) => `| [${s.name}](plugins/${s.name}/skills/${s.name}/SKILL.md) | ${esc(s.summary)}${s.nearestTitle ? `<br/><sub>Early: built on the ${s.nearestTitle} module until it gets its own.</sub>` : ""} | ${install(s.name)} |`),
          ].join("\n");
          readme = `${readme.slice(0, a + open.length)}\n${block}\n${readme.slice(b)}`;
        }
      }
    }
  }

  // 3. Catalog and README files
  const nextMarket = { ...market, plugins, renames };
  if (!Object.keys(renames).length) delete nextMarket.renames;
  const marketText = JSON.stringify(nextMarket, null, 2) + "\n";
  if (marketText !== readFileSync(marketPath, "utf8").replace(/\r\n/g, "\n")) {
    planned.set(marketPath, marketText);
    changes.push(".claude-plugin/marketplace.json: specialist entries and renames");
  }
  if (readme !== null && readme !== readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n")) {
    planned.set(readmePath, readme);
    changes.push("README.md: family tables");
  }

  if (errors.length || check) return { changes, errors, notes };

  const touched = new Set();
  for (const [p, content] of planned) {
    if (content === null) {
      rmSync(p, { force: true });
    } else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
    }
    touched.add(dirname(p));
  }
  // Drop folders a removal left empty.
  const prune = (d) => {
    if (!isDir(d) || !posix(d).startsWith(posix(join(root, "plugins")) + "/")) return;
    if (readdirSync(d).length === 0) {
      rmSync(d, { recursive: true });
      prune(dirname(d));
    }
  };
  for (const d of touched) prune(d);
  return { changes, errors, notes };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (k) => argv.includes(`--${k}`);
  const since = argv.find((a) => a.startsWith("--since="))?.slice(8);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const check = flag("check");
  const { changes, errors, notes } = sync(root, { check, since, bump: !flag("no-bump"), force: flag("force") });
  for (const n of notes) console.log(`note   ${n}`);
  for (const e of errors) console.log(`error  ${e}`);
  if (errors.length) {
    console.log(`\n${errors.length} error(s); nothing was written.`);
    process.exit(1);
  }
  for (const c of changes) console.log(`${check ? "stale " : "synced"} ${c}`);
  if (check && changes.length) {
    console.log(`\n${changes.length} thing(s) out of step: run node scripts/sync.mjs`);
    process.exit(1);
  }
  console.log(changes.length ? `\n${changes.length} change(s) ${check ? "pending" : "written"}.` : "\nEverything is in step.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
