window.__ModuleLoader__.load({
	id: "dsh-zcode-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		const { useState, useCallback, useEffect } = react;
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
			"error": "Failed to load",
			"error.remote": "Memory service is not ready yet; refresh in a moment.",
		};
		//#endregion

		//#region remote contribution
		/** Client-side codec stand-in: the Host gateway validates with real zod. */
		const permissive = () => ({ parse: (value) => value });
		const codec = (typeSymbol) => ({ mode: "strict", typeSymbol, create: permissive });

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
		 * Client plugin body: mount the remote namespace, register dictionaries
		 * and the settings section.
		 *
		 * Post-turn changed-file listing is intentionally NOT re-implemented on
		 * the 0.2.x line: official dsh-workspace-changes + dsh-client-ui-deliverables
		 * now provide it natively (turn tail with per-file diff and open actions).
		 *
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const remote = ctx.get("remote");

			ctx.effect(
				() =>
					Promise.resolve(remote.$mount(CONTRIBUTION)).catch((error) => {
						console.error("dsh-zcode-memory: remote mount failed", error);
					}),
				"dsh-zcode-memory: remote mount",
			);

			/**
			 * Invoke one mounted gateway method; returns the RemoteResult envelope.
			 *
			 * Self-mounted namespaces cannot be declared in this module's inject
			 * (the declaration would wait on a service only this module creates and
			 * deadlock the boot), so the call resolves the `remote.<namespace>`
			 * cordis service after the mount settles; the gateway's namespaces
			 * registry is the fallback path.
			 */
			const call = async (method, ...params) => {
				const deadline = Date.now() + 5000;
				for (;;) {
					let service;
					try {
						service = ctx.get("remote.zcodeMemory");
					} catch {
						service = undefined;
					}
					if (!service || typeof service[method] !== "function") {
						service = remote.namespaces?.get?.("zcodeMemory")?.service;
					}
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
					console.error("dsh-zcode-memory: locale register failed", error);
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
		}
		//#endregion

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote"];
		return module.exports;
	},
});
