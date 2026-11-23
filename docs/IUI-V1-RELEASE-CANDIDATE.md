# MiOpIIk IUI v1 — 稳定候选基线与交付门禁

> 初稿 2026-11-12，更新 2026-11-23。本文覆盖独立插件包 **MiOpIIk IUI**（`miopiik-iui` `0.1.1` stable）。
> 当前状态：**已发布正式版（`0.1.0`）**。发布时仍有两项限制未消除（非官方宿主补丁、无多版本矩阵），由维护者决定带着它们发布，转为已知限制；跨 token Markdown 有损与流式非增量已于 `0.1.0-rc.12` 解除（详见第 3 节与 [RELEASE-NOTES.md](RELEASE-NOTES.md)）。
> 实际质量状态以当前 Git HEAD 与每次执行测试的结果为准。

## 1. 落定的技术边界

- **面向模型的语法**：以 `miopiik-ml`（````iui` 围栏）作为首选格式，`iui/1` JSON AST 保留为调试与兼容入口。两者统一进入 `iui/1` AST、`validateAst` 与受控 React 组件注册表，阻断任意 HTML、CSS 与 JavaScript。
- **样式与交互权限**：模型仅可声明语义 `tone`、受限布局参数、结构化数据、本地状态初值与路径绑定；主题颜色、间距、事件处理与安全预算由客户端渲染器统一控制。
- **本地状态绑定**：`$state.foo.bar` 与 `$data.foo.bar` 仅做点号路径读取，不支持脚本表达式；`segmented` 等交互仅更新当前消息内的本地状态，不触发工具调用、网络请求或模型回合。
- **聊天层职责划分**：DSH 原生 `AssistantMarkdown` 与 `ReasoningRow` 负责消息主干、思考折叠、图片与历史；独立的 `miopiik-iui` 插件仅渲染受信行内 token 与 fenced `iui` 片段。MiOpIIk Agent 不再接管聊天消息行。
- **宿主补丁机制**：聊天内联渲染当前基于本地生成的 `dsh-client-ui-chat` fork 与 Web profile 软链覆盖，属于非官方、版本耦合的实验性补丁，尚未合入 DSH 上游 API。安装与回滚步骤见 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)。
- **旧展示协议退役**：`ink_view` 与 `ink_chart` 工具已从模型工具面移除，历史 `ink-view` 协议已退役；历史会话数据零迁移，由 `shared/legacy-widgets.js` 只读映射回放，无法映射的 spec 保留原始文本（不使用旧 spec 的 `fallback` 字段），不写回账本。

## 2. 已验证的 RC 能力

| 维度 | 证据与边界 |
|---|---|
| 真实画廊兼容 | 三份画廊样本固定于 `test/fixtures/gallery/`，解析与校验零非预期降级 |
| 行内与块级表达 | 支持 `badge`、`icon`、`code` 行内 token，以及 `paragraph`、`card`、`grid`、`table`、`chart`、`metric` 等块级组件 |
| 表格归一 | 兼容列描述符 + 对象行与二维数组，真实回放不出现 `[object Object]` |
| 本地状态切换 | 支持 `state name/value`；本地 `segmented` 切换可实时更新绑定的指标与图表，不产生模型消息 |
| 原生兼容 | 开启 fork 时，历史画廊会话回放完整展示三展区，原生 `ReasoningRow` 正常展开与折叠 |
| 错误隔离 | 非法子树局部降级，非法根节点回退为 `fallback` 文本，不影响同条消息中的其余原生 Markdown |

回归验证命令：

```sh
npm test
node tools/fork-chat-embeds.mjs --check
node tools/e2e-gallery-replay.mjs
node tools/e2e-iui-user-sessions.mjs
node tools/e2e-playwright.mjs
node tools/e2e-dual-settings.mjs
```

后四条脚本需配合运行中的本地 DSH Web 与隔离 Playwright 浏览器执行，且仅做只读回放与本地 DOM 交互，不向既有主会话发送测试消息。

### RC 验收门禁清单

1. `npm test` 全部通过，`node tools/fork-chat-embeds.mjs --check` 通过，工作树变更可审计。
2. 画廊回放：页面渲染三个 `data-iui-output` 展区，表格、徽章与指标完整，零非预期降级、零控制台 JS 错误。
3. 本地状态交互：真实 DOM 点击切换后，7 日 `12,480` 更新为 30 日 `48,296`，且不触发新消息。
4. 原生思考折叠：`[data-variant=think] [role=button]` 的 `aria-expanded` 可正常展开并恢复原状态。
5. 历史会话与旧 `ink-view` 内容保持可读回放，不丢失正文。
6. 更新或重启服务前确认无运行中任务，并完成 profile 备份与 import 校验。
7. 端到端测试统一在隔离浏览器或独立测试会话中进行，不向既有主会话写入测试消息。

## 3. Stable Blocker（尚未纳入本 RC 的范围）

| 项目 | 现状 | 关闭条件 |
|---|---|---|
| 公共上游集成（脱离非官方补丁） | 聊天内联渲染依赖版本耦合的本地 `@deepseek-ai/dsh-client-ui-chat` patch（针对 DSH `0.2.2-rc.1`） | DSH 上游提供官方 Markdown embed / renderer 扩展点，或 `dsh-client-ui-primitives` 作为独立可解析包发布 |
| 跨 token Markdown 无损排版 | **已解除（rc.12）**：改为 DOM 级嫁接——原生 Markdown 先渲染整段，再把行内 token 原位替换，加粗/斜体、选中复制与朗读顺序跨 token 保留；残余：仅定稿态嫁接、极端长段落未压测 | 残项：流式中间态的复制/无障碍验收、极端长段落性能 |
| 流式增量渲染 | **已解除（rc.12）**：`iui` 围栏开启后逐段成形、闭合定稿、无入场动画；`html` 沙箱围栏按设计闭合才成块 | 残项：`html` 围栏流式与中断恢复 E2E |
| 多版本兼容与全量矩阵 | 仅在 DSH `0.2.2-rc.1` 及基础深色/窄屏环境下验证 | 建立跨 DSH 版本兼容测试矩阵、干净 profile 冷启动全链路验证，以及完整的明/暗/高对比度与屏幕阅读器测试矩阵 |
| 同模型输出格式 A/B 基准 | `index.js` 已注入精简输出约定，但尚未完成同模型、同任务的定量对比 | 在普通问答、数据对比、交互趋势三类任务上完成合法率、降级率与 token 开销基准测试 |

`0.1.0` 已在上述两项限制未消除的情况下发布（维护者决定）：它们不再是发布门槛，但仍是安装与兼容承诺上的已知限制；后续版本继续按「解除一项、记录一项」推进。跨 token Markdown 有损与流式非增量已于 `0.1.0-rc.12` 解除。

## 4. 启用与回滚

- 安装 `miopiik-iui` 并挂载 fork 后默认启用受信 IUI 嵌入；可在 **设置 → 内置插件 → MiOpIIk IUI** 查看诊断状态并切换本浏览器的渲染开关。
- **快速关闭（无需重启服务）**：在设置页关闭渲染开关（对应当前浏览器 `localStorage["miopiik.markdownEmbeds"] = "0"`），刷新页面即可恢复为原生 Markdown。
- **完整回滚**：按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 移除插件并恢复 Web profile 的 `ui-chat` 原软链，随后重启 DSH Web。保持全局 DSH 安装与其他 profile 不变。
- `node tools/fork-chat-embeds.mjs --check` 为只读校验；重新生成 fork 会重建 `upstream/dsh-client-ui-chat-embeds/` 目录，请仅在无运行中任务加载该目录时执行。

## 5. 后续工作队列

1. **P0（可靠性）**：维护 E2E 交互与思考折叠回归、状态与表格安全预算校验、补丁状态诊断及跨版本 fork 自检。
2. **P1（原生体验）**：保持混合 Markdown 与块级 IUI 组件的全宽排版（`flex-basis: 100%`）；推进上游 Markdown AST 级扩展点以解决跨 token 语法、复制与流式增量渲染。
3. **P2（版本与基准）**：补齐同模型多场景 benchmark、跨 DSH 版本兼容矩阵与干净 profile 冷启动全链路验证。
4. **P3（生态对接）**：对接上游正式插件接口，收敛并稳定核心声明式组件集。
