import test from 'node:test'
import assert from 'node:assert/strict'

import { validateAst } from '../shared/iui-ast.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'

test('已完整闭合的 JSON 状态串能从弯引号恢复，保留之后的标签', () => {
  const parsed = parseMiopiikMl(`<ui><state name="phase" value='"故障"‘/><metric label="当前" value="$state.phase"/></ui>`)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.degraded, [])
  assert.equal(parsed.doc.state.phase, '故障')
  assert.equal(parsed.doc.root.type, 'metric')
})

const ML = `<ui title="周活跃" fallback="近7天活跃45次">
  <state>{"range":{"current":45,"prev":31,"series":[["一",12]]}}</state>
  <column gap="10">
    <text>切换范围只改本地状态。</text>
    <row gap="12">
      <metric label="当前" value="$state.range.current" unit="次"/>
      <metric label="上一" value="$state.range.prev" unit="次"/>
    </row>
    <segmented label="范围" bind="$state.range" options='[{"label":"近7天","value":{"current":45}}]'/>
    <chart kind="bar" series="$state.range.series" source="示例"/>
  </column>
</ui>`

test('miopiik-ml：嵌套结构编译成 AST 并通过唯一校验器', () => {
  const parsed = parseMiopiikMl(ML)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.doc.title, '周活跃')
  assert.equal(parsed.doc.root.type, 'column')
  const [text, row] = parsed.doc.root.children
  assert.equal(text.type, 'text')
  assert.equal(text.props.text, '切换范围只改本地状态。')
  assert.equal(row.type, 'row')
  assert.equal(row.children[0].props.value, '$state.range.current')

  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  assert.deepEqual(Object.keys(checked.ast.state), ['range'])
})

test('miopiik-ml：未知标签/脚本只降级子树，兄弟与父布局保留', () => {
  const parsed = parseMiopiikMl('<ui fallback="f"><column><text>保留我</text><script>alert(1)</script><metric label="a" value="1"/></column></ui>')
  assert.equal(parsed.ok, true)
  const types = parsed.doc.root.children.map((node) => node.type)
  assert.deepEqual(types, ['text', 'text', 'metric'])
  assert.match(parsed.degraded.join(''), /script/)
  assert.equal(parsed.doc.root.children[0].props.text, '保留我')
  // script 内容绝不会变成组件或可执行内容
  assert.equal(JSON.stringify(parsed.doc).includes('alert'), false)
})

test('miopiik-ml：半截/未闭合保留已写出的文本，不整段丢失', () => {
  const parsed = parseMiopiikMl('<ui fallback="半截"><column><text>已经写了一半')
  assert.equal(parsed.ok, true)
  assert.equal(parsed.doc.root.type, 'text')
  assert.equal(parsed.doc.root.props.text, '已经写了一半')
  assert.match(parsed.degraded.join(''), /没有闭合/)
})

