window.__ModuleLoader__.load({
	id: "dsh-zcode-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let client_runtime = require("@deepseek-ai/dsh-client-runtime/client");
		const { useState, useCallback, useEffect, Fragment } = react;
		// createElement 后端：children 既可放 props.children 也可走第三个参数，
		// 与 jsx-runtime（第三参数是 key）不同——手写调用必须用它。
		const j = (type, props, child) => react.createElement(type, props, child);
		const js = (type, props, ...children) => react.createElement(type, props, ...children);

		//#region locale dictionaries
		const NS = "dshZcode";
		/** Chinese dictionary (default UI language for this plugin's user). */
		const zh = {
			"nav": "ZCode 记忆",
			"section.hint": "与 ZCode 项目记忆目录完全兼容：把 ZCode 的 memories/projects 目录整体拷贝到根目录即可直接复用。",
			"root.label": "记忆根目录",
			"root.source": "来源",
			"root.source.config": "配置覆盖（cordis.patch.yml）",
			"root.source.settings": "设置文件",
			"root.source.default": "默认",
			"root.save": "保存",
			"root.saved": "已保存",
			"root.invalid": "必须是绝对路径",
			"refresh": "刷新",
			"projects.title": "项目",
			"projects.count": "{count} 个记忆文件",
			"projects.index": "含索引",
			"projects.empty": "还没有任何项目记忆。",
			"projects.updated": "更新于 {time}",
			"files.title": "记忆文件",
			"files.back": "返回项目列表",
			"review": "审查",
			"review.close": "收起",
			"review.empty": "没有捕获到内容差异。",
			"open": "打开",
			"changes.title": "修改的文件",
			"changes.more": "还有 {count} 个文件",
			"changes.new": "新文件",
			"error": "加载失败",
			"error.remote": "记忆服务未就绪，请稍后刷新。",
		};
		/** English dictionary (same key set). */
		const en = {
			"nav": "ZCode Memory",
			"section.hint": "Fully compatible with ZCode project memory directories: copy ZCode's memories/projects tree into the root to reuse it as-is.",
			"root.label": "Memory root",
			"root.source": "Source",
			"root.source.config": "patch config (cordis.patch.yml)",
			"root.source.settings": "settings file",
			"root.source.default": "default",
			"root.save": "Save",
			"root.saved": "Saved",
			"root.invalid": "must be an absolute path",
			"refresh": "Refresh",
			"projects.title": "Projects",
			"projects.count": "{count} memories",
			"projects.index": "indexed",
			"projects.empty": "No project memories yet.",
			"projects.updated": "updated {time}",
			"files.title": "Memory files",
			"files.back": "Back to projects",
			"review": "Review",
			"review.close": "Collapse",
			"review.empty": "No content diff was captured.",
			"open": "Open",
			"changes.title": "Changed files",
			"changes.more": "+ {count} more files",
			"changes.new": "new file",
			"error": "Failed to load",
			"error.remote": "Memory service is not ready yet; refresh in a moment.",
		};
		//#endregion

		//#region remote contribution
		/** Client-side schema stand-in: the Host gateway already validates with real zod. */
		const permissive = { parse: (value) => value };
		const codec = (typeSymbol) => ({ mode: "strict", typeSymbol, schema: permissive });

		/** Client half of the gateway contract; mounted into ctx.remote on apply. */
		const CONTRIBUTION = {
			package: "dsh-zcode-memory",
			descriptors: [
				{ id: "dsh-zcode-memory#zcodeMemory/status", service: "zcodeMemory", namespace: "zcodeMemory", method: "status", invocation: { kind: "direct" }, parameters: [], result: codec("status") },
				{ id: "dsh-zcode-memory#zcodeMemory/listProjects", service: "zcodeMemory", namespace: "zcodeMemory", method: "listProjects", invocation: { kind: "direct" }, parameters: [], result: codec("listProjects") },
				{ id: "dsh-zcode-memory#zcodeMemory/setRoot", service: "zcodeMemory", namespace: "zcodeMemory", method: "setRoot", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("setRoot") }], result: codec("setRoot") },
				{ id: "dsh-zcode-memory#zcodeMemory/listFiles", service: "zcodeMemory", namespace: "zcodeMemory", method: "listFiles", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("listFiles") }], result: codec("listFiles") },
				{ id: "dsh-zcode-memory#zcodeMemory/readFile", service: "zcodeMemory", namespace: "zcodeMemory", method: "readFile", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("readFile") }], result: codec("readFile") },
			],
		};
		//#endregion

		//#region turn changed-files accumulator
		/**
		 * Per-turn mutation accumulator in the shape of the official deliverables
		 * plugin: recognizes mutations by render intent (diff cards, or generic
		 * cards whose kind is `edit`), keeps first-seen path order, and carries the
		 * captured FileDiff hunks so the tail can offer a review view.
		 */
		const changesDefinition = {
			kind: "zcodeChanges",
			match: (event) => {
				if (event.type === "turn/start") return { id: String(event.data.turn), role: "start" };
				if (event.type === "tool/call") return { id: String(event.data.turn), role: "update" };
				if (event.type === "tool/result" && client_runtime.isAppendSurfaceEvent(event)) {
					return { id: String(event.data.turn), role: "update" };
				}
				return null;
			},
			start: (_context, match) => {
				if (match.event.type !== "turn/start") throw new Error("zcodeChanges start requires turn/start");
				return { turn: match.event.data.turn, calls: new Map(), files: [] };
			},
			update: (context, match) => {
				if (match.event.type === "tool/call") {
					const calls = new Map(context.state.calls);
					calls.set(String(match.event.data.callId), match.view?.for === "call" ? match.view.view : null);
					return { ...context.state, calls };
				}
				if (match.event.type !== "tool/result") return context.state;
				const content = match.event.data.message.content;
				if (Array.isArray(content) && content[0]?.isError === true) return context.state;
				const callId = String(match.event.data.message.source.callId);
				const callView = context.state.calls.get(callId) ?? null;
				const resultView = match.view?.for === "result" ? match.view.view : null;
				const additions = hunksFromViews(callView, resultView);
				if (additions.length === 0) return context.state;
				return { ...context.state, files: mergeHunks(context.state.files, additions) };
			},
			buildLocationData: (context, scope) =>
				scope !== "turn" || context.state === undefined
					? null
					: { kind: "turn", turn: context.state.turn, key: "zcodeChanges", value: { files: context.state.files } },
		};

		/** Extract {path, hunk} entries from any view shape that reports mutations. */
		function hunksFromViews(...views) {
			const out = [];
			for (const view of views) {
				if (view === null || typeof view !== "object") continue;
				if (view.card === "diff" && Array.isArray(view.diffs)) {
					for (const diff of view.diffs) {
						if (typeof diff?.path === "string") out.push({ path: diff.path, hunk: { oldText: diff.oldText ?? null, newText: diff.newText ?? "" } });
					}
					continue;
				}
				if (view.card === "generic" && view.kind === "edit" && Array.isArray(view.locations)) {
					for (const location of view.locations) {
						if (typeof location?.path === "string") out.push({ path: location.path, hunk: null });
					}
				}
			}
			return out;
		}

		/** Merge hunk entries into the first-seen path list. */
		function mergeHunks(files, additions) {
			const next = [...files];
			for (const addition of additions) {
				const at = next.findIndex((file) => file.path === addition.path);
				if (at === -1) {
					next.push({ path: addition.path, hunks: addition.hunk === null ? [] : [addition.hunk] });
					continue;
				}
				const file = next[at];
				const hunks = addition.hunk === null ? file.hunks : [...file.hunks, addition.hunk];
				next[at] = { path: file.path, hunks };
			}
			return next;
		}

		/** Turn-tail match: only claim the tail when the turn changed files. */
		function selectChanges(owner) {
			const data = owner.turn.data.get("zcodeChanges");
			if (data === undefined || data.files.length === 0) return null;
			return data.files;
		}
		//#endregion

		//#region line diff (hunk rendering)
		/** LCS line diff over one hunk; hunks are small so quadratic DP is fine. */
		function diffRows(oldText, newText) {
			const left = (oldText ?? "").split("\n");
			const right = (newText ?? "").split("\n");
			const rows = [];
			if (oldText === null) {
				for (const text of right) rows.push({ kind: "add", text });
				return rows;
			}
			const width = left.length;
			const height = right.length;
			// lcs[y][x] = LCS length of left[x..] and right[y..]
			const lcs = Array.from({ length: height + 1 }, () => new Uint32Array(width + 1));
			for (let y = height - 1; y >= 0; y--) {
				for (let x = width - 1; x >= 0; x--) {
					lcs[y][x] = left[x] === right[y] ? lcs[y + 1][x + 1] + 1 : Math.max(lcs[y + 1][x], lcs[y][x + 1]);
				}
			}
			let x = 0;
			let y = 0;
			while (x < width && y < height) {
				if (left[x] === right[y]) {
					rows.push({ kind: "same", text: left[x] });
					x++;
					y++;
				} else if (lcs[y + 1][x] >= lcs[y][x + 1]) {
					rows.push({ kind: "del", text: left[x] });
					x++;
				} else {
					rows.push({ kind: "add", text: right[y] });
					y++;
				}
			}
			while (x < width) rows.push({ kind: "del", text: left[x++] });
			while (y < height) rows.push({ kind: "add", text: right[y++] });
			return rows;
		}
		//#endregion

		//#region changed-files turn tail
		const SHOWN_LIMIT = 5;

		/** Diff view for one file entry. */
		function DiffPanel({ file, t }) {
			if (file.hunks.length === 0) {
				return j("div", { style: { padding: "8px 12px", color: "#8a8f98", fontSize: 12 } }, t("review.empty"));
			}
			return js("div", {
				style: { margin: "6px 0", overflowX: "auto", background: "#0d1117", borderRadius: 6, padding: "6px 0", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: "18px" },
				children: file.hunks.map((hunk, index) => {
					const rows = diffRows(hunk.oldText, hunk.newText);
					return js(Fragment, {
						children: [
							j("div", { key: `h${index}`, style: { color: "#8a8f98", padding: "0 12px" } }, `@@ hunk ${index + 1} @@`),
							...rows.map((row, at) =>
								j(
									"div",
									{
										key: `${index}-${at}`,
										style: {
											padding: "0 12px",
											whiteSpace: "pre",
											background: row.kind === "add" ? "rgba(46,160,67,0.15)" : row.kind === "del" ? "rgba(248,81,73,0.15)" : "transparent",
											color: row.kind === "same" ? "#c9d1d9" : row.kind === "add" ? "#7ee787" : "#ffa198",
										},
									},
									`${row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}${row.text}`,
								),
							),
						],
					});
				}),
			});
		}

		/** The turn-tail card: one row per changed file with review/open actions. */
		function ChangedFiles({ matched: files, openFile, isLoopback, useHostDescription, t }) {
			const hostCanOpenPath = useHostDescription((description) => description?.canOpenPath === true);
			const canOpenPath = isLoopback === true && hostCanOpenPath;
			const [reviewing, setReviewing] = useState(() => new Set());
			const toggleReview = useCallback((path) => {
				setReviewing((current) => {
					const next = new Set(current);
					if (next.has(path)) next.delete(path);
					else next.add(path);
					return next;
				});
			}, []);
			const shown = files.slice(0, SHOWN_LIMIT);
			const hidden = files.length - shown.length;
			const buttonStyle = {
				border: "1px solid rgba(140,145,152,0.4)",
				borderRadius: 4,
				background: "transparent",
				padding: "1px 8px",
				fontSize: 12,
				cursor: "pointer",
			};
			return js("div", {
				style: { margin: "6px 0", borderTop: "1px solid rgba(140,145,152,0.25)", paddingTop: 6 },
				children: [
					j("div", { style: { fontSize: 12, color: "#8a8f98", marginBottom: 4 } }, `${t("changes.title")} · ${files.length}`),
					...shown.map((file) =>
						js("div", {
							key: file.path,
							children: [
								js("div", {
									style: { display: "flex", alignItems: "center", gap: 8, padding: "2px 0" },
									children: [
										j("span", { title: file.path, style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 } }, file.path),
										file.hunks.length === 0 ? j("span", { style: { fontSize: 11, color: "#8a8f98" } }, t("changes.new")) : null,
										file.hunks.length > 0
											? j("button", { style: buttonStyle, onClick: () => toggleReview(file.path) }, reviewing.has(file.path) ? t("review.close") : t("review"))
											: null,
										canOpenPath ? j("button", { style: buttonStyle, onClick: () => openFile(file.path) }, t("open")) : null,
									],
								}),
								reviewing.has(file.path) ? j(DiffPanel, { file, t }) : null,
							],
						}),
					),
					hidden > 0 ? j("div", { style: { fontSize: 12, color: "#8a8f98" } }, t("changes.more", { count: hidden })) : null,
				],
			});
		}
		//#endregion

		//#region settings section
		const row = { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" };
		const subtle = { color: "#8a8f98", fontSize: 12 };
		const card = { border: "1px solid rgba(140,145,152,0.25)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 };
		const primaryButton = { borderRadius: 6, border: "none", padding: "4px 14px", cursor: "pointer", fontSize: 13 };

		/** Settings page: memory root, per-project stats, file browser. */
		function ZcodeMemorySection({ t }) {
			const [status, setStatus] = useState(null);
			const [projects, setProjects] = useState(null);
			const [error, setError] = useState(null);
			const [rootDraft, setRootDraft] = useState("");
			const [saving, setSaving] = useState(false);
			const [savedTick, setSavedTick] = useState(false);
			const [openProject, setOpenProject] = useState(null);
			const [files, setFiles] = useState(null);
			const [preview, setPreview] = useState(null);

			const refresh = useCallback(async () => {
				setError(null);
				try {
					const [statusResult, projectsResult] = await Promise.all([
						memoryApi.status(),
						memoryApi.listProjects(),
					]);
					if (statusResult?.ok === true) {
						setStatus(statusResult.value);
						setRootDraft(statusResult.value.memoryRoot);
					} else {
						setError(`status: ${JSON.stringify(statusResult)?.slice(0, 300)}`);
					}
					if (projectsResult?.ok === true) setProjects(projectsResult.value.projects);
					else setError((previous) => `${previous ?? ""}; projects: ${JSON.stringify(projectsResult)?.slice(0, 300)}`);
				} catch (error) {
					setError(`refresh threw: ${error instanceof Error ? error.message : String(error)}`);
				}
			}, [t]);

			useEffect(() => {
				void refresh();
			}, [refresh]);

			const save = useCallback(async () => {
				setSaving(true);
				const result = await memoryApi.setRoot(rootDraft.trim());
				setSaving(false);
				if (result?.ok === true) {
					setStatus(result.value);
					setSavedTick(true);
					setTimeout(() => setSavedTick(false), 1500);
					await refresh();
				} else {
					setError(result?.error?.message ?? t("error"));
				}
			}, [rootDraft, refresh, t]);

			const openFiles = useCallback(async (key) => {
				setPreview(null);
				const result = await memoryApi.listFiles(key);
				if (result?.ok === true) {
					setOpenProject(key);
					setFiles(result.value.files);
				} else {
					setError(result?.error?.message ?? t("error"));
				}
			}, [t]);

			const openFile = useCallback(async (key, name) => {
				const result = await memoryApi.readFile(key, name);
				if (result?.ok === true) setPreview(result.value);
				else setPreview({ name, content: null, error: result?.error?.message ?? t("error") });
			}, [t]);

			const sourceLabel = status === null ? "" : t(`root.source.${status.source}`);
			return js("div", {
				style: { maxWidth: 860 },
				children: [
					j("p", { style: subtle }, t("section.hint")),
					js("div", { style: card, children: [
						js("div", { style: row, children: [
							j("label", { style: { fontSize: 13, minWidth: 90 } }, t("root.label")),
							j("input", {
								value: rootDraft,
								onChange: (event) => setRootDraft(event.target.value),
								spellCheck: false,
								style: { flex: 1, borderRadius: 6, border: "1px solid rgba(140,145,152,0.4)", padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 13 },
							}),
							j("button", { style: primaryButton, disabled: saving, onClick: () => void save() }, savedTick ? t("root.saved") : t("root.save")),
							j("button", { style: { ...primaryButton, border: "1px solid rgba(140,145,152,0.4)", background: "transparent" }, onClick: () => void refresh() }, t("refresh")),
						] }),
						status !== null
							? js("div", { style: subtle, children: [
								t("root.source"),
								": ",
								sourceLabel,
								`　·　dsh home: ${status.dshHome}`,
							] })
							: null,
					] }),
					error !== null ? j("div", { style: { ...card, borderColor: "rgba(248,81,73,0.5)" } }, error) : null,
					openProject === null
						? js("div", { style: card, children: [
							j("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, t("projects.title")),
							projects === null
								? j("div", { style: subtle }, "…")
								: projects.length === 0
									? j("div", { style: subtle }, t("projects.empty"))
									: projects.map((project) =>
										js("div", {
											key: project.key,
											style: { ...row, cursor: "pointer", borderTop: "1px solid rgba(140,145,152,0.15)" },
											onClick: () => void openFiles(project.key),
											children: [
												j("span", { title: project.key, style: { flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 13 } }, project.slug),
												project.indexPresent ? j("span", { style: { ...subtle, border: "1px solid rgba(140,145,152,0.35)", borderRadius: 4, padding: "0 6px" } }, t("projects.index")) : null,
												j("span", { style: subtle }, t("projects.count", { count: project.memoryCount })),
												j("span", { style: subtle }, t("projects.updated", { time: new Date(project.lastModifiedMs).toLocaleString() })),
											],
										}),
									),
						] })
						: js("div", { style: card, children: [
							js("div", { style: row, children: [
								j("button", { style: { ...primaryButton, border: "1px solid rgba(140,145,152,0.4)", background: "transparent" }, onClick: () => { setOpenProject(null); setFiles(null); setPreview(null); } }, t("files.back")),
								j("span", { style: { fontSize: 13, fontWeight: 600 } }, t("files.title")),
								j("span", { title: openProject, style: subtle }, openProject),
							] }),
							files === null
								? j("div", { style: subtle }, "…")
								: files.map((file) =>
									js("div", {
										key: file.name,
										style: { ...row, cursor: "pointer", borderTop: "1px solid rgba(140,145,152,0.15)" },
										onClick: () => void openFile(openProject, file.name),
										children: [
											j("span", { style: { flex: 1, fontFamily: "ui-monospace, monospace", fontSize: 13 } }, file.name),
											j("span", { style: subtle }, `${(file.sizeBytes / 1024).toFixed(1)} KB`),
											j("span", { style: subtle }, new Date(file.lastModifiedMs).toLocaleString()),
										],
									}),
								),
							preview !== null
								? js("div", { style: { marginTop: 8 }, children: [
									j("div", { style: { ...subtle, marginBottom: 4 } }, preview.name),
									j("pre", {
										style: { margin: 0, maxHeight: 360, overflow: "auto", background: "rgba(140,145,152,0.08)", borderRadius: 6, padding: 10, fontSize: 12, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" },
										children: preview.content ?? preview.error,
									}),
								] })
								: null,
						] }),
				],
			});
		}
		//#endregion

		//#region plugin body
		/** Remote helper bound in apply once the client services exist. */
		let memoryApi = {
			status: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			listProjects: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			setRoot: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			listFiles: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			readFile: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
		};

		/**
		 * Client plugin body: mount the remote namespace, register dictionaries,
		 * the settings section, and the turn-tail changed-files card.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const remote = ctx.get("remote");
			const connection = ctx.get("connection");

			ctx.effect(
				() =>
					Promise.resolve(remote.$mount(CONTRIBUTION)).catch((error) => {
						console.error("dsh-zcode: remote mount failed", error);
					}),
				"dsh-zcode-memory: remote mount",
			);

			/**
			 * Invoke one mounted gateway method; returns the RemoteResult envelope.
			 *
			 * Self-mounted namespaces cannot be declared in this module's inject
			 * (the declaration would wait on a service only this module creates and
			 * deadlock the boot), so the call resolves the namespace service through
			 * the remote service's namespace registry — the same object the typed
			 * `remote.zcodeMemory.*` proxy hands out.
			 */
			const call = async (method, ...params) => {
				const deadline = Date.now() + 5000;
				for (;;) {
					const service = remote.namespaces?.get("zcodeMemory")?.service;
					if (service && typeof service[method] === "function") {
						return service[method](...params);
					}
					if (Date.now() > deadline) {
						return { ok: false, error: { code: "internal", message: "zcodeMemory namespace not mounted yet" } };
					}
					await new Promise((resolve) => setTimeout(resolve, 200));
				}
			};
			memoryApi = {
				status: () => call("status"),
				listProjects: () => call("listProjects"),
				setRoot: (memoryRoot) => call("setRoot", { memoryRoot }),
				listFiles: (key) => call("listFiles", { key }),
				readFile: (key, name) => call("readFile", { key, name }),
			};

			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, { zh, en });
				} catch (error) {
					console.error("dsh-zcode: locale register failed", error);
					return undefined;
				}
			}, "dsh-zcode-memory: dictionaries");

			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "zcode-memory",
						order: 60,
						label: () => ctx.locale.bind(NS)("nav"),
						locale: NS,
					},
					ZcodeMemorySection,
				),
			);

			ctx.conversationEvents.register(changesDefinition);
			ctx.slots.inject("conversation.chat.turnTail", () =>
				ctx.slots.register(
					{
						name: "conversation.chat.turnTail",
						select: selectChanges,
						locale: NS,
						// 链式槽按 priority 升序选举（低者先试）；低于官方 deliverables
						// 的默认 0，本轮捕获到 diff 时本面板当选，无 diff 时回落产物面板。
						priority: -1,
						// hooks.hostDescription 会被 slot 渲染器转成组件的
						// useHostDescription hook prop（与官方 deliverables 相同）。
						inject: () => ({
							isLoopback: connection.isLoopback,
							hooks: { hostDescription: connection.hostDescription },
						}),
					},
					ChangedFiles,
				),
			);
		}
		//#endregion

		exports.apply = apply;
		exports.inject = ["slots", "locale", "conversationEvents", "connection", "remote"];
		exports.changesDefinition = changesDefinition;
		return module.exports;
	},
});
