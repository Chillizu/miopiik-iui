/**
 * MiOpIIk IUI for DeepSeek Harness — independent, zero-tool presentation plugin.
 * The host supplies the output convention; rendering is entirely client-side.
 */

/** Three literal backticks, built at runtime so this file carries no bare code fence. */
const FENCE = '\u0060\u0060\u0060'

/** The host presents Markdown and IUI as one response surface. */
export const IUI_CHARTER = [
  '用 Markdown 回答。文字、行内标记和交互片段可以自然混排，是否使用 IUI、放在哪里，由你按内容判断。不要为了画界面去查源码或调用工具。',
  '让每个片段替读者完成一件事，例如扫一眼趋势、改一个前提、查一个口径。同一组数字或步骤只放在最顺手的一处。正文交代结论与边界，片段承接比较、结构或试算。一个句子能交代清楚的内容可以直接写。',
  '句子中可以直接补一个简短的范围或状态，例如 样本 {{badge:neutral:300 次请求}}。行内也支持 {{icon:check}} 和 {{code:npm test}}。图表和控件作为独立 iui 围栏嵌在前后文之间。',
  'iui 围栏内用 miopiik-ml。以 <ui density="auto" fallback="一句话说明主要结果"> 开始，以 </ui> 结束。auto 按内容选择无边框片段、紧凑块或面板，也可指定 inline / compact / panel。用 weight="primary" 突出主要结果，用 details 收起次要口径。排版、主题与响应式交给宿主。',
  '组合原语：row/column/grid/card 排列内容，p/text/badge 描述，metric/progress/table/chart 展示数据，steps/diagram 呈现顺序与关系，details 展开细节。图表和表格应注明数据来源或标明是演示数据。',
  `数据写法：<metric label="耗时" value="24" unit=" ms"/>；<chart kind="line" series='[["周一",24],["周二",17]]'/>（bar/line/donut）；<table columns='["项","值"]' rows='[["缓存",24]]'/>。流程图用 <diagram><node id="a" label="入口"/><node id="b" label="缓存"/><edge from="a" to="b"/></diagram>。`,
  `联动值写入 bind="$state.x"，when 加 is 控制显隐。state 的 value 和 columns/rows/series/options 用合法 JSON，例如 <state name="mode" value='"week"'/>、<segmented bind="$state.mode" options='[{"label":"一周","value":"week"}]'/>。运算都放进 derive 的 expr，支持算术、==、!=、条件表达式和 round/min/max。展示属性可以整体绑定为 "$state.result"。`,
  '读者能用给定数据改一个前提来复算时，可以放一个控件。控件写入 state，derive 读取它，至少一个可见结果读取派生值。输出前用两个输入验算，确认结果真的变化。固定事实用固定结果表达，示例或假设注明口径。',
  '需要重复执行的实验用 button 触发本地状态转换：set 写 value，append 将 value 加到数组末尾（max 缺省 32），pop 删除末项（min 保留下限），reset 恢复该绑定的初始值。四者都用 bind="$state.x"。append 后用 len(ids)-1 取新的末项，或者用 gather 读取整个序列。把共享状态的图、控制与结果放在同一个 ui 里。',
  '数组运算用 len(a)、at(a,i)、gather(a,indices)、join(a,sep)、zip(a,b,…)；索引从 0 起，zip 将各列合成表格行。数值运算用 dot(a,b)、matvec(matrix,v)、scale(a,k)、softmax(a)、roundEach(a,小数位数)。分数与概率分开算，可用 softmax(scale(logits,1 / T))。数组函数接收真实数组，数字数组中不要混入文本。',
  '自定义示意图用 drawing，指定 width、height 和可访问的 label。形状：rect(x y width height rx)、circle(cx cy r)、line(x1 y1 x2 y2)、path(d)、label(x y text size align)。填充和描边的主题色为 text、muted、border、surface、accent、neutral、success、warning、danger、info、none。坐标、颜色、透明度 opacity（0–1）与文字可绑定。属性接受常量或完整的 $state.x，公式只写进 derive。画笔粗细用 stroke-width，图层用 when/is。',
  `${FENCE}iui
<ui density="auto" fallback="试跑耗时先下降，最后小幅回升"><chart kind="line" series='[["第 1 次",24],["第 2 次",17],["第 3 次",19]]' source="演示数据"/></ui>
${FENCE}`,
  `${FENCE}iui
<ui density="auto" fallback="从 A → B 开始，可追加或撤销一项"><state name="ids" value="[0,1]"/><derive name="seq" expr='join(gather(["A","B"],$state.ids)," → ")'/><derive name="last" expr='at(["A","B"],at($state.ids,len($state.ids)-1))'/><metric label="当前序列" value="$state.seq"/><metric label="末项" value="$state.last"/><row><button label="追加 A" action="append" bind="$state.ids" value="0" max="8"/><button label="撤销" action="pop" bind="$state.ids" min="2"/></row></ui>
${FENCE}`,
  `${FENCE}iui
<ui density="auto" fallback="小球越过中点时变色"><state name="x" value="60"/><derive name="paint" expr="$state.x > 120 ? 'warning' : 'accent'"/><slider label="球的位置" bind="$state.x" min="24" max="216"/><drawing width="240" height="84" label="沿导轨移动的小球"><line x1="16" y1="50" x2="224" y2="50" stroke="border" stroke-width="2"/><circle cx="$state.x" cy="40" r="10" fill="$state.paint"/><label x="120" y="73" text="导轨" align="middle" fill="muted"/></drawing></ui>
${FENCE}`,
  '交互只在当前片段内生效。copy 动作用 value，用户点击后才写剪贴板。每块最多 120 节点、6 层、60 图点、200 表格行。禁止自定义脚本、样式、网络和工具调用。',
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
