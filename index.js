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

export function apply(ctx) {
  ctx.inject(['systemPrompt'], (scope) => {
    scope.systemPrompt.section({
      name: 'miopiik-iui:render-contract',
      order: 670,
      // The charter carries literal braces, fences and attribute quotes; it is
      // not a DSH prompt template, so interpolation stays off.
      interpolate: false,
      text: IUI_CHARTER,
    })
  })
}
