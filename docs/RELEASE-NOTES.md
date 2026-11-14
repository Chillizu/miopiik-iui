# MiOpIIk IUI — Release Notes

`miopiik-iui` 是 DeepSeek Harness（DSH）Web 的**纯表现层**插件：模型在普通 Markdown 中输出受信行内 token 与受控 `iui` 围栏，浏览器侧将其渲染为声明式组件。本包独立于 MiOpIIk Agent，可单独安装。

> **当前版本 `0.1.0-rc.5` 为 prerelease（预发布 / release candidate），属于独立实验性插件，而非 stable 版本或 DSH 上游内置功能。** 聊天内联渲染依赖对 `@deepseek-ai/dsh-client-ui-chat` 的非官方、版本耦合补丁；未加载该补丁时，聊天中的 `iui` 围栏按普通代码块显示，仅插件页与设置页预览可用。

## miopiik-iui 0.1.0-rc.5 — prerelease

**状态**：prerelease（预发布），四项 stable blocker 仍未解除（非官方 chat 包补丁、跨 token Markdown 有损、流式非增量、无多版本兼容矩阵）。

- **设置页职责调整**：插件页保留介绍与真实渲染器预览；真实设置入口移入 DSH「设置 → 内置插件」。
- **文档细化**：中英文 README 与当前文档改为直接陈述，移除防御性话术与装饰性比喻；新增渲染管线矢量图 `docs/images/iui-pipeline.svg`，README 顶部补图标。
- **运行时不变**：渲染器、校验器、legacy `ink-view` 只读回放与宿主补丁生成逻辑均未改动；与 MiOpIIk Agent 仍互不依赖。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.5.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。
- **验证**：`npm test`（67 项）、`npm run check`、`npm run build:check`、`npm run icon:check`。

## miopiik-iui 0.1.0-rc.4 — prerelease

本版本在拆分后的独立仓库 `Chillizu/miopiik-iui` 发布；运行时代码与 monorepo 时期的 `miopiik-iui` `0.1.0-rc.4` 一致，并在仓库根目录补齐独立的测试、工具、文档与 CI（拆分溯源见 [MIGRATION.md](MIGRATION.md)）。

### 本版内容

- **独立仓库结构**：仓库根即包根（`package.json` 与 `index.js` 同级），零第三方运行时依赖，`npm test`、`npm run check`、`npm run build:check` 与 `npm run icon:check` 均可在干净 checkout 中离线通过。
- **旧展示层退役**：原 `ink-view` 七 Widget 协议已退役，不再注册模型侧展示工具。
- **历史数据只读回放**：历史数据零迁移，由 `shared/legacy-widgets.js` 将旧 fenced `ink-view` JSON 只读映射为 `iui/1` AST 回放；无法映射的 spec（如 mermaid）保留原始文本显示（不使用旧 spec 的 `fallback` 字段），不写回账本。
- **浏览器本地开关**：挂载 fork 补丁后默认启用聊天内受信嵌入渲染；可在 **设置 → 内置插件 → MiOpIIk IUI** 关闭（对应当前浏览器 `localStorage["miopiik.markdownEmbeds"] = "0"`），关闭后消息恢复为原生 Markdown 显示。
- **宿主补丁状态诊断**：设置页显式展示「实验性 DSH Chat Markdown 补丁（已加载）」或「未检测到补丁 · 仅设置页预览可用」。
- **安装与发布校验脚本**：
  - `tools/install-plugin.mjs`：支持 `link` 与 `tarball` 两种安装模式，默认 dry-run，拒绝在未确认时写入运行中的 `web` profile。
  - `tools/check-release.mjs`：执行真实 `npm pack`、解包、语法检查与运行时 import 图比对。
  - `tools/icon-check.mjs`：静态校验根 `icon.svg`。
- **包元数据与文档**：补齐 `repository`、`homepage`、`bugs`、`keywords` 及独立版 [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md)、[MIGRATION.md](MIGRATION.md)、[DEV-TOOLS.md](DEV-TOOLS.md)、[EXTRA-UI.md](EXTRA-UI.md)、[IUI-V1-RELEASE-CANDIDATE.md](IUI-V1-RELEASE-CANDIDATE.md)、[IUI-NATURAL-OUTPUT-AUDIT.md](IUI-NATURAL-OUTPUT-AUDIT.md)、[UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)。

### 升级为 0.1.0 stable 的四项 blocker

1. **非官方、版本耦合的 `@deepseek-ai/dsh-client-ui-chat` patch**：聊天内联渲染需将 profile 的 `ui-chat` 解析指向由 `tools/fork-chat-embeds.mjs` 基于特定 DSH 版本（`0.2.1-rc.5`）生成的本地 fork；标准插件安装流程本身无法自动挂载该钩子。
2. **跨 token Markdown 有损**：切分式嵌入会将 Markdown 文本节点切开，跨越 token 边界的加粗/斜体格式会断开，选中复制与屏幕阅读器朗读顺序与单节点原生 Markdown 存在差异（需 DSH 上游提供 Markdown AST 级扩展点，提案见 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)）。
3. **流式非增量**：未闭合的 `iui` 围栏在流式输出期间按普通文本显示，闭合后一次性渲染。
4. **无多版本矩阵与冷启动全链路验证**：当前仅针对 DSH `0.2.1-rc.5` 基线验证，尚未建立跨多个 DSH 版本的兼容矩阵与干净 profile 冷启动（安装 → 启动 → 渲染 → 卸载）全链路验证。

### 解除 blocker 的条件清单

- [ ] DSH 上游提供官方 Markdown embed / renderer 扩展点（或将 `dsh-client-ui-primitives` 作为独立可解析包发布）；
- [ ] 或 IUI 内联渲染改用无需宿主 patch 的官方扩展机制；
- [ ] 跨 token Markdown 排版、复制与无障碍朗读通过验收；
- [ ] 建立多版本兼容测试矩阵并完成干净 profile 冷启动全链路验证。

在上述 blocker 解除前，版本保持 `0.1.0-rc.x`（prerelease）。

## 范围与安全边界

- 独立于 MiOpIIk Agent（Mind / Ink / Operator），可单装或同装。
- 禁止任意 HTML、JavaScript 与 CSS；`segmented` 等组件仅修改当前消息内的本地 React 状态，不发起网络请求，不触发模型回合。
- 历史会话与账本数据零迁移、不改写，旧 `ink-view` 内容仅在渲染层只读回放。
