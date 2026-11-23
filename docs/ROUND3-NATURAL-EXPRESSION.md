# Round 3：自然表达与原生融合实验（EXPERIMENT）

> 隔离分支 `exp-mot-parity`（worktree `.agents/worktrees/exp-mot-parity`），基线 `34b94ce`（0.1.1）。
> 本文记录第三轮交接状态。归档对照的重新计数、来源核验和本地候选验证见[自然表达验收](NATURAL-EXPRESSION.md)。

## 1. 这轮改了什么

1. **提示词（charter）改为自然混排**：先普通 Markdown，只有数据对比/结构关系/可调参数/可折叠
   细节能显著降低理解成本时才插入一小片 IUI；片段可出现在段落之间，不把整条回答封装成看板；
   模型只表达语义（`density`、`weight`、`tone`、结构），排版/响应式/主题由渲染器决定。
   旧 0.1.1 charter 与 Round3 charter 分别保存在 `.dsh/bench/round3/contracts/`（对照基准）。
2. **新增两个语义意图属性**（不新增专用组件）：
   - 根 `density="inline|compact|panel"`：inline 无框极小边距 / compact 细框 8px / panel 12px；
   - 任意节点 `weight="primary|secondary|optional"`：语义重要程度，视觉由渲染器决定。
3. **派生状态加固**（上一轮审计 R1–R14）：
   - `derive` 改为依赖拓扑求值（前向引用可用），自环/互环在校验期降级；
   - `derive.name` 与控件 `bind`/初始 state 命名冲突 → 校验期降级；
   - `validateAst` 属性白名单化（未知属性如 onClick/style 一律剥离）；
   - 根 `density`、`weight` 枚举校验；copy 数量 ≤4、载荷 ≤16KB、可见「待复制」摘要；
   - `details` 展开态提升到 IuiSheet 级（重挂载不丢）；文本类属性字面量回退，数值类仍 `—`。
4. **测试**：新增 `test/iui-round3-hardening.test.js`（11 项安全/语义负向）、浏览器测试扩展
   density/weight/details/copy/derive 拓扑；`npm test` 126 项 124 pass / 0 fail / 2 skipped。

## 2. 八题自然生成对照（无 UI 形式提示）

方法：8 道普通用户问题（概念解释、方案比较、趋势解释、上手路线、故障排查、计划、一句话、
参数探索），每题在两个条件下各生成一次——「before」读 0.1.1 charter，「after」读 Round3
charter；题面不出现 UI 字样。生成产物在 `.dsh/bench/round3/generations/`，客观指标在
`.dsh/bench/round3/benchmark/analysis.json`。

| 条件 | 回答数 | 含 IUI | IUI 块 | 总字符 | IUI 字符占比* | 语法错误 | 降级节点 | density | outputTokens 合计** |
|---|---|---|---|---|---|---|---|---|---|
| before（0.1.1 charter） | 8 | 6 | 6 | 9387 | 43.8% | 0 | 1 | panel×6 | 22613 |
| after（Round3 charter） | 8 | 7 | 7 | 9670 | 32.8% | 0 | 0 | compact×7 | 20041 |

\* 字符占比代理，不是 token 占比。 \*\* provider 上报的 outputTokens，含 read/write 工具回合开销，
不是最终回答 token；n=8，不能当严格成本结论。

逐题要点：
- q1 概念解释：before 纯文本，after 主动补了一张 compact 判别表；两者都保留大段 prose。
- q2 方案比较：两条件都用一块表；after 更短（1217 vs 1489 字符）。
- q3 趋势：两条件都图表化；after 用 metric+line 后接 Markdown 表格与步骤，IUI 占比更低。
- q4 上手路线：before/after 都用 steps；after 为 compact，文字更长。
- q5 故障排查：both 用 steps/表格，after 输出更短。
- q6 计划：both 用 steps，after 更紧凑（903 vs 891 字符，视觉上更小）。
- q7 一句话：两条件都选择纯 Markdown（正确选择，未用 IUI）。
- q8 参数探索：both 用 metric/table；before 有一处表格 rows JSON 语法错误被校验器降级，
  after 0 降级。

结论（证据支持的部分）：
- 自然混排提示词把「IUI 字符占比」从 43.8% 降到 32.8%，同时 IUI 块数从 6 增到 7、回答总量基本
  不变（+3% 字符）——表现为「更多、更小的片段混进 prose」，而不是更大的看板。
- 语法错误/降级没有恶化（after 0，before 1 处模型 JSON 错误）。
- **但语义意图属性使用不足**：after 的 7 块全部是 compact，inline/panel/weight 均未出现。
  归因是提示词示例锚定 compact；说明「预设+自由组合」需要渲染器默认值与示例多样性配合，
  只靠文字规则不足以让模型使用密度/权重语义。
- 2/16 条生成混入了与本实验无关的宿主全局风格前缀（「Ciallo~~」），属于 subagent 系统提示的
  污染，已记录、未计入结论差异。

## 3. 三种嵌入密度与响应式实测

