# MiOpIIk IUI — Release Notes

`miopiik-iui` 是 DeepSeek Harness（DSH）Web 的**纯表现层**插件：模型在普通 Markdown 中输出受信行内 token 与受控 `iui` 围栏，浏览器侧将其渲染为声明式组件。本包独立于 MiOpIIk Agent，可单独安装。

## miopiik-iui 0.2.0-rc.2 — 局部程序与绘图候选

本地预发布（prerelease），用于独立 DSH Web profile 验收。

- `derive` 支持有界数组操作、点积、矩阵向量乘法和稳定 softmax。
- 本地按钮可写入、追加、撤销末项或恢复某一绑定，让用户重复运行同一份声明。
- `drawing` 用主题化的矩形、圆、直线、路径和文本组成图形。坐标和显隐可绑定状态。
- 已知限制包括版本耦合的 DSH 宿主补丁，以及片段内局部状态。详见[程序与绘图示例](PROGRAMMABLE-IUI.md)。

## miopiik-iui 0.2.0-rc.1 — 自然表达候选

本地预发布（prerelease），用于独立 DSH Web profile 验收。

- 真正的句内标记沿用原生 Markdown。iui 块可使用 `density="auto"`，由宿主按结构选择片段、紧凑块或面板。历史声明省略密度时仍以面板渲染。
- 将局部状态、派生计算、条件显隐和折叠组合为可交互片段。剪贴板动作由用户触发，可展开查看实际复制内容。
- 普通 Markdown 走原生宿主路径。围栏示例保留原文，持续生成后续片段时保留前面已渲染的交互。
- 已知限制仍包括本地版本耦合宿主补丁，以及尚未覆盖多个 DSH 版本。详见[自然表达示例和评估](NATURAL-EXPRESSION.md)。

## miopiik-iui 0.1.1 — stable（2026-11-23）

**状态**：**正式版（stable）**，两项已知限制不变（非官方宿主补丁、无多版本矩阵）。本版为无障碍与触摸兼容批。

- **可见焦点环**：`segmented` / `toggle` / `slider` / `input` 键盘聚焦时显示 `:focus-visible` 描边（品牌色，2px + offset），不再依赖浏览器默认轮廓。
- **读屏语义**：表格 `<th>` 增加 `scope="col"`，表格本身带 `aria-label`（caption 或「数据表，N 行 M 列」）；过滤时行数变化通过 `role="status"` + `aria-live="polite"` 播报；`segmented` 容器补 `role="group"` 与可访问名。
- **图表数据摘要**：SVG 图表的 `aria-label` 从「一张图」升级为数据本身（如「占比图：Web 46，CLI 32，API 22」），读屏用户可直接听到数值。
- **触摸目标**：`@media (pointer:coarse)` 下控件最小高度 32px、内边距加大，滑块与输入框同步增高。
- **强制色彩**：`@media (forced-colors:active)` 下改用系统色边框与 `Highlight` 焦点环，避免高对比模式下控件消失。
- **减少动效**：沿用既有 `prefers-reduced-motion` 处理（入场淡入与 hover 滤镜同时关闭）。
- **验证**：97 项全绿；真 Chromium 新增断言——焦点环、sr-only、粗指针目标、强制色彩兜底、表头 `scope`、图表数据摘要、分组语义、表格可访问名。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.1.tgz` 安装并重启 DSH；已知限制与安装前提同 `0.1.0`。

## miopiik-iui 0.1.0 — stable（2026-11-23）

**状态**：**正式版（stable）**。代码与 `0.1.0-rc.15` 完全一致，本版只做版本定稿与文档收口——维护者决定在两项已知限制未消除的情况下发布。

- **定稿内容**（自 rc.7 起累积）：受控 `iui` 围栏组件体系与本地 `$state` 交互；动效定妆；声明式泳道图（实测几何布线）；rc.12 的 DOM 级嫁接与围栏级流式增量；rc.13 的 `html` 无脚本沙箱文档通道 + 宿主主题预设（`mi-*` 组件词汇）；rc.14/rc.15 的沙箱帧自动高度（含测量修正）。
- **发布时未消除的两项已知限制**：① 聊天内联渲染依赖非官方、版本耦合的 `@deepseek-ai/dsh-client-ui-chat` fork（DSH 升级后需重跑 `tools/fork-chat-embeds.mjs`）；② 尚无跨多个 DSH 版本的兼容矩阵与干净 profile 冷启动全链路验证。
- **已解除并记录**：跨 token Markdown 有损（rc.12 DOM 级嫁接）、流式非增量（rc.12 围栏级增量）。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0.tgz` 安装并重启 DSH；宿主补丁经 profile 的 ui-chat 软链随重启生效。未发布到 npm registry。
- **升级**：`0.1.0-rc.*` 用户直接替换包并重启即可，配置与设置页开关状态保留；无数据迁移。
- **实机验收点**：`iui` 围栏组件、`html` 沙箱帧（自动高度、无拖拽角、JS 不执行）、行内 token 与宿主主题一致性。

