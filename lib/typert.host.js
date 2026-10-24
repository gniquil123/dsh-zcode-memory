/**
 * Host-face Typert contract for the dsh-zcode gateway.
 *
 * Hand-written in the exact shape the dsh-typert generator emits
 * (`dsh-typert-loader` auto-registers any mounted package's `./typert`
 * export), so the profile boots without a codegen toolchain.
 *
 * Result schemas validate the service methods' BARE return values; thrown
 * RemoteErrors travel as the wire's error envelope and never reach them.
 */
import { z } from "zod";

const statusResult = z.object({
	memoryRoot: z.string(),
	source: z.enum(["config", "settings", "default"]),
	defaultRoot: z.string(),
	dshHome: z.string(),
});

const projectsResult = z.object({
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
});

const filesResult = z.object({
	files: z.array(
		z.object({
			name: z.string(),
			sizeBytes: z.number(),
			lastModifiedMs: z.number(),
		}),
	),
});

const fileContentResult = z.object({
	name: z.string(),
	content: z.string(),
	lastModifiedMs: z.number(),
});

/** One strict invocation descriptor for the gateway. */
function invocation(method, parameters, result) {
	return {
		id: `dsh-zcode#zcodeMemory/${method}`,
		service: "zcodeMemory",
		namespace: "zcodeMemory",
		method,
		invocation: { kind: "direct" },
		parameters,
		result: { mode: "strict", typeSymbol: `dsh-zcode/types#${method}`, schema: result },
	};
}

function jsonParam(name, schema) {
	return {
		name,
		wire: name,
		source: "json",
		codec: { mode: "strict", typeSymbol: `dsh-zcode/types#${name}`, schema },
	};
}

export const TYPERT = {
	package: "dsh-zcode",
	face: "host",
	schemas: [],
	invocations: [
		invocation("status", [], statusResult),
		invocation("listProjects", [], projectsResult),
		invocation("setRoot", [jsonParam("request", z.object({ memoryRoot: z.string() }))], statusResult),
		invocation("listFiles", [jsonParam("request", z.object({ key: z.string() }))], filesResult),
		invocation("readFile", [jsonParam("request", z.object({ key: z.string(), name: z.string() }))], fileContentResult),
	],
	model: { services: [], events: [], objects: [] },
};