同一内容（2 metric + bar chart）只改 `density`：`test/fixtures/round3/density-*.iui`；
混排消息 `mixed-flow.md` 为「段落 + compact 块 + 段落 + inline 块 + 段落」。

| 指标 | inline | compact | panel |
|---|---|---|---|
| 块高（1280 与 420 相同） | 219px | 245px | 255px |
| padding-top / border | 0px / 0px | 8px / 1px | 12px / 1px |
| 块宽 1280 / 420 | 1248 / 388 | 1246 / 386 | 1246 / 386 |
| 420 横向溢出 / 裁切 | 无 | 无 | 无 |

- mixed-flow：720px 消息列总高 308px；420px 视口列宽 388、总高 352px；无溢出/裁切。
- 发现（如实记录）：块根 `margin:0`，模拟消息列里「段→块」间距 10px、「块→段」0px，块底会贴
  下一段。真实 DSH 宿主的 MarkdownText 间距未测，不改 fixture 掩盖，交由宿主/下一轮决定。
- 证据：`.dsh/bench/round3-e2e/evidence/round3-density.json` + 28 张截图；mini React harness
  141/141 pass。

## 4. 真 React 近似宿主验证

离线使用安装包里的 react/react-dom 19.2.7 + esbuild 0.28.2 打包真实渲染路径，本地随机端口
127.0.0.1 静态服务 + 真 Chromium：三密度块高/内边距与 mini harness 完全一致；segmented + slider
交互驱动派生重算（120/72/48 → 300/180/120）；copy 可见摘要与 `data-iui-copy-bytes`、
`data-iui-derive-errors` 均验证；零外网请求。41/41 pass。

**边界**：primitives 仍是最小替身，不是 DSH 完整插件运行时；这不构成「生产宿主通过」，
只能说明渲染器在真 React（而非轻量兼容运行时）下行为一致。

## 5. R1–R14 处置（摘要）

| 风险 | 状态 | 证据/说明 |
|---|---|---|
| R1 派生/控件命名冲突 | 已修 | 校验期冲突降级；派生只进渲染 scope；`test/iui-round3-hardening.test.js` |
| R2 前向引用/环 | 已修 | `exprRefs` 依赖图 + 拓扑求值；环降级；渲染层第二道防线 |
| R3 求值与显隐 | 已明确 | 全树收集、与 `when` 无关；同一 state 同一结果 |
| R4 校验期表达式预算 | 已修 | validateAst 内 compileExpr + EXPR_LIMITS |
| R5 绑定值二次校验 | 已修 | table 渲染期重跑 1–12 列/≤200 行/≤16KB/类型；chart 走 chartMatrix |
| R6 结果字符串长度 | 已修 | expr stringLength 2000 + stateSafe 2000；文本类渲染有界 |
| R7 undefined/比较语义 | 已冻结（部分） | undefined 参与算术/比较=求值错误；`==` 为严格等价（与 JS loose == 不同），已文档化 |
| R8 derive 与节点预算 | 已明示 | derive 占 nodes 预算；另设 64 上限 |
| R9 copy 授权边界 | 已修 | 数量 ≤4、载荷 ≤16KB、可见摘要、权限拒绝不假报、无 html 沙箱 copy |
| R10 details 状态 | 已修 | 展开态提升 IuiSheet；aria-expanded/controls；重挂载测试 |
| R11 diagram 条件几何 | 已修 | 入口过滤后重算几何/aria；隐藏节点边跳过 |
| R12 tone 静态 | 已修 | 绑定字符串降级；浏览器测试 |
| R13 旧文档字面绑定 | 已修 | 文本类字面量回退，数值类 `—` |
| R14 负向测试/静态扫描 | 部分已修 | bundle 静态扫描无 eval/Function/网络/脚本；定向负向覆盖；未做随机 fuzz |

## 6. 仍未达成 / 风险

- 语义属性（density/weight）在实际生成中未被充分使用；需要默认值策略与多样示例，当前只验证了
  能力可用，未验证「模型稳定选择最优密度」。
- 自然混排的宿主间距（块与前后文的 margin）只在模拟消息列测量；真实 DSH MarkdownText 未测。
- token 成本只有 provider outputTokens（含工具回合）与字符代理，不是严格 tokenizer 计量。
- 三密度只有一种内容形态；未覆盖表格/图表/交互同时出现时的密度表现。
- 真实宿主（在线 3080）不加载本分支，无法做「新原语在生产会话」验收；不得声称已通过。
- 建议：值得进入 RFC 评审，但先补两件事——①宿主间距与真实 MarkdownText 测量；
  ②density/weight 的默认与示例策略（否则模型不用语义属性）。

## 7. 复跑

```sh
npm test
node tools/build.mjs --check
node .dsh/bench/round3/analyze-generations.mjs
node .dsh/bench/round3-e2e/density.mjs
node .dsh/bench/round3-e2e/generations.mjs
node .dsh/bench/round3-e2e/real-react.mjs
```