## miopiik-iui 0.1.0-rc.15 — prerelease

**状态**：prerelease，剩余两项 stable blocker（非官方宿主补丁、无多版本矩阵）；本版修 rc.14 自动高度的测量缺陷。

- **缺陷**：rc.14 直接把 `documentElement.scrollHeight` 当内容高度。内容不足时 `html` 会被 iframe 视口撑满，`scrollHeight` 等于当前帧高——于是帧永远收不回来（实机表现：`<!-- height: 900 -->` 配三百字内容，帧就是 900 的空白）。
- **修法**：测量前把帧临时压到 `0px` 让内容自然定型，读完立刻还原（同一帧内完成，不产生可见闪烁）；量完后同时写 DOM 与组件状态——DOM 立即生效，状态保证后续重渲染不被初始值覆盖。
- **onLoad 取帧方式**：改用 `event.currentTarget`（部分宿主渲染器不注入 `ref`），挂载期仍走 `ref`。
- **测试**：此前那条断言在与被测逻辑同一套错误测量上自证；现改为断言真实内容高度——700px 内容帧须长到约 732（含预设 body padding），`height: 900` 的短内容帧必须收回到 400 以下。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.15.tgz` 安装并重启 DSH；宿主补丁经 profile 的 ui-chat 软链随重启生效。
- **实机验收点**：`html` 围栏文档帧高应贴着内容（长内容变高、短内容变矮），无拖拽角，文档 JS 仍不执行。

## miopiik-iui 0.1.0-rc.14 — prerelease

**状态**：prerelease，剩余两项 stable blocker（非官方宿主补丁、无多版本矩阵）；本版为沙箱文档帧的收尾打磨。

- **沙箱帧自动高度**：`html` 围栏的帧不再写死高度——父页面读文档 `scrollHeight` 后收紧到内容高度（120–1600，超出则帧内滚动），`<!-- height: 480 -->` 降级为「首次绘制高度」。
- **沙箱属性调整（用户点头）**：`sandbox` 从留空改为 `allow-same-origin`，**绝不含 `allow-scripts` 与 `allow-top-navigation`**——文档里的 JS 依旧一行都不执行（浏览器引擎级），无脚本即无法读 cookie/DOM 外泄路径，CSP `default-src 'none'` 的零网络约束不变；父页面仅获得「读尺寸」能力。
- **预设修正**：`.mi-metric .mi-value` 改为 `inline-block`，模型把 `mi-unit` 写成兄弟节点时不再换行。
- **文档同步**：rc.13 后的 blocker 记录清理（四项 → 两项，跨 token 有损与流式非增量标注为 rc.12 已解除）并入本版，tarball 内 README 与 HEAD 一致。
- **验证**：97 项全绿；真 Chromium 新增断言——`sandbox` 只含 `allow-same-origin` 且不含 `allow-scripts`、帧高与内容高度一致（虚拟时间预算下测量）、无 resize、预设注入、令牌解析为绝对色值。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.14.tgz` 安装并重启 DSH；宿主补丁经 profile 的 ui-chat 软链随重启生效。
- **实机验收点**：聊天里发一条 `html` 围栏文档，帧高应与内容贴合（不再有大片空白）、无拖拽角；文档里 JS 仍不执行。

## miopiik-iui 0.1.0-rc.13 — prerelease

**状态**：prerelease，剩余两项 stable blocker（非官方宿主补丁、无多版本矩阵）；本版为 F-42 沙箱帧通道（用户「直接内嵌 HTML 渲染」理想的可信实现）。

