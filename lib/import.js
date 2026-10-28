/**
 * ZCode → dsh memory import: plan, execute, index merge, compatibility scan.
 *
 * Pure path/file functions with no plugin dependencies so they can be exercised
 * standalone. Every exported function catches its own I/O failures and reports
 * them in the returned value — import must degrade to a report, never throw.
 *
 * Strategy (minimal-change):
 * - project directory absent in the target → copy the whole `<key>/memory` tree;
 * - specific memory files → copy only when absent in the target (identical
 *   same-name files are skipped, differing ones are reported as conflicts);
 * - MEMORY.md of a project present on BOTH sides → deterministic line merge
 *   (target lines first, source-only lines appended, exact-trim dedupe) — the
 *   minimal-change merge; no model call, no reordering, no rewording;
 * - every file the import overwrites or merges is backed up first under
 *   `<dsh-home>/dsh-zcode-memory/import-backup/<timestamp>/`.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** ZCode's default memory root (`~/.zcode/cli/memories`). */
export function zcodeDefaultRoot(homeDir) {
	return join(homeDir, ".zcode", "cli", "memories");
}

const INDEX_NAME = "MEMORY.md";
/** Safety caps: one bad project must not turn the import into a hang. */
const MAX_PROJECTS = 500;
const MAX_FILES_PER_PROJECT = 500;
const MAX_READ_BYTES = 5 * 1024 * 1024;
const MAX_CONFLICTS = 100;
const MAX_WARNINGS = 100;

/**
 * List one root's `<key>/memory/*.md` projects.
 * @returns `{ ok, value: { projects: [{key, dir, files: [{name, sizeBytes}]}] } }` or `{ ok: false, error }`.
 */
export function listMemoryProjects(root) {
	const projectsDir = join(root, "projects");
	let entries;
	try {
		entries = readdirSync(projectsDir, { withFileTypes: true });
	} catch (error) {
		return { ok: false, error: { code: "projects/not-found", message: String(error) } };
	}
	const projects = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || projects.length >= MAX_PROJECTS) continue;
		const dir = join(projectsDir, entry.name, "memory");
		let names;
		try {
			names = readdirSync(dir, { withFileTypes: true })
				.filter((file) => file.isFile() && file.name.toLowerCase().endsWith(".md"))
				.map((file) => file.name)
				.slice(0, MAX_FILES_PER_PROJECT);
		} catch {
			continue; // directory without a memory/ subtree: not a memory project
		}
		const files = [];
		for (const name of names) {
			try {
				const info = statSync(join(dir, name));
				files.push({ name, sizeBytes: info.size });
			} catch {
				continue;
			}
		}
		if (files.length > 0) projects.push({ key: entry.name, dir, files });
	}
	return { ok: true, value: { projects } };
}

/**
 * Diff one source project against the target project directory.
 * Actions: `copy` (whole project), or per file `copy` / `merge` / `skip-identical` / `conflict`.
 */
function planProject(source, targetRoot) {
	const targetDir = join(targetRoot, "projects", source.key, "memory");
	let targetNames = null;
	try {
		targetNames = new Set(
			readdirSync(targetDir, { withFileTypes: true })
				.filter((entry) => entry.isFile())
				.map((entry) => entry.name),
		);
	} catch {
		targetNames = null; // target project absent → whole-directory copy
	}
	if (targetNames === null) {
		return {
			key: source.key,
			sourceDir: source.dir,
			targetDir,
			exists: false,
			files: source.files.map((file) => ({ name: file.name, action: "copy", sizeBytes: file.sizeBytes })),
			copyCount: source.files.length,
			mergeCount: 0,
			skipCount: 0,
			conflictCount: 0,
		};
	}
	const files = [];
	let copyCount = 0;
	let mergeCount = 0;
	let skipCount = 0;
	let conflictCount = 0;
	for (const file of source.files) {
		if (!targetNames.has(file.name)) {
			files.push({ name: file.name, action: "copy", sizeBytes: file.sizeBytes });
			copyCount += 1;
			continue;
		}
		if (file.name.toLowerCase() === INDEX_NAME.toLowerCase()) {
			files.push({ name: file.name, action: "merge", sizeBytes: file.sizeBytes });
			mergeCount += 1;
			continue;
		}
		const verdict = sameFile(join(source.dir, file.name), join(targetDir, file.name));
		if (verdict === true) {
			files.push({ name: file.name, action: "skip-identical", sizeBytes: file.sizeBytes });
			skipCount += 1;
		} else if (verdict === false) {
			files.push({ name: file.name, action: "conflict", sizeBytes: file.sizeBytes });
			conflictCount += 1;
		} else {
			// unreadable on either side: leave untouched, surface as conflict
			files.push({ name: file.name, action: "conflict", sizeBytes: file.sizeBytes });
			conflictCount += 1;
		}
	}
	return { key: source.key, sourceDir: source.dir, targetDir, exists: true, files, copyCount, mergeCount, skipCount, conflictCount };
}

