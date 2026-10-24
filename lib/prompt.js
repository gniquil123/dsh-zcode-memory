/**
 * The model-facing persistent-memory prompt.
 *
 * Adapted from ZCode's provider-visible memory prompts
 * (`context/sections/memory.ts` + `subagent/persistent-memory-prompt.ts`, MIT)
 * into one user-role context block suitable for a single-channel host.
 */

/**
 * Build the full memory context text for one session.
 * @param memoryDir - the project's `memory/` directory (per-workspace).
 * @param indexContent - clamped MEMORY.md content, "" when empty.
 * @returns the injected user-role text; undefined when memory is disabled.
 */
export function buildMemoryContext(memoryDir, indexContent) {
	const root = memoryDir.endsWith("/") || memoryDir.endsWith("\\") ? memoryDir : `${memoryDir}/`;
	const index = indexContent.trim()
		? indexContent
		: "Your MEMORY.md is currently empty. When you save new memories, they will appear here.";
	return [
		"# Persistent Project Memory",
		"",
		`You have a persistent, file-based memory system at \`${root}\`. This directory already exists — write to it directly with the Write tool (do not run mkdir or check for its existence). It is scoped to this project and persists across conversations.`,
		"",
		"You should build up this memory system over time so that future conversations can have a complete picture of who the user is, how they'd like to collaborate with you, what behaviors to avoid or repeat, and the context behind the work the user gives you.",
		"",
		"If the user explicitly asks you to remember something, save it immediately as whichever type fits best. If they ask you to forget something, find and remove the relevant entry.",
		"",
		"## Types of memory",
		"",
		"- `user` — who the user is (role, expertise, responsibilities, preferences). Avoid negative judgements; tailor future behavior to their perspective.",
		"- `feedback` — guidance the user has given on how you should work, both corrections and confirmed approaches; include the why. Record from failure AND success: if you only save corrections, you drift away from approaches the user has already validated.",
		"- `project` — ongoing work, goals, constraints, or decisions not derivable from the code or git history; convert relative dates to absolute (e.g. \"Thursday\" → \"2026-03-05\").",
		"- `reference` — pointers to external resources (URLs, dashboards, tickets, where things are tracked).",
		"",
		"## What NOT to save",
		"",
		"- Code patterns, conventions, architecture, file paths, or project structure — derivable by reading the current project state.",
		"- Git history, recent changes, or who-changed-what — `git log` / `git blame` are authoritative.",
		"- Debugging solutions or fix recipes — the fix is in the code; the commit message has the context.",
		"- Anything already documented in AGENTS.md files.",
		"- Ephemeral task details: in-progress work, temporary state, current conversation context.",
		"",
		"These exclusions apply even when the user explicitly asks you to save. If asked to save a PR list or activity summary, ask what was *surprising* or *non-obvious* — that is the part worth keeping.",
		"",
		"## How to save a memory",
		"",
		"**Step 1** — write the memory to its own file at the top level of the memory directory (e.g. `user_role.md`, `feedback_testing.md`) with this frontmatter:",
		"",
		"```markdown",
		"---",
		"name: <short-kebab-case-slug>",
		"description: <one-line summary — used to decide relevance during recall>",
		"metadata:",
		"  type: user | feedback | project | reference",
		"---",
		"",
		"<the fact; for feedback/project, follow with **Why:** and **How to apply:** lines. Link related memories with [[their-name]].>",
		"```",
		"",
		"In the body, link to related memories with `[[name]]`, where `name` is the other memory's `name:` slug. Link liberally — a `[[name]]` that doesn't match an existing memory yet is fine; it marks something worth writing later, not an error.",
		"",
		"**Step 2** — add a one-line pointer in `MEMORY.md` (`- [Title](file.md) — hook`). `MEMORY.md` is the index loaded into context each session — one line per memory, no frontmatter, never put memory content there. Keep entries one line under ~150 characters; lines after 200 will be truncated.",
		"",
		"- Before saving, check for an existing file that already covers it — update that file rather than creating a duplicate; delete memories that turn out to be wrong.",
		"- Organize memory semantically by topic, not chronologically; keep name/description/type fields up to date.",
		"",
		"## When to access memories",
		"",
		"- When memories seem relevant, or the user references prior-conversation work.",
		"- You MUST access memory when the user explicitly asks you to check, recall, or remember.",
		"- If the user says to *ignore* or *not use* memory: do not apply remembered facts, cite, compare against, or mention memory content.",
		"",
		"## Before recommending from memory",
		"",
		"A memory that names a file, function, or flag is a claim that it existed *when the memory was written*. Verify against current state before asserting it as fact — check the file exists, grep for the symbol. \"The memory says X exists\" is not the same as \"X exists now.\" If a recalled memory conflicts with current information, trust what you observe now — and update or remove the stale memory rather than acting on it.",
		"",
		"## Memory and other forms of persistence",
		"",
		"- Use a Plan instead of memory to align with the user on a non-trivial implementation approach in the current conversation.",
		"- Use tasks instead of memory to track steps within the current conversation. Memory is reserved for what will be useful in future conversations.",
		"",
		"## MEMORY.md",
		"",
		index,
	].join("\n");
}

/**
 * Fingerprint of one memory context, used to skip unchanged re-injections.
 * @returns `${memoryDir}\n${indexContent}` — cheap string identity.
 */
export function memoryFingerprint(memoryDir, indexContent) {
	return `${memoryDir}\n${indexContent}`;
}
