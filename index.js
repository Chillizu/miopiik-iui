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
  `${FENCE}iui
<ui density="auto" fallback="试跑耗时先下降，最后小幅回升"><chart kind="line" series='[["第 1 次",24],["第 2 次",17],["第 3 次",19]]' source="演示数据"/></ui>
${FENCE}`,
  `${FENCE}iui
<ui density="auto" fallback="25% 折扣时，原价 200 元实付 150 元"><state name="discount" value="25"/><derive name="total" expr="200 * (100 - $state.discount) / 100"/><slider label="折扣" bind="$state.discount" min="0" max="50" unit="%"/><metric label="实付" value="$state.total" unit=" 元" weight="primary"/><details label="计算口径"><text>原价 200 元 × 折后比例。</text></details></ui>
${FENCE}`,
  '交互只在当前片段内生效。button 的唯一动作是用户点击复制（action="copy" + value）。每块最多 120 节点、6 层、60 图点、200 表格行。禁止自定义脚本、样式、网络和工具调用。',
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