/** `true`/`false` when both files are readable (equal/unequal), `undefined` when either read fails. */
function sameFile(leftPath, rightPath) {
	try {
		const left = readFileSync(leftPath);
		const right = readFileSync(rightPath);
		return left.equals(right);
	} catch {
		return undefined;
	}
}

/**
 * Build the full import plan without writing anything.
 * @returns `{ ok, value: plan }` or `{ ok: false, error }`.
 */
export function planImport(sourceRoot, targetRoot) {
	const source = listMemoryProjects(sourceRoot);
	if (!source.ok) return source;
	const projects = source.value.projects.map((project) => planProject(project, targetRoot));
	const totals = {
		projects: projects.length,
		copyProjects: projects.filter((project) => !project.exists && project.copyCount > 0).length,
		// files copied into EXISTING projects only: whole-project copies are
		// already counted as copyProjects (their file count lives on the project)
		copyFiles: projects.reduce((sum, project) => sum + (project.exists ? project.copyCount : 0), 0),
		mergeIndexes: projects.reduce((sum, project) => sum + project.mergeCount, 0),
		skipFiles: projects.reduce((sum, project) => sum + project.skipCount, 0),
		conflicts: projects.reduce((sum, project) => sum + project.conflictCount, 0),
	};
	return { ok: true, value: { sourceRoot, targetRoot, projects, totals } };
}

/**
 * Deterministic MEMORY.md merge: target lines first, then source-only lines
 * (exact-trim dedupe, case-sensitive). Never reorders or rewords existing lines.
 * @returns `{ text, addedLines }`.
 */
export function mergeIndexLines(targetText, sourceText) {
	const targetLines = String(targetText ?? "").split(/\r?\n/);
	const seen = new Set();
	for (const line of targetLines) {
		const trimmed = line.trim();
		if (trimmed) seen.add(trimmed);
	}
	const out = [...targetLines];
	let addedLines = 0;
	for (const line of String(sourceText ?? "").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		out.push(line);
		addedLines += 1;
	}
	let text = out.join("\n");
	if (text.length > 0 && !text.endsWith("\n")) text += "\n";
	return { text, addedLines };
}

/**
 * ZCode-specific references that will not work under dsh, with fix suggestions.
 * Advisory only — the report lets the user decide; nothing is rewritten.
 */
const COMPAT_PATTERNS = [
	{
		kind: "zcode-memories-path",
		pattern: /\.zcode[\/\\]cli[\/\\]memories/iu,
		suggestion: "ZCode 记忆目录引用：改为本插件记忆根目录（设置页可查看），或删除该路径说明。",
	},
	{
		kind: "zcode-home-path",
		pattern: /[~]?[\/\\]?\.zcode\b(?![\/\\]cli[\/\\]memories)/iu,
		suggestion: "ZCode 主目录引用（skills/plugins/配置等）：dsh 对应目录是 ~/.dsh，请核对后改写或删除。",
	},
	{
		kind: "zcode-cli",
		pattern: /\bzcode\s+(run|exec|mcp|plugin|skill|web|desktop)\b/iu,
		suggestion: "zcode CLI 调用：dsh 的命令不同（dsh --profile …），请核对后改写或删除。",
	},
];

/**
 * Scan one markdown text for ZCode-only references.
 * @returns `[{line, snippet, kind, suggestion}]`, capped.
 */
export function scanCompatibility(text, cap = MAX_WARNINGS) {
	const warnings = [];
	const lines = String(text ?? "").split(/\r?\n/);
	for (let at = 0; at < lines.length && warnings.length < cap; at += 1) {
		const line = lines[at];
		for (const rule of COMPAT_PATTERNS) {
			if (!rule.pattern.test(line)) continue;
			warnings.push({
				line: at + 1,
				snippet: line.trim().slice(0, 160),
				kind: rule.kind,
				suggestion: rule.suggestion,
			});
			break; // one warning per line: the first matching rule wins
		}
	}
	return warnings;
}

/**
 * Execute an import plan: copies, index merges, backups, compatibility report.
 * Re-plans from the current disk state first (the scan the user confirmed may be stale).
 * @returns a full `{ ok, value: report }` envelope; never throws.
 */
