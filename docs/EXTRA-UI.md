# MiOpIIk Extra：展示层（历史设计归档）

> **退役说明**：本文记录 2026-11-06 至 2026-11-10 期间设计的七 Widget / `ink-view` 展示协议。该协议及 `ink_view`、`ink_chart` 工具现已全面退役。
> 当前 `miopiik-iui`（`0.1.1` stable）的唯一主路径为：Markdown 中的受控 `iui` 围栏（`miopiik-ml` 或 `iui/1` JSON AST）与行内 token → `validateAst` 校验 → 浏览器侧声明式组件渲染。
> 历史会话中的 `ink-view` 数据零迁移，由 `shared/legacy-widgets.js` 只读映射为 `iui/1` AST 回放（无法映射的保留原始文本，不使用旧 spec 的 `fallback` 字段，不写回账本）。本文作为设计演进档案保留。

> 原始创建日期：2026-11-06 ｜ 当时定位：附加展示层（独立于 Mind/Ink/Operator 核心不变式）
> 架构配图：[extra-ui.html](diagrams/extra-ui.html)（含结构定义 [extra-ui.architecture.json](diagrams/extra-ui.architecture.json)）

---

## 0. 当时的设计目标

将对话中适合结构化呈现的内容抽象为「单一中间表示（IR）+ 多种视图投影」：模型输出结构化数据与展示意图，客户端按预设投影渲染，不引入外部设计系统，也不开放模型编写任意界面代码。

---

## 1. 一个 IR，多个投影

**IR（中间表示）**：`records + fields + relations + 可选 axis`。

**投影**：同一份 IR 的不同呈现形态。

```
spec（数据 + 意图） → IR → 投影选择（数据形状 + 能力清单） → 展示面（卡片 / 抽屉 / 导出）
```

| 投影 | 涵盖形式 | 适用场景 |
|---|---|---|
| `dataset` | table + chart | 对比、账本、审计、矩阵；柱状图、折线图、环图 |
| `graph` | flow + timeline + 鱼骨 | 流程、因果、状态转移、时序、分叉与汇回 |
| `text` | — | 解释、结论、证据链、纯文本兜底 |
| `choice` | — | 确认、二元选择（<= 2 个动作） |
| `media` | — | 图片、文件链接 |
| `layout` | — | 组合容器：stack / row / grid（嵌套 <= 2 层） |

---

## 2. 三档自由度（选 / 组 / 逃逸）

| 档位 | 形态 | 信任级别 | 适用条件 |
|---|---|---|---|
| 选 | 单个投影 + 结构化 props | 高，可确定性回放 | 默认路径 |
| 组 | `layout` 容器组合多个投影 | 高，受 schema 约束 | 单一投影无法表达的结构化组合 |
| 逃逸 | 独立生成的静态 SVG/PNG 图像或受控 HTML 交付物 | 按外部文件处理 | 复杂自由布局架构图 |

---

## 3. 旧版 spec 结构

```json
{
  "widget": "dataset",
  "v": 1,
  "props": {
    "title": "两种接入方式",
    "columns": [{ "label": "维度" }, { "label": "自绘组件" }, { "label": "内核节点" }],
    "rows": [["改动面", "客户端插件", "chat 包"], ["上线成本", "低", "高"]]
  },
  "fallback": "自绘组件改动小、上线快；内核节点能力全，但要动 DSH。"
}
```

- `widget` 指定投影类型，`props` 按对应 schema 校验，`fallback` 为必填纯文本摘要。
- 组合布局使用 `layout` 包裹子项。
- 落盘内容为上述 JSON 结构，用于会话回放与审计。

---

## 4. 旧版校验规则

1. **`fallback` 必填**：供 Markdown 导出、旧版客户端或渲染失败时展示。
2. **未知 `widget` 直接报错并返回可用列表**。
3. **读写通道分离**：卡片不直接修改账本状态。
4. **样式仅使用主题 token**：spec 中不允许传入自定义 CSS。
5. **单卡聚焦单一主题**：多层级状态清单留在后台面板中展示。
6. **单向降级链**：渲染失败时向纯文本 `text` 降级。

