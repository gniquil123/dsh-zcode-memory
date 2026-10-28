#!/usr/bin/env node
/**
 * dsh-zcode installer: link this plugin into a dsh profile and wire its peer
 * dependencies to the running dsh installation.
 *
 * The plugin imports @deepseek-ai/* packages that must resolve to the SAME
 * module instances the host runs on, so after `dsh plugin add` this script
 * creates one directory junction/symlink per dependency inside the plugin's
 * own node_modules, each pointing into the dsh installation tree.
 *
 * PATH-INDEPENDENT: only `node` and `npm` must be on PATH. The dsh CLI and
 * pnpm are located through `npm root -g` and invoked directly, with the npm
 * global bin dir prepended to the child PATH so dsh's inner pnpm call works.
 *
 * Usage:
 *   node install.mjs [--profile <name>] [--home <dsh-home>] [--dsh <dsh-install-dir>]
 *
 * Defaults: --profile web, --home $DSH_HOME or ~/.dsh, dsh dir auto-detected
 * from the global npm root.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const argOf = (flag, fallback) => {
	const at = args.indexOf(flag);
	return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const sourceDir = dirname(fileURLToPath(import.meta.url));
const profileName = argOf("--profile", "web");
const home = resolve(argOf("--home", process.env.DSH_HOME?.trim() || join(homedir(), ".dsh")));
const profileDir = join(home, "profiles", profileName);

/** Peer packages that must alias into the dsh installation tree. */
const PEERS = [
	"@deepseek-ai/cordis",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-typert-protocol",
	"@deepseek-ai/dsh-sandbox",
	"@deepseek-ai/schemastery",
	"zod",
];

function fail(message) {
	console.error(`install.mjs: ${message}`);
	process.exit(1);
}

/** Quietly read stdout of a shell command; undefined when it fails. */
function probe(command) {
	try {
		return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
	} catch {
		return undefined;
	}
}

/** Parse one semver string (prerelease supported). Returns fields or undefined. */
function parseVersion(value) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value).trim());
	if (!match) return undefined;
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre: match[4] ?? null };
}

/** Compare two parsed versions (semver precedence: numeric fields, then prerelease). */
function compareVersions(left, right) {
	for (const field of ["major", "minor", "patch"]) {
		if (left[field] !== right[field]) return left[field] - right[field];
	}
	if (left.pre === null && right.pre === null) return 0;
	if (left.pre === null) return 1;
	if (right.pre === null) return -1;
	const leftParts = left.pre.split(".");
	const rightParts = right.pre.split(".");
	for (let at = 0; at < Math.max(leftParts.length, rightParts.length); at += 1) {
		const a = leftParts[at];
		const b = rightParts[at];
		if (a === undefined) return -1;
		if (b === undefined) return 1;
		const aNumeric = /^\d+$/.test(a);
		const bNumeric = /^\d+$/.test(b);
		if (aNumeric && bNumeric) {
			const delta = Number(a) - Number(b);
			if (delta !== 0) return delta;
		} else if (aNumeric !== bNumeric) {
			return aNumeric ? -1 : 1;
		} else if (a !== b) {
			return a < b ? -1 : 1;
		}
	}
	return 0;
}

/**
 * Evaluate one space/comma-separated range of predicates (>=, <=, >, <, ^, ~,
 * or exact) against a version — the subset of semver ranges this plugin's
 * engines.dsh uses. Implemented locally so the installer stays dependency-free.
 */
function satisfiesRange(version, range) {
	const parsed = parseVersion(version);
	if (!parsed) return false;
	return String(range)
		.split(/[,\s]+/)
		.filter(Boolean)
		.every((predicate) => {
			const match = /^(>=|<=|>|<|\^|~)?\s*v?(.+)$/.exec(predicate);
			if (!match) return false;
			const op = match[1] ?? "=";
			const target = parseVersion(match[2]);
			if (!target) return false;
			const order = compareVersions(parsed, target);
			switch (op) {
				case ">=": return order >= 0;
				case "<=": return order <= 0;
				case ">": return order > 0;
				case "<": return order < 0;
				case "^": return order >= 0 && parsed.major === target.major;
				case "~": return order >= 0 && parsed.major === target.major && parsed.minor === target.minor;
				default: return order === 0;
			}
		});
}

/**
 * Locate the dsh installation's bundled node_modules and the npm global bin
 * directory (for the child PATH). Returns both, or undefined.
 */
