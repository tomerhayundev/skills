// node --test scripts/names.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findNames, hashName, loadHashes, scanPath, HASH_FILE } from "./names.mjs";

// Invented names only: a test never names a real company.
const blocked = new Set([hashName("Qworbly Crates"), hashName("Zentrovax")]);

test("a name is caught however it is written", () => {
  for (const text of ["Made by Qworbly Crates.", "qworbly-crates", "QworblyCrates", "see qworblycrates.com", "QWORBLY  CRATES", "zentrovax", "Zentro-vax"]) {
    assert.equal(findNames(text, blocked).length, 1, text);
  }
});

test("its parts and ordinary words are not", () => {
  for (const text of ["Qworbly alone", "crates of apples", "a zentro drive", "nothing here"]) {
    assert.deepEqual(findNames(text, blocked), [], text);
  }
});

test("findings give the place, never the name", () => {
  const [hit] = findNames("line one\nwe used Zentrovax here", blocked);
  assert.deepEqual(hit, { line: 2, column: 9 });
});

test("the repo stores hashes only, and a scan walks its text files", () => {
  const root = mkdtempSync(join(tmpdir(), "names-"));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "plugins/x"), { recursive: true });
  writeFileSync(join(root, HASH_FILE), `# comment\n${hashName("Zentrovax")}\n`);
  writeFileSync(join(root, "plugins/x/SKILL.md"), "A brand like Zentrovax.\n");
  writeFileSync(join(root, "plugins/x/clean.md"), "A storage-tote brand.\n");
  writeFileSync(join(root, "plugins/x/track.mp3"), "Zentrovax"); // not a text file
  const hashes = loadHashes(root);
  assert.equal(hashes.size, 1);
  assert.doesNotMatch(readFileSync(join(root, HASH_FILE), "utf8"), /zentrovax/i);
  assert.deepEqual(scanPath(root, hashes), [{ file: "plugins/x/SKILL.md", line: 1, column: 14 }]);
});
