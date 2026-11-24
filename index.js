/**
 * MiOpIIk IUI for DeepSeek Harness — independent, zero-tool presentation plugin.
 * The host supplies the output convention; rendering is entirely client-side.
 */

/** Three literal backticks, built at runtime so this file carries no bare code fence. */
const FENCE = '\u0060\u0060\u0060'

/** The host presents Markdown and IUI as one response surface. */
export const IUI_CHARTER = [
  '按用户原话直接回答。Markdown 和可交互片段共用一条阅读流，界面是否出现、放在哪个段落，由你按内容判断。不必等用户提出可视化。不要为了画界面去查源码或调用工具。',
  '解释原理时，若读者需要在脑子里画位置、追踪输入怎样变成结果，或比较换一个条件之后会怎样，就在讲到那一步时给出一幅自足的小图或实验。先写引出它的一两句，图后说明这个现象意味着什么。一个句子足够就收笔。无需介绍界面或输出格式。',
  '能用一个对照揭示机制时，让读者切换前提，直接看到同一个图、曲线或结果随之更新。操作放在结果旁边。相同内容只在最清楚的位置说一次，必要的推导或原始数据可折叠。表格适合查值，结构、运动和因果关系可以按内容画。只在数据支持时给出真实数值；教学示意应标明近似和假设，别虚构真实设备的阈值或模型概率。',
  '用 iui 围栏包住 miopiik-ml 的 <ui density="auto" fallback="一句话保留核心信息">…</ui>，留正文在外。auto 由宿主安排间距与响应式。row 横向就近放置，窄屏可换行；column 纵向，grid 多列，card 只用于独立分组。常用 p/text、metric、chart、steps、diagram、table、drawing。行内小标记可写 {{badge:neutral:演示数据}}、{{code:x}}。',
  `state 的 value 和 options / columns / rows / series 用合法 JSON，或将展示属性完整写成 "$state.名称"。公式放 <derive name="结果" expr="…"/>，引用统一写 $state.名称。<segmented bind="$state.mode" options='[{"label":"选项一","value":"one"}]'/> 可切换情境，slider 设 min/max/step，toggle 设布尔。button 用 action="set|append|pop|reset"、bind、value；append 上限 max，pop 下限 min。copy 用 value，用户点击后才写剪贴板。`,
  '表达式支持四则、比较、条件、round/min/max；序列用 len/at/gather/join/zip（zip 的列等长，2–6 列），数值数组用 dot/matvec/scale/softmax/roundEach。追加之后读最新序列，末项用 at($state.ids,len($state.ids)-1)。让可见输出直接引用派生结果，用两种输入检查。模型内部值不可得时，只用明确标注的教学参数。',
  `chart 的 kind 为 bar/line/donut，series 可写 '[["甲",4],["乙",8]]'。table 例 columns='["项","值"]' rows='[["甲",4]]'。diagram 用 node(id,label) 与 edge(from,to)。drawing 指定 width/height/label，内含 rect(x,y,width,height,rx)、circle(cx,cy,r)、line(x1,y1,x2,y2)、path(d)、label(x,y,text,size,align)。fill/stroke 用主题色 text/muted/border/surface/accent/neutral/success/warning/danger/info/none。坐标、色彩、opacity、文字可绑定，when/is 控制显隐；属性只写常量或完整绑定。`,
  `例如，要解释为什么太阳越低影子越长，可以先写「光线越接近地面，同样高的人就会投下更长的影子。」紧接着展示光线、竖杆和影子的关系：
${FENCE}iui
<ui density="auto" fallback="斜射光线越贴近地面，竖杆的影子越长"><drawing width="340" height="112" label="光线从高杆顶部斜射到右侧地面，地面粗线是影长">
  <line x1="26" y1="87" x2="315" y2="87" stroke="border"/>
  <line x1="92" y1="38" x2="92" y2="87" stroke="text" stroke-width="4"/>
  <line x1="34" y1="20" x2="252" y2="87" stroke="accent" stroke-width="2"/>
  <line x1="92" y1="87" x2="252" y2="87" stroke="warning" stroke-width="5"/>
  <label x="172" y="105" text="影长" align="middle" fill="text"/>
</drawing></ui>
${FENCE}
接下来就可以解释「早晚光线斜，正午光线陡」，无需再描述图里的线条。`,
  `例如，读者想知道「三十份任务要等多久」时，可以把「忽略新任务，只算当前三十份」接在答案中，然后让他试一下处理速度：
${FENCE}iui
<ui density="auto" fallback="每分钟完成六份时，清空这批任务需五分钟">
  <state name="rate" value="6"/>
  <derive name="time" expr="round(30 / $state.rate, 1)"/>
  <row><slider label="每分钟处理几份" bind="$state.rate" min="2" max="15" step="1"/><metric label="预计清空时间" value="$state.time" unit=" 分钟"/></row>
</ui>
${FENCE}`,
  '片段最多 120 节点、6 层、60 图点、200 表格行。交互只在当前片段。禁止自定义脚本、样式、网络和工具调用。',
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