---

## 5. 场景覆盖率核对（2026-11-06）

从 `SPEC.md` 与早期设计讨论中抽取 20 个典型展示样本进行映射核对：

| # | 样本 | 出处 | 形态 | 对应投影 |
|---|---|---|---|---|
| 1 | 十二不变式 | SPEC §1 | 列举 | `text` |
| 2 | 阶段表（批次/内容/状态） | README | 进度矩阵 | `dataset` |
| 3 | 三种折叠的触发与产出 | SPEC §5.1 | 对比 | `dataset` |
| 4 | 开环六种类型 | SPEC §4.3 | 分类 | `text` |
| 5 | 开环生命周期 | SPEC §4.3 | 状态转移 | `graph` |
| 6 | 派发链路 | SPEC §4.1/§4.4 | 流程 | `graph` |
| 7 | 收件箱 T0–T3 分层 | SPEC §3.3 | 优先级层次 | `dataset` |
| 8 | note 的 kind 枚举 | SPEC §2.2 | 枚举 | `dataset` |
| 9 | 自审计统计 56 / 37 / 8 | SPEC §11.2 | 数值 | `dataset`（chart） |
| 10 | 判例 C-1 与 J-4 | SPEC §11.3 | 证据链 | `text` |
| 11 | L0–L5 缓存前缀 | SPEC §4.6 | 层次 | `dataset` |
| 12 | 交接简报五段 | SPEC §5.3 | 结构化文本 | `text` |
| 13 | 天轴老化 | SPEC §5.6 | 时间序列 | `graph`（axis） |
| 14 | 闸门 accept / reject / settle | SPEC §4.1 | 状态转移 | `graph` |
| 15 | 审计发现 → 修复 | SPEC §11.2 | 对比 | `dataset` |
| 16 | 旧账本迁移记录 | SPEC §11.4 | 因果事件 | `graph`（axis） |
| 17 | 单测分布 | SPEC §11.3 | 数值 | `dataset`（chart） |
| 18 | 两种接入方式对比 | 讨论记录 | 对比 | `dataset` |
| 19 | MiOpIIk 三层架构 | README | 结构示意图 | `graph` |
| 20 | 鱼骨双脊 + 分支汇回 | 交互界面 | 双轴 + 分叉 | `graph`（泳道 + axis） |

---

## 6. 早期 DSH 接入路径探索

1. **侧栏/功能页渲染**：spec 从工具结果返回客户端插件，在会话功能页「视图」页签渲染。
2. **对话流内联节点**：注册自定义会话节点或接管 Markdown 片段，在聊天正文中渲染。
3. **静态图像交付**：生成 SVG/PNG 文件并通过标准 Markdown 图片语法引用。

---

## 7. 早期迭代记录（2026-11-08 至 2026-11-10）

### 7.1 `ink_view` 与「视图」页签（2026-11-08）

- 早期通过 `ink_view`（`show` / `list` / `clear`）将校验后的 spec 写入 `widgets.jsonl`，并在 MiOpIIk 会话页的「视图」页签渲染 `dataset`、`graph`、`timeline`、`text`、`choice`、`media`、`layout`（实机截图：[extra-view-live.png](screenshots/extra-view-live.png)、[extra-view-live-2.png](screenshots/extra-view-live-2.png)）。

### 7.2 `tool.call.toolview` 席位试验（2026-11-08）

- 利用 DSH 的 `tool.call.toolview` 席位（`key: 'ink_view'`）读取工具调用的 `argsRaw` 渲染卡片（截图：[inline-widget-fixed.png](screenshots/inline-widget-fixed.png)）。
- 局限：该席位位于回合的思考/工具过程组（`process` 层）内，回合结束后会随过程组一起被折叠。

### 7.3 Turn 层独立节点（2026-11-09）

