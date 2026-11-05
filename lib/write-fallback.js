/**
 * Raw-fs fallback for memory-root writes on filesystems that reject the local
 * backend's fd-chmod staging. HGFS (VMware shared folders — the physical store
 * behind the ZCode memory symlink) fails the backend's staging chmod with
 * "ENOENT ... fchmod" even though plain writes, chmod-by-path, and rename all
 * work; these helpers mirror dsh-fs-local's writeText/editText semantics —
 * mkdir -p, temp-file publication, CRLF preservation, and the exact
 * "dev:ino:size:mtimeNs:ctimeNs" version template — minus every chmod call.
 *
 * The backend's per-key lock is not replicated: memory files are written by one
 * agent turn at a time and publication stays atomic via rename-over, which is
 * the guarantee concurrent writers actually need.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/** The error signature of the backend's fd chmod failing on a chmod-less filesystem. */
export function isFchmodGap(error) {
	return String(error?.message ?? error).includes("fchmod");
}

/** Same opaque version template as the local backend's versionOf (bigint stat). */
export function versionOf(absolutePath) {
	const info = statSync(absolutePath, { bigint: true });
	return [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(":");
}

function normalizeLineEndings(content) {
	return content.replaceAll("\r\n", "\n");
}

/** Publish content at absolutePath: temp file + rename-over, no chmod. Falls
 * back to a direct write when the rename-over itself is refused (untested
 * territory on exotic shares) — publication stays best-atomic, never lost. */
function publishFile(absolutePath, content) {
	mkdirSync(dirname(absolutePath), { recursive: true });
	const tempPath = absolutePath + "." + randomUUID() + ".tmp";
	try {
		writeFileSync(tempPath, content, "utf8");
		try {
			renameSync(tempPath, absolutePath);
		} catch {
			writeFileSync(absolutePath, content, "utf8");
		}
	} finally {
		try {
			rmSync(tempPath, { force: true });
		} catch {
			// temp already gone with the rename; nothing to clean
		}
	}
}

/** Mirror of the backend's writeText core (guards already passed upstream). */
export function writeTextFallback(targetKey, content) {
	const existed = (() => {
		try {
			return statSync(targetKey).isFile();
		} catch {
			return false;
		}
	})();
	publishFile(targetKey, content);
	return {
		operation: existed ? "update" : "create",
		version: versionOf(targetKey),
		before: null,
		after: normalizeLineEndings(content),
	};
}

/** Literal oldString to newString replacement with the backend's uniqueness rule. */
function applyLiteralEdit(content, edit) {
	const { oldString, newString, replaceAll } = edit ?? {};
	if (typeof oldString !== "string" || oldString === "") throw new Error("edit requires a non-empty oldString");
	if (typeof newString !== "string") throw new Error("edit requires a string newString");
	const occurrences = content.split(oldString).length - 1;
	if (occurrences === 0) throw new Error("oldString not found in file");
	if (occurrences > 1 && replaceAll !== true) {
		throw new Error("oldString matches " + occurrences + " locations; replaceAll or a longer unique string required");
	}
	return replaceAll === true ? content.split(oldString).join(newString) : content.replace(oldString, newString);
}

/** Mirror of the backend's editText core: read, literal edit, CRLF restore, publish. */
export function editTextFallback(targetKey, edit) {
	const raw = readFileSync(targetKey, "utf8");
	const hadCrlf = raw.includes("\r\n");
	const normalized = normalizeLineEndings(raw);
	const edited = applyLiteralEdit(normalized, edit);
	publishFile(targetKey, hadCrlf ? edited.replaceAll("\n", "\r\n") : edited);
	return {
		version: versionOf(targetKey),
		before: normalized,
		after: edited,
	};
}
