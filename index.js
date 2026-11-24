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
  '用 iui 围栏包住 miopiik-ml 的 <ui density="auto" fallback="一句话保留核心解释">…</ui>。drawing 用 width/height/label，内部可混用共享图形和 2–6 个 <view label="条件" caption="图上变化所说明的事">…</view>。每个 view 只放该条件下的图形。选择器和图注由宿主生成，无需写 state、按钮、公式；尺寸和坐标用数字。',
  '图形原语 rect(x,y,width,height,rx)、circle(cx,cy,r)、line(x1,y1,x2,y2)、path(d)、label(x,y,text,size,align)。fill/stroke 用主题色 text/muted/border/surface/accent/neutral/success/warning/danger/info/none，线宽 stroke-width。尺寸以外的图形参数可用完整 $state 名称绑定。公式放 derive，when/is 控制显隐。',
  '数据用 chart(kind=bar/line/donut)、table、metric、diagram(node/edge)、steps(step)；row 横向就近、column 纵向，details 保留推导。chart.series 和 table.rows 可直接写 JSON 点列、完整绑定或纯表达式。state 的 value 和 options 只用合法 JSON；控件 bind="$state.名称"，slider 设 min/max/step，toggle 绑定布尔，segmented 的 options 是 [{"label":"选项","value":"x"}]。button 支持 set/append/pop/reset（bind、value、max 或 min）和用户触发的 copy。',
  'derive 支持四则、比较、条件、round/min/max。数组用 len/at/gather/join/zip/dot/matvec/scale/softmax/roundEach，索引只用 at(a,i)，roundEach 的第二参数是小数位整数。调温的概率可用 softmax(scale(logits,1/T))，用 zip(标签数组,概率数组) 配对。让结果真正使用输入，用两种输入检查。',
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
  `例如解释一批任务如何减少，将滑杆直接连到同一张图：
${FENCE}iui
<ui density="auto" fallback="每分钟做得更快时，剩余任务下降得更快">
  <state name="rate" value="6"/>
  <slider label="每分钟处理几份" bind="$state.rate" min="2" max="15" step="1"/>
  <chart kind="line" series='[["开始",30],["1 分钟",30-$state.rate],["2 分钟",30-2*$state.rate]]' source="这批任务剩余份数"/>
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
