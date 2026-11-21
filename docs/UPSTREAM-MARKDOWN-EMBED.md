# 上游提案：Markdown 受信嵌入扩展点（草案 v1）

> 状态：2026-11-13 已拆分为独立插件包 `miopiik-iui`（`0.1.0-rc.11` prerelease），本地 Web profile 已通过真实回放验收；聊天内联渲染当前仍使用版本耦合的实验性 `ui-chat` fork（挂载后浏览器开关默认开启，可在插件设置页关闭），上游 PR 尚未提交。本文记录面向 DSH 上游的接口提案与当前本地 fork 的实现细节；日常安装步骤以 [`README.md`](../README.md) 为准。
> 目标：允许插件将**受信任的声明式嵌入组件**挂载进 DSH 原生 Markdown 渲染流，同时保持 `assistant-step` 与 `ReasoningRow` 的原生所有权。
> 非目标：不改变标准 Markdown 语法语义、不执行模型输出的 HTML/JS/CSS、不改动会话日志格式。

## 1. 宿主现状核对

| 事实 | 代码位置 |
|---|---|
| `conversation.chat.node` 是按键名互斥的 keyed 槽，注册同名 key 会替换整个 `ChatNodeKind` 渲染器 | `dsh-client-ui-chat/lib/types/client/contract/slots.d.ts` |
| 替换 `assistant-step` 后，原生 `ReasoningRow`（折叠壳、摘要、流式状态、无障碍属性）不再参与该行渲染 | 同上 + `ReasoningRow.d.ts` |
| `conversation.chat.reasoning.body` 仅替换思考展开区域；`conversation.chat.reasoning.content` 为思考内容工厂槽 | 同上 |
| 结论：DSH `0.2.2-rc.1` 尚未暴露「仅替换正文内匹配的 Markdown 片段、其余保持原生渲染」的公开插件接口 | — |

## 2. 建议的最小上游接口

在 Markdown 渲染管线（`dsh-client-ui-primitives` 的 `MarkdownText` 或其上游）增加一个**嵌入渲染器注册表**，仅将匹配到的代码块或行内 token 交给插件处理，其余节点保持原生路径：

```ts
/** 嵌入组件只接收自身节点的纯数据，不接收整条消息实例。 */
interface MarkdownEmbedProps {
  /** 解析后的 AST 片段（插件自定义的 JSON 可序列化纯数据） */
  value: unknown
  /** 原始文本，用于降级显示与复制 */
  raw: string
  /** 宿主提供的运行环境（主题模式、语言环境） */
  context: { mode: 'light' | 'dark'; locale: string }
}

interface MarkdownEmbedRegistration {
  /** 命名空间，冲突时报错退出 */
  namespace: string
  kind: 'block' | 'inline'
  /**
   * 仅匹配 fenced code block 的 info string（block）或行内 `{{ns:...}}`（inline）。
   */
  match: (token: { lang?: string; info?: string; text?: string }) => boolean
  /**
   * 解析为受信数据；返回 null 表示交回原生 Markdown。
   * 解析失败返回 null 或 { ok: false, reason }，不向宿主渲染管线抛出未捕获异常。
   */
  parse: (raw: string) => { ok: true; value: unknown } | { ok: false; reason: string }
  /** 渲染：返回 React 元素或字符串，禁止 innerHTML / eval。 */
  render: (props: MarkdownEmbedProps) => React.ReactNode
  /** 解析失败或渲染异常时的降级节点（默认渲染 raw） */
  fallback?: (raw: string, reason: string) => React.ReactNode
}
```

插件注册入口：

```ts
ctx.markdownEmbeds.register(registration): () => void   // 返回 disposer
```

### 兼容与容错要求

- 未注册任何 embed 时：行为与现有原生 Markdown 完全一致（围栏块按代码显示，行内标记按纯文本显示）。
- 解析失败或渲染抛错时：**仅降级当前片段**，同一消息内的其余 Markdown 内容不受影响。
- 流式输出：未闭合片段先按纯文本显示，闭合后渲染为组件。
- 历史回放：会话日志仅保存原始 Markdown 文本，前端按当前注册表实时渲染，无需迁移历史数据。
- 无障碍：嵌入组件自带 ARIA 语义角色，外层容器保持原有的选中复制与焦点管理。

