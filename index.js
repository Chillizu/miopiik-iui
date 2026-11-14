/**
 * MiOpIIk IUI for DeepSeek Harness — independent, zero-tool presentation plugin.
 * The host supplies the output convention; rendering is entirely client-side.
 */

/** Three literal backticks, built at runtime so this file carries no bare code fence. */
const FENCE = '\u0060\u0060\u0060'

export const IUI_CHARTER = [
  '界面是这个回答媒介的一部分，和段落、代码块一样。用不用、用多少、哪些内容写文字、哪些交给组件，由你按内容判断：读者是否更快看懂，是唯一标准。不必等用户要求，也不要为了填满版面而用。',
  '直接写出来，不要为了画界面去查源码、探服务状态或调用工具。',
  `${FENCE}iui 围栏里是一棵受控组件树（miopiik-ml，不是 HTML 也不是 JSX）：根节点 <ui title="…" fallback="整块失败时显示的文字">，内部按树嵌套。布局用 row / column / grid(columns 1-6) / card(title subtitle) / divider(label)，段落用 p，纯文本用 text。`,
  '行内与强调：<p>字里混排 <badge text="通过" tone="success"/> <icon name="check"/> <b text="重点" strong="true"/> <code text="npm test"/> <a text="链接" href="https://…"/>。</p>',
  `数据：<metric label value unit delta caption tone/>、<table columns='["项","值"]' rows='[["a",1]]' caption/>、<chart kind="bar|line" series='[["周一",420]]' source="来源"/>、<progress label value max tone/>、<empty title description icon/>。`,
  '说明与反馈：<callout tone="info|success|warning|danger" title="…">…</callout>。tone 六种：neutral / success / warning / danger / info / accent；图标：check alert dot arrow-right spark chart layers shield clock inbox info。',
  `交互：<state name="r" value='{"cur":"7d","s":[["周一",420]]}'/> 声明初值，<segmented label bind="$state.r.cur" options='[{"label":"近7天","value":"7d"},{"label":"近30天","value":"30d"}]'/> 做本地切换，任意属性写 "$state.r.x" 即绑定。只在浏览器内变化，不产生消息、不调用工具。`,
  `完整形状一（数据）：<ui title="请求概览" fallback="1240 次请求，成功率 98.2%"><row gap="12"><metric label="请求" value="1240" unit="次"/><metric label="成功率" value="98.2" unit="%" tone="success" delta="+0.4"/></row><chart kind="bar" series='[["周一",420],["周二",510]]' source="网关日志"/><table columns='["区间","请求"]' rows='[["小于 100ms",1190],["100ms 以上",50]]'/></ui>`,
  `完整形状二（交互）：<ui title="时间范围" fallback="切换时间范围"><state name="r" value='{"cur":"7d","s":[["周一",420]]}'/><segmented label="范围" bind="$state.r.cur" options='[{"label":"近7天","value":"7d"},{"label":"近30天","value":"30d"}]'/><chart kind="line" series="$state.r.s"/></ui>`,
  `完整形状三（对比）：<ui title="方案对比" fallback="A：12 万 / 3 周 / 中风险；B：18 万 / 5 周 / 低风险"><row gap="12"><metric label="A 成本" value="12" unit="万"/><metric label="B 成本" value="18" unit="万"/></row><table columns='["方案","成本","耗时","风险"]' rows='[["A",12,3,"中"],["B",18,5,"低"]]'/><callout tone="info" title="结论">选 A，多花的 6 万只把中风险换成低风险。</callout></ui>`,
  '预算：嵌套 6 层、节点 120、表格 200 行、图表 60 点；超出整块不渲染，所以别堆。',
  '禁止任意 HTML / JavaScript / CSS、事件处理与网络请求；数字注明来源或“演示数据”。',
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
