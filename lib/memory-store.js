/**
 * Memory root resolution, persistence, and per-project scanning for the
 * settings page and the agent memory injection.
 *
 * Root priority: patch config `memoryRoot` (non-empty) > plugin settings file
 * `<dsh-home>/dsh-zcode-memory.json` > default `<dsh-home>/memories`.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";

import { executeImport, planImport, zcodeDefaultRoot } from "./import.js";
import { projectKey, resolveProjectMemoryRoot } from "./project-key.js";

const SETTINGS_FILE = "dsh-zcode-memory.json";
/** Pre-rename settings file, migrated on first use. */
const LEGACY_SETTINGS_FILE = "dsh-zcode.json";
/** ZCode Settings viewer refuses previews above 5 MiB; keep the same contract. */
export const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;
const MAX_INDEX_CHARS = 25_000;
const MAX_INDEX_LINES = 200;

export function dshHome() {
	return process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
}

/**
 * Create the store bound to one plugin Config snapshot.
 * Config values win over the settings file so a patch override cannot be
 * silently undone from the settings page.
 */
export function createMemoryStore(config) {
	const home = dshHome();
	// One-time migration from the pre-rename settings file.
	try {
		if (!existsSync(join(home, SETTINGS_FILE)) && existsSync(join(home, LEGACY_SETTINGS_FILE))) {
			renameSync(join(home, LEGACY_SETTINGS_FILE), join(home, SETTINGS_FILE));
		}
	} catch {
		// unreadable legacy file behaves like an absent one
	}
	const settingsPath = join(home, SETTINGS_FILE);

	const readSettings = () => {
		try {
			const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
			return typeof parsed?.memoryRoot === "string" ? parsed : {};
		} catch {
			return {};
		}
	};

	const resolveRoot = () => {
		const configured = config.memoryRoot?.trim();
		if (configured) return configured;
		const stored = readSettings().memoryRoot?.trim();
		return stored || join(home, "memories");
	};

	/** Create the effective root (and its projects/ subtree); best effort. */
	const ensureRoot = () => {
		try {
			mkdirSync(join(resolveRoot(), "projects"), { recursive: true });
			return true;
		} catch {
			return false;
		}
	};

	return {
		/** Effective root plus where each layer came from. */
		status() {
			const configured = config.memoryRoot?.trim() || "";
			const stored = readSettings().memoryRoot?.trim() || "";
			const root = configured || stored || join(home, "memories");
			return {
				memoryRoot: root,
				source: configured ? "config" : stored ? "settings" : "default",
				defaultRoot: join(home, "memories"),
				dshHome: home,
				zcodeRoot: zcodeDefaultRoot(homedir()),
			};
		},

		/** Create the effective root on demand (install default, after setRoot). */
		ensureRoot() {
			return ensureRoot();
		},

		/** Persist a new root into the settings file; patch config still wins. */
		setRoot(memoryRoot) {
			const trimmed = memoryRoot?.trim() || "";
			if (trimmed && !isAbsolute(trimmed)) {
				return { ok: false, error: { code: "root/relative", message: "memoryRoot must be an absolute path" } };
			}
			try {
				const next = { ...readSettings(), memoryRoot: trimmed };
				if (trimmed === "") delete next.memoryRoot;
				mkdirSync(home, { recursive: true });
				writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
			} catch (error) {
				return { ok: false, error: { code: "root/write-failed", message: String(error) } };
			}
			return { ok: true, value: this.status() };
		},

		/** One project's memory directory, or undefined when absent. */
		projectMemoryDir(workspacePath, workspaceIdentity) {
			return resolveProjectMemoryRoot(resolveRoot(), workspacePath, workspaceIdentity);
		},

		/** Read MEMORY.md for injection; returns "" when absent or unreadable. */
		readMemoryIndex(memoryDir) {
			try {
				const raw = readFileSync(join(memoryDir, "MEMORY.md"), "utf8");
				return clampIndex(raw);
			} catch {
				return "";
			}
		},

		/** Per-project memory statistics for the settings page. */
		listProjects() {
			const root = resolveRoot();
			const projectsDir = join(root, "projects");
			const rows = [];
			let entries = [];
			try {
				entries = readdirSync(projectsDir, { withFileTypes: true });
			} catch {
				return { ok: true, value: { memoryRoot: root, projects: [] } };
			}
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const key = entry.name;
				const memoryDir = join(projectsDir, key, "memory");
				let files;
				try {
					files = readdirSync(memoryDir, { withFileTypes: true });
				} catch {
					continue; // directory without a memory/ subtree: not a memory project
				}
				let count = 0;
				let totalBytes = 0;
				let lastModifiedMs = 0;
				let indexPresent = false;
				for (const file of files) {
					if (!file.isFile() || !file.name.toLowerCase().endsWith(".md")) continue;
					let info;
					try {
						info = statSync(join(memoryDir, file.name));
					} catch {
						continue;
					}
					count += 1;
					totalBytes += info.size;
					if (info.mtimeMs > lastModifiedMs) lastModifiedMs = info.mtimeMs;
					if (file.name === "MEMORY.md") indexPresent = true;
				}
				rows.push({
					key,
					slug: key.replace(/-[0-9a-f]{16}$/u, ""),
					memoryCount: count,
					indexPresent,
					totalBytes,
					lastModifiedMs,
				});
			}
			rows.sort((left, right) => right.lastModifiedMs - left.lastModifiedMs);
			return { ok: true, value: { memoryRoot: root, projects: rows } };
		},

		/** List one project's memory files (basenames only; traversal impossible by construction). */
		listFiles(request) {
			const memoryDir = join(resolveRoot(), "projects", request.key, "memory");
			let names = [];
			try {
				names = readdirSync(memoryDir, { withFileTypes: true })
					.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
					.map((entry) => entry.name);
			} catch (error) {
				return { ok: false, error: { code: "project/not-found", message: String(error) } };
			}
			const files = [];
			for (const name of names) {
				try {
					const info = statSync(join(memoryDir, name));
					files.push({ name, sizeBytes: info.size, lastModifiedMs: Math.round(info.mtimeMs) });
				} catch {
					continue; // a file vanishing between readdir and stat must not fail the listing
				}
			}
			files.sort((left, right) => right.lastModifiedMs - left.lastModifiedMs);
			return { ok: true, value: { files } };
		},

		/**
		 * Search one project's memory files by name AND content (case-insensitive
		 * substring). Content matches carry up to three context snippets per file.
		 */
		searchFiles(request) {
			const query = String(request.query ?? "").trim();
			const listed = this.listFiles({ key: request.key });
			if (listed.ok !== true || query === "") return listed;
			const needle = query.toLowerCase();
			const memoryDir = join(resolveRoot(), "projects", request.key, "memory");
			const files = [];
			for (const file of listed.value.files) {
				const path = join(memoryDir, file.name);
				let content;
				try {
					if (statSync(path).size <= MAX_PREVIEW_BYTES) content = readFileSync(path, "utf8");
				} catch {
					content = undefined;
				}
				const nameHit = file.name.toLowerCase().includes(needle);
				const snippets = content ? contentSnippets(content, needle) : [];
				if (nameHit || snippets.length > 0) {
					files.push({ ...file, matchCount: snippets.length, firstSnippet: snippets[0] ?? "", nameMatch: nameHit });
				}
			}
			return { ok: true, value: { files, query } };
		},

		/**
		 * ZCode import step 1: scan the source root and diff against the target
		 * root without writing anything.
		 */
		importZcodeScan(request) {
			const sourceRoot = String(request?.sourceRoot ?? "").trim() || zcodeDefaultRoot(homedir());
			if (!isAbsolute(sourceRoot)) {
				return { ok: false, error: { code: "import/relative", message: "sourceRoot must be an absolute path" } };
			}
			try {
				const planned = planImport(sourceRoot, resolveRoot());
				if (planned.ok !== true) {
					// A missing/unreadable source behaves like an empty one: the UI
					// shows "nothing to import" instead of a raw ENOENT.
					if (planned.error?.code === "projects/not-found") {
						return { ok: true, value: emptyPlan(sourceRoot, resolveRoot(), homedir()) };
					}
					return planned;
				}
				return { ok: true, value: { ...planned.value, zcodeRoot: zcodeDefaultRoot(homedir()) } };
			} catch (error) {
				return { ok: false, error: { code: "import/scan-failed", message: String(error) } };
			}
		},

		/**
		 * ZCode import step 2: execute after user confirmation. Backs up every
		 * modified index, merges MEMORY.md by line union, copies new content
		 * verbatim, and reports ZCode-only references as suggestions.
		 */
		importZcodeExecute(request) {
			const sourceRoot = String(request?.sourceRoot ?? "").trim() || zcodeDefaultRoot(homedir());
			if (!isAbsolute(sourceRoot)) {
				return { ok: false, error: { code: "import/relative", message: "sourceRoot must be an absolute path" } };
			}
			const backupBase = join(home, "dsh-zcode-memory", "import-backup");
			try {
				const executed = executeImport(sourceRoot, resolveRoot(), backupBase);
				if (executed.ok !== true && executed.error?.code === "projects/not-found") {
					return { ok: false, error: { code: "import/nothing-to-import", message: `no importable ZCode projects under ${sourceRoot}` } };
				}
				return executed;
			} catch (error) {
				return { ok: false, error: { code: "import/execute-failed", message: String(error) } };
			}
		},

		/** Read one memory file preview with the ZCode 5 MiB viewer cap. */
		readFile(request) {
			if (!request.name.match(/^[^\\/]+\.md$/u) || request.name.includes("..")) {
				return { ok: false, error: { code: "file/invalid-name", message: `invalid file name ${JSON.stringify(request.name)}` } };
			}
			const path = join(resolveRoot(), "projects", request.key, "memory", request.name);
			let info;
			try {
				info = statSync(path);
			} catch {
				return { ok: false, error: { code: "file/not-found", message: `${request.key}/${request.name} not found` } };
			}
			if (info.size > MAX_PREVIEW_BYTES) {
				return {
					ok: false,
					error: {
						code: "file/too-large",
						message: `preview cap is ${MAX_PREVIEW_BYTES} bytes; file is ${info.size}`,
					},
				};
			}
			try {
				return { ok: true, value: { name: request.name, content: readFileSync(path, "utf8"), lastModifiedMs: Math.round(info.mtimeMs) } };
			} catch (error) {
				return { ok: false, error: { code: "file/read-failed", message: String(error) } };
			}
		},

		/** Fresh project key for a workspace path (diagnostics display). */
		projectKeyFor(workspacePath, workspaceIdentity) {
			return projectKey(workspacePath, workspaceIdentity);
		},
	};
}