test('miopiik-ml：card/grid/table 是通用组合原语，不是预设卡片', () => {
  const parsed = parseMiopiikMl(`<ui fallback="f">
    <grid columns="2" gap="12">
      <card title="左"><metric label="A" value="1"/><text>说明</text></card>
      <card title="右"><table columns='["项","值"]' rows='[["x",1]]' caption="口径"/></card>
    </grid>
  </ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  const grid = checked.ast.root
  assert.equal(grid.type, 'grid')
  assert.equal(grid.children.length, 2)
  assert.equal(grid.children[0].type, 'card')
  assert.equal(grid.children[1].children[0].type, 'table')
})

test('miopiik-ml：views 的内容可以使用同一个状态和任意受信组件', () => {
  const source = `<ui><state name="stage" value='"working"'/>
    <views label="2026" bind="$state.stage">
      <view label="处理数据" value='"working"' caption="正在读取输入"><metric label="进度" value="1"/></view>
      <view label="整理结果" value='"result"'><text>已完成</text></view>
    </views>
  </ui>`
  const { doc, degraded } = parseMiopiikMl(source)
  const checked = validateAst(doc)
  assert.deepEqual(degraded, [])
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const { root } = checked.ast
  assert.deepEqual(root.props, { label: '2026', bind: '$state.stage' })
  assert.deepEqual(root.children.map((pane) => pane.props.value), ['working', 'result'])
  assert.deepEqual(root.children.map((pane) => pane.children[0].type), ['metric', 'text'])
})

test('miopiik-ml：只归并相邻正文视图，不修改绘图图层、周边正文或状态', () => {
  const source = `<ui>
    <text>开头</text>
    <view label="初始"><drawing width="40" height="40" label="位置"><rect x="0" y="0" width="10" height="10"/></drawing></view>
    <view label="后来" caption="出现新结果"><text>过程结束</text></view>
    <drawing width="40" height="40" label="局部">
      <view label="原始" value="ignored"><line x1="0" y1="0" x2="10" y2="10"/></view>
      <view label="变化"><line x1="0" y1="0" x2="12" y2="10"/></view>
    </drawing>
    <view label="单独"><text>未归并</text></view>
    <text>结尾</text>
  </ui>`
  const parsed = parseMiopiikMl(source)
  assert.deepEqual(parsed.degraded, [])
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 1)
  assert.deepEqual(checked.ast.state, {})
  const [leading, group, drawing, orphan, trailing] = checked.ast.root.children
  assert.equal(group.type, 'views')
  assert.deepEqual(group.props, {})
  assert.deepEqual(group.children.map((pane) => pane.props.label), ['初始', '后来'])
  assert.deepEqual([leading.props.text, trailing.props.text], ['开头', '结尾'])
  assert.deepEqual(drawing.children.map((pane) => pane.type), ['view', 'view'])
  assert.equal(drawing.children[0].props.value, undefined)
  assert.equal(orphan.degraded, true)
})

test('miopiik-ml：可切换视图遵守状态写入约束、容量与内容类型', () => {
  const valid = '<view label="第一" value="one" caption="第一段"/><view label="第二" value="two" caption="第二段"/>'
  const check = (attrs, children = valid) => validateAst(parseMiopiikMl(`<ui><views ${attrs}>${children}</views></ui>`).doc)
  assert.equal(check('').ok, true)
  assert.equal(check('bind="$data.phase"').ok, false)
  assert.equal(check('bind="$state.__proto__"').ok, false)
  assert.equal(check('bind="$state.phase"', valid.replace('value="two"', 'value="one"')).ok, false)
  assert.equal(check('bind="$state.phase"', valid.replace('value="two"', '')).ok, false)
  assert.equal(check('', valid.repeat(4)).ok, false)
  assert.equal(check('', '<text>只能有视图</text>' + valid).ok, false)
  const badContent = check('', valid.replace('caption="第二段"/>', '><rect x="0" y="0" width="10" height="10"/></view>'))
  assert.equal(badContent.degraded, 1)
  assert.equal(badContent.ast.root.children[1].children[0].degraded, true)
})

test('miopiik-ml：没有 <ui> 根 / 空内容时明确拒绝，让调用方降级为文本', () => {
  assert.equal(parseMiopiikMl('随便一段没有标签的文字').ok, false)
  assert.equal(parseMiopiikMl('<ui fallback="f"></ui>').ok, false)
})

test('miopiik-ml：声明降级保留作者兜底，语法诊断单独返回', () => {
  const parsed = parseMiopiikMl('<ui><column><text>前</text><unknown fallback="自定义说明"/><slider fallback="参数当前不可调整"/><text>后</text></column></ui>')
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.degraded, ['<unknown> 未知标签'])
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 1)
  assert.match(checked.diagnostics[0], /bind/u)
  assert.deepEqual(checked.ast.root.children.map((node) => node.props.text), ['前', '自定义说明', '参数当前不可调整', '后'])
  assert.equal(parseMiopiikMl('<ui fallback="替代结论"/>').fallback, '替代结论')
})

test('miopiik-ml：流式保留闭合子组件，未闭合标签不渲染或回显', () => {
  const parsed = parseMiopiikMl('<ui><column><metric label="可用" value="1"/><slider label="尚未结束', { streaming: true })
  assert.equal(parsed.ok, true)
  assert.equal(parsed.doc.root.children[0].type, 'metric')
  assert.equal(parsed.doc.root.children[1].type, 'text')
  assert.equal(parsed.doc.root.children[1].props.text, '')
  assert.match(parsed.degraded.join(' '), /没有闭合/u)
})

test('miopiik-ml：id 稳定唯一，重复解析结果一致（回放/状态不漂移）', () => {
  const a = parseMiopiikMl(ML)
  const b = parseMiopiikMl(ML)
  assert.deepEqual(a.doc, b.doc)
  const ids = []
  const walk = (node) => {
    ids.push(node.id)
    for (const child of node.children) walk(child)
  }
  walk(a.doc.root)
  assert.equal(new Set(ids).size, ids.length)
})

test('miopiik-ml：toggle/slider/input/steps/step 解析成对应组件，when/is 进入 props', () => {
  const parsed = parseMiopiikMl(`<ui fallback="f">
    <state name="r" value='{"on":true,"th":5,"cur":"7d"}'/>
    <toggle label="明细" bind="$state.r.on" when="$state.r.cur" is="7d"/>
    <slider label="阈值" bind="$state.r.th" min="0" max="10" unit="次"/>
    <input bind="$state.r.on" placeholder="搜索…"/>
    <steps><step title="解析" note="miopiik-ml" tone="success"/><step title="校验"/></steps>
  </ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  assert.deepEqual(checked.ast.root.children.map((node) => node.type), ['toggle', 'slider', 'input', 'steps'])
  assert.equal(checked.ast.root.children[0].props.is, '7d', 'when/is 必须进入 props')
  assert.deepEqual(checked.ast.root.children[3].children.map((node) => node.props.title), ['解析', '校验'])
})

test('miopiik-ml：steps 混入非 step 子节点整体降级，兄弟保留', () => {
  const parsed = parseMiopiikMl('<ui fallback="f"><column><steps><step title="一"/><text>混入</text></steps><metric label="保留" value="1"/></column></ui>')
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 1, 'steps 混入非 step 子节点应整体降级')
  assert.equal(checked.ast.root.children.at(-1).type, 'metric', '兄弟必须保留')
})

