# MiOpIIk IUI

[English](README.md) | **简体中文**

> **Version 0.1.0-rc.4 — 预发布（prerelease）。**
> 这是发布候选版本，不是 stable。它尚未在 npm 发布，不是 DeepSeek Harness 的上游功能，聊天内渲染依赖对 `@deepseek-ai/dsh-client-ui-chat` 的**非官方、版本耦合补丁**。见[发布状态](#发布状态)。

MiOpIIk IUI 是 DeepSeek Harness（DSH）Web 的纯表现层插件。模型写普通 Markdown，其中可以包含少量受信行内 token 与受控的 `iui` 围栏；浏览器把这些片段渲染成声明式界面组件。插件不依赖 MiOpIIk 的 Mind/Ink/Operator Agent，不持有账本，也不暴露模型工具。

定位刻意收窄：**只在聊天里放恰到好处的界面**。其余聊天体验（消息、思考折叠、图片、历史、流式、复制、无障碍归属）仍归 DSH。

- 行内 token：`{{badge:success:通过}}`、`{{icon:check}}`、`{{code:npm test}}`
- `iui` 围栏：内容为 `miopiik-ml` 或校验过的 `iui/1` JSON AST
- 一小份声明式组件白名单、本地状态绑定与本地 `segmented` 交互
- 旧 `ink-view` Widget JSON 的只读回放，历史会话不丢内容
- DSH 原生插件页：Overview 用真实渲染器预览，Configuration 放唯一的浏览器开关与诊断

它不是界面生成器：模型不能投递任意 HTML、JavaScript 或 CSS，消息内容也不能发起网络请求、调用工具或触发模型回合。

## 发布状态

**Version 0.1.0-rc.4** 是预发布版本。代码可用且有测试，但还不足以称为 stable：

1. **实验性宿主补丁。** 聊天内渲染需要一个本地 fork 的 `@deepseek-ai/dsh-client-ui-chat`，由 [tools/fork-chat-embeds.mjs](tools/fork-chat-embeds.mjs) 从特定 DSH 版本生成。DSH 上游没有 Markdown 嵌入 API。未打补丁时，聊天里的 `iui` 围栏按普通代码块显示；插件设置页预览仍可用，诊断也会明确说明这一点。
2. **跨 token Markdown 有损。** 受信片段会把 Markdown 文本块切开，跨越 token 边界的格式、选中复制与屏幕阅读器顺序与原生 Markdown 不完全一致。
3. **流式非增量。** 未闭合的 `iui` 围栏先按普通文本显示，闭合后整块一次性物化。

称 v1 完成所需的完整门禁清单见 [docs/IUI-V1-RELEASE-CANDIDATE.md](docs/IUI-V1-RELEASE-CANDIDATE.md)，每个版本的 stable blocker 记录在 [docs/RELEASE-NOTES.md](docs/RELEASE-NOTES.md)。这些文档是基线，不是永久健康证明。

## 与 MiOpIIk Agent 的对比

MiOpIIk 已拆分成两个独立仓库，可同装或单装，互不依赖。

| | **MiOpIIk IUI**（本仓库） | **MiOpIIk Agent** |
|---|---|---|
| 包 | `miopiik-iui` 0.1.0-rc.4，预发布 | `miopiik-dsh` 0.1.1，stable |
| 层次 | 纯表现层：浏览器侧的受信 Markdown 片段 | host 侧：记忆、治理、后台执行 |
| 主要面 | 行内 token、`iui` 围栏、声明式组件、本地状态 | `ink_*` 工具面、收件箱/事实/开环/鱼骨账本、Operator 派发 |
| 状态 | 一个浏览器本地渲染偏好 | workspace 下 `.dsh/miopiik/` 的 append-only JSONL 账本 |
| 模型工具 | 无 | 有 |
| 聊天所有权 | 原生 DSH `AssistantMarkdown` / `ReasoningRow` 继续负责 | 会话视图与插件页；不渲染 IUI |
| 安装条件 | DSH Web profile；聊天内渲染需要实验性 chat 补丁 | DSH Web profile |
| 仓库 | 本仓库 | <https://github.com/Chillizu/miopiik> |

### 仓库拆分说明

本仓库由原 MiOpIIk monorepo 用 `git subtree split -P miopiik-iui` 提取，IUI 的提交历史是真实历史。Agent 部分迁到独立仓库 <https://github.com/Chillizu/miopiik>。拆分前旧仓库的 Release tag 使用 `miopiik-iui-v...` 前缀，其资产与下载链接继续有效。历史会话数据不迁移、不改写：旧 `ink-view` 内容在渲染时只读映射（见[旧协议回放](#旧-ink-view-协议回放)）。完整迁移溯源见 [docs/MIGRATION.md](docs/MIGRATION.md)。

## 架构

```text
模型输出（普通 Markdown）
  |
  |  shared/markdown-segments.js   切出 iui / ink-view 围栏与行内 token；
  |                                其他代码围栏、行内代码原样保留
  v
  L-- shared/miopiik-ml.js         iui 围栏里的 miopiik-ml -> 原始 AST 文档
  |   （或 iui/1 JSON 围栏）       JSON AST 保留作调试/兼容入口
  v
  shared/iui-ast.js                validateAst()：组件白名单、属性、
  |                                绑定路径、预算、安全链接、局部降级
  v
  renderer.js                      React 组件注册表；主题 token、内联 SVG
  |
  v
浏览器                            只有本地 React 状态；无网络、无模型往返
```

文件与职责：

| 文件 | 作用 |
|---|---|
| [index.js](index.js) | host 半边。注入一节 system prompt（`miopiik-iui:render-contract`，order 670，关闭变量插值），内容是精简输出约定。不注册任何工具。 |
| [shared/markdown-segments.js](shared/markdown-segments.js) | 无状态切分器：围栏块 + 行内 token。模型漏写围栏时，行首顶层 `<ui>...</ui>` 也识别。 |
| [shared/miopiik-ml.js](shared/miopiik-ml.js) | 面向模型的 `miopiik-ml` 标签语法解析器，产出未校验的 AST 文档。 |
| [shared/iui-ast.js](shared/iui-ast.js) | `iui/1` 的唯一校验器：`REGISTRY` 白名单、`LIMITS`、绑定解析、表格/图表归一、局部降级。 |
| [shared/legacy-widgets.js](shared/legacy-widgets.js) | 只读适配器，把退役的七 Widget `ink-view` JSON 映射成 `iui/1`。 |
| [renderer.js](renderer.js) | 校验后 AST 的 React 渲染器，以及行内原语。原样打进 `client.js`。 |
| [settings.js](settings.js) | DSH 插件页（`plugins.bundle.config`，key `miopiik-iui`）：Overview 与 Configuration 两个视图。 |
| [client.js](client.js) | 生成的浏览器 bundle。不要手改，用 `node tools/build.mjs` 重新生成。 |
| [cordis.patch.yml](cordis.patch.yml) | DSH profile 加载插件所用的 bundle patch。 |

### 宿主侧补丁

当前 DSH 没有官方 Markdown 嵌入 API。客户端需要在聊天消息渲染器里有一个挂钩，因此本仓库交付的是补丁生成器，而不是一个会静默漂移的私有 fork：

1. [tools/fork-chat-embeds.mjs](tools/fork-chat-embeds.mjs) 把已安装的 `@deepseek-ai/dsh-client-ui-chat` 复制到 `upstream/dsh-client-ui-chat-embeds/`（生成物，已 gitignore），只在 `AssistantMarkdown` 的 `case "text"` 分支插入一个受控挂钩。
2. 它把精确差异写到 [patches/chat-markdown-embeds.patch](patches/chat-markdown-embeds.patch)，对产物执行 `node --check`，并把 fork 的 `node_modules` 链到 DSH 依赖树，保证 import 能解析。
3. 原生 `AssistantMarkdown`、`ReasoningRow`（折叠、摘要、流式、无障碍）、图片、附件、复制与回放仍归 DSH；只有被受信标记命中的文本片段交给插件。
4. 挂钩 fail-closed：插件注册表缺失、浏览器偏好关闭或渲染抛错时，片段回退到原生 Markdown 或纯文本兜底。挂钩还会置位 `globalThis.__miopiikMarkdownEmbedsHost = true`，插件页据此报告补丁是否已加载。

这**不是 DSH 上游 API**。生成器用锚点定位已安装包，结构不符时直接报错而不是产出错误补丁，因此 fork 与 DSH 版本耦合。DSH 升级后要重新生成，并且只把目标 profile 指向它；不要改全局 DSH 安装。

## 可以写什么

### 行内 token

可出现在普通段落任意位置：

| token | 含义 |
|---|---|
| `{{badge:success:通过}}` | 徽章，tone 为 `neutral`、`success`、`warning`、`danger`，后接文本。tone 可省略（`{{badge:草稿}}` 按 neutral 处理）。 |
| `{{icon:check}}` | 按名字取图标。可用：`check`、`alert`、`dot`、`arrow-right`、`spark`、`chart`、`layers`、`shield`、`clock`、`inbox`、`info`。未知名字降级为 `dot`。 |
| `{{code:npm test}}` | 行内等宽文本，payload 原样显示。 |

payload 最长 120 字符，不能含花括号或换行。其他代码围栏原样保留；行内代码里的 token 仍会被识别，这是已知局限（见[局限](#局限)）。

### `iui` 围栏

围栏 info 必须正好是 `iui`。接受两种格式：

- **`miopiik-ml`**（首选）：小型类 XML 标签语言，先编译成 AST，再校验。
- **`iui/1` JSON AST**：带 `root` 树的 JSON 对象。保留作调试与兼容入口，走同一套校验。

`miopiik-ml` 用标签表示组件、属性表示 props、JSON 表示结构化值、`$state.*` 表示绑定：

```iui
<ui title="周活跃" fallback="周一 12，周二 19">
  <state name="range" value='{"total":"31"}'/>
  <column gap="md">
    <metric label="累计" value="$state.range.total" unit="次"/>
    <chart kind="line" series='[["周一",12],["周二",19]]' source="演示数据"/>
  </column>
</ui>
```

方言要点：

- 根元素是 `<ui>`；`title` 与 `fallback` 可选。整块无法渲染时使用 `fallback`。
- `<state>` 有两种形态：`<state name="range" value='{"...":...}'/>`，或 JSON 对象正文 `<state>{"range":{...}}</state>`。
- 属性可以是引号字符串、JSON 字面量（`options='[...]'`、`rows='[...]'`）、数字、布尔值，或 `$state.*` 字符串。
- `gap` 接受 `none`、`xs`、`sm`、`md`、`lg`、`xl` 或数字。`chart` 接受 `kind="bar"` 或 `kind="line"`；旧写法 `type`/`data` 会归一为 `kind`/`series`。
- 模型漏写围栏时，行首顶层 `<ui>...</ui>` 仍按 `miopiik-ml` 解析；这是容错路径，不是文档格式。

### 组件清单

| 组件 | ML 标签 | 说明 |
|---|---|---|
| 根 | `ui` | 包裹一个块；`title`、`fallback`。 |
| 状态声明 | `state` | 声明本地初值；不是渲染节点。 |
| 文本 | `text` | 纯文本节点。 |
| 段落 | `p`、`paragraph` | 只接受行内原语：text、badge、icon、emphasis、code、link。 |
| 徽章 | `badge` | `text`、`tone`。tone：`neutral`、`success`、`warning`、`danger`、`info`、`accent`。行内与块级都可用。 |
| 图标 | `icon` | 行内原语，放在 `p`/`paragraph` 里，或作为 `empty.icon`。`name`、`label`；名字来自固定清单。 |
| 强调 | `b`、`emphasis` | 行内原语，放在 `p`/`paragraph` 里。`text`、`strong`。 |
| 代码 | `code` | 行内原语，放在 `p`/`paragraph` 里。`text`；行内等宽。 |
| 链接 | `a`、`link` | 行内原语，放在 `p`/`paragraph` 里。`text`、`href`；只接受 `https://...`、站内 `/...` 或 `#anchor`。 |
| 行/列 | `row`、`column` | 布局容器；`gap`、`align`。 |
| 网格 | `grid` | `columns` 1-6、`gap`、`align`。 |
| 卡片 | `card` | `title`、`subtitle`、`gap`、`span`、`align`；容器。 |
| 分隔 | `divider` | `label` 可选。 |
| 指标 | `metric` | `label`、`value`、`unit`、`delta`、`caption`/`note`、`tone`。值可绑定 `$state`。 |
| 表格 | `table` | `columns`（1-12 个字符串或 `{key,label}` 描述符）、`rows`（最多 200 行数组或对象）、`caption`。 |
| 图表 | `chart` | `kind` 为 `bar` 或 `line`；`series` 是点列或 `$state` 绑定；`source`。渲染为内联 SVG。 |
| 进度 | `progress` | `value` >= 0、`max` 正数、`label`、`tone`。 |
| 提示条 | `callout` | `tone`、`title`、`text`；可含子节点。 |
| 空状态 | `empty` | `text`/`title`/`description`、`icon`。 |
| 分段控件 | `segmented` | 本地控件；`bind` 必须是 `$state.*`，1-6 个选项，`label`。 |

清单由 [shared/iui-ast.js](shared/iui-ast.js) 的 `REGISTRY` 强制。未知组件类型不会被渲染。

### 本地状态与绑定

绑定只做路径读取，绝不是表达式：`$state.a.b` 与 `$data.a.b`。不做求值、不调用函数、没有 `eval`。`segmented` 只能绑定 `$state.*`；点击选项只替换这份本地值，同一消息内依赖它的节点随即重算。它不发消息、不调工具、不启动模型回合。当前客户端没有外部数据通道，`data` 作用域为空，`$data.*` 解析为缺失值；该形式保留给未来的只读数据通道。

### 旧 `ink-view` 协议回放

旧会话里可能有 fenced `ink-view`，内容是退役的七 Widget spec（`dataset`、`graph`、`timeline`、`text`、`choice`、`media`、`layout`）。渲染器在进入校验前把这些 spec 只读映射成 `iui/1`，历史消息继续显示内容而不是原始 JSON。映射是尽力而为：无法映射的 spec 保留原始文本（当前路径不显示旧 spec 自带的 `fallback` 字段），`choice` 的动作只显示为不可执行选项，不写回会话，也不写任何账本。旧协议作为退役设计史记录在 [docs/EXTRA-UI.md](docs/EXTRA-UI.md)。

### 插件页

DSH 原生插件页在 **Plugins -> Installed -> MiOpIIk IUI**，两个视图：

- **Overview**：简短说明、用真实渲染器渲染的实时预览（渲染开启时；数据为虚构演示）、行内语义徽章，以及兼容性事实（版本、协议 `iui/1`/`miopiik-ml`、接入方式、渲染器状态）。
- **Configuration**：唯一真实设置（在聊天中显示 IUI，浏览器本地）、诊断（渲染器已连接/未连接、插件版本、协议、偏好 key 与当前值、接入方式与补丁检测），以及可复制的 Markdown 示例。

运行中的 DSH shell 暴露官方 primitives 时页面使用它们，否则使用纯主题 token 元素。

### 校验、预算与错误隔离

校验集中在 `validateAst`：

- 组件白名单；props 按类型归一与检查。
- 预算：120 个节点、深度 6、图表 60 点、segmented 6 个选项、单个文本节点 2000 字符、state/table 载荷 16384 字节、表格 200 行、12 列。
- 绑定、状态与表格 key 中拒绝不安全属性名（`__proto__`、`constructor`、`prototype`）。
- 根节点非法、超深或超节点数时整块拒绝（fail closed），显示该块的 `fallback` 文本。
- 完全无法解析成 AST 的围栏交还给原生 Markdown 按原始文本显示，内容不会被静默丢弃。
- 子树非法时只把该子树降级为文本节点，兄弟与父布局保留。
- 挂钩边界处渲染器抛错时回退为带 `data-miopiik-embed-fallback` 标记的纯文本 span。

## 用法示例

模型像写普通回答一样产出这些内容，不需要调用工具，也不需要了解渲染器实现。下面的 Markdown 可以直接粘贴进 DSH 会话。

行内 token 与普通文字混排：

~~~md
构建 {{badge:success:通过}}，耗时 {{badge:neutral:42s}}；状态 {{icon:check}}。
本地验证命令：{{code:npm test}}
~~~

含本地状态、指标、图表、表格与分段控件的围栏块：

~~~md
这轮发布检查的结果 {{badge:success:2/3}}：

```iui
<ui title="发布检查" fallback="本轮 3 项检查：解析通过、校验通过、渲染观察中">
  <state name="range" value='{"total":"3","passed":"2","series":[["解析",12],["校验",9],["渲染",7]]}'/>
  <column gap="md">
    <row gap="md">
      <metric label="检查项" value="$state.range.total" unit="项"/>
      <metric label="已通过" value="$state.range.passed" unit="项" tone="success" delta="+1"/>
    </row>
    <segmented label="轮次" bind="$state.range" options='[{"label":"本轮","value":{"total":"3","passed":"2","series":[["解析",12],["校验",9],["渲染",7]]}},{"label":"上轮","value":{"total":"3","passed":"1","series":[["解析",11],["校验",8],["渲染",6]]}}]'/>
    <grid columns="2">
      <chart kind="bar" series="$state.range.series" source="演示数据"/>
      <table columns='["检查","结果"]' rows='[["解析","通过"],["校验","通过"],["渲染","观察中"]]'/>
    </grid>
  </column>
</ui>
```
~~~

同样内容用 `iui/1` JSON AST 表达（便于调试，或给已经输出 JSON 的工具使用）：

~~~md
```iui
{"version":"iui/1","title":"组件使用","fallback":"组件使用：metric 2，chart 1","state":{},"root":{"id":"root","type":"column","props":{"gap":10},"children":[{"id":"m1","type":"metric","props":{"label":"组件","value":"3","unit":"个"},"children":[]},{"id":"t1","type":"table","props":{"columns":["类型","数量"],"rows":[["metric",2],["chart",1]]},"children":[]}]}}
```
~~~

插件自己的输出约定由 [index.js](index.js) 注入：优先普通 Markdown，只有对比、趋势或本地选择更清楚时才用 IUI，并避免为了画界面去调用工具。该决策背后的自然输出审计见 [docs/IUI-NATURAL-OUTPUT-AUDIT.md](docs/IUI-NATURAL-OUTPUT-AUDIT.md)。

## 支持范围

| 项 | 要求 |
|---|---|
| DSH | 仅 DSH Web（web profile）。测试基线：DSH `0.2.1-rc.5`。其他 DSH 版本未验证；chat 补丁与版本耦合。 |
| Node.js | `>= 23.6`（见 `package.json` 的 `engines`）。 |
| DSH CLI | `dsh plugin --profile <profile> add/remove`，在测试基线中可用。 |
| 浏览器 | 隔离 DOM 测试使用 Chromium。其他浏览器不在已验证矩阵内。 |

更完整的包、安装与退场条件汇总在 [docs/SUPPORT-MATRIX.md](docs/SUPPORT-MATRIX.md)。

## 安装、升级、回滚

`0.1.0-rc.4` 是**预发布**版本，且需要本地宿主补丁。只把它装进你能控制的 DSH profile，并确保你能重启 DSH Web。未经他人同意，不要装进别人在用的 profile。

### 前置条件

- 有可修改 profile 的 DSH Web 安装。
- Node.js >= 23.6，`dsh` CLI 在 `PATH` 上。
- 本仓库的本地 checkout，用于生成器与校验工具。

### 安装

1. 把包加入 profile：

   ```sh
   dsh plugin --profile <profile> add /absolute/path/to/miopiik-iui
   ```

   也可以用 tarball：

   ```sh
   npm pack --pack-destination .dsh/tmp/packs
   dsh plugin --profile <profile> add .dsh/tmp/packs/miopiik-iui-0.1.0-rc.4.tgz
   ```

   仓库还提供封装脚本 [tools/install-plugin.mjs](tools/install-plugin.mjs)，默认 dry-run；未加 `--allow-running-profile` 时拒绝写入运行中的 `web` profile：

   ```sh
   node tools/install-plugin.mjs --profile <profile> --mode link            # dry-run
   node tools/install-plugin.mjs --profile <profile> --mode link --execute  # 实际执行
   ```

2. 校验提交的浏览器 bundle 与源码一致：

   ```sh
   node tools/build.mjs --check
   ```

   `client.js` 由 `shared/`、`renderer.js`、`settings.js` 与 `package.json` 生成；不一致说明 checkout 不可安装。

3. 在受控环境生成一次 chat 挂钩。生成器从 DSH 安装目录读取 `@deepseek-ai/dsh-client-ui-chat`（不是 profile 里的）。它会自动探测常见全局 npm 前缀下的 DSH 安装；不在这些位置时用 `MIOPIIK_DSH_DIR` 指定：

   ```sh
   MIOPIIK_DSH_DIR=/path/to/dsh/installation node tools/fork-chat-embeds.mjs
   MIOPIIK_DSH_DIR=/path/to/dsh/installation node tools/fork-chat-embeds.mjs --check
   ```

   输出目录是 `upstream/dsh-client-ui-chat-embeds/`（生成物，已 gitignore），可用 `MIOPIIK_FORK_DIR` 覆盖；补丁写到 [patches/chat-markdown-embeds.patch](patches/chat-markdown-embeds.patch)，可用 `MIOPIIK_FORK_PATCH` 覆盖。`--check` 只读：比较 fork 与生成器应产出的结果，并校验 fork 的依赖链接，不创建任何东西。在没有 DSH 安装的机器上，或 fork 尚不存在时，它会明确提示并通过，因为"无 fork 即无漂移"。不要重建正在被运行中 DSH 服务加载的 fork。背景与上游 API 提案见 [docs/UPSTREAM-MARKDOWN-EMBED.md](docs/UPSTREAM-MARKDOWN-EMBED.md)。

4. **只把该 profile 的** `@deepseek-ai/dsh-client-ui-chat` 解析指向 fork。不要覆盖全局 DSH 安装，也不要改其他 profile 共用的 `node_modules`：

   ```sh
   cd <profile>/node_modules/@deepseek-ai
   [ -e dsh-client-ui-chat ] && mv dsh-client-ui-chat dsh-client-ui-chat.bak
   ln -s /absolute/path/to/miopiik-iui/upstream/dsh-client-ui-chat-embeds dsh-client-ui-chat
   ```

   fork 是独立包，会解析自己的依赖；生成器会创建它指向 DSH 依赖树的 `node_modules` 链接，保持该链接完好。

5. 备份 profile 配置与原来的 `ui-chat` 解析，确认没有 DSH 任务在运行，重启 DSH Web，然后刷新浏览器。插件与挂钩都加载后渲染默认开启；打开 **Plugins -> Installed -> MiOpIIk IUI** 确认。

### 升级

1. 用新版本替换 profile 依赖（`dsh plugin --profile <profile> add <新 checkout 或 tarball>`）。
2. 在新 checkout 里运行 `node tools/build.mjs --check`。
3. 若 DSH 版本变了，重新生成 fork 与补丁（`node tools/fork-chat-embeds.mjs`，再 `--check`），并让 profile 的 `ui-chat` 解析继续指向新 fork。
4. 重启 DSH Web。历史消息不做迁移：它们本来就是会话日志里的 Markdown，下次查看时由新版本渲染。

### 卸载

1. 从 profile 移除插件：

   ```sh
   dsh plugin --profile <profile> remove miopiik-iui
   ```

2. 恢复 profile 原来的 `ui-chat` 解析（例如把 `dsh-client-ui-chat.bak` 移回），全局 DSH 安装保持不动。
3. 重启 DSH Web。聊天回到原生 Markdown 渲染。生成的 `upstream/` 目录与浏览器偏好可以删除；历史会话不受影响。

### 回滚

- **快速回滚，无需重启：** 在插件页关闭渲染，或直接写浏览器偏好后刷新：

  ```js
  localStorage.setItem("miopiik.markdownEmbeds", "0"); location.reload()
  ```

  只影响当前浏览器，不改任何会话数据。

- **完整回滚：** 按[卸载](#卸载)移除 profile 依赖、恢复原 `ui-chat` 解析，然后重启 DSH Web。

### 未打补丁时

如果装了插件但 `ui-chat` fork 未加载：

- 聊天里的 `iui` 围栏按普通代码块显示；行内 token 按字面文本显示。
- 插件页照常工作，Overview 预览仍能渲染，因为渲染器就在页面本地运行。
- Configuration 诊断会显示未检测到补丁，而不是静默假装渲染正常。
- host 输出约定仍会注入，模型可能继续产出 IUI；这些块在挂钩装好前只会以代码块存在。

## 配置

没有服务端配置 schema。组成部分如下：

| 项 | 位置 | 作用 |
|---|---|---|
| 浏览器偏好 `miopiik.markdownEmbeds` | 浏览器 `localStorage` | `"0"` 关闭当前浏览器渲染；其他值（默认：不存在）开启。切换会刷新页面，让已渲染消息按新偏好重建。 |
| 插件页开关 | **Plugins -> Installed -> MiOpIIk IUI -> Configuration** | 同一偏好的受支持 UI：在聊天中显示 IUI。仅当前浏览器生效，不同步到其他标签页、浏览器或 profile。 |
| 宿主补丁标记 `globalThis.__miopiikMarkdownEmbedsHost` | 浏览器 `globalThis` | `ui-chat` 挂钩加载时置为 `true`。插件页据此显示"补丁已加载"或"未检测到补丁"。 |
| 嵌入注册表 `globalThis.__miopiikMarkdownEmbeds` | 浏览器 `globalThis` | 插件 bundle 安装；挂钩调用其 `segments`、`renderInline` 与 `renderBlock`。缺失时挂钩返回 `null`，走原生 Markdown 路径。 |
| bundle patch `cordis.patch.yml` | 包元数据（`dsh.bundle.patch`） | 告诉 profile 如何加载插件。 |

渲染开关只控制显示。关掉它**不会**停止向模型提示注入 host 输出约定，因此模型仍可能写 IUI 语法；这些内容会按 Markdown 代码显示。

## 安全与权限

- **无任意 HTML/JavaScript/CSS。** 模型输出被解析进白名单组件树；没有 `innerHTML`、没有 `eval`、没有动态样式表或脚本注入。样式来自 DSH 主题 token 与固定代码。
- **无网络请求。** 渲染器不发 `fetch`、XHR、WebSocket 或外部资源请求；图表是内联 SVG，图标是内置字形。
- **控件不触发模型回合。** 唯一交互控件是本地 `segmented` 开关，它只替换本地 React 状态，不能调用工具、启动回合或写入持久状态。
- **无任意事件处理。** 模型输出不能挂 `on*` 处理器；只有内置控件有行为。
- **数据与状态有预算。** 节点数、深度、图表点数、选项数、文本长度、表格与状态大小都受限；原型污染 key 被拒绝。
- **安全链接。** 只接受 `https://...`、站内相对路径与 `#anchor`；其他 scheme 会让该链接节点降级。
- **局部错误隔离。** 非法子树只降级自身；非法文档回退到 `fallback` 文本；渲染器异常变成纯文本 fallback span。消息其余部分仍是原生 Markdown。
- **不写日志。** 插件不写日志、不写文件；持久化的只有当前浏览器里那一个 `localStorage` 偏好。

## 测试与开发

```sh
npm test                      # node --test —— 离线单测
npm run check                 # npm pack + 解包 + 逐文件语法 + import 图覆盖检查
npm run build:check           # client.js 必须与源码一致
npm run icon:check            # 图标资产约束（静态检查）
node tools/fork-chat-embeds.mjs --check
```

- 离线套件覆盖切分器、`miopiik-ml` 解析、`iui/1` 校验、表格/图表归一、旧协议映射、设置页 bundle 与发布就绪。不需要 DSH 安装、网络或浏览器。
- 解析不到 DSH 安装时跳过 fork 生成器回归（用 `MIOPIIK_DSH_DIR` 指向宿主即可运行）；只读的 `--check` 无宿主路径始终会被测试。
- 插件页的隔离 Chromium DOM 测试在找不到 Chromium 二进制时跳过（可用 `CHROMIUM_PATH` 或 `MIOPIIK_CHROMIUM` 指定路径）。
- 需要真实 DSH Web 宿主或真实补丁 chat 包的验证属于开发脚本，不放进 `npm test`；它们从 `MIOPIIK_*` 环境变量读取宿主路径（见 [tools/dev-env.mjs](tools/dev-env.mjs)），不硬编码。
- `node tools/fork-chat-embeds.mjs --check` 可离线安全运行：没有 DSH 安装或没有生成 fork 时会明确提示并成功退出。
- CI 定义在 [.github/workflows/ci.yml](.github/workflows/ci.yml)：在 Node 23.6.0、24.x、26.x 上跑单测、发布检查、bundle 一致性检查与图标守卫，另有一个 pack/安装验证 job。

协议真源是 [shared/iui-ast.js](shared/iui-ast.js) 与 [shared/miopiik-ml.js](shared/miopiik-ml.js)。[renderer.js](renderer.js) 是渲染源码；[client.js](client.js) 是生成物，绝不能手改。仅开发用的端到端脚本在 `tools/` 下：`e2e-gallery-replay.mjs`、`e2e-iui-user-sessions.mjs`、`e2e-playwright.mjs`、`e2e-dual-settings.mjs`、`e2e-legacy-replay.mjs`、`e2e-iui.mjs` 与 `e2e-iui-model.mjs`。它们需要运行中的本地 DSH Web 与隔离 Playwright 浏览器，不得向既有主会话发测试消息，也不属于 `npm test`。脚本清单与环境变量见 [docs/DEV-TOOLS.md](docs/DEV-TOOLS.md)。

## FAQ

**为什么还是 rc？**

因为聊天内渲染依赖针对特定 `@deepseek-ai/dsh-client-ui-chat` 构建的非官方补丁，跨 token Markdown 尚不完全无损，流式也不是增量。把它标成 stable 等于对用户隐藏这些条件。门禁清单见 [docs/IUI-V1-RELEASE-CANDIDATE.md](docs/IUI-V1-RELEASE-CANDIDATE.md)。

**不打 chat 补丁会怎样？**

插件仍能安装，插件页预览也能用，但聊天里的 `iui` 围栏按普通代码块显示，行内 token 保持字面文本。插件页会显示未检测到补丁，而不是静默失效。见[未打补丁时](#未打补丁时)。

**会影响历史会话吗？**

不会。消息仍是会话日志里的原始 Markdown，渲染发生在查看时。旧 `ink-view` 块只读映射，绝不改写；关闭渲染只是让消息回到普通 Markdown 外观。

**必须和 MiOpIIk Agent 一起装吗？**

不必。两个仓库相互独立，可同装或单装。IUI 不依赖 Agent 的工具面、账本或后台执行。

**关掉渲染后消息会变吗？**

只有外观变。消息文本不变；`iui` 围栏显示为代码块，行内 token 显示为文本。变化的只有当前浏览器的偏好。

## 局限

- **行内代码不受 token 保护。** 行内 token 在普通段落文本里匹配，包括反引号内的文本；示例请放进围栏代码块。
- **跨 token Markdown。** 受信 token 会把 Markdown 文本块切开。跨越 token 边界的加粗/斜体等格式可能在边界处断开；选中、复制与屏幕阅读器顺序可能与原生 Markdown 不同。彻底修复需要 DSH 上游的 Markdown AST 扩展点。
- **流式非增量。** 未闭合或格式错误的围栏先按普通文本显示，闭合后整块一次性物化。
- **版本耦合的实验性补丁。** 宿主挂钩不是上游 API，是按特定 `ui-chat` 包里的锚点生成的。DSH 升级可能让生成器（明确地）报错，直到补丁刷新。
- **无上游保证。** 补丁与 fork 是受控使用的本地产物；不要把 fork 当作官方包的替代品发布。
- **旧 Widget 仅只读回放。** 七 Widget 协议已退役；映射是尽力而为，`choice` 动作不执行，无法映射的 spec 保留原始文本（当前渲染路径不使用旧 spec 自带的 `fallback` 字段）。
- **无障碍与主题矩阵不完整。** 有基本的深色/窄屏检查；完整的明/暗/高对比、键盘与屏幕阅读器矩阵尚未验证。
- **模型遵从无法保证。** 输出约定是一节 prompt，模型可能忽略；自然输出审计记录了测到什么、没证明什么。

## 贡献

欢迎 issue 与 pull request，但请记住预发布状态：

- 协议改动放在 `shared/`，渲染改动放在 `renderer.js`；然后用 `node tools/build.mjs` 重新生成 `client.js`，并把源码与生成物一起提交。
- 不要手改 `client.js`、`patches/chat-markdown-embeds.patch` 或 `upstream/`。补丁是生成的；`upstream/` 已 gitignore。
- 保持插件零依赖、离线。新增组件需要白名单、校验、预算与降级行为，并配测试。
- 提交 pull request 前运行 `npm test`、`npm run check` 与 `npm run build:check`。需要宿主的端到端验证要运行中的 DSH Web 与隔离浏览器；不要拿别人的会话做测试。
- 用户设计的 `icon.svg` 资产必须逐字节保持原样；`npm run icon:check` 会守卫其约束。

## 许可

MIT。见 [LICENSE](LICENSE)。
