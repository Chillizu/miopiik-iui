# 实验原语：受信派生状态 / 折叠 / 宿主复制（EXPERIMENT，不随 0.1.1 发布）

> 状态：**实验分支**（`exp-mot-parity`，基线 `34b94ce` = miopiik-iui 0.1.1）。
> 本文件描述的是隔离实验里新增的能力，不属于 0.1.1 stable 支持面；未 push、未发布、未改
> profile/服务。主工作区 `main` 保持 0.1.1 原样。
>
> 目的：验证「ChatGPT Intelligence UI 式」的跨组件派生计算、数值条件分支、同源图表/表格、
> 原生折叠与宿主复制动作，能否以**通用、安全、可校验**的方式加入 IUI 协议，而不是为演示
> 硬编码数据。验收契约见主工作区
> `.dsh/benchmarks/chatgpt-parity-20261123.md`；差距矩阵与证据见 `.dsh/bench/`（忽略目录）。

## 新增原语

### 1. `derive` —— 受信派生状态

```xml
<derive name="d.h" expr="round($state.d.n * $state.r.hitRate / 100)"/>
```

- 文档内按 DFS 顺序求值，结果写入**渲染期 scope**（与原始 state 合并）；之后所有
  `$state.*` 读取（控件与全部组件）都能看到派生值，实现跨组件同源。
- `name`：点号路径，段名 `[A-Za-z_][A-Za-z0-9_]*`，禁止 `__proto__`/`constructor`/`prototype`；
  同文档重复名、超过 64 条、表达式非法 → 仅该 derive 局部降级/失效，不连坐整块。
- 求值失败或结果非法（非有限数、非 JSON-safe、超预算）→ 该派生值为 `undefined`，依赖它的
  组件显示 `—`/空；不抛异常。
- 派生值只存在于渲染 scope，不写回 React state；控件 `bind` 仍写原始 state。

### 2. 安全表达式（`shared/iui-expr.js`）

- 语法：数字/字符串/`true`/`false`/`null`、数组/对象字面量、`$state.*`/`$data.*` 点号引用、
  `?:`、`&&`/`||`、比较、`+ - * / %`、一元 `! - +`、括号、白名单函数
  `round/floor/ceil/abs/min/max/clamp`。
- 安全：**不使用 `eval`/`new Function`**，自有 tokenizer + 递归下降；无赋值、无函数定义、
  无模板字符串、无成员访问、无正则；参数/结果类型受限；token/深度/长度/结果体积全部有预算；
  失败返回结构化错误，不抛异常。
- 预算：源码 ≤1000 字符、token ≤256、嵌套 ≤24、数组/对象项 ≤128、结果深度 ≤8。

### 3. `details` —— 折叠容器

```xml
<details label="展开计算口径"><p>…</p></details>
```

- 按钮 + `aria-expanded`/`aria-controls`，默认收起；展开态是组件本地 React state，
  切场景/改滑杆（IuiSheet 重渲染）不会重置；内容仍是白名单组件树。

### 4. `button action="copy"` —— 唯一宿主授权动作

```xml
<button label="复制当前配置" action="copy" value="$state.d.config"
        done="已复制当前配置 JSON" unsupported="当前不支持此动作"/>
```

- 唯一 `action` 值：`copy`（校验器拒绝其他值）。
- 仅用户点击时执行：resolve `value` → string（字符串原样、其他 `JSON.stringify`）→
  `navigator.clipboard.writeText`；无 URL/回调/脚本/网络/工具参数。
- 结果如实显示：成功 → `done`（默认「已复制」）；不可用/被拒/序列化失败/载荷 >16KB →
  `unsupported`（默认「当前不支持此动作」）。状态通过 `role=status aria-live=polite` 播报。
- DOM 标记：`data-iui-action="copy"`、`data-iui-action-status="ok|unsupported"`。

### 5. 渲染期绑定解析扩展

- 所有可见属性走 `$state` 解析：metric label/value/unit/delta/caption、text、badge、
  callout title/text、card title/subtitle、step title/note、divider label、chart series/source、
  table columns/rows/caption/filter、progress label、diagram title/source/lane/node/edge
  label/note、控件 label、button 文案。
- `table.columns/rows` 允许 `$state` 绑定；渲染前 resolve 并**重新执行预算**（1–12 列、
  ≤200 行、≤16KB、行/列类型），超限渲染 `data-iui-table-invalid="1"` 降级节点。
- `diagram` 的 `lane/node/edge` 支持 `when/is`：隐藏节点不参与布线，引用隐藏节点的边跳过，
  无可见节点的列整列移除；几何/aria 摘要按可见集合重算。
- `link.href` 故意不参与绑定，保持静态协议白名单；`tone` 仍是静态枚举。

## 0.1.1 向后兼容

未使用新标签/未写绑定的文档走原渲染路径；原有单测、gallery/legacy 测试保持通过。
`IuiSheet` 的 state 语义、预算、白名单、局部降级、no-script 沙箱、主题、无障碍均未改变。

## 验证

```sh
npm test                        # 单测 + 浏览器 DOM 测试
npm run build:check             # client.js 与源码同步
npm run check                   # 发布自检
```

实验演示文档：`test/fixtures/mot/mot-demo.iui`（87 节点、20 derive、0 降级）；
stage-1（纯 0.1.1）对照：`test/fixtures/mot/stage1-0.1.1.iui`（56 节点）。
端到端证据（隔离环境 Playwright）在 `.dsh/bench/e2e/evidence/`。

## 已知限制（实验边界）

- 表达式不是通用脚本语言：无字符串方法、无成员访问、无自定义函数。
- `derive` 依赖文档顺序，前向引用得到 `undefined`；派生值不能作为控件 `bind` 目标。
- 折叠展开态是组件本地状态，依赖 React 组件身份稳定；宿主若以不同 key 重挂载会重置。
- 复制动作只允许 `copy`；任何“任意宿主动作/URL/网络/工具”仍属**故意不支持**（④）。
- 校验器仍不剥离未知 props（0.1.1 既有行为，安全依赖渲染器不摊开 props 的纪律）；
  本实验未扩大该面。
