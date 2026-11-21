# MiOpIIk IUI — Release Notes

`miopiik-iui` 是 DeepSeek Harness（DSH）Web 的**纯表现层**插件：模型在普通 Markdown 中输出受信行内 token 与受控 `iui` 围栏，浏览器侧将其渲染为声明式组件。本包独立于 MiOpIIk Agent，可单独安装。

> **当前版本 `0.1.0-rc.9` 为 prerelease（预发布 / release candidate），属于独立实验性插件，而非 stable 版本或 DSH 上游内置功能。** 聊天内联渲染依赖对 `@deepseek-ai/dsh-client-ui-chat` 的非官方、版本耦合补丁；未加载该补丁时，聊天中的 `iui` 围栏按普通代码块显示，仅插件页预览可用。

## miopiik-iui 0.1.0-rc.9 — prerelease

**状态**：prerelease，四项 stable blocker 未变；本版为泳道图 + 配置归位包，架构与理念未动。

- **泳道图（本版主题，挑战「复杂图走静态图片」）**：新增 `diagram`/`lane`/`node`/`edge` 四个白名单原语——lane 是显式列，散落的 `node` 按出现顺序汇成首列（单列即纵向流程），`edge` 是唯一的方向性原语（`solid`/`dashed`），`diagram` 内纯文本行按注释渲染。**灵活原语而非图种穷举**：链路图、流程图、状态图、多列泳道均由同一组原语自由组合。渲染用确定性几何（等宽列 + 定高药丸），箭头按坐标自动布成贝塞尔曲线，无需运行时测量、回放不漂移；坏 id/重复 id/未知引用只局部降级该节点或该边，预算 6 列 / 24 节点 / 24 连线。「静态图像交付物」降级为自由美术专用。
- **配置归位（用户裁决）**：撤销 rc.5 的双面拆分——真实渲染开关、实时预览、状态行（版本 · 宿主补丁 · 渲染器）与可复制示例全部收进 **插件 → 已安装 → MiOpIIk IUI** 单面；不再注册 `settings.plugins.tab` 页签，页面砍掉说明小作文，只留可调项与想看的状态。
- **章程**：目录新增「图形」一行（泳道/链路/流程语法与预算），选型口诀补「结构图用 diagram」。
- **验证**：单测 + 画廊样本 `zone5-diagram` + 真实 Chromium DOM 断言（两列泳道、节点 id 标记、连线无障碍摘要、虚线 path、注释行），测试 82 项全绿；`npm run check` / `build:check` / `icon:check` 通过。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.9.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。

## miopiik-iui 0.1.0-rc.8 — prerelease

**状态**：prerelease，四项 stable blocker 未变；本版为动效定妆包，架构与理念未动。

- **动效与手感（本版主题）**：整个交互面此前只有 toggle 拨钮一处 120ms 过渡，其余硬切；本版补齐——
  - 插件注入一段**固定的**定妆样式（`<style id="miopiik-iui-chrome">`，约 6 行 keyframes/hover，随插件生命周期挂载与清理；模型仍然禁止输出 CSS）；
  - 块级与 `when` 显隐内容挂 `miopiik-enter` 入场淡入（140ms ease-out），segmented 切换视图不再是硬切蹦现；
  - segmented 选中换色与 toggle 底色加 `background/border/color .12s` 过渡，progress 宽度加 `.18s` 过渡（拖滑杆时进度条跟手）；
  - 交互按钮挂 `miopiik-ctl`，获得 hover/active 的亮度反馈；全量尊重 `prefers-reduced-motion`（减少动效偏好下动画与悬停反馈全部关闭）。
- **验证**：真实 Chromium DOM 断言新增四条（定妆样式在位、入场类挂载、reduced-motion 规则、ctl 类），测试 78 项全绿；`npm run check` / `build:check` / `icon:check` 通过。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.8.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。

## miopiik-iui 0.1.0-rc.7 — prerelease

**状态**：prerelease，四项 stable blocker 未变（非官方 chat 包补丁、跨 token Markdown 有损、流式非增量、无多版本兼容矩阵）；宿主补丁随本版重新生成，锚定 DSH `0.2.2-rc.1` 的 chat 包。

