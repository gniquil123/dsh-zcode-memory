/**
 * Root-adoption convergence: merge the current local memory root into the
 * shared ZCode store with a zero-loss policy, before the memory root is
 * switched to the store. Nothing is ever overwritten away:
 *
 * - the whole local root is copied to a timestamped backup FIRST, and the
 *   convergence aborts when that backup fails — no backup, no merge;
 * - files only on one side stay where they are (local-only files are copied
 *   into the store, store-only files are simply kept);
 * - differing MEMORY.md indexes are line-merged (union, exact-trim dedupe) on
 *   both sides — the lossless join;
 * - differing regular files publish the newer-mtime side on both roots and
 *   preserve the losing bytes as a "<name>.conflict-<side>-<stamp>.md" side
 *   car beside them, reported for a human to resolve (or delete on purpose).
 *
 * Scope: projects/<key>/memory/*.md — the pattern every consumer reads.
 * Anything else (stray files, foreign subtrees) is left untouched everywhere.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { mergeIndexLines } from "./import.js";

const INDEX_NAME = "MEMORY.md";

/** Relative paths (forward slashes) of every projects/<key>/memory/*.md under one root. */
function listProjectFiles(root) {
	const files = new Map();
	let projects;
	try {
		projects = readdirSync(join(root, "projects"), { withFileTypes: true });
	} catch {
		return files;
	}
	for (const project of projects) {
		if (!project.isDirectory()) continue;
		const memoryDir = join(root, "projects", project.name, "memory");
		let entries;
		try {
			entries = readdirSync(memoryDir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
			files.set(project.name + "/memory/" + entry.name, join(memoryDir, entry.name));
		}
	}
	return files;
}

/** Short timestamp for conflict side-car names: safe in a filename. */
function shortStamp() {
	return new Date().toISOString().replace(/[:.]/gu, "-").slice(0, 19);
}

/**
 * Converge localRoot into remoteRoot (both physical directories).
 * Returns a report; ok:false means the pre-merge backup failed and NOTHING
 * was written anywhere.
 */
export function convergeRoots(localRoot, remoteRoot, backupBase) {
	const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
	const report = {
		backupDir: "",
		copiedToRemote: [],
		unions: [],
		conflicts: [],
		skipped: 0,
		ok: true,
	};

	// Step 0 — full local-root backup; the floor under every later step.
	report.backupDir = join(backupBase, stamp);
	try {
		mkdirSync(report.backupDir, { recursive: true });
		cpSync(localRoot, join(report.backupDir, "local-root"), { recursive: true });
	} catch (error) {
		return { ok: false, error: "pre-merge backup failed, nothing was changed: " + String(error) };
	}

	const local = listProjectFiles(localRoot);
	const remote = listProjectFiles(remoteRoot);
	const sideStamp = shortStamp();
	const allPaths = [...new Set([...local.keys(), ...remote.keys()])].sort();

	for (const rel of allPaths) {
		const localPath = local.get(rel);
		const remotePath = remote.get(rel);
		try {
			if (localPath && !remotePath) {
				// local-only memory: belongs in the shared store
				// (rel has no "projects" segment — the map keys start below it)
				mkdirSync(dirname(join(remoteRoot, "projects", rel)), { recursive: true });
				cpSync(localPath, join(remoteRoot, "projects", rel));
				report.copiedToRemote.push(rel);
				continue;
			}
			if (!localPath || !remotePath) continue; // store-only: kept as-is
			const localBytes = readFileSync(localPath);
			const remoteBytes = readFileSync(remotePath);
			if (localBytes.equals(remoteBytes)) {
				report.skipped += 1;
				continue;
			}
			const name = rel.split("/").pop();
			if (name.toLowerCase() === INDEX_NAME.toLowerCase()) {
				// indexes line-merge losslessly; both sides end up identical
				const merged = mergeIndexLines(remoteBytes.toString("utf8"), localBytes.toString("utf8"));
				writeFileSync(remotePath, merged.text, "utf8");
				writeFileSync(localPath, merged.text, "utf8");
				report.unions.push({ rel, addedLines: merged.addedLines });
				continue;
			}
			// differing content: newer mtime becomes the primary on both sides;
			// the losing bytes live on as a conflict side car next to them
			const localTime = statSync(localPath).mtimeMs;
			const remoteTime = statSync(remotePath).mtimeMs;
			const winnerIsLocal = localTime >= remoteTime;
			const winnerBytes = winnerIsLocal ? localBytes : remoteBytes;
			const loserBytes = winnerIsLocal ? remoteBytes : localBytes;
			const side = winnerIsLocal ? "remote-loses" : "local-loses";
			const sideName = name.slice(0, -3) + ".conflict-" + side + "-" + sideStamp + ".md";
			writeFileSync(join(dirname(remotePath), sideName), loserBytes);
			writeFileSync(join(dirname(localPath), sideName), loserBytes);
			writeFileSync(remotePath, winnerBytes);
			writeFileSync(localPath, winnerBytes);
			report.conflicts.push({ rel, sideCar: sideName });
		} catch (error) {
			report.conflicts.push({ rel, sideCar: "", error: String(error) });
		}
	}
	return report;
}