- **```html 沙箱文档通道**：完整静态 HTML 文档经**无脚本沙箱 iframe** 内嵌——`sandbox` 属性留空（无 allow-scripts/allow-same-origin，浏览器引擎级强制），注入 CSP `default-src 'none'`（零网络，样式仅内联、图片仅 data:），脚本块双保险剔除，≤256KB 预算超限降级为提示文本，高度支持 `<!-- height: 480 -->` 提示（默认 560，尺寸不可拖拽）。**宿主主题预设**：渲染时从宿主 DOM 采样设计令牌（`--dsw-alias-*` / `--dsw-radius-*` / `--dsw-font-*`），经探针解析成绝对色值后注入沙箱文档，并预置 `mi-*` 组件词汇（`mi-card` / `mi-row` / `mi-grid` / `mi-metric` / `mi-badge` / `mi-callout` / `mi-progress` / `mi-divider` + `data-tone`）——文档默认与 DSH 本体同风格，文档自有 `<style>` 排在其后，可完全覆盖。宿主补丁 lang 分支路由；流式期间 html 围栏保持文本、闭合成块。「模型输出永不执行」的执行禁区不变——从校验器挡升级为浏览器挡。
- **章程更新**：目录新增「沙箱文档」一行；禁令行改写为「完整 HTML 文档仅经 ```html 无脚本沙箱围栏内嵌」。
- **实机翻车修复（两个真 bug）**：① 围栏收尾未锚行首——文档正文里出现行内 ``` 会把围栏当场腰斩、后半截漏成聊天正文，现在开启与收尾都必须独占一行（流式切分同步对齐）；② srcdoc 二次转义——`class="x"` 被洗成 `class=&quot;x&quot;`（类名带引号），导致所有 class 选择器静默失效、`&lt;` 显示成字面量，改为文档原文直传。
- **验证**：围栏切分单测（lang=html、行首收尾、流式不路由、旧路径兼容）+ frame-theme 单测（回退色板、令牌探针解析）+ 真实 Chromium DOM 断言（sandbox 空、CSP 注入、脚本剔除、标题提取、超预算降级、预设注入、宿主令牌解析成绝对色值、无 resize），97 项全绿；宿主补丁随模板重生成（patch 约 7KB 入库）。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.13.tgz` 安装并重启 DSH；宿主补丁经 profile 的 ui-chat 软链随重启生效。
- **实机验收点**：聊天里发出一条 ```html 围栏消息（如 archify 画板级排版），文档在沙箱帧内全量呈现、JS 不执行、尺寸不可拖拽（高度由 `<!-- height -->` 提示）；只用 `mi-*` 类写的文档应与 DSH 本体同风格，自带 `<style>` 可覆盖预设。

## miopiik-iui 0.1.0-rc.12 — prerelease

**状态**：prerelease，本版解除两项 stable blocker（跨 token Markdown 有损、流式非增量），剩两项；本版为 L-11 流式增量 + 跨 token 完整性（fork 手术 + 仓库基础同船发布）。

- **跨 token 完整性（根修）**：行内 token 从「预切分」改为「**原生先渲染，DOM 级嫁接**」——加粗/斜体/选中复制/屏幕阅读顺序跨 token 保留，受信 token 在原生渲染完成后原位替换（幂等，`code/pre` 内不识别）。React 安全护栏：嫁接仅在该消息非流式终态执行一次，流式期间不做 DOM 突变。
- **流式增量渲染**：新增 `splitStreamingFence`（识别尾部未闭合 iui 围栏）与 `renderBlockStreaming`（部分 ML 可渲染：未闭合子树按降级语义保留已写文本；流式期间不挂入场动画防频闪）。宿主补丁在每个流式分片把 `pre` 段交原生、`live` 段实时渲染——围栏闭合即无缝换成正式块。
- **宿主补丁重生成**：`MiopiikGraftText`（原生 + 嫁接宿主组件）、`MiopiikBlockSegment`、`miopiikStreamSplit` 三件新钩子；块级切分改 `segmentsBlocks`（行内 token 不再预切）。旧 `MiopiikEmbedSegment` 预切分路径退役。
- **验证**：`splitTrustedBlocks`/`splitStreamingFence` 单测 + 真实 Chromium DOM 断言（加粗跨 token 嫁接、幂等、流式无动画标记），fork 生成回归含新钩子钉子，92 项全绿；fork 已按上游 0.2.2-rc.1 重新生成（node --check 过）。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.12.tgz` 安装并重启 DSH；本版**必须与重新生成的宿主补丁同船**（profile 的 ui-chat 软链指向仓库 fork 目录，重启自动生效）。
- **实机验收点**：① 流式输出 iui 围栏时块随分片渐次成形，闭合后定稿；② `**加粗 {{badge:success:完成}} 继续加粗**` 一行里 badge 在加粗文本中间原位出现，加粗跨 token 不断裂。

## miopiik-iui 0.1.0-rc.11 — prerelease

**状态**：prerelease，四项 stable blocker 未变；本版为泳道图几何重做（像素级读图报告驱动的四项修复）。

