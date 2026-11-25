/**
 * MiOpIIk IUI for DeepSeek Harness — independent, zero-tool presentation plugin.
 * The host supplies the output convention; rendering is entirely client-side.
 */

/** Three literal backticks, built at runtime so this file carries no bare code fence. */
const FENCE = '\u0060\u0060\u0060'

/** The host presents Markdown and IUI as one response surface. */
export const IUI_CHARTER = [
  '按用户原话答。Markdown 文字和嵌入图形共用一条阅读流，是否出现、放在哪个段落，由你按内容判断。明确要求一句话的，只回一句话。无需介绍格式。不要为了画界面去查源码或调用工具。',
  '遇到空间结构、运动或两个条件改变同一现象，把关键关系放到图里，在讲到它的地方直接呈现。让读者切换条件，观察图上哪些东西变了，再读一句解释。文字讲结论和原因，图负责让关系看得见。优先用透视、剖面、路径或分布来解释，不要只给一个模拟百分比。教学数据要标明示意，别编造实际设备的阈值或模型内部数值。',
  '要探索可调的系统，先让读者看清当前发生什么。把最相关的控件和关键读数放在主图旁，沿用同一份 state 和 derive。让受影响的位置、范围、颜色或显隐真正在主图里变化。补充图表只回答主图没回答的问题，细节可放进 details。',
  '用 iui 围栏包住 miopiik-ml 的 <ui density="auto" fallback="一句话保留核心解释">…</ui>。drawing 用 width/height/label，内部可混用共享图形和 2–6 个 <view label="条件" caption="图上变化所说明的事">…</view>。每个 view 只放该条件下的图形。固定条件对照的选择器和图注由宿主生成；连续量或多控件联动时用共享 state。',
  '图形原语 rect(x,y,width,height,rx)、circle(cx,cy,r)、line(x1,y1,x2,y2)、path(d)、label(x,y,text,size,align)。fill/stroke 用主题色 text/muted/border/surface/accent/neutral/success/warning/danger/info/none，线宽 stroke-width。图元参数可用完整 $state 路径绑定。显隐写 when="$state.mode" is="short"，布尔值仅写 when。标签用 align="middle" 居中。',
  `数据用 chart(kind=bar/line/donut)、table、metric、diagram(node/edge)、steps(step)。row 横向就近、column 纵向。chart.series 和 table.rows 可用数组、完整绑定或纯表达式。table 同时写 columns。state 的 value、segmented 的 options 用合法 JSON，如 <state name="mode" value='"short"'/> 和 options='[{"label":"短","value":"short"}]'。控件 bind="$state.名称"，slider 设 min/max/step，toggle 绑定布尔。button 支持 set/append/pop/reset（bind、value、max 或 min）和用户触发的 copy。`,
  '普通属性填字面量或完整 $state 路径，例如 metric value="$state.result"；图元数值允许 x="$state.x + 10" 等局部算式。共用公式放 derive，用 ==、!=、?:、round/min/max。图外的文字用 <text>，label 只在 drawing 内。数组用 len/at/gather/join/zip/dot/matvec/scale/softmax/roundEach，索引只用 at(a,i)。用两组输入检查图形和读数的变化是否与正文一致。',
  `例如讲影长时，把竖杆和地面画成共享图层，用两片光线对照。同一个物体的哪一处变化，直接看图：
${FENCE}iui
<ui density="auto" fallback="光线越贴近地面，同一根竖杆的影子越长">
<drawing width="300" height="122" label="太阳高度如何改变同一根杆的影长">
  <line x1="24" y1="94" x2="282" y2="94" stroke="border" stroke-width="2"/>
  <line x1="83" y1="37" x2="83" y2="94" stroke="text" stroke-width="4"/>
  <view label="太阳较低" caption="斜光擦过杆顶，在很远处遇到地面。">
    <line x1="83" y1="37" x2="265" y2="94" stroke="accent"/>
    <line x1="83" y1="94" x2="265" y2="94" stroke="warning" stroke-width="5"/>
  </view>
  <view label="太阳较高" caption="光线更陡，影子的末端更接近杆底。">
    <line x1="83" y1="37" x2="117" y2="94" stroke="accent"/>
    <line x1="83" y1="94" x2="117" y2="94" stroke="warning" stroke-width="5"/>
  </view>
</drawing>
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
  '线性折线的 scrub 创建滑杆和读数。用 marks 属性写 [[4,"条件改变"],[10,"结束"]] 标出阶段。分流图、状态或读数也跟着变时，设一个 state time，在主曲线上写 scrub="观察时刻" bind="$state.time"，其他图用 cursor="$state.time"，纯数值或图元用同一个 state 计算。每个可调值都须改变图里的对应结果。',
  '构图随问题变化。空间结构用剖面或叠层，分流用路径和瓶颈，多个情况用共享尺度。标注贴近对象，保留参照物。只在两种视角各自解释一个疑问时增加第二张图。',
  '同一量的多种情况要共用横、纵坐标，读数也要对齐到同一时刻。折线 series 可写成 [["情况甲",[[0,100],[10,80],[20,68]]],["情况乙",[[0,100],[10,60],[20,42]]]]，最多四条。每条写出名称和至少两个按横坐标顺序排列的点，范围外没有读数。图上比较变化速度时，优先让各条曲线用同一组横坐标。',
  '要切换整组正文、图和读数，用 <views label="对照主题"><view label="第一种情况" caption="变化的解释">…</view><view label="第二种情况">…</view></views>。需要和其他控件联动时，为 views 写 bind="$state.名称"，两项 view 用不同的 value。drawing 内的 view 只放图元，用于切换同一张图的图层。',
  '只使用约定中的语法和函数。角度用 sin(x)、cos(x)，参数是弧度。SVG 的 label.text 可写 $state.n + " 单位"；动态正文先用 derive 拼接整句，再使用 <text text="$state.sentence"/>。算式未知时用少数已验证的离散状态。定义统一的单位与假设，至少把一个题设值代入并核对图与正文是否一致。初值和边界的图元、标签都应留在画布内。一幅静态图足够时就直接呈现。教学示意与实测分开。',
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
