/**
 * Host-face Typert contract for the dsh-zcode-memory gateway.
 *
 * Hand-written in the exact shape the dsh-typert generator emits for
 * dsh >=0.2.1-rc.3 (`createTypertRemoteInfo` + lazy `create()` zod factories;
 * `dsh-typert-loader` auto-registers any mounted package's `./typert` export),
 * so the profile boots without a codegen toolchain.
 *
 * Result schemas validate the service methods' BARE return values; thrown
 * Errors travel as the wire's error envelope and never reach them.
 */
import { z } from "zod";
import { createTypertRemoteInfo } from "@deepseek-ai/dsh-typert-protocol/remote-info";

/** Lazy schema factory, mirroring the generator's single-init pattern. */
function lazy(build) {
	let value;
	return () => (value ??= build());
}

const statusSchema = lazy(() =>
	z.object({
		memoryRoot: z.string(),
		source: z.enum(["config", "settings", "default"]),
		defaultRoot: z.string(),
		dshHome: z.string(),
		zcodeRoot: z.string(),
	}),
);

const projectsSchema = lazy(() =>
	z.object({
		memoryRoot: z.string(),
		projects: z.array(
			z.object({
				key: z.string(),
				slug: z.string(),
				memoryCount: z.number(),
				indexPresent: z.boolean(),
				totalBytes: z.number(),
				lastModifiedMs: z.number(),
			}),
		),
	}),
);

const filesSchema = lazy(() =>
	z.object({
		files: z.array(
			z.object({
				name: z.string(),
				sizeBytes: z.number(),
				lastModifiedMs: z.number(),
				matchCount: z.number().optional(),
				firstSnippet: z.string().optional(),
				nameMatch: z.boolean().optional(),
			}),
		),
		query: z.string().optional(),
	}),
);

const fileContentSchema = lazy(() =>
	z.object({
		name: z.string(),
		content: z.string(),
		lastModifiedMs: z.number(),
	}),
);

const importScanRequestSchema = lazy(() => z.object({ sourceRoot: z.string().optional() }));

const importPlanFileSchema = lazy(() =>
	z.object({
		name: z.string(),
		action: z.enum(["copy", "merge", "skip-identical", "conflict"]),
		sizeBytes: z.number(),
	}),
);

const importPlanProjectSchema = lazy(() =>
	z.object({
		key: z.string(),
		sourceDir: z.string(),
		targetDir: z.string(),
		exists: z.boolean(),
		files: z.array(importPlanFileSchema()),
		copyCount: z.number(),
		mergeCount: z.number(),
		skipCount: z.number(),
		conflictCount: z.number(),
	}),
);

const importScanResultSchema = lazy(() =>
	z.object({
		sourceRoot: z.string(),
		targetRoot: z.string(),
		zcodeRoot: z.string(),
		projects: z.array(importPlanProjectSchema()),
		totals: z.object({
			projects: z.number(),
			copyProjects: z.number(),
			copyFiles: z.number(),
			mergeIndexes: z.number(),
			skipFiles: z.number(),
			conflicts: z.number(),
		}),
	}),
);

const importExecuteRequestSchema = lazy(() => z.object({ sourceRoot: z.string().optional() }));

const importExecuteResultSchema = lazy(() =>
	z.object({
		sourceRoot: z.string(),
		targetRoot: z.string(),
		copiedProjects: z.array(z.string()),
		copiedFiles: z.number(),
		mergedIndexes: z.array(z.object({ key: z.string(), addedLines: z.number() })),
		skippedFiles: z.number(),
		conflicts: z.array(z.object({ key: z.string(), name: z.string() })),
		warnings: z.array(
			z.object({
				key: z.string(),
				name: z.string(),
				line: z.number(),
				snippet: z.string(),
				kind: z.string(),
				suggestion: z.string(),
			}),
		),
		backupsDir: z.string(),
		errors: z.array(z.string()),
	}),
);

const setRootRequestSchema = lazy(() => z.object({ memoryRoot: z.string() }));
const listFilesRequestSchema = lazy(() => z.object({ key: z.string() }));
const searchFilesRequestSchema = lazy(() => z.object({ key: z.string(), query: z.string() }));
const readFileRequestSchema = lazy(() => z.object({ key: z.string(), name: z.string() }));

/** One strict parameter descriptor. */
function jsonParam(name, description, create) {
	return {
		name,
		description,
		source: "json",
		codec: {
			mode: "strict",
			typeSymbol: `dsh-zcode-memory/types#${name}`,
			create,
		},
	};
}

const $remote = createTypertRemoteInfo({
	package: "dsh-zcode-memory",
	methods: {
		"zcodeMemory/status": {
			service: "zcodeMemory",
			description: "Effective memory root and where its value comes from.",
			invocation: { kind: "direct" },
			parameters: [],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryStatus",
				create: statusSchema,
				description: "the effective memory root status.",
			},
		},
		"zcodeMemory/listProjects": {
			service: "zcodeMemory",
			description: "Per-project memory statistics under the memory root.",
			invocation: { kind: "direct" },
			parameters: [],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryProjects",
				create: projectsSchema,
				description: "the project list with memory counts.",
			},
		},
		"zcodeMemory/setRoot": {
			service: "zcodeMemory",
			description: "Persist a new memory root into the plugin settings file.",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "the new memory root.", setRootRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryStatus",
				create: statusSchema,
				description: "the refreshed status after the change.",
			},
		},
		"zcodeMemory/listFiles": {
			service: "zcodeMemory",
			description: "List one project's memory files.",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "the project directory key.", listFilesRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryFiles",
				create: filesSchema,
				description: "the project's memory files.",
			},
		},
		"zcodeMemory/searchFiles": {
			service: "zcodeMemory",
			description: "Search one project's memory files by file name AND document content.",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "the project key and the query substring.", searchFilesRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryFiles",
				create: filesSchema,
				description: "matching files with optional content snippets.",
			},
		},
		"zcodeMemory/importZcodeScan": {
			service: "zcodeMemory",
			description: "Scan the ZCode memory root and diff it against the target root without writing.",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "optional source root override; defaults to the ZCode memory root.", importScanRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#ZcodeImportScan",
				create: importScanResultSchema,
				description: "the per-project import plan (copy/merge/skip/conflict).",
			},
		},
		"zcodeMemory/importZcodeExecute": {
			service: "zcodeMemory",
			description: "Execute the ZCode memory import: copy new content, merge MEMORY.md indexes by line union, back up modified files, and report ZCode-only references.",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "optional source root override; defaults to the ZCode memory root.", importExecuteRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#ZcodeImportReport",
				create: importExecuteResultSchema,
				description: "the import report with counts, conflicts, and compatibility suggestions.",
			},
		},
		"zcodeMemory/readFile": {
			service: "zcodeMemory",
			description: "Read one memory file preview (5 MiB cap, like ZCode).",
			invocation: { kind: "direct" },
			parameters: [
				jsonParam("request", "the project key and file name.", readFileRequestSchema),
			],
			result: {
				mode: "strict",
				typeSymbol: "dsh-zcode-memory/types#MemoryFileContent",
				create: fileContentSchema,
				description: "the file preview.",
			},
		},
	},
});

export const TYPERT = {
	package: "dsh-zcode-memory",
	face: "host",
	schemas: [],
	get invocations() {
		return $remote.descriptors;
	},
	model: { services: [], events: [], objects: [] },
};