- **实测几何（本版主题）**：rc.9 的泳道图把药丸放在真实像素 DOM、箭头却画在被横向拉伸 4 倍的逻辑坐标系里——端点错位百余像素。本版改为**挂载后一次实测锚点**（等比 1:1 坐标系）：箭头精确落在药丸边缘、箭头尖恢复正常尺寸；无实测环境（测试桩/降级）回落近似几何。布线纯函数抽到 `shared/diagram-geometry.js`，合成锚点单测覆盖。
- **四项像素级修复（图像子代理报告逐条核实）**：①泳道列标题行高从 8px 恢复 16px（此前被裁成 1px 残影）；②lane 增加 `align-items:center`，药丸按内容宽度收拢（此前被拉伸成整列长条）；③反向边统一走**底部弧线**——避开一切中间药丸、与同对正向边天然分离（rc.9 的虚线边被实线完全盖住的问题根除）；④accent tone 药丸改用虚线边框（与 info 同色但可区分）。
- **验证**：几何纯函数单测 6 项（端点贴缘/底弧/双向纵线/跨列绕行/自环跳过/近似锚点）+ 既有 Chromium DOM 断言（回落路径），测试 88 项全绿。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.11.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。

## miopiik-iui 0.1.0-rc.10 — prerelease

**状态**：prerelease，四项 stable blocker 未变；本版为泳道图标签热修。

- **连线标签压扁修复（用户实机报告）**：泳道图 SVG 覆盖层用 `preserveAspectRatio="none"` 拉伸坐标系（布线需要），SVG `<text>` 连带被非等比横向拉宽——所有连线标注看起来被踩扁。修复：标签改为 HTML 覆盖层（等比、清晰、随宿主字体），随中点定位并左右限幅（8%–88%）。
- **往复边标签错位（渲染层礼貌规则）**：同一对泳道之间的近平行反向边（如「验收 / 发布」）中点天然同位；现在**正向边标签放线上方、反向边放线下方**，一对往复边自动分开。
- **验证**：真实 Chromium DOM 断言新增 HTML 标签层检查，测试 82 项全绿。
- **安装**：从本仓库 Release 下载 `miopiik-iui-0.1.0-rc.10.tgz`，按 README 的 profile 补丁步骤安装后重启 DSH。

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

### 升级为 0.1.0 stable 的两项 blocker

1. **非官方、版本耦合的 `@deepseek-ai/dsh-client-ui-chat` patch**：聊天内联渲染需将 profile 的 `ui-chat` 解析指向由 `tools/fork-chat-embeds.mjs` 基于特定 DSH 版本（现为 `0.2.2-rc.1`）生成的本地 fork；标准插件安装流程本身无法自动挂载该钩子。
2. **无多版本矩阵与冷启动全链路验证**：当前仅针对 DSH `0.2.2-rc.1` 基线验证，尚未建立跨多个 DSH 版本的兼容矩阵与干净 profile 冷启动（安装 → 启动 → 渲染 → 卸载）全链路验证。

### 已于 0.1.0-rc.12 解除的 blocker（保留记录）

2′. **跨 token Markdown 有损** → DOM 级嫁接：原生 Markdown 先渲染整段，再把行内 token 在叶子文本节点原位替换，加粗/斜体、选中复制与朗读顺序跨 token 保留（残余：仅定稿态嫁接、表格内 token 不嫁接、极端长段落未压测，详见 [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md)）。
3′. **流式非增量** → 围栏级增量：未闭合的 `iui` 围栏切成"已定稿文本 + 活动块"，活动块随分片逐段成形、闭合定稿且无入场动画（残余：`html` 沙箱围栏按设计不参与流式）。

### 解除 blocker 的条件清单

- [ ] DSH 上游提供官方 Markdown embed / renderer 扩展点（或将 `dsh-client-ui-primitives` 作为独立可解析包发布）；
- [ ] 或 IUI 内联渲染改用无需宿主 patch 的官方扩展机制；
- [x] 跨 token Markdown 排版、复制与无障碍朗读通过验收（rc.12 DOM 级嫁接，残项见上）；
- [x] 流式中间态安全增量渲染通过验收（rc.12 围栏级增量，`html` 围栏例外）；
- [ ] 建立多版本兼容测试矩阵并完成干净 profile 冷启动全链路验证。

在上述 blocker 解除前，版本保持 `0.1.0-rc.x`（prerelease）。

## 范围与安全边界

- 独立于 MiOpIIk Agent（Mind / Ink / Operator），可单装或同装。
- 禁止任意 HTML、JavaScript 与 CSS；`segmented` 等组件仅修改当前消息内的本地 React 状态，不发起网络请求，不触发模型回合。
- 历史会话与账本数据零迁移、不改写，旧 `ink-view` 内容仅在渲染层只读回放。
