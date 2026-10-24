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
 * Usage:
 *   node install.mjs [--profile <name>] [--home <dsh-home>] [--dsh <dsh-install-dir>]
 *
 * Defaults: --profile web, --home $DSH_HOME or ~/.dsh, dsh dir auto-detected
 * from the global npm/pnpm root.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
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

/** Locate the dsh installation's bundled node_modules. */
function findDshNodeModules() {
	const candidates = [];
	const override = argOf("--dsh", "");
	if (override) candidates.push(resolve(override, "node_modules"));
	for (const cmd of ["npm root -g", "pnpm root -g"]) {
		try {
			candidates.push(join(execSync(cmd, { encoding: "utf8" }).trim(), "@deepseek-ai", "dsh", "node_modules"));
		} catch {
			// tool absent; try the next candidate
		}
	}
	return candidates.find((candidate) => existsSync(join(candidate, "@deepseek-ai", "dsh-llm")));
}

if (!existsSync(join(sourceDir, "lib", "index.js"))) {
	fail(`run this script from the plugin directory (missing lib/index.js under ${sourceDir})`);
}
if (!existsSync(profileDir)) {
	fail(`profile "${profileName}" not found at ${profileDir} — boot it once with \`dsh --profile ${profileName}\` first`);
}

const dshNodeModules = findDshNodeModules();
if (!dshNodeModules) {
	fail(
		"could not locate the @deepseek-ai/dsh installation; pass it explicitly:\n" +
			`  node install.mjs --dsh "C:/path/to/npm-root/node_modules/@deepseek-ai/dsh"`,
	);
}
console.log(`dsh installation: ${dshNodeModules}`);

// 1. Official registration: link the plugin into the profile and append it to
//    dsh.profile.bundles (the dsh CLI owns both; it shells out to pnpm).
console.log(`dsh plugin --profile ${profileName} add ${sourceDir}`);
try {
	execSync(`dsh plugin --profile ${profileName} add "${sourceDir}"`, { stdio: "inherit" });
} catch {
	fail(
		"`dsh plugin add` failed. Check that `dsh` and `pnpm` are on PATH (npm i -g pnpm), " +
			"then re-run this script.",
	);
}

// 2. Alias every peer dependency to the host's own module instances.
const linkType = platform() === "win32" ? "junction" : "dir";
for (const name of PEERS) {
	const target = join(dshNodeModules, name);
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