test('miopiik-ml：行内组件可带 when，table 读取 filter', () => {
  const parsed = parseMiopiikMl(`<ui fallback="f"><p>前 <badge text="签" tone="success" when="$state.r.on"/> 后</p><table columns='["a"]' rows='[[1]]' filter="$state.r.q"/></ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  assert.equal(checked.ast.root.children[0].children[1].props.when, '$state.r.on')
  assert.equal(checked.ast.root.children[1].props.filter, '$state.r.q')
})

test('miopiik-ml：diagram/lane/node/edge 解析，散装 node 汇成首列，注释文本保留', () => {
  const parsed = parseMiopiikMl(`<ui fallback="f">
    <diagram title="链路">
      <node id="a" label="拉取"/>
      <lane label="执行"><node id="b" label="构建" tone="success" note="两阶段"/></lane>
      注释行：虚线表示异步
      <edge from="a" to="b" kind="dashed"/>
    </diagram>
  </ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const diagram = checked.ast.root
  assert.deepEqual(diagram.children.map((child) => child.type), ['lane', 'lane', 'text', 'edge'])
  assert.equal(diagram.children[0].props.label, undefined, '散装 node 合成的首列没有 label')
  assert.equal(diagram.children[0].children[0].props.id, 'a')
  assert.equal(diagram.children[1].children[0].props.tone, 'success')
  assert.equal(diagram.children[3].props.kind, 'dashed')
})

test('miopiik-ml：lane 混入非 node 子节点整体降级，diagram 保留其余 lane', () => {
  const parsed = parseMiopiikMl(`<ui fallback="f"><diagram><lane label="坏列"><node id="a" label="甲"/><text>混入</text></lane><lane label="好列"><node id="b" label="乙"/></lane></diagram></ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 1, '坏列应整体降级')
  const diagram = checked.ast.root
  assert.equal(diagram.children.filter((child) => child.type === 'lane').length, 1, '好列必须保留')
})
