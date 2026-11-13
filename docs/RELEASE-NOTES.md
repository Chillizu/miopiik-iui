# MiOpIIk IUI — Release Notes

`miopiik-iui` 是 MiOpIIk 家族的**纯表现层** DSH Web 插件：模型在普通 Markdown 里写受信行内
token 与受控 `iui` 围栏，浏览器侧把它们渲染成声明式组件。它不依赖 MiOpIIk Agent，可单独安装。

> **当前版本 `0.1.0-rc.4` 是 prerelease（预发布 / release candidate），不是 stable，也不是
> DSH 上游功能。** 内联渲染依赖一个非官方、版本耦合的实验性 `@deepseek-ai/dsh-client-ui-chat`
> 补丁；未打补丁时聊天里只会看到 `iui` 代码块，只有插件设置页预览可用。

## miopiik-iui 0.1.0-rc.4 — prerelease, NOT stable

本版本在拆分后的独立仓库 `Chillizu/miopiik-iui` 继续交付；包内容与 monorepo 时代的
`miopiik-iui` rc.4 一致，仓库级测试/工具/文档补到根目录（拆分溯源见
[MIGRATION.md](MIGRATION.md)）。

### 本版内容

- **独立包**：仓库根即包根（`package.json` 与 `index.js` 同级），零运行时依赖，
  `npm test` / `npm run check` / `npm run build:check` 可在干净环境运行。
- **旧展示层退役**：Agent 包内已无引用的旧 `renderer` / DSL / spec 校验器死代码被清理；
  历史 `ink-view` 七 Widget spec 不会复活为模型面工具。
- **旧数据只读兼容**：`shared/legacy-widgets.js` 把历史 fenced `ink-view` JSON 只读映射成
  `iui/1` AST 后回放；无法映射的类型（如 mermaid）按原始文本保留显示（当前渲染路径不使用旧 spec 的 `fallback` 字段）。
- **默认开启渲染**：安装独立 IUI 后，打上 fork 补丁的聊天默认渲染受信嵌入；在
  **插件 → 已安装 → MiOpIIk IUI** 的配置页可关闭（仅当前浏览器、
  `localStorage["miopiik.markdownEmbeds"] = "0"`）。关闭后历史消息回原生 Markdown，不改数据。
- **宿主补丁诊断**：设置页显示“实验性 DSH Chat Markdown 补丁（已加载）”或
  “未检测到补丁 · 仅设置页预览可用”，不再静默失效。
- **安装脚本修复**：`tools/install-plugin.mjs` 的 tarball 模式按 `package.json` 版本生成真实
  产物名并在 `--execute` 下真正调用 `dsh plugin add`；任何占位符残留都会失败，不再静默跳过。
- **发布检查**：`tools/check-release.mjs` 真实 `npm pack` + 解包 + `node --check` + import 图
  覆盖检查；`tools/icon-check.mjs` 静态校验根 `icon.svg`（用户设计原稿不随仓库分发）。
- **元数据**：`repository` / `homepage` / `bugs` / `keywords` 指向独立仓库，移除 `private`。
- **文档**：独立版 [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md)、[MIGRATION.md](MIGRATION.md)、
  [DEV-TOOLS.md](DEV-TOOLS.md)，以及历史设计文档 [EXTRA-UI.md](EXTRA-UI.md)、
  [IUI-V1-RELEASE-CANDIDATE.md](IUI-V1-RELEASE-CANDIDATE.md)、
  [IUI-NATURAL-OUTPUT-AUDIT.md](IUI-NATURAL-OUTPUT-AUDIT.md)、
  [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)。

### 为什么仍是 rc，而不是 0.1.0 stable

1. **内联渲染依赖非官方 patch**：需要把 profile 里的 `@deepseek-ai/dsh-client-ui-chat`
   替换成本仓库生成的 fork。这不是可发布包能自我声明的安装方式；普通用户按标准流程安装后
   聊天里**看不到**内联 IUI（只看到代码块），与产品承诺不一致。
2. **跨 token 的 Markdown 无损混排未完成**：切分式嵌入会打断跨标记的强调，复制可能带出
   额外换行。正解是 Markdown AST 级嵌入，需要 DSH 上游扩展点
   （提案见 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)）；本机核实
   `dsh-client-ui-primitives` 仅以 bundle 形式存在，插件无法 fork。
3. **流式非增量**：围栏闭合后才物化。
4. **尚未做一次干净的 profile 冷启动安装验证**（安装 → 启动 → 渲染 → 卸载全链路）。

### 升级为 0.1.0 stable 的条件（blocker 清单）

- [ ] DSH 提供官方 Markdown embed / renderer 扩展点（或把 primitives 作为可解析包发布）；
- [ ] 或 IUI 的内联能力改为不依赖宿主 patch 的官方机制；
- [ ] 跨 token Markdown 与复制行为达到可接受水平（或文档化为“仅行内原子标记”并默认关闭）；
- [ ] 完成一次干净的 profile 冷启动安装验证（安装 → 启动 → 渲染 → 卸载）。

在上述 blocker 全部解除前，版本保持 `0.1.0-rc.x`，不发布 stable。

## 不包含 / 边界

- 不包含 MiOpIIk Agent 的 Mind / Ink / Operator 功能；Agent 与 IUI 可同装，但互不依赖。
- 不允许任意 HTML / JavaScript / CSS；IUI 控件不发起网络请求，也不触发模型回合。
- 不迁移、不删除旧会话数据；历史兼容只在渲染层只读映射。