export function executeImport(sourceRoot, targetRoot, backupBase) {
	const planResult = planImport(sourceRoot, targetRoot);
	if (!planResult.ok) return planResult;
	const plan = planResult.value;

	const report = {
		sourceRoot,
		targetRoot,
		copiedProjects: [],
		copiedFiles: 0,
		mergedIndexes: [],
		skippedFiles: 0,
		conflicts: [],
		warnings: [],
		backupsDir: "",
		errors: [],
	};
	const touched = plan.totals.copyFiles + plan.totals.mergeIndexes;
	if (touched === 0 && plan.totals.conflicts === 0) {
		report.skippedFiles = plan.totals.skipFiles;
		return { ok: true, value: report };
	}

	// Backup only files this run will modify (merged indexes); whole-project
	// copies go to a fresh target and cannot destroy anything.
	const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
	const backupsDir = join(backupBase, stamp);
	report.backupsDir = backupsDir;

	for (const project of plan.projects) {
		if (!project.exists && project.copyCount > 0) {
			try {
				mkdirSync(join(targetRoot, "projects"), { recursive: true });
				cpSync(project.sourceDir, project.targetDir, { recursive: true });
				report.copiedProjects.push(project.key);
				report.copiedFiles += project.copyCount;
			} catch (error) {
				report.errors.push(`${project.key}: copy failed: ${String(error)}`);
			}
			continue;
		}
		for (const file of project.files) {
			const sourcePath = join(project.sourceDir, file.name);
			const targetPath = join(project.targetDir, file.name);
			try {
				if (file.action === "copy") {
					mkdirSync(project.targetDir, { recursive: true });
					cpSync(sourcePath, targetPath);
					report.copiedFiles += 1;
				} else if (file.action === "merge") {
					const sourceText = readTextCapped(sourcePath);
					const targetText = readTextCapped(targetPath);
					if (sourceText === undefined || targetText === undefined) {
						report.errors.push(`${project.key}/${file.name}: unreadable, index not merged`);
						continue;
					}
					backupFile(backupsDir, project.key, file.name, targetPath);
					const merged = mergeIndexLines(targetText, sourceText);
					writeFileSync(targetPath, merged.text, "utf8");
					report.mergedIndexes.push({ key: project.key, addedLines: merged.addedLines });
					report.warnings.push(
						...scanCompatibility(merged.text)
							.slice(0, MAX_WARNINGS)
							.map((warning) => ({ key: project.key, name: file.name, ...warning })),
					);
				} else if (file.action === "skip-identical") {
					report.skippedFiles += 1;
				} else if (file.action === "conflict") {
					if (report.conflicts.length < MAX_CONFLICTS) {
						report.conflicts.push({ key: project.key, name: file.name });
					}
				}
			} catch (error) {
				report.errors.push(`${project.key}/${file.name}: ${String(error)}`);
			}
			if (report.warnings.length >= MAX_WARNINGS) break;
		}
		if (report.warnings.length >= MAX_WARNINGS) break;
	}
	// Newly copied projects also get the compatibility scan (report-only).
	if (report.warnings.length < MAX_WARNINGS) {
		for (const key of report.copiedProjects) {
			const project = plan.projects.find((row) => row.key === key);
			if (!project) continue;
			for (const file of project.files) {
				const text = readTextCapped(join(project.targetDir, file.name));
				if (text === undefined) continue;
				report.warnings.push(
					...scanCompatibility(text)
						.map((warning) => ({ key: project.key, name: file.name, ...warning })),
				);
				if (report.warnings.length >= MAX_WARNINGS) break;
			}
			if (report.warnings.length >= MAX_WARNINGS) break;
		}
	}
	return { ok: true, value: report };
}

/** Read a UTF-8 file with the preview cap; undefined when unreadable or too large. */
function readTextCapped(path) {
	try {
		if (statSync(path).size > MAX_READ_BYTES) return undefined;
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** Copy one file into the per-run backup directory; failures are silent (best effort). */
function backupFile(backupsDir, key, name, sourcePath) {
	try {
		const target = join(backupsDir, key, name);
		mkdirSync(dirname(target), { recursive: true });
		cpSync(sourcePath, target);
	} catch {
		// best effort: a failed backup must not abort the import
	}
}

/** Remove one backup directory (used when the user undoes nothing and cleans up). */
export function removeBackups(backupsDir) {
	try {
		rmSync(backupsDir, { recursive: true, force: true });
		return true;
	} catch {
		return false;
	}
}
