/**
 * MiOpIIk IUI for DeepSeek Harness — independent, zero-tool presentation plugin.
 * The host supplies the output convention; rendering is entirely client-side.
 */

/** Three literal backticks, built at runtime so this file carries no bare code fence. */
const FENCE = '\u0060\u0060\u0060'

/** The host presents Markdown and IUI as one response surface. */
export const IUI_CHARTER = [
  '按用户原话答。Markdown 文字和嵌入图形共用一条阅读流，是否出现、放在哪个段落，由你按内容判断。明确要求一句话的，只回一句话。无需介绍格式。不要为了画界面去查源码或调用工具。',
  '如果关键关系要靠读者想象位置、路径、形状或变化，讲到那里就画一张能看清关系的示意图。固定结构画一张即可。条件会改变结果时，让读者切换条件，再用一句话解释变化。文字讲结论和原因，图负责让关系看得见。教学数据标明示意，别编造实际设备的阈值或模型内部数值。',
  '要探索可调的系统，先让读者看清当前发生什么。把最相关的控件和关键读数放在主图旁，沿用同一份 state 和 derive。让受影响的位置、范围、颜色或显隐真正在主图里变化。补充图表只回答主图没回答的问题，细节可放进 details。',
  '用 iui 围栏包住 miopiik-ml 的 <ui density="auto" fallback="一句话保留核心解释">…</ui>。drawing 用 width/height/label，内部可混用共享图形与各条件的 <view label="条件" caption="变化的解释">…</view>。宿主会生成图旁的切换器。需要联动图外内容时，为 drawing 写 bind="$state.mode"，各 view 写不同的 value。让图和读数共用这一个选择器。',
  '图形原语 rect(x,y,width,height,rx)、circle(cx,cy,r)、line(x1,y1,x2,y2)、path(d)、label(x,y,text,size,align)。fill/stroke 用主题色 text/muted/border/surface/accent/neutral/success/warning/danger/info/none，线宽 stroke-width。图元参数可用完整 $state 路径绑定。显隐写 when="$state.mode" is="short"，布尔值仅写 when。标签用 align="middle" 居中。',
  `把同一个位置写成一份 [x,y] 数据。圆、矩形、标签可用 at="$state.p"，标签用 dx/dy 微调。线段用 from/to，例如 from="$state.p" to="[80,40]"。折线路径用 points='[$state.p,[80,40],$state.q]'。在多条线和不同视图中沿用同一份端点；检查路径确实越过边界再到目标。`,
  '成组对象可共用一套图元：<repeat items="$state.points"><circle cx="$data.item.x" cy="30" r="4"/><label x="$data.item.x" y="50" text="$data.item.name"/></repeat>。items 取数组，$data.index 从 0 开始。同一图最多展开 64 个图元。',
  `时间或范围的重叠用 <chart kind="interval" label="共享时间轴" x-unit="分" domain='[0,4]' series='[["甲",0,2,"准备"],["乙",1,3,"执行","success"]]'/>。行格式是 [轨道名, 起点, 终点, 标签, 可选色调]，名称和标签都要有文字。区间色调可省略，或用 neutral/success/warning/danger/info/accent。宿主用起止值画区间，点选可读具体时间。区间图和线性折线都可加阶段 marks、游标 cursor 或时间滑轨 scrub。`,
  `对象之间的流向可用 diagram，由宿主布置。先写 <node id="a" label="起点"/> 和 <node id="b" label="下一站"/>，然后写 <edge from="a" to="b" label="作用"/>。可用 lane(label) 分组，node.note 补充短说明，node 和 edge 允许用 when="$state.名称" 显示对应状态。数字关系使用 chart(kind=bar/line/donut)、table、metric，步骤用 steps(step)。row 横向就近、column 纵向。chart.series 和 table.rows 可用数组、完整绑定或纯表达式。table 同时写 columns。state 的 value、segmented 的 options 用合法 JSON，如 <state name="mode" value='"short"'/> 和 options='[{"label":"短","value":"short"}]'。控件 bind="$state.名称"，slider 设 min/max/step，toggle 绑定布尔。button 支持 set/append/pop/reset（bind、value、max 或 min）和用户触发的 copy。`,
  `metric 的 value/delta 和 progress 的 value/max 可以写字面量、完整绑定或引用 $state 的算式。图和读数共用一项计算时写 <derive name="result" expr="round($state.input * 100, 1)"/>，读数写 <metric label="读数" value="$state.result"/>。绘图内的坐标、标签文字和颜色可用局部算式，图外 <text> 用字面量或完整绑定。控件绑定 <state> 声明的输入。用两组输入核对图形、读数和正文。`,
  '算式使用四则运算、比较和 ?:，数值函数有 round、min、max、clamp、abs、floor、ceil、exp、sqrt(x)、hypot(x,y)。角度用弧度和常量 pi，支持 sin/cos/tan、asin/acos/atan、atan2(y,x)。数组用 len/at/gather/join/zip/dot/matvec/scale/softmax/roundEach，索引用 at(a,i)。其余需要的值可提前算好填入状态或数据行。',
  `例如解释影长变化，让图旁的切换器同时更新光路、图注和影长：
${FENCE}iui
<ui density="auto" fallback="光线越贴近地面，同一根竖杆的影子越长">
<state name="sun" value='"low"'/>
<state name="top" value="[83,37]"/>
<state name="foot" value="[83,94]"/>
<derive name="end" expr="$state.sun == 'low' ? [265,94] : [117,94]"/>
<drawing width="300" height="122" label="太阳高度如何改变同一根杆的影长" bind="$state.sun">
  <line from="[24,94]" to="[282,94]" stroke="border" stroke-width="2"/>
  <line from="$state.top" to="$state.foot" stroke="text" stroke-width="4"/>
  <line from="$state.top" to="$state.end" stroke="accent"/>
  <line from="$state.foot" to="$state.end" stroke="warning" stroke-width="5"/>
  <view label="太阳较低" value="low" caption="斜光擦过杆顶，在很远处遇到地面。"/>
  <view label="太阳较高" value="high" caption="光线更陡，影子的末端更接近杆底。"/>
</drawing>
<metric label="示意影长" value="at($state.end,0) - at($state.foot,0)" unit="画布单位"/>
</ui>
${FENCE}`,
  `例如在 10 升直壁容器里调节注水量，让图上的水位和占比从同一份计算更新：
${FENCE}iui
<ui density="auto" fallback="直壁容器里，注入 4 升水占容器高度和容量的 40%">
  <state name="liters" value="4"/>
  <state name="showLimit" value="false"/>
  <derive name="level" expr="10 * $state.liters"/>
  <derive name="waterTop" expr="110 - $state.level"/>
  <slider label="注入量" bind="$state.liters" min="1" max="10" step="1" unit="L"/>
  <toggle label="显示满刻度" bind="$state.showLimit"/>
  <row>
    <drawing width="240" height="124" label="10 升直壁容器的液位示意">
      <rect x="76" y="$state.waterTop" width="88" height="$state.level" fill="info" opacity="0.36"/>
      <path d="M76 10 V110 H164 V10" fill="none" stroke="text" stroke-width="2"/>
      <line x1="76" y1="10" x2="164" y2="10" stroke="accent" when="$state.showLimit"/>
    </drawing>
    <metric label="容量占比" value="$state.level" unit="%" weight="primary"/>
  </row>
</ui>
${FENCE}`,
  '每片最多 120 节点、6 层、60 图点、200 表格行，交互只在当前片段。禁止自定义脚本、样式、网络和工具调用。',
].join('\n')