/** Empty import plan for an absent/empty source; keeps the client contract stable. */
function emptyPlan(sourceRoot, targetRoot, homeDir) {
	return {
		sourceRoot,
		targetRoot,
		zcodeRoot: zcodeDefaultRoot(homeDir),
		projects: [],
		totals: { projects: 0, copyProjects: 0, copyFiles: 0, mergeIndexes: 0, skipFiles: 0, conflicts: 0 },
	};
}

/** Up to three ~90-char context windows around content matches. */
function contentSnippets(content, needle) {
	const snippets = [];
	const lower = content.toLowerCase();
	let at = lower.indexOf(needle);
	while (at !== -1 && snippets.length < 3) {
		const start = Math.max(0, at - 40);
		const end = Math.min(content.length, at + needle.length + 50);
		const snippet = `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\s+/gu, " ").trim()}${end < content.length ? "…" : ""}`;
		if (!snippets.includes(snippet)) snippets.push(snippet);
		at = lower.indexOf(needle, at + Math.max(needle.length, 1));
	}
	return snippets;
}

/** ZCode index clamp: trim, cap at 200 lines / 25,000 chars with a warning line. */
function clampIndex(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return "";
	const lines = trimmed.split("\n");
	let text = trimmed;
	if (lines.length > MAX_INDEX_LINES) text = lines.slice(0, MAX_INDEX_LINES).join("\n");
	if (text.length > MAX_INDEX_CHARS) text = text.slice(0, MAX_INDEX_CHARS);
	if (text !== trimmed) text += "\n\n> WARNING: MEMORY.md is truncated; keep index entries to one line per memory.";
	return text;
}

/** Basename of a workspace path for display. */
export function workspaceTitle(workspacePath) {
	return basename(workspacePath) || workspacePath;
}