- 改为通过 `ctx.uiConversation.events.register` 注册 `target: 'chat'`、`kind: 'miopiik-widget'`、`groupTree: 'turn'` 的会话节点，并绑定 `conversation.chat.node` 槽位。
- 由于 `groupTree: 'turn'` 位于过程折叠组外层，卡片在正文中独立成行且不被折叠（截图：[inline-widget-body.png](screenshots/inline-widget-body.png)、[extra-forms-all.png](screenshots/extra-forms-all.png)）。

### 7.4 SVG 图表化与排版调整（2026-11-09 晚）

- 将 `graph` 改为按 lane 分列的带箭头 SVG 曲线图；`dataset.chart` 支持 `bar`、`line`、`donut`；`timeline` 改为竖向时间轴（截图：[extra-charts-live.png](screenshots/extra-charts-live.png)）。

### 7.5 协议 v2、静态 SVG 工具与单轮合并（2026-11-10）

- 扩展 `preset`（`card / plain / inset / stat`），并将 `fallback` 改为仅在投影失败时展示（截图：[inline-md-restored.png](screenshots/inline-md-restored.png)）。
- 试验 Host 侧 SVG 生成工具 `ink_chart`，将图表落盘为 `<session>/charts/chart-<stamp>.svg` 并以原生 Markdown 图片引用。
- 同一回合内的多次 `ink_view` 调用合并为单个 `miopiik-widget` 节点，仅展示最后一张卡片（截图：[extra-one-card-per-turn.png](screenshots/extra-one-card-per-turn.png)）。

---

## 8. 退役与向 `miopiik-iui` 的演进（2026-11-12）

在后续实机审计（见 [IUI-NATURAL-OUTPUT-AUDIT.md](IUI-NATURAL-OUTPUT-AUDIT.md)）中发现，通过工具调用（`ink_view` / `ink_chart`）或整行替换 `assistant-step` 来渲染界面存在明显缺陷：模型需发起额外工具调用，且替换 `assistant-step` 会破坏 DSH 原生 `ReasoningRow` 思考折叠。

因此，上述 Extra 方案已正式退役并收敛为当前的独立插件 `miopiik-iui`：

1. **移除模型侧 UI 工具**：不再注册 `ink_view` 与 `ink_chart`，模型直接在普通 Markdown 中编写受控 `iui` 围栏（`miopiik-ml`）与行内 token。
2. **保留原生聊天所有权**：不再替换 `assistant-step` 整行，仅对匹配受信标记的文本片段做局部组件渲染。
3. **历史数据只读回放**：旧会话中的 `ink-view` spec 由 `shared/legacy-widgets.js` 只读映射为 `iui/1` AST 回放，无需迁移历史账本。

---

## 9. 早期与外部参考资料的对照记录（2026-11-10）

下表记录 2026-11-10 设计期与《Harness WebUI：Intelligent UI 风格交互系统技术参考手册》（基于公开资料整理的第三方参考文档）的取舍对照：

| 参考维度 | 当时的取舍 | 原因 |
|---|---|---|
| 回答模式（纯文本 / 静态 UI / 客户端交互 / Agent 驱动 / 嵌入式应用） | 聚焦纯文本、静态声明式 UI 与受限本地状态切换 | 保持展示层纯粹，外部动作统一归口到工具面与提交门 |
| 组件目录规模 | 收敛为精简白名单与固定预设 | 缩小校验面与模型记忆负担 |
| 组件契约（schema、预算、无障碍、fallback） | 强制字段白名单、节点与字节预算、SVG 无障碍标签及必填 `fallback` | 确保异常输入可局部降级 |
| 传输与存储架构 | 复用宿主 DSH 的消息流与日志，不自建独立网关 | 保持零外部服务依赖 |
| 流式补丁协议 | 采用围栏闭合后一次性物化 | 简化客户端状态同步 |
| 安全边界 | 禁止任意 HTML/JS/CSS、限制链接协议、拦截原型污染键 | 模型输出按不可信数据处理 |
| 富交互沙箱（如 MCP Apps iframe） | 不内置 iframe 沙箱；复杂架构图通过静态图像或独立文件交付 | 保持聊天流轻量与主题一致 |（2026-11-22 补记：已由 `html` 无脚本沙箱帧通道替代——脚本仍永不执行，见 README）