function findDsh() {
	const candidates = [];
	const override = argOf("--dsh", "");
	if (override) {
		const root = resolve(override);
		candidates.push({ modules: join(root, "node_modules"), bin: dirname(root) });
	}
	const npmRoot = probe("npm root -g");
	if (npmRoot) {
		candidates.push({
			modules: join(npmRoot, "@deepseek-ai", "dsh", "node_modules"),
			bin: dirname(npmRoot),
		});
	}
	const pnpmRoot = probe("pnpm root -g");
	if (pnpmRoot) {
		candidates.push({
			modules: join(pnpmRoot, "@deepseek-ai", "dsh", "node_modules"),
			bin: dirname(pnpmRoot),
		});
	}
	// PATH-independent fallback: npm's default global prefix per platform.
	const fallbackPrefix =
		platform() === "win32"
			? join(process.env.APPDATA?.trim() || join(homedir(), "AppData", "Roaming"), "npm")
			: dirname(dirname(process.execPath));
	candidates.push({
		modules: join(fallbackPrefix, "node_modules", "@deepseek-ai", "dsh", "node_modules"),
		bin: fallbackPrefix,
	});
	return candidates.find(
		(candidate) =>
			existsSync(join(candidate.modules, "@deepseek-ai", "dsh-llm")) &&
			existsSync(join(dirname(candidate.modules), "lib", "bin.js")),
	);
}

if (!existsSync(join(sourceDir, "lib", "index.js"))) {
	fail(`run this script from the plugin directory (missing lib/index.js under ${sourceDir})`);
}
if (!existsSync(profileDir)) {
	fail(`profile "${profileName}" not found at ${profileDir} — boot it once with \`dsh --profile ${profileName}\` first`);
}

const dsh = findDsh();
if (!dsh) {
	fail(
		"could not locate the @deepseek-ai/dsh installation. Install dsh first (npm i -g @deepseek-ai/dsh), " +
			"or pass it explicitly:\n" +
			`  node install.mjs --dsh "C:/path/to/npm-root/node_modules/@deepseek-ai/dsh"`,
	);
}
const dshBinJs = join(dirname(dsh.modules), "lib", "bin.js");
if (!existsSync(dshBinJs)) {
	fail(`dsh entry not found at ${dshBinJs} — is @deepseek-ai/dsh fully installed?`);
}
console.log(`dsh installation: ${dsh.modules}`);

// 0. Compatibility gate: refuse to install into an unsupported dsh version.
//    engines.dsh in this plugin's package.json is the single source of truth.
const dshVersion = JSON.parse(readFileSync(join(dirname(dsh.modules), "package.json"), "utf8")).version;
const pluginManifest = JSON.parse(readFileSync(join(sourceDir, "package.json"), "utf8"));
const requiredRange = pluginManifest.engines?.dsh;
if (requiredRange && !satisfiesRange(dshVersion, requiredRange)) {
	fail(
		`this plugin requires dsh ${requiredRange} but the installed dsh is ${dshVersion}.\n` +
			`  upgrade dsh first, e.g.:  npm i -g @deepseek-ai/dsh@<compatible-version>\n` +
			`  (installation aborted — nothing was changed)`,
	);
}
console.log(`dsh version ${dshVersion} satisfies engines.dsh "${requiredRange}" — proceeding`);

// 1. Official registration: link the plugin into the profile and append it to
//    dsh.profile.bundles. Run the dsh entry with node directly (PATH-independent)
//    and prepend the npm global bin dir so dsh's inner `pnpm` spawn resolves.
const childEnv = { ...process.env };
childEnv.PATH = `${dsh.bin}${delimiter}${childEnv.PATH ?? ""}`;
console.log(`dsh plugin --profile ${profileName} add ${sourceDir}`);
try {
	execFileSync(process.execPath, [dshBinJs, "plugin", "--profile", profileName, "add", sourceDir], {
		stdio: "inherit",
		env: childEnv,
	});
} catch {
	fail(
		"`dsh plugin add` failed. pnpm is resolved from the npm global bin directory — " +
			"install it there (npm i -g pnpm), then re-run this script.",
	);
}

// 2. Alias every peer dependency to the host's own module instances.
const linkType = platform() === "win32" ? "junction" : "dir";
for (const name of PEERS) {
	const target = join(dsh.modules, name);
	if (!existsSync(target)) {
		console.warn(`skip ${name}: not present in the dsh installation`);
		continue;
	}
	const linkPath = join(sourceDir, "node_modules", name);
	rmSync(linkPath, { force: true, recursive: true });
	mkdirSync(dirname(linkPath), { recursive: true });
	symlinkSync(target, linkPath, linkType);
	console.log(`linked ${name}`);
}

console.log(`\ndone. restart the profile to activate: dsh --profile ${profileName}`);
