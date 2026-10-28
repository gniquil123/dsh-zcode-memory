# dsh-zcode-memory

把 ZCode（zai-org/ZCode）的项目记忆能力移植到 DeepSeek Harness（dsh）的插件：ZCode 兼容的项目记忆、对话轮结束后的修改文件列表（审查 / 打开按钮）、独立的记忆设置页。

[English](README.md)

**适配版本：dsh `>=0.2.1-rc.3 <0.3.0-0`**（插件 v0.2.0；声明在 `engines.dsh`，在 `0.2.1-rc.3` 上实测通过）。安装器检测到不兼容的 dsh 版本会拒绝安装。dsh 0.1.x 请用插件 [v0.1.0](https://github.com/gniquil123/dsh-zcode-memory/releases/tag/v0.1.0)。

## 功能

1. **ZCode 兼容的项目记忆** — 每个项目的记忆目录名与 ZCode 的转码规则完全一致（`basename 清洗 slug` + `-` + SHA-256(规范化绝对路径，Windows 转小写) 前 16 位）。把 ZCode 的 `memories/projects/` 目录整体拷贝到本插件的记忆根目录，各项目记忆直接被识别、可直接维护。每个 agent 会话注入一段记忆协议上下文（四种记忆类型、frontmatter 格式、`MEMORY.md` 索引规则）加当前项目索引；记忆根目录内写入免审批，对应 ZCode 的记忆写自动放行。
2. **对话轮结束后的修改文件列表** — dsh 0.1.x 上由插件 v0.1.0 提供（回复尾部面板：**审查**按钮展开 +/- 着色 diff、**打开**按钮本地打开）。dsh 0.2.x 起官方 `dsh-workspace-changes` + 交付物界面原生提供了同等能力（轮尾部逐文件 diff 与打开操作），本插件不再自带该面板，直接使用官方实现。
3. **独立的设置页** — web 设置里的「ZCode 记忆」分区：
   - 查看/修改记忆根目录（持久化到 `<dsh-home>/dsh-zcode-memory.json`）；**浏览…** 按钮调起宿主系统目录选择框选路径；**打开文件夹** 按钮在系统文件管理器中显示当前记忆根目录；插件启动即确保默认根目录 `<dsh-home>/memories` 存在（缺失则自动创建）。
   - 各项目记忆统计（文件数、是否含索引、总大小、最近更新），列表限高带滚动条；点进项目后，文件列表右上角可按**文件名或文档内容**搜索（内容命中显示匹配数与上下文摘要）；点击文件在下方展示内容预览（5 MiB 上限，与 ZCode 一致）。
4. **从 ZCode 导入记忆** — 设置页一键迁移：先扫描 ZCode 默认记忆目录（`~/.zcode/cli/memories`）并与当前记忆根目录对比，确认后执行——目标缺失的项目整目录复制；已有项目中的新文件直接复制；两边都有的 `MEMORY.md` 索引按行合并（保留已有行、追加新行、精确去重，最小改动）；同名不同内容的文件保留现状并报告。导入同时检查 ZCode 专属引用（`.zcode` 路径、zcode CLI 调用等），逐条给出修改建议，由用户决定是否处理；被合并改写过的索引先备份到 `<dsh-home>/dsh-zcode-memory/import-backup/<时间戳>/`。

![ZCode 记忆设置页](docs/settings-zcode-memory.png)

> 与 ZCode 项目记忆目录完全兼容：把 ZCode 的 memories/projects 目录整体拷贝到根目录即可直接复用。

## 安装

前置：[Node.js](https://nodejs.org) ≥ 20 且 npm 可用（`dsh` 与 `pnpm` 由脚本自动定位，无需配置 PATH）。

### 从发布包安装（一行命令）

```sh
tar -xzf dsh-zcode-memory-0.1.0.tgz && node dsh-zcode-memory/install.mjs
```

`install.mjs` 会通过官方 `dsh plugin add` 流程把插件注册进 `web` profile，并把每个 peer 依赖链接到 dsh 安装树，保证插件与宿主共享同一模块实例。可选参数：`--profile <名称>`（默认 `web`）、`--home <dsh-home>`（默认 `$DSH_HOME` 或 `~/.dsh`）、`--dsh <目录>`（手动指定安装树）。

### 从 git 克隆安装

```sh
git clone https://github.com/gniquil123/dsh-zcode-memory.git
node dsh-zcode-memory/install.mjs
```

### 桌面版 profile

`desktop` profile 由 Electron 应用独占管理，CLI 会拒绝 `dsh plugin add`。手动安装（与任何第三方桌面 bundle 同一套路）：

1. 编辑 `~/.dsh/profiles/desktop/package.json`：在 `dependencies` 加 `"dsh-zcode-memory": "link:<克隆目录>"`，在 `dsh.profile.bundles` 加 `"dsh-zcode-memory"`。
2. 在该目录执行 `pnpm install`。
3. 重启 DeepSeek Harness 桌面应用。

然后重启 profile：`dsh web`。设置页出现「ZCode 记忆」分区即成功。

## 迁移已有的 ZCode 记忆

```sh
# Windows（PowerShell）
Copy-Item -Recurse "$env:USERPROFILE\.zcode\cli\memories\projects" "$env:USERPROFILE\.dsh\memories\projects"
```

```sh
# macOS / Linux
cp -r ~/.zcode/cli/memories/projects ~/.dsh/memories/projects
```

记忆根目录默认为 `<dsh-home>/memories`，项目位于 `<根目录>/projects/<项目key>/memory/`。key 计算与 ZCode 完全一致，拷贝即被识别。

## 配置

编辑 profile 用户层补丁（`~/.dsh/profiles/web/cordis.patch.yml`）：

```yaml
- id: zcode-memory
  config:
    enabled: true            # false 时：不注入记忆上下文、不启动远程服务
    memoryRoot: ""           # 非空时强制作为记忆根目录（优先于设置页保存值）
    memoryWriteAllow: true   # 仅对记忆根目录内的写入放宽沙箱
```

设置页的运行时修改持久化到 `<dsh-home>/dsh-zcode-memory.json`；patch 配置的 `memoryRoot` 始终优先。

## 安全边界

- `memoryWriteAllow` 只放宽**目标路径位于记忆根目录内**的 `writeText`/`editText` 调用（等同 ZCode 的记忆写自动放行）；bash 与其他路径保持会话原有沙箱模式。希望手动审批每次记忆写入时置 `false`。
- 注入的记忆内容是模型可读上下文，与 ZCode 相同：记忆文件由模型写入，引用前需自行核实时效性（注入协议中已包含该要求）。

## 已知问题

- 较新的 dsh desktop 版本写入的 `$DSH_HOME/.credentials.yaml` 是富格式，`0.1.0-rc.6` 的扁平解析器不识别。同时使用两者时，用用户层补丁把 web profile 的 `credentials` 行指向独立文件：

  ```yaml
  - id: credentials
    config:
      path: '<dsh-home>/.credentials-web.yaml'
      dshHome: '<dsh-home>'
  ```

## 实现说明

- host 半（`lib/index.js`）：在 `agent/pre-step` 上每会话注入一次记忆上下文（轮中重注入会唤醒 agent 循环产生多余回复）；包装 `ctx.fs.writeText/editText` 实现记忆写放行；注册 Typert Remote 网关。
- 远程通道：`lib/typert.host.js` 是手写的生成器格式 Typert 契约（`dsh-typert-loader` 自动注册任何已挂载包的 `./typert` 导出）；client 半通过公开的 `ctx.remote.$mount` 挂载描述符。自挂载的命名空间**不能**写进模块 `inject`（会等待自己创建的服务，启动死锁）——调用经 `remote.namespaces` 注册表解析。
- 修改文件列表：纯 client 侧从会话事件流推导，沿用官方 deliverables 插件的累加器模式。turnTail 是链式槽，按 `priority` 升序选举第一个 select 非 null 的条目：本面板注册 `priority: -1`，捕获到 diff 时当选，否则回落官方产物面板。
- `lib/project-key.js` 1:1 移植自 ZCode（`zai-org/ZCode`，`apps/zcode-cli/packages/core/src/memory/project-root.ts`，Apache-2.0，已标注改动）；提示词改编自 ZCode 的 provider-visible 记忆提示词。第三方声明见 `LICENSE`。
- 纯 JS 无构建步骤；`lib/client.js` 按 dsh ModuleLoader 的 lazy-CJS factory 格式手写。**注意**：dsh 0.2.x 客户端运行时会把 `createElement(type, { children: <原始字符串> })` 里的原始字符串 children 丢弃（数组和第三参数形式不受影响）——文本子元素必须用第三参数传递（`createElement(type, props, text)`），否则渲染为空。

## 更新日志

### v0.2.2（2026-10-28）

- **设置页大改版** — 文件列表右上角新增搜索框（按文件名和文档内容检索，内容命中带匹配数与上下文摘要）；项目与文件列表限高加滚动条；点击文件在下方展示内容预览；记忆根目录行新增 **浏览…**（系统目录选择框，经宿主 `remote.directoryPicker`）与 **打开文件夹**（文件管理器定位，经官方 `session/openWorkspacePath` reveal）按钮。
- **从 ZCode 导入记忆** — 扫描 `~/.zcode/cli/memories` → 展示对比计划（整目录复制 / 复制新文件 / 行合并索引 / 同名冲突）→ 确认执行。索引合并为确定性行并集（保留已有行、追加新行、精确去重，最小改动，不调用模型）；同名不同内容文件保留现状并在报告中列出；自动检查 ZCode 专属引用（`.zcode` 路径、`zcode` CLI 调用）并逐条给出修复建议，由用户决定；被合并的索引先备份到 `<dsh-home>/dsh-zcode-memory/import-backup/<时间戳>/`。
- **默认记忆根目录自动创建** — 插件启动即确保 `<dsh-home>/memories/projects` 存在；设置页保存新根目录后同样创建。
- **全链路容错** — 网关调用永不 reject（未挂载/超时/异常统一折叠为 `{ok:false,error}`）；每个设置页操作独立 try/catch 并在错误卡片显示；store 对消失中的文件、坏 mtime、非法路径均不再抛出；宿主侧 store 创建或功能安装失败只记日志，不拖垮 profile 启动。
- 新增 `node test/smoke.mjs` 冒烟测试（store、导入管线、typert schema 校验，测试用独立 `DSH_HOME`，不触碰真实配置）。

### v0.2.1（2026-10-26）

- **修复 dsh 0.2.x 上模型调用失败** — 报错 `format v4 message requires a producer-owned source kind`：v4 会话格式退役了通用的 `source: { kind: "plugin" }` 包装，注入的记忆上下文改用生产者自有 kind `dsh-zcode-memory/memory-context`。本版本创建的会话导出日志不再 HTTP 500。（v0.2.0 期间产生的会话日志含有已退役 kind，在 0.2.x 上导出/回放仍会失败——删除那些会话即可。）

### v0.2.0（2026-10-26）

- **支持 dsh 0.2.1-rc.3** — 兼容范围调整为 `>=0.2.1-rc.3 <0.3.0-0`；typert 契约整体重写为新版 `createTypertRemoteInfo` + `create()` 惰性 zod 工厂格式（旧 `schema` 字段在 0.2.x 上启动即失败）。
- **安装器版本门禁** — 安装器读取已装 dsh 版本，不满足 `engines.dsh` 时拒绝安装（自带零依赖 semver 范围求值）；dsh CLI 自身的插件门禁作为第二层兜底。
- **修改文件面板移交官方** — dsh 0.2.x 自带 `dsh-workspace-changes` 与新交付物界面（轮尾部逐文件 diff 与打开操作），本插件撤下 0.1 时代的客户端累加器面板，直接使用官方实现。
- **补充桌面版 profile 安装说明** — `desktop` profile 由 Electron 应用独占管理，安装节给出手动 manifest + pnpm 步骤。
- 已在 dsh 0.2.1-rc.3 实测：插件 v0.2.0 运行中、ZCode 记忆设置分区正常渲染、远程网关全链路通（11 个 ZCode 迁移项目全部识别）。

### v0.1.0（2026-10-24）

- 面向 dsh 0.1.0-rc.6 的首版：ZCode 兼容项目记忆、client 侧修改文件面板（审查/打开）、记忆设置页。

## 许可证

[MIT](LICENSE)