- **本地交互自由度（本版主题）**：交互收敛为一个模型——**控件写 `$state`，其余读 `$state`**。新增 `toggle`（布尔）、`slider`（数值）、`input`（文本）三个本地控件；任意组件可写 `when="$state.*"`（可配 `is="值"` 做等值切换）按本地状态控制显隐；`table` 支持 `filter="$state.*"` 浏览器内文本过滤。全部交互只在浏览器内生效，不产生消息、不调用工具；「要用户做决定的事仍用对话提问，不要在卡片里造提交表单」写进章程。
- **模板广度**：`chart` 放行 `donut` 占比图（含图例；渲染器自旧版已内置，本版解除校验器封禁，legacy 回放同步如实恢复）；新增 `steps`/`step` 过程清单模板（仅接受 step 子节点、`title` 必填、tone 共用六色枚举）；`grid columns` 2-6 落实为真实固定列（此前文档承诺但渲染忽略）；行内图标补齐全部 11 个字形（此前 6 个退化为圆点）。
- **契约修复**：`progress.value` 此前只收字面数字、拒绝 `$state` 绑定，与「任意属性可绑定」的章程承诺不符；本版放行绑定并在渲染时解析为数字。
- **章程（render-contract）重写**：理念两句与预算/禁令原样保留；目录行补全已实现的自由度（card span、表格对象行、序列三形态、链接站内/锚点）；交互段改为「控件写、内容读」单模型；新增选型口诀（对比与账目用 table、趋势用 line、占比用 donut、过程用 steps）与第四个完整形状「本地小应用」（segmented 切换 donut/steps、toggle 控表格显隐、input 过滤明细）。
- **插件页预览升级**：实时预览与可复制示例改为带 toggle/input/本地过滤表格的小应用；新增画廊样本 `zone4-controls` 与真实 Chromium DOM 断言（donut、steps、toggle、slider、progress 绑定、input、过滤标记逐一验证）。
- **宿主补丁同步**：`patches/chat-markdown-embeds.patch` 按上游 `@deepseek-ai/dsh-client-ui-chat` `0.2.2-rc.1` 重新生成（上游 `AssistantMarkdown` 新增 `textInteractionSource` 形参，锚点行号随之偏移）；相关文档基线同步更新为 `0.2.2-rc.1`。
- **架构不变**：三层分工（解析 → 唯一校验器 → 客户端渲染）、白名单、预算、局部降级、零运行时依赖均未改动；新组件走同一注册/校验/降级路径，外部动作仍归口工具面与提交。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.7.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。
- **验证**：`npm test`（78 项，含真实 Chromium DOM 渲染断言）、`npm run check`、`npm run build:check`、`npm run icon:check`。

## miopiik-iui 0.1.0-rc.6 — prerelease

**状态**：prerelease，四项 stable blocker 未变（非官方 chat 包补丁、跨 token Markdown 有损、流式非增量、无多版本兼容矩阵）。

- **渲染契约重写**：去掉「优先普通 Markdown」默认句与比较级触发条件，改为一句判断标准（读者是否更快看懂），用不用、用多少交回模型按内容决定；组件清单压成短句，配三个可直接照抄的完整形状（数据视图、本地切换、方案对比）。
- **示例纳入回归**：`npm test` 会从 `index.js` 抽出章程里所有完整示例，逐个跑解析与校验，示例写坏即失败。
- **自然触发探针**：新增 `tools/probe-naturalness.mjs`，6 个中性提示各开一个空白会话，按会话日志判定自发使用 IUI 的形态（围栏 / 裸 `<ui>` / 行内 token）。本版测得正向 11/15、负向对照 0/3（三轮合计）。
- **已知开销**：正向任务中约 17% 的推理字符与 IUI 相关（负向对照 1.5%）；抽查 18 条会话有 4 条出现「这是不是评测」的元推理，成因是示例编号与探针数据撞车，下一版修正措辞与探针数据后复测。
- **运行时不变**：渲染器、校验器、legacy `ink-view` 只读回放与宿主补丁生成逻辑均未改动；与 MiOpIIk Agent 仍互不依赖。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.6.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。
- **验证**：`npm test`（67 项）、`npm run check`、`npm run build:check`、`npm run icon:check`。

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
