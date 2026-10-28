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
			}),
		),
	}),
);

const fileContentSchema = lazy(() =>
	z.object({
		name: z.string(),
		content: z.string(),
		lastModifiedMs: z.number(),
	}),
);

const setRootRequestSchema = lazy(() => z.object({ memoryRoot: z.string() }));
const listFilesRequestSchema = lazy(() => z.object({ key: z.string() }));
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
