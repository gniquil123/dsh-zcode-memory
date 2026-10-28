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
			"section.hint": "与 ZCode 项目记忆目录完全兼容：把 ZCode 的 memories/projects 目录整体拷贝到根目录即可直接复用，或用下方导入功能。",
			"root.label": "记忆根目录",
			"root.source": "来源",
			"root.source.config": "配置覆盖（cordis.patch.yml）",
			"root.source.settings": "设置文件",
			"root.source.default": "默认",
			"root.browse": "浏览…",
			"root.browse.unavailable": "当前客户端不支持系统目录选择框，请手动输入路径。",
			"root.browse.cancelled": "未选择目录。",
			"root.openFolder": "打开文件夹",
			"root.openFolder.unavailable": "当前 host 不支持打开本地路径，请手动访问：{path}",
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
			"files.searching": "搜索中…",
			"search.placeholder": "按文件名或内容搜索…",
			"search.matches": "{count} 处匹配",
			"search.none": "没有匹配的文件。",
			"search.failed": "搜索失败",
			"error": "加载失败",
			"error.remote": "记忆服务未就绪，请稍后刷新。",
			"import.title": "从 ZCode 导入记忆",
			"import.scan": "扫描 ZCode 记忆",
			"import.scanning": "扫描中…",
			"import.importing": "导入中…",
			"import.source": "ZCode 记忆目录",
			"import.target": "导入到",
			"import.plan.projects": "{count} 个项目",
			"import.plan.copyProjects": "整目录复制 {count} 个项目",
			"import.plan.copyFiles": "复制 {count} 个文件",
			"import.plan.mergeIndexes": "合并 {count} 个 MEMORY.md 索引（按行合并，不改动已有行）",
			"import.plan.skipFiles": "跳过 {count} 个相同文件",
			"import.plan.conflicts": "{count} 个同名冲突（保留现有文件，不覆盖）",
			"import.confirm": "确认导入",
			"import.cancel": "取消",
			"import.close": "关闭",
			"import.empty": "ZCode 记忆目录里没有可导入的项目。",
			"import.notFound": "未找到 ZCode 记忆目录：{path}",
			"import.done": "导入完成",
			"import.report.copiedProjects": "已整目录复制项目：{keys}",
			"import.report.copiedFiles": "已复制 {count} 个文件",
			"import.report.merged": "已合并 {count} 个索引（共新增 {lines} 行）",
			"import.report.skipped": "跳过 {count} 个相同文件",
			"import.report.conflicts": "同名冲突 {count} 个（未覆盖，需手动处理）",
			"import.report.noWarnings": "未发现 ZCode 专属引用。",
			"import.report.warnings": "发现 {count} 处 ZCode 专属引用（未自动修改，请核对）：",
			"import.report.backups": "被修改文件的备份目录：{path}",
			"import.report.errors": "部分操作失败：",
			"import.nothing": "没有需要导入的内容（目标目录已同步）。",
		};
		/** English dictionary (same key set). */
		const en = {
			"nav": "ZCode Memory",
			"section.hint": "Fully compatible with ZCode project memory directories: copy ZCode's memories/projects tree into the root, or use the importer below.",
			"root.label": "Memory root",
			"root.source": "Source",
			"root.source.config": "patch config (cordis.patch.yml)",
			"root.source.settings": "settings file",
			"root.source.default": "default",
			"root.browse": "Browse…",
			"root.browse.unavailable": "This client cannot open the OS directory chooser; type the path instead.",
			"root.browse.cancelled": "No directory selected.",
			"root.openFolder": "Open folder",
			"root.openFolder.unavailable": "This host cannot open local paths; visit it manually: {path}",
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
			"files.searching": "searching…",
			"search.placeholder": "Search by name or content…",
			"search.matches": "{count} matches",
			"search.none": "No matching files.",
			"search.failed": "Search failed",
			"error": "Failed to load",
			"error.remote": "Memory service is not ready yet; refresh in a moment.",
			"import.title": "Import from ZCode",
			"import.scan": "Scan ZCode memory",
			"import.scanning": "Scanning…",
			"import.importing": "Importing…",
			"import.source": "ZCode memory root",
			"import.target": "Import into",
			"import.plan.projects": "{count} projects",
			"import.plan.copyProjects": "copy {count} whole projects",
			"import.plan.copyFiles": "copy {count} files",
			"import.plan.mergeIndexes": "merge {count} MEMORY.md indexes (line union, existing lines untouched)",
			"import.plan.skipFiles": "skip {count} identical files",
			"import.plan.conflicts": "{count} name conflicts (kept as-is, not overwritten)",
			"import.confirm": "Import now",
			"import.cancel": "Cancel",
			"import.close": "Close",
			"import.empty": "No importable projects in the ZCode memory root.",
			"import.notFound": "ZCode memory root not found: {path}",
			"import.done": "Import finished",
			"import.report.copiedProjects": "Copied projects: {keys}",
			"import.report.copiedFiles": "Copied {count} files",
			"import.report.merged": "Merged {count} indexes ({lines} lines added)",
			"import.report.skipped": "Skipped {count} identical files",
			"import.report.conflicts": "{count} name conflicts (not overwritten; resolve manually)",
			"import.report.noWarnings": "No ZCode-only references found.",
			"import.report.warnings": "{count} ZCode-only references found (left untouched; review advised):",
			"import.report.backups": "Backup directory for modified files: {path}",
			"import.report.errors": "Some operations failed:",
			"import.nothing": "Nothing to import (target is already in sync).",
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
				{ id: "dsh-zcode-memory#zcodeMemory/searchFiles", service: "zcodeMemory", namespace: "zcodeMemory", method: "searchFiles", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("searchFiles") }], result: codec("searchFiles") },
				{ id: "dsh-zcode-memory#zcodeMemory/readFile", service: "zcodeMemory", namespace: "zcodeMemory", method: "readFile", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("readFile") }], result: codec("readFile") },
				{ id: "dsh-zcode-memory#zcodeMemory/importZcodeScan", service: "zcodeMemory", namespace: "zcodeMemory", method: "importZcodeScan", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("importZcodeScan") }], result: codec("importZcodeScan") },
				{ id: "dsh-zcode-memory#zcodeMemory/importZcodeExecute", service: "zcodeMemory", namespace: "zcodeMemory", method: "importZcodeExecute", invocation: { kind: "direct" }, parameters: [{ name: "request", wire: "request", source: "json", codec: codec("importZcodeExecute") }], result: codec("importZcodeExecute") },
			],
		};
		//#endregion

		//#region settings section
		const row = { display: "flex", alignItems: "center", gap: 8, padding: "4px 0" };
		const subtle = { color: "#8a8f98", fontSize: 12 };
		const card = { border: "1px solid rgba(140,145,152,0.25)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 };
		const primaryButton = { borderRadius: 6, border: "none", padding: "4px 14px", cursor: "pointer", fontSize: 13 };
		const secondaryButton = { ...primaryButton, border: "1px solid rgba(140,145,152,0.4)", background: "transparent" };
		const textInput = { borderRadius: 6, border: "1px solid rgba(140,145,152,0.4)", padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 13 };
		/** Bounded lists: the settings page must never grow unbounded with the memory tree. */
		const scrollList = { maxHeight: 320, overflowY: "auto", overscrollBehavior: "contain" };
		const previewScroll = { maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain" };

		/** Timestamp formatting that survives garbage mtimes from foreign memory trees. */
		const fmtTime = (ms) => {
			const value = Number(ms);
			return Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString() : "";
		};

		/** Settings page: memory root, per-project stats, file browser with search, ZCode importer. */
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
			const [query, setQuery] = useState("");
			const [searchResults, setSearchResults] = useState(null);
			const [searching, setSearching] = useState(false);
			const [scan, setScan] = useState(null);
			const [scanning, setScanning] = useState(false);
			const [importing, setImporting] = useState(false);
			const [report, setReport] = useState(null);
			const [browsing, setBrowsing] = useState(false);
			const [opening, setOpening] = useState(false);

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
						setError(`status: ${summarize(statusResult)}`);
					}
					if (projectsResult?.ok === true) setProjects(projectsResult.value.projects);
					else setError((previous) => `${previous ?? ""}; projects: ${summarize(projectsResult)}`);
				} catch (error) {
					setError(`refresh: ${errorMessage(error)}`);
				}
			}, []);

			useEffect(() => {
				void refresh();
			}, [refresh]);

			const save = useCallback(async () => {
				setSaving(true);
				setError(null);
				try {
					const result = await memoryApi.setRoot(rootDraft.trim());
					if (result?.ok === true) {
						setStatus(result.value);
						setSavedTick(true);
						setTimeout(() => setSavedTick(false), 1500);
						setOpenProject(null);
						setFiles(null);
						setPreview(null);
						setScan(null);
						setReport(null);
						await refresh();
					} else {
						setError(result?.error?.message ?? t("error"));
					}
				} catch (error) {
					setError(`save: ${errorMessage(error)}`);
				} finally {
					setSaving(false);
				}
			}, [rootDraft, refresh, t]);

			/** Pick a directory with the host's OS chooser; fills the input (user still saves). */
			const browseRoot = useCallback(async () => {
				setBrowsing(true);
				setError(null);
				try {
					const result = await hostApi.pickDirectory();
					if (result?.ok === true) {
						if (typeof result.value === "string" && result.value) setRootDraft(result.value);
						else setError(t("root.browse.cancelled"));
					} else {
						setError(result?.error?.message ?? t("root.browse.unavailable"));
					}
				} catch (error) {
					setError(`browse: ${errorMessage(error)}`);
				} finally {
					setBrowsing(false);
				}
			}, [t]);

			/** Reveal the effective memory root in the OS file manager. */
			const openRootFolder = useCallback(async () => {
				const target = status?.memoryRoot;
				if (!target) return;
				setOpening(true);
				setError(null);
				try {
					const result = await hostApi.revealPath(target);
					if (result?.ok !== true) {
						setError(result?.error?.message ?? t("root.openFolder.unavailable", { path: target }));
					}
				} catch (error) {
					setError(`open: ${errorMessage(error)}`);
				} finally {
					setOpening(false);
				}
			}, [status, t]);

			const openFiles = useCallback(async (key) => {
				setPreview(null);
				setQuery("");
				setSearchResults(null);
				setError(null);
				try {
					const result = await memoryApi.listFiles(key);
					if (result?.ok === true) {
						setOpenProject(key);
						setFiles(result.value.files);
					} else {
						setError(result?.error?.message ?? t("error"));
					}
				} catch (error) {
					setError(`listFiles: ${errorMessage(error)}`);
				}
			}, [t]);

			const openFile = useCallback(async (key, name) => {
				setError(null);
				try {
					const result = await memoryApi.readFile(key, name);
					if (result?.ok === true) {
						// 字段级快照：不依赖 value 对象的后续读取稳定性
						const value = result.value ?? {};
						setPreview({
							name: String(value.name ?? name),
							content: typeof value.content === "string" ? value.content : null,
							lastModifiedMs: Number(value.lastModifiedMs) || 0,
						});
					} else {
						setPreview({ name, content: null, error: result?.error?.message ?? t("error") });
					}
				} catch (error) {
					setPreview({ name, content: null, error: errorMessage(error) });
				}
			}, [t]);

			// Debounced content+name search within the open project.
			useEffect(() => {
				const trimmed = query.trim();
				if (openProject === null || trimmed === "") {
					setSearchResults(null);
					setSearching(false);
					return undefined;
				}
				setSearching(true);
				const timer = setTimeout(async () => {
					try {
						const result = await memoryApi.searchFiles(openProject, trimmed);
						if (result?.ok === true) setSearchResults(result.value.files);
						else setError(result?.error?.message ?? t("search.failed"));
					} catch (error) {
						setError(`search: ${errorMessage(error)}`);
					} finally {
						setSearching(false);
					}
				}, 250);
				return () => clearTimeout(timer);
			}, [query, openProject, t]);

			const runScan = useCallback(async () => {
				setScanning(true);
				setError(null);
				setReport(null);
				try {
					const result = await memoryApi.importScan();
					if (result?.ok === true) setScan(result.value);
					else setError(result?.error?.message ?? t("error"));
				} catch (error) {
					setError(`importScan: ${errorMessage(error)}`);
				} finally {
					setScanning(false);
				}
			}, [t]);

			const runImport = useCallback(async () => {
				if (scan === null) return;
				setImporting(true);
				setError(null);
				try {
					const result = await memoryApi.importExecute(scan.sourceRoot);
					if (result?.ok === true) {
						setReport(result.value);
						setScan(null);
						await refresh();
					} else {
						setError(result?.error?.message ?? t("error"));
					}
				} catch (error) {
					setError(`import: ${errorMessage(error)}`);
				} finally {
					setImporting(false);
				}
			}, [scan, refresh, t]);

			const sourceLabel = status === null ? "" : t(`root.source.${status.source}`);
			const searchingActive = query.trim() !== "";
			const shownFiles = searchingActive ? (searchResults ?? (searching ? null : files)) : files;
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
								style: { ...textInput, flex: 1, minWidth: 0 },
							}),
							j("button", { style: secondaryButton, disabled: browsing, onClick: () => void browseRoot() }, t("root.browse")),
							j("button", { style: secondaryButton, disabled: opening || status === null, onClick: () => void openRootFolder() }, t("root.openFolder")),
							j("button", { style: primaryButton, disabled: saving, onClick: () => void save() }, savedTick ? t("root.saved") : t("root.save")),
							j("button", { style: secondaryButton, onClick: () => void refresh() }, t("refresh")),
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
					renderImportCard({ t, scan, scanning, importing, report, runScan, runImport, setScan, setReport }),
					error !== null ? j("div", { style: { ...card, borderColor: "rgba(248,81,73,0.5)", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all" } }, error) : null,
					openProject === null
						? js("div", { style: card, children: [
							j("div", { style: { fontSize: 13, fontWeight: 600, marginBottom: 6 } }, t("projects.title")),
							js("div", { style: scrollList, children: [
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
													j("span", { title: project.key, style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 13 } }, project.slug),
													project.indexPresent ? j("span", { style: { ...subtle, border: "1px solid rgba(140,145,152,0.35)", borderRadius: 4, padding: "0 6px" } }, t("projects.index")) : null,
													j("span", { style: subtle }, t("projects.count", { count: project.memoryCount })),
													j("span", { style: subtle }, t("projects.updated", { time: fmtTime(project.lastModifiedMs) })),
												],
											}),
										),
							] }),
						] })
						: js("div", { style: card, children: [
							js("div", { style: row, children: [
								j("button", { style: secondaryButton, onClick: () => { setOpenProject(null); setFiles(null); setPreview(null); setQuery(""); setSearchResults(null); } }, t("files.back")),
								j("span", { style: { fontSize: 13, fontWeight: 600 } }, t("files.title")),
								j("span", { title: openProject, style: { ...subtle, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, openProject),
								j("input", {
									value: query,
									placeholder: t("search.placeholder"),
									onChange: (event) => setQuery(event.target.value),
									spellCheck: false,
									style: { ...textInput, width: 220, flex: "none", fontSize: 12, padding: "3px 8px" },
								}),
							] }),
							searchingActive && searching ? j("div", { style: subtle }, t("files.searching")) : null,
							js("div", { style: scrollList, children: [
								shownFiles === null
									? j("div", { style: subtle }, "…")
									: shownFiles.length === 0
										? j("div", { style: subtle }, searchingActive ? t("search.none") : t("projects.empty"))
										: shownFiles.map((file) =>
											js("div", {
												key: file.name,
												style: { cursor: "pointer", borderTop: "1px solid rgba(140,145,152,0.15)", padding: "4px 0" },
												onClick: () => void openFile(openProject, file.name),
												children: [
													js("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
														j("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "ui-monospace, monospace", fontSize: 13 } }, file.name),
														typeof file.matchCount === "number" ? j("span", { style: { ...subtle, border: "1px solid rgba(140,145,152,0.35)", borderRadius: 4, padding: "0 6px" } }, t("search.matches", { count: file.matchCount })) : null,
														j("span", { style: subtle }, `${(file.sizeBytes / 1024).toFixed(1)} KB`),
														j("span", { style: subtle }, fmtTime(file.lastModifiedMs)),
													] }),
													typeof file.firstSnippet === "string" && file.firstSnippet
														? j("div", { style: { ...subtle, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, file.firstSnippet)
														: null,
												],
											}),
										),
							] }),
								preview !== null
									? js("div", { style: { marginTop: 8 }, children: [
										j("div", { style: { ...subtle, marginBottom: 4 } }, preview.name),
										j("pre", {
											style: { margin: 0, ...previewScroll, background: "rgba(140,145,152,0.08)", borderRadius: 6, padding: 10, fontSize: 12, fontFamily: "ui-monospace, monospace", whiteSpace: "pre-wrap" },
										}, preview.content ?? preview.error),
									] })
									: null,
						] }),
				],
			});
		}

		/** Short single-line summary of a failed remote envelope for the error card. */
		function summarize(result) {
			try {
				return JSON.stringify(result)?.slice(0, 300) ?? "unknown";
			} catch {
				return "unknown";
			}
		}

		function errorMessage(error) {
			return error instanceof Error ? error.message : String(error);
		}

		//#region import card
		/**
		 * The ZCode importer card: scan → confirm plan → execute → report.
		 * Kept as a plain function (not a component) so it re-renders with the
		 * section's state; every stage is optional and failures surface in the
		 * section's error card instead of breaking the settings tab.
		 */
		function renderImportCard({ t, scan, scanning, importing, report, runScan, runImport, setScan, setReport }) {
			const planLine = (text) => j("div", { style: subtle }, text);
			const children = [
				js("div", { style: { ...row, marginBottom: 4 }, children: [
					j("span", { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, t("import.title")),
					scan === null
						? j("button", { style: report === null ? primaryButton : secondaryButton, disabled: scanning || importing, onClick: () => void runScan() }, scanning ? t("import.scanning") : t("import.scan"))
						: null,
				] }),
			];
			if (scan !== null) {
				const totals = scan.totals ?? {};
				const planLines = [
					`${t("import.source")}: ${scan.sourceRoot ?? ""}`,
					`${t("import.target")}: ${scan.targetRoot ?? ""}`,
					planLine(t("import.plan.projects", { count: totals.projects ?? 0 })),
					planLine(t("import.plan.copyProjects", { count: totals.copyProjects ?? 0 })),
					planLine(t("import.plan.copyFiles", { count: totals.copyFiles ?? 0 })),
					planLine(t("import.plan.mergeIndexes", { count: totals.mergeIndexes ?? 0 })),
					planLine(t("import.plan.skipFiles", { count: totals.skipFiles ?? 0 })),
					(totals.conflicts ?? 0) > 0 ? planLine(t("import.plan.conflicts", { count: totals.conflicts })) : null,
				].filter(Boolean);
				if ((totals.projects ?? 0) === 0) {
					planLines.push(planLine(t("import.empty")));
				}
				children.push(
					js("div", { style: { border: "1px solid rgba(140,145,152,0.25)", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }, children: [
						...planLines,
						js("div", { style: { ...row, marginTop: 8 }, children: [
							(totals.projects ?? 0) > 0
								? j("button", { style: primaryButton, disabled: importing, onClick: () => void runImport() }, importing ? t("import.importing") : t("import.confirm"))
								: null,
							j("button", { style: secondaryButton, disabled: importing, onClick: () => setScan(null) }, t("import.cancel")),
						] }),
					] }),
				);
			}
			if (report !== null) {
				const lines = [j("div", { style: { fontSize: 13, fontWeight: 600 } }, t("import.done"))];
				if (report.copiedProjects?.length > 0) {
					lines.push(planLine(t("import.report.copiedProjects", { keys: report.copiedProjects.slice(0, 8).join(", ") + (report.copiedProjects.length > 8 ? "…" : "") })));
				}
				if (report.copiedFiles > 0) lines.push(planLine(t("import.report.copiedFiles", { count: report.copiedFiles })));
				if (report.mergedIndexes?.length > 0) {
					const added = report.mergedIndexes.reduce((sum, row) => sum + (row.addedLines ?? 0), 0);
					lines.push(planLine(t("import.report.merged", { count: report.mergedIndexes.length, lines: added })));
				}
				if (report.skippedFiles > 0) lines.push(planLine(t("import.report.skipped", { count: report.skippedFiles })));
				if (report.conflicts?.length > 0) {
					lines.push(planLine(t("import.report.conflicts", { count: report.conflicts.length })));
					for (const conflict of report.conflicts.slice(0, 8)) {
						lines.push(planLine(`　· ${conflict.key}/${conflict.name}`));
					}
				}
				const warnings = report.warnings ?? [];
				if (warnings.length === 0) lines.push(planLine(t("import.report.noWarnings")));
				else {
					lines.push(planLine(t("import.report.warnings", { count: warnings.length })));
					for (const warning of warnings.slice(0, 10)) {
						lines.push(j("div", { style: { ...subtle, marginLeft: 12, marginBottom: 2 } }, `${warning.key}/${warning.name}:${warning.line} — ${warning.snippet}`));
						lines.push(j("div", { style: { ...subtle, marginLeft: 24, marginBottom: 2, color: "#d29922" } }, `→ ${warning.suggestion}`));
					}
					if (warnings.length > 10) lines.push(planLine(`　… +${warnings.length - 10}`));
				}
				if (report.backupsDir && (report.mergedIndexes?.length > 0)) {
					lines.push(planLine(t("import.report.backups", { path: report.backupsDir })));
				}
				if (report.errors?.length > 0) {
					lines.push(planLine(t("import.report.errors")));
					for (const message of report.errors.slice(0, 5)) {
						lines.push(j("div", { style: { ...subtle, marginLeft: 12, color: "#ffa198" } }, message));
					}
				}
				children.push(js("div", { style: { border: "1px solid rgba(140,145,152,0.25)", borderRadius: 6, padding: "8px 10px" }, children: [
					...lines,
					j("div", { style: { ...row, marginTop: 8 } },
						j("button", { style: secondaryButton, onClick: () => setReport(null) }, t("import.close"))),
				] }));
			}
			return js("div", { style: card, children });
		}
		//#endregion
		//#endregion

		//#region plugin body
		/** Remote helper bound in apply once the client services exist. */
		let memoryApi = {
			status: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			listProjects: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			setRoot: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			listFiles: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			searchFiles: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			readFile: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			importScan: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			importExecute: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
		};
		/** Host-side client capabilities (OS chooser, file-manager reveal), bound in apply. */
		let hostApi = {
			pickDirectory: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
			revealPath: () => Promise.resolve({ ok: false, error: { code: "internal", message: "not mounted" } }),
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
			 * Resolve one mounted remote namespace service at click time; null when
			 * the owning bundle is absent. Self-mounted namespaces cannot be declared
			 * in this module's inject (the declaration would wait on a service only
			 * this module creates and deadlock the boot), and official namespaces
			 * resolve through the same registry.
			 */
			const namespaceService = (name) => {
				let service;
				try {
					service = ctx.get(`remote.${name}`);
				} catch {
					service = undefined;
				}
				if (!service || typeof service !== "object") {
					service = remote.namespaces?.get?.(name)?.service;
				}
				return service && typeof service === "object" ? service : null;
			};

			/**
			 * Invoke one mounted gateway method; returns the RemoteResult envelope.
			 * Never rejects: every failure — not-mounted, timeout, throw — folds into
			 * `{ ok: false, error }` so settings-page handlers stay simple.
			 */
			const call = async (method, ...params) => {
				const deadline = Date.now() + 5000;
				for (;;) {
					const service = namespaceService("zcodeMemory");
					if (service && typeof service[method] === "function") {
						try {
							const result = await service[method](...params);
							// 物化为普通对象：wire 层返回的值可能携带惰性属性（渲染期
							// 二次读取丢失内容），在这里一次性快照，组件拿到纯数据。
							if (result === null || typeof result !== "object") return result;
							try {
								return JSON.parse(JSON.stringify(result));
							} catch {
								return result;
							}
						} catch (error) {
							return { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } };
						}
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
				searchFiles: (key, query) => call("searchFiles", { key, query }),
				readFile: (key, name) => call("readFile", { key, name }),
				importScan: (sourceRoot) => call("importZcodeScan", { sourceRoot: sourceRoot ?? "" }),
				importExecute: (sourceRoot) => call("importZcodeExecute", { sourceRoot: sourceRoot ?? "" }),
			};

			hostApi = {
				/** Open the host's native directory chooser; `{ok:true, value: path|null}` (null = cancelled). */
				pickDirectory: async () => {
					const picker = namespaceService("directoryPicker");
					if (!picker || typeof picker.pick !== "function") {
						return { ok: false, error: { code: "internal", message: "remote.directoryPicker is not available" } };
					}
					try {
						const result = await picker.pick();
						if (result?.ok === true) return { ok: true, value: typeof result.value === "string" ? result.value : null };
						return { ok: false, error: result?.error ?? { code: "internal", message: "directory picker failed" } };
					} catch (error) {
						return { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } };
					}
				},
				/** Reveal one host path in the OS file manager (official session endpoint). */
				revealPath: async (path) => {
					const session = namespaceService("session");
					if (!session || typeof session.openWorkspacePath !== "function") {
						return { ok: false, error: { code: "internal", message: "remote.session is not available" } };
					}
					try {
						const result = await session.openWorkspacePath({ path, action: "reveal" });
						if (result?.ok === true) return { ok: true };
						return { ok: false, error: result?.error ?? { code: "internal", message: "openWorkspacePath failed" } };
					} catch (error) {
						return { ok: false, error: { code: "internal", message: error instanceof Error ? error.message : String(error) } };
					}
				},
			};

			ctx.effect(() => {
				try {
					return ctx.locale.register(NS, { zh, en });
				} catch (error) {
					console.error("dsh-zcode-memory: locale register failed", error);
					return undefined;
				}
			}, "dsh-zcode-memory: dictionaries");

			try {
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
			} catch (error) {
				console.error("dsh-zcode-memory: settings section registration failed", error);
			}
		}
		//#endregion

		exports.apply = apply;
		exports.inject = ["slots", "locale", "remote"];
		return module.exports;
	},
});