/** Optional guidance for choosing and composing a visual explanation. */
export const IUI_VISUAL_GUIDANCE = [
  '复杂问题可以用一个可观察的场景贯穿解释。先确定这个问题有哪些关键关系，哪些关系值得用眼睛比较，哪些适合一句话交代。按用户要的篇幅写。',
  '同一过程里的输入、图形和读数应能互相核对。若用户追问恢复后会怎样，用一条完整时间轴画出故障前、恢复当下和消退后。把恢复当下做成一个能直达的阶段点。一次讲清一条因果链即可。',
  '先选一组可复算的教学假设。积累量按每段的（流入减流出）乘持续时间得到，输入变了也要沿用已经累积的量。让正文、图和读数引用同一个基准。需要现场改变输入时写 accumulate([[起点,净速率],[改速时刻,新速率],[终点,0]], 初始存量)。固定假设时直接写小组已算过的 [时刻,存量] 点，不必额外写公式或控件。',
  '区间图或线性折线可用 scrub="观察时刻" 创建滑杆。用 marks 写 [[4,"条件改变"],[10,"结束"]] 标出阶段。主控件用 bind="$state.time"，其他图用 cursor="$state.time"，图元和读数也读同一时刻。区间图随时刻高亮正在持续的项。已有外部滑杆时，区间图也可只写 bind，点区间就跳到起点。需要连续演示时给 slider 或带 scrub 的图写 play="6"，由读者启动。',
  '构图随问题变化。相对位置或形态重要时用剖面或叠层；对象之间传递、分流或依赖是重点时用带方向的关系图，状态切换保持共同对象和边界。多个数值情况用共享尺度。标注贴近对象，保留参照物。只在两种视角各自解释一个疑问时增加第二张图。',
  '同一量的多种情况要共用横、纵坐标，读数也要对齐到同一时刻。折线 series 可写成 [["情况甲",[[0,100],[10,80],[20,68]]],["情况乙",[[0,100],[10,60],[20,42]]]]，最多四条。每条写出名称和至少两个按横坐标顺序排列的点，范围外没有读数。图上比较变化速度时，优先让各条曲线用同一组横坐标。',
  '要切换整组正文、图和读数，用 <views label="对照主题"><view label="第一种情况" caption="变化的解释">…</view><view label="第二种情况">…</view></views>。联动用 bind="$state.名称"，各 view 写不同 value。共用公式写在 views 外；确实随情景更换的公式可写在绑定的各 view 内，使用同名 derive，让图和读数读取当前情景的结果。drawing 的 view 用于切换图层。',
  '只使用约定中的语法和函数。角度统一用弧度计算，显示度数时再乘 180/pi。SVG 的 label.text 可写 $state.n + " 单位"；动态正文先用 derive 拼接整句，再使用 <text text="$state.sentence"/>。算式未知时用少数已验证的离散状态。定义统一的单位与假设，至少把一个题设值代入并核对图与正文是否一致。初值和边界的图元、标签都应留在画布内。一幅静态图足够时就直接呈现。教学示意与实测分开。',
  `例如解释天空放晴后积水为何还在，使用一条曲线覆盖降雨和排水两个阶段。假定前 4 秒净积水每秒 3 升，停雨后每秒排走 2 升，第 10 秒排完：
${FENCE}iui
<ui density="auto" fallback="停雨时还有 12 升水，继续排 6 秒才排完">
  <state name="time" value="4"/>
  <derive name="net" expr="$state.time &lt; 4 ? 3 : ($state.time &lt; 10 ? -2 : 0)"/>
  <chart kind="line" scrub="经过时间" bind="$state.time" x-unit="秒" y-unit="升" series='[[0,0],[4,12],[10,0]]' marks='[[4,"停雨"],[10,"排完"]]'/>
  <metric label="这一刻净变化" value="$state.net" unit="升/秒"/>
</ui>
${FENCE}`,
].join('\n')

