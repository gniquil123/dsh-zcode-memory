# dsh-zcode-memory

把 ZCode（zai-org/ZCode）的项目记忆能力移植到 DeepSeek Harness（dsh）的插件：ZCode 兼容的项目记忆、对话轮结束后的修改文件列表（审查 / 打开按钮）、独立的记忆设置页。

[English](README.md)

**适配版本：dsh `>=0.1.0-rc.6 <0.2.0`**（声明在 `package.json` 的 `engines.dsh`；在 `0.1.0-rc.6` 上开发并实测通过）。dsh 升级后需要回归验证再放宽范围。

## 功能

1. **ZCode 兼容的项目记忆** — 每个项目的记忆目录名与 ZCode 的转码规则完全一致（`basename 清洗 slug` + `-` + SHA-256(规范化绝对路径，Windows 转小写) 前 16 位）。把 ZCode 的 `memories/projects/` 目录整体拷贝到本插件的记忆根目录，各项目记忆直接被识别、可直接维护。每个 agent 会话注入一段记忆协议上下文（四种记忆类型、frontmatter 格式、`MEMORY.md` 索引规则）加当前项目索引；记忆根目录内写入免审批，对应 ZCode 的记忆写自动放行。
2. **对话轮结束后的修改文件列表** — 每轮回复尾部列出本轮产生/修改的文件，带**审查**按钮（内联 +/- 着色 diff）和**打开**按钮（本地 host 下在编辑器/资源管理器打开）。纯 client 侧从会话事件流推导，会话回放同样可用。
3. **独立的设置页** — web 设置里的「ZCode 记忆」分区：查看/修改记忆根目录（持久化）、各项目记忆统计（文件数、是否含索引、总大小、最近更新）、单文件内容预览（5 MiB 上限，与 ZCode 一致）。

## 安装

前置：[Node.js](https://nodejs.org) ≥ 20、`dsh` 在 PATH 上、`pnpm`（`npm i -g pnpm`）。

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
- `lib/project-key.js` 1:1 移植自 ZCode（`zai-org/ZCode`，`apps/zcode-cli/packages/core/src/memory/project-root.ts`，MIT）；提示词改编自 ZCode 的 provider-visible 记忆提示词。第三方声明见 `LICENSE`。
- 纯 JS 无构建步骤；`lib/client.js` 按 dsh ModuleLoader 的 lazy-CJS factory 格式手写。

## 许可证

[MIT](LICENSE)