## 3. 建议的上游改动范围

1. `dsh-client-ui-primitives`：`MarkdownText` 增加可选属性 `embeds?: MarkdownEmbedRegistration[]`，在 AST 转 React 节点时优先匹配 `embeds`，未命中则走原生分支。
2. 同包新增类型声明 `types/client/markdown-embeds.d.ts`。
3. `dsh-client-ui-chat`：将插件注册表通过 context 传递给 `MarkdownText`。
4. 保持 `conversation.chat.node`、`ReasoningRow` 与会话日志事件结构不变。

**验收判据**：安装插件后，原生思考折叠、复制、图片、流式输出与历史回放保持不变，仅被 `match` 命中的片段渲染为插件组件。

## 4. 演进阶段

| 阶段 | MiOpIIk IUI 侧 | DSH 上游 |
|---|---|---|
| A（已完成） | 实现 `iui/1` AST 校验器、组件注册表与插件页/设置页预览 | — |
| B（当前过渡态） | 通过 `tools/fork-chat-embeds.mjs` 生成本地 `ui-chat` 补丁，挂载 `AssistantMarkdown` 文本分支钩子 | 待评估第 2 节接口 |
| C（已完成） | 模型默认输出 `miopiik-ml`；旧 `ink-view` 七 Widget 协议退役并转入只读 legacy adapter | — |
| D（待上游支持后） | 切换至上游正式 `markdownEmbeds` 接口，移除本地 `ui-chat` 补丁生成与软链步骤 | 发布官方接口或独立 `primitives` 包 |

## 5. 本地实验补丁实现（当前方案）

### 5.1 宿主依赖树结构（基于 DSH `0.2.2-rc.1` 核对）

| 项 | 核对结果 |
|---|---|
| `profiles/web/node_modules/@deepseek-ai/dsh-client-ui-chat` | 默认软链至全局安装目录 `.../dsh/node_modules/@deepseek-ai/dsh-client-ui-chat`（`0.2.2-rc.1`），含预构建 `lib/`、`lib/types` 与 `locale` |
| `dsh-client-ui-primitives` | 运行时由前端主 bundle 注入，磁盘上无独立可修改的源码包 |
| DSH Web 前端加载方式 | `/assets/index-*.js` 为预构建主包；`dsh-client-ui-chat` 作为客户端插件由服务端动态加载其 `lib/client.js` |
| 落地方式 | 不修改全局 DSH 安装目录；通过脚本在仓库本地生成带钩子的 `ui-chat` fork，并仅在目标 profile 的 `node_modules` 下替换软链 |

### 5.2 交付组件

1. `tools/fork-chat-embeds.mjs`：将已安装的 `dsh-client-ui-chat` 复制到 `upstream/dsh-client-ui-chat-embeds/`（生成物，已 gitignore），在 `AssistantMarkdown` 的 `case "text"` 分支插入一处挂钩，其余代码与上游逐字节一致；生成后自动执行 `node --check`，并将差异写入 `patches/chat-markdown-embeds.patch`。
2. `shared/markdown-segments.js`：无状态切分器，识别 ```iui / ```ink-view 围栏与 `{{badge:...}}`、`{{icon:...}}`、`{{code:...}}` 行内 token；未闭合或格式非法的标记按原文本保留。
3. `client.js`：在浏览器端注册 `globalThis.__miopiikMarkdownEmbeds`（提供 `segments`、`renderInline`、`renderBlock`）。

### 5.3 运行性质