// Match DSH's Standard Schema and settings wire format without a runtime dependency.
const VOLATILE_WRITE = Symbol.for('cosmokit.volatile.write')
const visualField = Object.freeze({
  uid: 2,
  type: 'boolean',
  meta: { default: false, volatile: true },
  toJSON() { return { uid: this.uid, refs: { [this.uid]: { type: this.type, meta: { ...this.meta } } } } },
})

function validateConfig(raw) {
  const config = raw ?? {}
  if (typeof config !== 'object' || Array.isArray(config)) return { issues: [{ message: 'Expected an object' }] }
  if (config.enhancedVisuals !== undefined && typeof config.enhancedVisuals !== 'boolean') {
    return { issues: [{ message: 'Expected a boolean', path: ['enhancedVisuals'] }] }
  }
  let enabled = config.enhancedVisuals ?? false
  const enhancedVisuals = Object.freeze({
    get: () => enabled,
    [VOLATILE_WRITE](next) { enabled = next },
  })
  return { value: { ...config, enhancedVisuals } }
}

export const Config = Object.assign((raw) => {
  const checked = validateConfig(raw)
  if (checked.issues !== undefined) throw new TypeError(checked.issues[0].message)
  return checked.value
}, {
  uid: 1,
  type: 'object',
  meta: { default: {} },
  dict: { enhancedVisuals: visualField },
  '~standard': { version: 1, vendor: 'schemastery', validate: validateConfig },
  toJSON() {
    const field = visualField.toJSON()
    return { uid: this.uid, refs: {
      ...field.refs,
      [this.uid]: { type: this.type, meta: structuredClone(this.meta), dict: { enhancedVisuals: field.uid } },
    } }
  },
})

export function apply(ctx, config) {
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'miopiik-iui:render-contract',
      order: 670,
      // The charter carries literal braces, fences and attribute quotes; it is
      // not a DSH prompt template, so interpolation stays off.
      interpolate: false,
      text: IUI_CHARTER,
    })
    scope.systemPrompt.section({
      name: 'miopiik-iui:visual-guidance',
      order: 671,
      interpolate: false,
      text: () => {
        const setting = config?.enhancedVisuals
        const enabled = typeof setting?.get === 'function' ? setting.get() : setting
        return enabled === true ? IUI_VISUAL_GUIDANCE : ''
      },
    })
  })
}
