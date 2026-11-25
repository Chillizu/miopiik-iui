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

test('miopiik-ml：绘图及其视图内带坐标的 text 按 label 解析', () => {
  const parsed = parseMiopiikMl(`<ui>
    <text x="5" y="10">图外正文</text>
    <drawing width="200" height="100" label="低音位置">
      <text x="12" y="16" size="12" fill="muted">最低音</text>
      <view label="原位"><text x="$state.x" y="58" size="22" fill="accent">$state.low</text></view>
      <view label="转位"><text x="120" y="58" text="2026" align="end" opacity="0.5">备用文字</text></view>
    </drawing>
    <views><view label="正文甲"><text x="5" y="10">甲</text></view><view label="正文乙" caption="乙"/></views>
  </ui>`)
  assert.equal(parsed.ok, true)
  assert.deepEqual(parsed.degraded, [])
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const [prose, drawing, views] = checked.ast.root.children
  assert.equal(prose.type, 'text')
  assert.deepEqual(prose.props, { text: '图外正文' })
  const labels = [drawing.children[0], ...drawing.children.slice(1).map((pane) => pane.children[0])]
  assert.deepEqual(labels.map((label) => label.type), ['label', 'label', 'label'])
  assert.deepEqual(labels.map((label) => label.props), [
    { x: 12, y: 16, size: 12, fill: 'muted', text: '最低音' },
    { x: '$state.x', y: 58, size: 22, fill: 'accent', text: '$state.low' },
    { x: 120, y: 58, align: 'end', opacity: 0.5, text: '2026' },
  ])
  assert.equal(views.children[0].children[0].type, 'text')
})

test('miopiik-ml：绘图文本别名沿用坐标、标签和图元预算', () => {
  const parseDrawing = (content) => parseMiopiikMl(`<ui><drawing width="80" height="60" label="图">${content}</drawing></ui>`)
  const prose = parseDrawing(`一行正文<text>无坐标</text><text x="5">缺纵坐标</text>`)
  assert.deepEqual(prose.doc.root.children.map((child) => child.type), ['text', 'text', 'text'])
  const invalid = parseDrawing(`<text x="9999" y="0">越界</text><text x="0" y="0">${'字'.repeat(181)}</text><text x="0" y="0">保留</text>`)
  assert.deepEqual(invalid.doc.root.children.map((child) => child.type), ['label', 'label', 'label'])
  const checked = validateAst(invalid.doc)
  assert.equal(checked.degraded, 2)
  assert.equal(checked.ast.root.children[2].props.text, '保留')
  const overBudget = parseDrawing('<text x="0" y="0">字</text>'.repeat(65))
  assert.equal(validateAst(overBudget.doc).ok, false)
})

test('miopiik-ml：完整 XML 注释跳过，流式未闭合注释保留后续组件', () => {
  const parsed = parseMiopiikMl(`<!-- before <ui/> --><ui>
    <text>前<!-- <script>alert(1)</script> -->后</text>
    <drawing width="80" height="60" label="图"><!-- x < y，忽略 <rect/> -->
      <rect x="0" y="0" width="20" height="10"/>
    </drawing>
    <steps><step title="注释夹在文字中间">说<!-- <step/> -->明</step></steps>
  </ui>`)
  assert.deepEqual(parsed.degraded, [])
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const [prose, drawing, steps] = checked.ast.root.children
  assert.equal(prose.props.text, '前后')
  assert.deepEqual(drawing.children.map((child) => child.type), ['rect'])
  assert.equal(steps.children[0].props.note, '说明')

  const partial = parseMiopiikMl('<ui><column><metric label="先" value="1"/><!-- 未闭合<metric label="后" value="2"/>', { streaming: true })
  assert.equal(partial.ok, true)
  const metrics = partial.doc.root.children.filter((child) => child.type === 'metric')
  assert.deepEqual(metrics.map((metric) => metric.props.label), ['先', '后'])
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

test('miopiik-ml：play 时长解析为字面秒数并由 AST 限定适用控件', () => {
  const parsed = parseMiopiikMl(`<ui><state name="v" value="0"/><column>
    <slider bind="$state.v" min="0" max="10" step="1" play="2.5"/>
    <chart kind="line" scrub="时间" play="4" series='[[0,1],[10,2]]'/>
  </column></ui>`)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.doc.root.children[0].props.play, 2.5)
  assert.equal(parsed.doc.root.children[1].props.play, 4)
  assert.equal(validateAst(parsed.doc).ok, true)
  for (const source of [
    '<ui><state name="v" value="0"/><slider bind="$state.v" play="0.2"/></ui>',
    '<ui><chart kind="line" play="2" series="[[0,1],[1,2]]"/></ui>',
    '<ui><chart kind="interval" play="2" series="[[&quot;A&quot;,0,1,&quot;x&quot;]]"/></ui>',
    '<ui><state name="v" value="1"/><slider bind="$state.v" play="$state.duration"/></ui>',
  ]) assert.equal(validateAst(parseMiopiikMl(source).doc).ok, false, source)
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

test('miopiik-ml：diagram 将 lane 内 edge 提升到图级，并把 label 规范为 title', () => {
  const parsed = parseMiopiikMl(`<ui density="auto" fallback="消息先存到服务器并排好序，离线期间保存着，联网后按序号补发">
    <diagram label="两条消息从发送到补发的路径">
      <lane label="在线">
        <node id="s" label="发送方"/>
        <node id="srv" label="服务器" note="落库 + 分配序号"/>
        <node id="r" label="接收方"/>
        <edge from="s" to="srv" label="消息 1"/>
        <edge from="srv" to="r" label="推送 1"/>
      </lane>
      <lane label="离线期间">
        <node id="buf" label="消息 1 暂存" note="服务器排队中"/>
        <node id="buf2" label="消息 2 暂存" note="序号更大"/>
        <edge from="srv" to="buf" label="无法推送"/>
        <edge from="srv" to="buf2" label="无法推送"/>
      </lane>
      <lane label="重新联网">
        <node id="ack" label="上报最大序号"/>
        <node id="fill" label="按序号补发" note="消息 1 然后消息 2"/>
        <node id="done" label="接收方看到"/>
        <edge from="r" to="ack" label="sync"/>
        <edge from="ack" to="fill"/>
        <edge from="buf" to="fill"/>
        <edge from="buf2" to="fill"/>
        <edge from="fill" to="done"/>
      </lane>
    </diagram>
  </ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const diagram = checked.ast.root
  assert.equal(diagram.props.title, '两条消息从发送到补发的路径')
  assert.equal(diagram.props.label, undefined)
  assert.deepEqual(diagram.children.map((child) => child.type), ['lane', 'lane', 'lane', ...Array(9).fill('edge')])
  assert.deepEqual(diagram.children.slice(3).map((edge) => edge.props.from), ['s', 'srv', 'srv', 'srv', 'r', 'ack', 'buf', 'buf2', 'fill'])
  assert.equal(diagram.children[0].children.length, 3, 'lane 中只保留节点')
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
