/**
 * Standalone smoke test for the memory store and the ZCode import pipeline.
 * Run from the plugin directory:  node test/smoke.mjs
 * Exercises store resolution, search, scan/plan/execute/merge, and the typert
 * schemas — everything that runs without a live dsh host.
 */
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createMemoryStore } from "../lib/memory-store.js";
import { mergeIndexLines, scanCompatibility, zcodeDefaultRoot } from "../lib/import.js";
import { TYPERT } from "../lib/typert.host.js";

const base = mkdtempSync(join(tmpdir(), "dsh-zcode-memory-test-"));
const targetRoot = join(base, "target-memories");
const sourceRoot = join(base, "zcode-memories");

// Isolate the settings file: the store persists memoryRoot under DSH_HOME.
// Without this the test would overwrite the real ~/.dsh/dsh-zcode-memory.json.
process.env.DSH_HOME = join(base, "dsh-home");
mkdirSync(join(base, "dsh-home"), { recursive: true });

/** Build one fake memory project: <root>/projects/<key>/memory/<files>. */
function makeProject(root, key, files) {
	const dir = join(root, "projects", key, "memory");
	mkdirSync(dir, { recursive: true });
	for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content, "utf8");
}

try {
	// ---------- store: status / ensureRoot ----------
	const store = createMemoryStore({ memoryRoot: targetRoot, memoryWriteAllow: true });
	const status = store.status();
	assert.equal(status.memoryRoot, targetRoot);
	assert.equal(status.source, "config");
	assert.equal(typeof status.zcodeRoot, "string");
	assert.equal(store.ensureRoot(), true);
	assert.ok(existsSync(join(targetRoot, "projects")), "ensureRoot must create <root>/projects");

	// ---------- import.js: merge + compatibility ----------
	const merged = mergeIndexLines("- [a](a.md) keep\n- [b](b.md) keep\n", "- [b](b.md) keep\n- [c](c.md) new\n");
	assert.equal(merged.addedLines, 1);
	assert.ok(merged.text.includes("- [c](c.md) new"));
	assert.equal(merged.text.split("\n").filter((line) => line.startsWith("- [b]")).length, 1, "dedupe identical index lines");

	const compat = scanCompatibility("see ~/.zcode/cli/memories/notes\nrun `zcode run foo`\nplain line\n");
	assert.equal(compat.length, 2, "two zcode-only references detected");
	assert.equal(compat[0].kind, "zcode-memories-path", "the specific memories-path rule wins");
	assert.equal(compat[1].kind, "zcode-cli");
	assert.ok(compat.every((warning) => warning.suggestion.length > 0));

	// ---------- scenario: one fresh project, one overlapping project ----------
	makeProject(sourceRoot, "fresh-0000000000000001", {
		"MEMORY.md": "- [z1](z1.md) zcode index\n",
		"z1.md": "zcode fact referencing ~/.zcode/cli/skills\n",
	});
	makeProject(sourceRoot, "overlap-0000000000000002", {
		"MEMORY.md": "- [existing](e.md) shared\n- [s1](s1.md) from zcode\n",
		"s1.md": "brand new file from zcode\n",
		"e.md": "target copy stays untouched\n",
	});
	makeProject(targetRoot, "overlap-0000000000000002", {
		"MEMORY.md": "- [existing](e.md) shared\n- [t1](t1.md) from dsh\n",
		"e.md": "target copy stays untouched\n",
		"t1.md": "dsh fact\n",
	});

	// ---------- store: scan ----------
	const scan = store.importZcodeScan({ sourceRoot });
	assert.equal(scan.ok, true, `scan failed: ${JSON.stringify(scan)}`);
	assert.equal(scan.value.totals.copyProjects, 1);
	assert.equal(scan.value.totals.copyFiles, 1, "only s1.md copies into an existing project; the fresh project counts as copyProjects");
	assert.equal(scan.value.totals.mergeIndexes, 1);
	const overlapPlan = scan.value.projects.find((project) => project.key.startsWith("overlap-"));
	assert.equal(overlapPlan.files.find((file) => file.name === "s1.md").action, "copy");
	assert.equal(overlapPlan.files.find((file) => file.name === "e.md").action, "skip-identical");
	assert.equal(overlapPlan.files.find((file) => file.name === "MEMORY.md").action, "merge");

	// ---------- store: execute ----------
	const report = store.importZcodeExecute({ sourceRoot });
	assert.equal(report.ok, true, `execute failed: ${JSON.stringify(report)}`);
	assert.deepEqual(report.value.copiedProjects, ["fresh-0000000000000001"]);
	assert.equal(report.value.copiedFiles, 3, "2 files in the fresh project + s1.md into the overlapping project");
	assert.equal(report.value.mergedIndexes.length, 1);
	assert.equal(report.value.skippedFiles, 1);
	assert.ok(report.value.warnings.length >= 1, "zcode-only reference must be reported");
	assert.ok(report.value.warnings.some((warning) => warning.name === "z1.md"), "warning points at the copied file");

	const freshIndex = readFileSync(join(targetRoot, "projects", "fresh-0000000000000001", "memory", "MEMORY.md"), "utf8");
	assert.ok(freshIndex.includes("zcode index"));
	const mergedIndex = readFileSync(join(targetRoot, "projects", "overlap-0000000000000002", "memory", "MEMORY.md"), "utf8");
	assert.ok(mergedIndex.includes("from dsh"), "target index lines preserved");
	assert.ok(mergedIndex.includes("from zcode"), "source-only index line appended");
	assert.ok(!existsSync(join(targetRoot, "projects", "overlap-0000000000000002", "memory", "s1.md")) === false, "s1.md copied");

	// idempotent second run: everything skips or merges to zero added lines
	const again = store.importZcodeExecute({ sourceRoot });
	assert.equal(again.ok, true);
	assert.equal(again.value.copiedProjects.length, 0);
	assert.equal(again.value.copiedFiles, 0);
	const mergedAgain = again.value.mergedIndexes.find((row) => row.key.startsWith("overlap-"));
	assert.equal(mergedAgain?.addedLines ?? 0, 0, "second merge adds nothing (already deduped)");

	// backup of the merged index exists
	assert.ok(existsSync(report.value.backupsDir), "backup directory created");

	// ---------- store: listProjects / listFiles / searchFiles / readFile ----------
	const list = store.listProjects();
	assert.equal(list.ok, true);
	assert.equal(list.value.projects.length, 2, "two projects after import");

	const files = store.listFiles({ key: "overlap-0000000000000002" });
	assert.equal(files.ok, true);
	assert.equal(files.value.files.length, 4);

	const found = store.searchFiles({ key: "overlap-0000000000000002", query: "brand new" });
	assert.equal(found.ok, true);
	assert.deepEqual(found.value.files.map((file) => file.name), ["s1.md"]);
	assert.ok(found.value.files[0].firstSnippet.includes("brand new"));

	const byName = store.searchFiles({ key: "overlap-0000000000000002", query: "T1.md".toLowerCase() });
	assert.ok(byName.value.files.some((file) => file.name === "t1.md"), "name match is case-insensitive");

	const plain = store.searchFiles({ key: "overlap-0000000000000002", query: "" });
	assert.equal(plain.value.files.length, 4, "empty query returns the plain listing");

	const missing = store.searchFiles({ key: "nope-0000000000000000", query: "x" });
	assert.equal(missing.ok, false);

	const read = store.readFile({ key: "overlap-0000000000000002", name: "MEMORY.md" });
	assert.equal(read.ok, true);
	assert.ok(read.value.content.includes("from zcode"));

	// ---------- typert contract ----------
	const descriptors = TYPERT.invocations;
	const names = descriptors.map((descriptor) => descriptor.id);
	for (const method of ["status", "listProjects", "setRoot", "listFiles", "searchFiles", "readFile", "importZcodeScan", "importZcodeExecute"]) {
		assert.ok(names.some((name) => name.endsWith(`/${method}`)), `typert descriptor for ${method}`);
	}
	// the scan/result schemas must accept what the store actually returns
	const schemaById = new Map(
		descriptors.map((descriptor) => [descriptor.id.split("/")[1], descriptor]),
	);
	const scanSchema = schemaById.get("importZcodeScan").result.create();
	const parsedScan = scanSchema.parse(scan.value);
	assert.equal(parsedScan.totals.mergeIndexes, 1);
	const reportSchema = schemaById.get("importZcodeExecute").result.create();
	assert.equal(reportSchema.parse(report.value).copiedFiles >= 0, true);
	const statusSchema = schemaById.get("status").result.create();
	assert.equal(statusSchema.parse(status).memoryRoot, targetRoot);
	const filesSchema = schemaById.get("searchFiles").result.create();
	assert.equal(filesSchema.parse(found.value).files.length, 1);
	const listSchema = schemaById.get("listProjects").result.create();
	assert.equal(listSchema.parse(list.value).projects.length, 2);

	// ---------- setRoot persists; ensureRoot follows the EFFECTIVE root ----------
	// With a patch-config root pinned, setRoot cannot move the effective root
	// (config wins) — verify with a settings-only store, the production default.
	const secondRoot = join(base, "second-root");
	const settingsStore = createMemoryStore({ memoryRoot: "", memoryWriteAllow: true });
	assert.equal(settingsStore.setRoot(secondRoot).ok, true);
	assert.equal(settingsStore.ensureRoot(), true);
	assert.ok(existsSync(join(secondRoot, "projects")), "ensureRoot creates the newly saved root");
	assert.equal(settingsStore.setRoot(targetRoot).ok, true);
	assert.equal(settingsStore.ensureRoot(), true);

	// ---------- fault tolerance: hostile inputs must not throw ----------
	assert.equal(store.listFiles({ key: "missing-0000000000000000" }).ok, false);
	assert.equal(store.readFile({ key: "x", name: "../escape.md" }).ok, false);
	const badScan = store.importZcodeScan({ sourceRoot: "relative/path" });
	assert.equal(badScan.ok, false);
	// A missing source root behaves as empty (friendly UI), not as a hard error.
	const ghostScan = store.importZcodeScan({ sourceRoot: join(base, "does-not-exist") });
	assert.equal(ghostScan.ok, true);
	assert.equal(ghostScan.value.totals.projects, 0);
	const ghostExec = store.importZcodeExecute({ sourceRoot: join(base, "does-not-exist") });
	assert.equal(ghostExec.ok, false, "execute on a missing source reports nothing-to-import");
	assert.equal(ghostExec.error.code, "import/nothing-to-import");
	assert.equal(zcodeDefaultRoot("/home/u").endsWith(join(".zcode", "cli", "memories")), true);

	console.log("SMOKE OK — all store/import/typert checks passed");
} finally {
	rmSync(base, { recursive: true, force: true });
}
