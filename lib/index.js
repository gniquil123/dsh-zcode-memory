/**
 * dsh-zcode host plugin.
 *
 * Brings ZCode's project memory to DeepSeek Harness:
 * - per-project memory directories with ZCode-compatible `<slug>-<sha256-16>`
 *   keys (copy a ZCode `memories/projects/` tree into the configured root and
 *   every project resolves to the same directories);
 * - a per-session user-role context that teaches the agent the memory
 *   protocol and carries the project's MEMORY.md index;
 * - sandbox auto-allow for writes inside the memory root (ZCode's memory
 *   permission, ported to dsh's per-call sandbox policy);
 * - a Typert Remote gateway backing the web settings page.
 */
import { canonicalPath } from "@deepseek-ai/dsh-sandbox";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { sep } from "node:path";
import z from "@deepseek-ai/schemastery";

import { createMemoryGateway } from "./gateway.js";
import { createMemoryStore } from "./memory-store.js";
import { buildMemoryContext } from "./prompt.js";

export const name = "dsh-zcode";

/** The fs service is wrapped for the memory-root write allowance. */
export const inject = ["fs"];

export const Config = z.object({
	enabled: z.boolean().default(true),
	/** Absolute memory root; empty resolves to `<dsh-home>/memories`. */
	memoryRoot: z.string().default(""),
	/** Widen the sandbox policy to danger-full-access for writes inside the memory root only. */
	memoryWriteAllow: z.boolean().default(true),
});

/**
 * @param ctx - host Cordis context.
 * @param config - validated Config.
 */
export function apply(ctx, config) {
	const store = createMemoryStore(config);

	if (config.enabled) {
		ctx.plugin(createMemoryGateway(store));
		installMemoryInjection(ctx, store);
	}
	if (config.enabled && config.memoryWriteAllow) {
		installMemoryWriteAllow(ctx, store);
	}
}

/**
 * Auto-allow writes inside the memory root — ZCode's memory file permission
 * (`memory.file.markdown`) ported to dsh's per-call sandbox policy.
 *
 * The fs fence (`dsh-fs-sandbox`) judges each write against the policy the
 * tool layer passes in; wrapping the service widens ONLY the calls whose
 * resolved target key (the local backend's realpath) sits inside the memory
 * root. Workspace writes keep the session's standing mode; bash stays fenced.
 */
function installMemoryWriteAllow(ctx, store) {
	const fs = ctx.fs;
	if (!fs || typeof fs.writeText !== "function") return;

	const isMemoryTarget = (target) => {
		try {
			const key = canonicalPath(String(target?.targetKey ?? ""));
			const root = canonicalPath(store.status().memoryRoot);
			const strip = process.platform === "win32" ? (value) => value.toLowerCase() : (value) => value;
			const scoped = strip(key);
			const base = strip(root);
			return scoped === base || scoped.startsWith(base.endsWith(sep) ? base : base + sep);
		} catch {
			return false;
		}
	};

	for (const method of ["writeText", "editText"]) {
		if (typeof fs[method] !== "function") continue;
		const original = fs[method];
		fs[method] = function (target, a, b, signal, policy) {
			const effective = isMemoryTarget(target)
				? { ...(policy ?? {}), mode: "danger-full-access" }
				: policy;
			return original.call(this, target, a, b, signal, effective);
		};
	}
}

/**
 * Inject one user-role memory context per agent session, once.
 *
 * Mirrors ZCode's read path: the `# Memory` protocol text plus the project's
 * MEMORY.md index read at SESSION INIT only. Mid-session re-injection is
 * deliberately NOT done — when the model writes MEMORY.md during a turn, a
 * refreshed snapshot would wake the agent loop into a spurious extra
 * response. A new session picks up the fresh index naturally.
 * Subagent-origin sessions are excluded, like ZCode's task-type gate.
 */
function installMemoryInjection(ctx, store) {
	/** @type {WeakMap<object, true>} agents that already received the context */
	const injected = new WeakMap();

	const isMemoryMessage = (message) => message.source?.kind === "plugin" && message.source?.plugin === name;

	ctx.on("agent/pre-step", async ({ agent }, next) => {
		try {
			reconcile(agent);
		} catch {
			// memory must never break a turn: unreadable roots inject nothing
		}
		return next();
	});

	function reconcile(agent) {
		if (injected.has(agent)) {
			// Already delivered: keep the inbox clean of stray copies.
			for (const message of agent.inbox.nextStep) {
				if (isMemoryMessage(message)) agent.inbox.remove(message.id);
			}
			return;
		}

		const session = agent.session;
		const cwd = session?.header?.cwd;
		if (!cwd || session.header.origin === "subagent") return;

		const memoryDir = store.projectMemoryDir(cwd);
		const index = store.readMemoryIndex(memoryDir);
		const text = buildMemoryContext(memoryDir, index);

		for (const message of agent.inbox.nextStep) {
			if (isMemoryMessage(message)) agent.inbox.remove(message.id);
		}
		agent.inbox.prepend(
			"next-step",
			createUserMessage({
				content: [{ type: "text", text }],
				source: { kind: "plugin", plugin: name },
			}),
		);
		injected.set(agent, true);
	}
}
