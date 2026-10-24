/**
 * ZCode-compatible project memory key computation.
 *
 * Ported 1:1 from ZCode `apps/zcode-cli/packages/core/src/memory/project-root.ts`
 * (MIT) so a ZCode `memories/projects/` tree can be copied into this plugin's
 * memory root and resolve to the same per-project directories:
 *
 *   <memoryRoot>/projects/<slug>-<sha256-16>/memory/<facts>.md
 *
 * keySource = workspaceIdentity?.trim() || resolve(workspacePath)
 *           — lowercased before hashing on Windows, exactly like ZCode.
 */
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";

/**
 * Resolve the per-project memory directory for a workspace.
 * @param rootDir - plugin memory root (configurable; ZCode calls this cliStorageRoot).
 * @param workspacePath - absolute session working directory.
 * @param workspaceIdentity - optional opaque identity overriding the path key.
 * @returns the project's `memory/` directory path.
 */
export function resolveProjectMemoryRoot(rootDir, workspacePath, workspaceIdentity) {
	const key = projectKey(workspacePath, workspaceIdentity);
	return join(rootDir, "projects", key, "memory");
}

/**
 * Compute the ZCode project directory key: `<slug>-<hash16>`.
 * @param workspacePath - absolute session working directory.
 * @param workspaceIdentity - optional opaque identity; uses the neutral `project` slug.
 */
export function projectKey(workspacePath, workspaceIdentity) {
	const identity = workspaceIdentity?.trim();
	const normalized = resolve(workspacePath);
	const keySource =
		identity ?? (process.platform === "win32" ? normalized.toLowerCase() : normalized);
	const hash = createHash("sha256").update(keySource).digest("hex").slice(0, 16);
	const slug = identity
		? "project"
		: sanitizeProjectSlug(basename(normalized) || "project");
	return `${slug}-${hash}`;
}

/** ZCode sanitizeProjectSlug: lowercase, collapse to [a-z0-9._-], trim `-`, cap 48 chars. */
function sanitizeProjectSlug(value) {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);
	return slug.length > 0 ? slug : "project";
}