- **保留原生组件所有权**：`AssistantMarkdown`、`ReasoningRow`（折叠、摘要、流式、无障碍）、图片、附件与断点回放仍由 DSH 原生组件负责，挂钩仅替换 `text` 节点中被受信标记命中的片段。
- **浏览器级开关**：挂载 fork 后默认启用渲染；当 `localStorage['miopiik.markdownEmbeds'] === '0'` 或在设置页关闭开关时，挂钩直接返回 `null` 并走原生渲染分支。
- **局部降级**：当 `segments` 返回 `null`、注册表未加载或渲染抛错时，仅将当前片段回退为带 `data-miopiik-embed-fallback` 属性的纯文本节点。

### 5.4 Profile 挂载与回滚命令

**仅修改目标 profile（如 `web`）下的软链，保持全局 DSH 安装目录与其他 profile 不变：**

```bash
# 1) 生成并校验本地 fork（需已安装 DSH，可用 MIOPIIK_DSH_DIR 指定路径）
node tools/fork-chat-embeds.mjs
node tools/fork-chat-embeds.mjs --check

# 2) 在目标 profile 目录下备份原链接并指向本地 fork
cd ~/.dsh/profiles/web/node_modules/@deepseek-ai
[ -e dsh-client-ui-chat ] && mv dsh-client-ui-chat dsh-client-ui-chat.bak
ln -s <本仓库根>/upstream/dsh-client-ui-chat-embeds dsh-client-ui-chat

# 3) 确认无运行中任务后重启 dsh-web 服务
# 4) 如需在浏览器控制台显式切换：
localStorage.setItem('miopiik.markdownEmbeds', '1'); location.reload()
```

**关于 `fork/node_modules` 依赖链接**：Node 按包目录向上解析依赖，`upstream/dsh-client-ui-chat-embeds/` 需要访问 `@deepseek-ai/schemastery` 等宿主依赖。`tools/fork-chat-embeds.mjs` 会在生成时创建 `fork/node_modules -> <DSH 安装目录>/node_modules` 软链，并在 `--check` 模式下只读校验该链接是否有效。

**回滚方式**：

```bash
# 方式一：恢复 profile 原软链并重启服务
cd ~/.dsh/profiles/web/node_modules/@deepseek-ai && mv dsh-client-ui-chat.bak dsh-client-ui-chat

# 方式二：仅在当前浏览器关闭接管（无需重启服务）
localStorage.setItem('miopiik.markdownEmbeds', '0'); location.reload()
```

### 5.5 实机验证记录（2026-11-12）

- profile 软链解析与 `dsh-web` 服务启动正常。
- 在隔离 headless Chromium 中：`window.__miopiikMarkdownEmbeds` 正常挂载，行内分词结果为 `[text, inline, text, inline]`，页面控制台 JS error 为 `0`。
- 对同一会话中的原生 `[data-variant=think]` 思考块执行真实点击，`aria-expanded` 按 `false → true → false` 正常切换。
- 画廊三展区历史回放与本地 `segmented` 状态切换通过 `tools/e2e-gallery-replay.mjs` 验收。

### 5.6 已知限制（Stable Blocker 来源）

1. **版本耦合的实验性补丁**：生成脚本依赖 DSH `0.2.2-rc.1` 中 `AssistantMarkdown` 的代码锚点；上游升级改变结构时脚本会报错退出，需重新适配锚点并生成 fork。
2. **跨 token Markdown 有损**：
   - 行内 token 跨越 Markdown 强调语法（如 `**加粗 {{badge:x}} 继续**`）时，两侧文本被切分为独立片段，加粗在 token 处断开；
   - 行内片段通过外层 flex 容器（`data-miopiik-segments="inline"`）排布，块级 IUI 组件通过 `data-miopiik-block-wrap`（`flex-basis: 100%`）占满整行（实测宽度 680/680 px），但底层仍由多个独立 `MarkdownText` 组成，段落间距、跨片段复制选区（可能带出换行）与屏幕阅读器朗读顺序与单节点 Markdown AST 存在差异；
   - 彻底消除该差异需等待上游开放 `MarkdownText` 的 remark/renderer 级扩展点或独立发布 `dsh-client-ui-primitives` 包。
3. **流式非增量**：流式输出期间，未闭合的 `iui` 围栏按纯文本显示，收到闭合围栏后一次性渲染为组件。
