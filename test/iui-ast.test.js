import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IUI_VERSION, chartIntervals, chartMarks, chartTraces, readBinding, resolveValue, selectDerivePlan, validateAst } from '../shared/iui-ast.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'

const good = () => ({
  title: 't',
  state: { range: { current: 1 } },
  fallback: 'f',
  root: {
    id: 'root',
    type: 'column',
    children: [
      { id: 'm', type: 'metric', props: { label: 'a', value: '$state.range.current' } },
      { id: 'c', type: 'chart', props: { kind: 'bar', series: [['x', 1]] } },
    ],
  },
})

test('合法 AST：版本、绑定、状态初值都保留', () => {
  const checked = validateAst(good())
  assert.equal(checked.ok, true)
  assert.equal(checked.ast.version, IUI_VERSION)
  assert.equal(checked.ast.root.children.length, 2)
  assert.deepEqual(resolveValue('$state.range.current', { state: { range: { current: 7 } } }), 7)
})

test('未知组件只降级该子树：父布局与合法兄弟保留', () => {
  const bad = good()
  bad.root.children.push({ id: 'x', type: 'qrcode', props: {}, fallback: '这段是坏节点' })
  const checked = validateAst(bad)
  assert.equal(checked.ok, true, '局部降级不应整份拒绝')
  assert.equal(checked.degraded, 1)
  const degraded = checked.ast.root.children.at(-1)
  assert.equal(degraded.type, 'text')
  assert.equal(degraded.props.text, '这段是坏节点')
  assert.equal(checked.ast.root.children[0].type, 'metric', '合法兄弟必须保留')
  assert.equal(checked.ast.root.type, 'column', '父布局必须保留')
})

test('省略表头的表格恢复位置数据，并拒绝对象行和超列预算', () => {
  const check = (rows) => {
    const doc = good()
    doc.root.children.push({ type: 'table', props: { rows } })
    return validateAst(doc)
  }
  const live = check('[["间隔", $state.range.current, "秒"]]')
  assert.equal(live.degraded, 0)
  assert.equal(live.ast.root.children.at(-1).datasetExpression.ok, true)
  assert.equal(check([['班次', 27], ['间隔', 133, '秒']]).degraded, 0)
  assert.equal(check([{ name: '班次', value: 27 }]).degraded, 1)
  assert.equal(check([Array(13).fill(1)]).degraded, 1)
})

test('根节点损坏 / 预算超限：整份拒绝（安全边界）', () => {
  assert.equal(validateAst({ root: { id: 'r', type: 'nope' }, fallback: 'f' }).ok, false)
  const deep = (() => { let node = { id: 'leaf', type: 'text', props: { text: 'x' } }; for (let i = 0; i < 6; i += 1) node = { id: `n${i}`, type: 'column', children: [node] }; return node })()
  assert.equal(validateAst({ root: deep, fallback: 'f' }).ok, false)
})

test('预算：深度与节点数超限被拒', () => {
  let deep = { id: 'leaf', type: 'text', props: { text: 'x' } }
  for (let i = 0; i < 6; i += 1) deep = { id: `n${i}`, type: 'column', children: [deep] }
  assert.equal(validateAst({ root: deep, fallback: 'f' }).ok, false)

  const wide = { id: 'root', type: 'row', children: Array.from({ length: 130 }, (_, i) => ({ id: `t${i}`, type: 'text', props: { text: 'x' } })) }
  assert.equal(validateAst({ root: wide, fallback: 'f' }).ok, false)
})

test('绑定只接受 $state / $data，其余按字面量处理；segmented 的 bind 必须是 $state', () => {
  assert.deepEqual(readBinding('$state.a'), { scope: 'state', key: 'a' })
  assert.deepEqual(readBinding('$data.a'), { scope: 'data', key: 'a' })
  assert.deepEqual(readBinding('$fn.eval("x")'), { literal: '$fn.eval("x")' })
  const badBind = validateAst({ fallback: 'f', root: { id: 'r', type: 'column', children: [{ id: 's', type: 'segmented', props: { bind: '$data.x', options: [{ label: 'a', value: 1 }] } }] } })
  assert.equal(badBind.ok, true, '子节点非法应局部降级')
  assert.equal(badBind.degraded, 1)
})

test('实验入口：默认关闭、localStorage 记忆、AST 校验器已内联进客户端', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.ok(client.includes('IUI_AST.validateAst'))
  assert.ok(client.includes('data-iui-output'))
  assert.ok(client.includes('aria-pressed'))
})

test('防回归：客户端内联块里 return 的标识符在真源里都有定义（曾因 degradeToText 被删导致整插件不启动）', async () => {
  const { readFileSync } = await import('node:fs')
  const module = await import('../shared/iui-ast.js')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const start = client.indexOf('const IUI_AST = (() => {')
  const stop = client.indexOf('const MIOPIIK_ML = (() => {')
  assert.ok(start > 0 && stop > start, '找不到内联的 IUI_AST 块')
  const block = client.slice(start, stop)
  const tail = block.slice(block.lastIndexOf('return {'))
  const names = tail.slice('return {'.length, tail.indexOf('}')).split(',').map((part) => part.trim()).filter(Boolean)
  for (const name of names) {
    assert.notEqual(module[name], undefined, `${name} 在内联块里被导出，但真源没有定义`)
  }
})

test('本地交互控件：toggle/slider/input 必须绑定 $state，缺 bind 或绑到别处只降级自身', () => {
  const compile = (children) => validateAst({ fallback: 'f', state: { r: { on: true, th: 5 } }, root: { id: 'r', type: 'column', children } })
  const ok = compile([
    { id: 't', type: 'toggle', props: { label: '开关', bind: '$state.r.on' } },
    { id: 's', type: 'slider', props: { label: '阈值', bind: '$state.r.th', min: 0, max: 10, step: 1, unit: '次' } },
    { id: 'i', type: 'input', props: { bind: '$state.r.on', placeholder: '搜索' } },
  ])
  assert.equal(ok.ok, true)
  assert.equal(ok.degraded, 0)
  for (const type of ['toggle', 'slider', 'input']) {
    assert.equal(compile([{ id: 'x', type, props: { bind: '$data.r.on' } }]).degraded, 1, `${type} 绑定非 $state 应降级`)
    assert.equal(compile([{ id: 'y', type, props: {} }]).degraded, 1, `${type} 缺 bind 应降级`)
  }
})

test('slider：min/max/step 必须是数字，max 必须大于 min', () => {
  const compile = (extra) => validateAst({ fallback: 'f', state: { r: { th: 5 } }, root: { id: 'r', type: 'column', children: [{ id: 's', type: 'slider', props: { bind: '$state.r.th', ...extra } }] } })
  assert.equal(compile({ min: 0, max: 100 }).degraded, 0)
  assert.equal(compile({ min: '0' }).degraded, 1, '字符串 min 应降级')
  assert.equal(compile({ step: -1 }).degraded, 1, '负 step 应降级')
  assert.equal(compile({ min: 10, max: 5 }).degraded, 1, 'max <= min 应降级')
  assert.equal(compile({ min: 0, max: 4, step: 2, play: 3 }).degraded, 0)
  assert.equal(compile({ min: 0.1, max: 0.3, step: 0.2, play: 3 }).degraded, 0)
  assert.equal(compile({ min: 0, max: 1, step: 2, play: 3 }).degraded, 1, '播放范围至少应覆盖一个 step')
  for (const play of [0.49, 60.01, Infinity, '$state.duration']) {
    assert.equal(compile({ min: 0, max: 10, play }).degraded, 1, `非法 play: ${play}`)
  }
})

test('steps：只接受 step 子节点，title 必填，tone 走同一枚举', () => {
  const compile = (children) => validateAst({ fallback: 'f', root: { id: 'r', type: 'column', children: [{ id: 'st', type: 'steps', props: {}, children }] } })
  assert.equal(compile([{ id: 's1', type: 'step', props: { title: '解析' } }, { id: 's2', type: 'step', props: { title: '校验', note: '白名单', tone: 'success' } }]).degraded, 0)
  assert.equal(compile([]).degraded, 1, '空 steps 应降级')
  assert.equal(compile([{ id: 's', type: 'text', props: { text: '混入' } }]).degraded, 1, '非 step 子节点应降级')
  assert.equal(compile([{ id: 's', type: 'step', props: { note: '没有标题' } }]).degraded, 1, 'step 缺 title 应降级')
  assert.equal(compile([{ id: 's', type: 'step', props: { title: 'x', tone: 'purple' } }]).degraded, 1, '未知 tone 应降级')
})

test('chart.kind 放行 donut，其余未知 kind 仍拒绝', () => {
  const compile = (kind) => validateAst({ fallback: 'f', root: { id: 'r', type: 'column', children: [{ id: 'c', type: 'chart', props: { kind, series: [['a', 1], ['b', 2]] } }] } })
  assert.equal(compile('donut').degraded, 0)
  assert.equal(compile('line').degraded, 0)
  assert.equal(compile('pie').degraded, 1)
})

test('区间图表归一化车道、时间顺序、范围与绑定数据', () => {
  const series = [
    ['API', 4, 8, '发布', 'success'],
    ['Worker', '2', '6.0', '构建'],
    ['API', 1, 5, '准备'],
    ['API', 3, 7, '重叠阶段'],
  ]
  assert.deepEqual(chartIntervals(series), {
    min: 1, max: 8,
    lanes: [
      { label: 'API', intervals: [
        { start: 1, end: 5, label: '准备' },
        { start: 3, end: 7, label: '重叠阶段' },
        { start: 4, end: 8, label: '发布', tone: 'success' },
      ] },
      { label: 'Worker', intervals: [{ start: 2, end: 6, label: '构建' }] },
    ],
  })
  assert.equal(chartIntervals(series, [0, 10]).min, 0)
  for (const invalid of [
    [], [['A', 0, 0, 'x']], [['A', 2, 1, 'x']], [[' ', 0, 1, 'x']], [['A', 0, 1, ' ']],
    [['A', Infinity, 2, 'x']], [['A', 0, NaN, 'x']], [['A', 0, 1, 'x', 'purple']],
    [['A', '', '1', 'x']], [['A', null, 1, 'x']], [['A', 0, '0x10', 'x']], [['A', 0, '3秒', 'x']],
    [['A', 0, 1, 'x', null]], [['A', 0, 1, 'x', 'success', 'extra']],
  ]) assert.equal(chartIntervals(invalid), null, JSON.stringify(invalid))
  assert.equal(chartIntervals(Array.from({ length: 61 }, (_, i) => ['A', i, i + 1, 'x'])), null)
  assert.equal(chartIntervals(Array.from({ length: 9 }, (_, i) => [`L${i}`, 0, 1, 'x'])), null)
  const originalSeries = structuredClone(series)
  const extended = chartIntervals(series, [2, 7])
  assert.equal(extended.min, 1)
  assert.equal(extended.max, 8)
  assert.deepEqual(series, originalSeries, '范围扩展不会修改输入数据')
  for (const domain of [[4, 3], [0, Infinity], [0, 0], '0,8', [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
    assert.equal(chartIntervals(series, domain), null, JSON.stringify(domain))
  }
  assert.equal(chartIntervals([['A', 0, 1, 'x'.repeat(101)]]), null)

  const parsed = parseMiopiikMl(`<ui><chart kind="interval" label="发布窗口" x-unit="分钟" domain='[0,10]'
    series='[["API",1,5,"准备"],["Worker",3,9,"构建","info"]]'/></ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  assert.equal(checked.ast.root.props.title, '发布窗口')
  assert.equal(checked.ast.root.props.domain[1], 10)
  assert.equal(chartIntervals(checked.ast.root.props.series, checked.ast.root.props.domain).lanes.length, 2)
  assert.equal(validateAst({ root: { type: 'chart', props: { kind: 'bar', title: 'ignored', series: [['A', 1]] } } }).ast.root.props.title, undefined)

  const dynamic = validateAst({ state: { intervals: [['API', 0, 2, 'Build']], range: [0, 3] }, root: {
    type: 'chart', props: { kind: 'interval', series: '$state.intervals', domain: '$state.range' },
  } })
  assert.equal(dynamic.ok, true)
  assert.equal(validateAst({ state: { intervals: [] }, root: { type: 'chart', props: {
    kind: 'interval', series: '$state.intervals', domain: [-Number.MAX_VALUE, Number.MAX_VALUE],
  } } }).ok, false)
  const expression = validateAst({ root: { type: 'chart', props: {
    kind: 'interval', series: 'zip(["API"],[0],[2],["Build"])',
  } } })
  assert.equal(expression.ok, true)
  assert.equal(expression.ast.root.datasetExpression.ok, true)

  const interval = (overrides) => validateAst({ root: { type: 'chart', props: {
    kind: 'interval', series: [['A', 1, 2, 'x']], ...overrides,
  } } })
  assert.equal(interval({ xScale: 'linear' }).ok, false)
  assert.equal(interval({ yUnit: '件' }).ok, false)
  assert.equal(interval({ domain: [0, 1] }).ok, true)
})

test('区间图从 miopiik-ml 读取时间轴标签、播放时长和节点', () => {
  const ml = parseMiopiikMl(`<ui><column>
    <chart kind="interval" label="发布窗口" x-unit="分钟" scrub=" 经过时间 " play="2.5"
      bind="$state.time" marks='[[1," 准备 "],[4,"发布"]]' series='[["API",1,5,"准备"]]'/>
    <chart kind="interval" cursor="2.5" series='[["API",1,5,"准备"]]'/>
    <chart kind="interval" cursor="$state.time" marks="$state.marks" series='[["API",1,5,"准备"]]'/>
    <derive name="time" expr="4"/>
  </column></ui>`)
  assert.equal(ml.ok, true)
  const checked = validateAst(ml.doc)
  assert.equal(checked.ok, true)
  const [timeline, fixed, bound] = checked.ast.root.children
  assert.equal(timeline.props.title, '发布窗口')
  assert.equal(timeline.props.xUnit, '分钟')
  assert.equal(timeline.props.scrub, '经过时间')
  assert.equal(timeline.props.play, 2.5)
  assert.equal(timeline.props.bind, '$state.time')
  assert.equal(timeline.props.xScale, undefined)
  assert.deepEqual(chartMarks(timeline.props.marks), [[1, '准备'], [4, '发布']])
  assert.equal(fixed.props.cursor, 2.5)
  assert.equal(bound.props.cursor, '$state.time')
  assert.equal(bound.props.marks, '$state.marks')
  assert.match(checked.diagnostics[0], /derive\.name 与控件绑定冲突：time/u)
})

test('区间图接受独立绑定和时间节点，并按可写路径和控制冲突校验', () => {
  const state = { times: [0] }
  const interval = (overrides) => validateAst({ state, root: { type: 'chart', props: {
    kind: 'interval', series: [['A', 1, 5, '准备']], ...overrides,
  } } })
  for (const overrides of [
    { bind: '$state.time' }, { bind: '$state.times.1' }, { scrub: '时间' },
    { marks: [[0, '准备']] }, { marks: '$data.marks' },
  ]) assert.equal(interval(overrides).ok, true, JSON.stringify(overrides))
  const redundant = interval({ bind: '$state.time', cursor: '$state.time' })
  assert.equal(redundant.ok, true)
  assert.equal(redundant.ast.root.props.bind, '$state.time')
  assert.equal(redundant.ast.root.props.cursor, undefined)
  for (const overrides of [
    { cursor: 0, scrub: '时间' }, { cursor: 0, bind: '$state.time' }, { cursor: '$data.time' },
    { cursor: '$state.other', bind: '$state.time' },
    { cursor: NaN }, { scrub: '   ' }, { scrub: '$state.time' }, { scrub: '字'.repeat(121) },
    { play: 2 }, { play: 2, bind: '$state.time' }, { scrub: '时间', play: 60.01 },
    { bind: '$data.time' }, { bind: '$state.__proto__' }, { bind: '$state.times.2' },
    { marks: [[4, '发布'], [1, '准备']] },
    { marks: Array.from({ length: 7 }, (_, x) => [x, '准备']) },
  ]) assert.equal(interval(overrides).ok, false, JSON.stringify(overrides))
})

test('折线图 scrub 使用线性横轴，保留单位绑定并拒绝冲突控制', () => {
  const ml = parseMiopiikMl(`<ui><chart kind="line" scrub=" 经过时间 " x-unit="秒" y-unit="$state.unit"
    series='accumulate([[0,2],[4,-1],[12,0]],0)'/></ui>`)
  assert.equal(ml.ok, true)
  const checked = validateAst(ml.doc)
  assert.equal(checked.ok, true)
  const { props, datasetExpression } = checked.ast.root
  assert.equal(props.scrub, '经过时间')
  assert.equal(props.xScale, 'linear')
  assert.equal(props.xUnit, '秒')
  assert.equal(resolveValue(props.yUnit, { state: { unit: '件' } }), '件')
  assert.equal(datasetExpression.ok, true)
  assert.equal(ml.doc.root.props.xScale, undefined, '校验不会修改原始文档')

  const chart = (overrides) => validateAst({ root: {
    type: 'chart', props: { kind: 'line', scrub: '时间', series: [[0, 2], [4, 0]], ...overrides },
  } })
  assert.equal(chart({ yUnit: '件' }).ok, true)
  assert.equal(chart({ scrub: '字'.repeat(120) }).ok, true)
  const invalid = [
    { kind: 'bar' }, { scrub: true }, { scrub: '   ' }, { scrub: '字'.repeat(121) },
    { scrub: '$state.t' }, { cursor: 0 }, { xScale: 'ordinal' }, { series: [['开始', 2], ['结束', 0]] },
  ]
  for (const overrides of invalid) assert.equal(chart(overrides).ok, false, JSON.stringify(overrides))
  assert.equal(chart({ scrub: undefined, cursor: 0, xScale: 'linear' }).ok, true)
  assert.equal(chart({ scrub: undefined, play: 2 }).ok, false, '播放时长要求 scrub')
  assert.equal(chart({ scrub: '时间', play: 2 }).ok, true)
  for (const play of [0.49, 60.01, Infinity, '$state.duration']) {
    assert.equal(chart({ scrub: '时间', play }).ok, false, `非法 play: ${play}`)
  }
  assert.equal(validateAst({ root: { type: 'chart', props: {
    kind: 'bar', scrub: undefined, play: 2, series: [['A', 1]],
  } } }).ok, false)
})

test('时间轴支持状态联动、节点标签和派生写入保护', () => {
  const ml = parseMiopiikMl(`<ui><column>
    <chart kind="line" scrub="观察时刻" bind="$state.time" marks='[[4," 停雨 "],[10,"排空"]]' series='[[0,0],[12,2]]'/>
    <derive name="time" expr="1"/>
    <derive name="elapsed" expr="$state.time * 2"/>
  </column></ui>`)
  assert.equal(ml.ok, true)
  const checked = validateAst(ml.doc)
  assert.equal(checked.ok, true)
  const chart = checked.ast.root.children[0]
  assert.equal(chart.props.bind, '$state.time')
  assert.deepEqual(chartMarks(chart.props.marks), [[4, '停雨'], [10, '排空']])
  assert.deepEqual(checked.ast.state, {})
  assert.deepEqual(checked.derivePlan.map(({ name }) => name), ['elapsed'])
  assert.match(checked.diagnostics[0], /derive\.name 与控件绑定冲突：time/u)
})

test('互斥视图按当前状态排序同名公式并共享外层依赖', () => {
  const parsed = parseMiopiikMl(`<ui>
    <state name="mode" value='"first"'/>
    <derive name="total" expr="$state.x + $state.y"/>
    <views bind="$state.mode">
      <view label="甲" value="first">
        <derive name="y" expr="$state.x + 1"/><derive name="x" expr="2"/>
      </view>
      <view label="乙" value="second">
        <derive name="x" expr="$state.y + 1"/><derive name="y" expr="4"/>
      </view>
    </views>
    <metric label="共享" value="$state.total"/>
  </ui>`)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.degraded, 0)
  assert.equal(checked.ast.root.children.find((node) => node.type === 'views').hasConditionalDerives, true)
  const first = selectDerivePlan(checked.derivePlan, { mode: 'first' })
  assert.equal(first.errors, 0)
  assert.deepEqual(first.ordered.map(({ name }) => name), ['x', 'y', 'total'])
  assert.equal(selectDerivePlan(checked.derivePlan, { mode: 'first', slider: 10 }), first)
  const second = selectDerivePlan(checked.derivePlan, { mode: 'second' })
  assert.equal(second.errors, 0)
  assert.deepEqual(second.ordered.map(({ name }) => name), ['y', 'x', 'total'])
  assert.deepEqual(selectDerivePlan(checked.derivePlan, {}).ordered.map(({ name }) => name), ['total'])
})

test('绑定视图只在选中循环分支时计错，并拒绝可同时存在的重名', () => {
  const parsed = parseMiopiikMl(`<ui>
    <state name="mode" value='"valid"'/>
    <derive name="shared" expr="1"/>
    <views bind="$state.mode">
      <view label="循环" value="loop">
        <derive name="x" expr="$state.y"/><derive name="y" expr="$state.x"/>
      </view>
      <view label="有效" value="valid">
        <derive name="x" expr="2"/><derive name="y" expr="3"/>
        <derive name="shared" expr="4"/>
      </view>
    </views>
  </ui>`)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.degraded, 1)
  assert.match(checked.diagnostics[0], /derive\.name 重复：shared/u)
  const loop = selectDerivePlan(checked.derivePlan, { mode: 'loop' })
  assert.equal(loop.errors, 2)
  assert.deepEqual(loop.ordered.map(({ name }) => name), ['shared'])
  const valid = selectDerivePlan(checked.derivePlan, { mode: 'valid' })
  assert.equal(valid.errors, 0)
  assert.deepEqual(valid.ordered.map(({ name }) => name), ['shared', 'x', 'y'])
})

test('时间轴只接受可写的 scrub 绑定、升序节点和完整的节点数据绑定', () => {
  const state = { time: 0, times: [0], marks: [[4, '停雨']] }
  const chart = (overrides) => validateAst({ state, root: { type: 'chart', props: {
    kind: 'line', xScale: 'linear', scrub: '时刻', series: [[0, 0], [12, 2]], ...overrides,
  } } })
  for (const binding of ['$state.marks', '$data.marks']) {
    const checked = chart({ bind: '$state.time', marks: binding })
    assert.equal(checked.ok, true)
    assert.deepEqual(chartMarks(resolveValue(checked.ast.root.props.marks, { state, data: state })), [[4, '停雨']])
  }
  assert.equal(chart({ bind: '$state.times.1' }).ok, true)
  assert.equal(chart({ scrub: undefined, marks: [[4, '停雨']] }).ok, true)
  for (const overrides of [
    { bind: '$state.time', scrub: undefined }, { bind: '$data.time' }, { bind: '$state.__proto__' },
    { bind: '$state.times.2' }, { bind: '$state.times.foo' }, { bind: `$state.${'x'.repeat(65)}` },
    { kind: 'bar', xScale: undefined, scrub: undefined, marks: '$state.marks' },
  ]) assert.equal(chart(overrides).ok, false, JSON.stringify(overrides))
  assert.deepEqual(chartMarks([[0, '字'.repeat(64)]]), [[0, '字'.repeat(64)]])
  const maxMarks = Array.from({ length: 6 }, (_, x) => [x, String(x)])
  assert.deepEqual(chartMarks(maxMarks), maxMarks)
  for (const marks of [
    [], [...maxMarks, [6, '6']], [[1, '停雨'], [1, '排空']], [[2, '停雨'], [1, '排空']],
    [[Infinity, '停雨']], [['1', '停雨']], [[1, 2]], [[1, '  ']], [[1, '字'.repeat(65)]],
    [[1, '停雨', 'extra']], '$state.marks || []',
  ]) {
    assert.equal(chartMarks(marks), null, JSON.stringify(marks))
    assert.equal(chart({ marks }).ok, false, JSON.stringify(marks))
  }
})

test('多条曲线共享数值轴，可绑定本地数据或直接使用字面量', () => {
  const curves = [
    [' 铸铁锅 ', [['0秒', 100], ['10秒', 80], ['10秒', 76]]],
    ['薄铝锅', [[2, 100], [7, 70], [12, 60]]],
  ]
  const series = JSON.stringify(curves)
  for (const axis of ['scrub="关火后经过时间"', 'x-scale="linear"', '']) {
    const ml = parseMiopiikMl(`<ui><chart kind="line" ${axis} x-unit="秒" series='${series}'/></ui>`)
    assert.equal(ml.ok, true)
    const checked = validateAst(ml.doc)
    assert.equal(checked.ok, true)
    assert.deepEqual(chartTraces(checked.ast.root.props.series, '秒'), [
      { label: '铸铁锅', rows: [[0, 100], [10, 80], [10, 76]] },
      { label: '薄铝锅', rows: [[2, 100], [7, 70], [12, 60]] },
    ])
    assert.deepEqual(checked.ast.root.props.series, curves)
  }
  const compile = (props) => validateAst({ state: { curves }, root: { type: 'chart', props } })
  assert.equal(compile({ kind: 'line', xScale: 'linear', series: '$state.curves' }).ok, true)
  assert.equal(compile({ kind: 'line', xUnit: '秒', series: curves.slice(0, 1) }).ok, true)
  for (const kind of ['donut', 'bar']) {
    assert.equal(compile({ kind, series: curves }).ok, false)
  }
})

test('多条曲线拒绝无跨度的时间、重复标签、无效点和超预算输入', () => {
  const valid = [[0, 1], [5, 2]]
  const large = Array.from({ length: 30 }, (_, x) => [x, 2])
  assert.equal(chartTraces([['A', large], ['B', large]]).length, 2)
  const invalid = [
    [],
    ['A', 'B', 'C', 'D', 'E'].map((label) => [label, valid]),
    [['A', large], ['B', [...large, [30, 2]]]],
    [['A', valid], [' A ', valid]],
    [[' ', valid], ['B', valid]],
    [['字'.repeat(101), valid], ['B', valid]],
    [['A', valid], ['B', [[0, 1]]]],
    [['A', valid], ['B', [[0, 1], [0, 2]]]],
    [['A', valid], ['B', [[5, 1], [0, 2]]]],
    [['A', valid], ['B', [[0, 1], [5, '2']]]],
    [['A', valid], ['B', [[0, 1], [5, 2, 3]]]],
  ]
  for (const series of invalid) {
    assert.equal(chartTraces(series), null, JSON.stringify(series))
    const checked = validateAst({ root: { type: 'chart', props: { kind: 'line', xScale: 'linear', series } } })
    assert.equal(checked.ok, false, JSON.stringify(series))
  }
})

test('when / table.filter：只接受 $state 绑定，坏值只降级自身、兄弟保留', () => {
  const compile = (node) => validateAst({ fallback: 'f', state: { r: { cur: '7d', q: '' } }, root: { id: 'r', type: 'column', children: [node, { id: 'm', type: 'metric', props: { label: '保留', value: 1 } }] } })
  assert.equal(compile({ id: 't', type: 'text', props: { text: '可见', when: '$state.r.cur', is: '7d' } }).degraded, 0)
  assert.equal(compile({ id: 't', type: 'text', props: { text: '坏', when: 'true' } }).degraded, 1, 'when 字面量应降级')
  assert.equal(compile({ id: 't', type: 'table', props: { columns: ['a'], rows: [[1]], filter: '$state.r.q' } }).degraded, 0)
  assert.equal(compile({ id: 't', type: 'table', props: { columns: ['a'], rows: [[1]], filter: 'Web' } }).degraded, 1, 'filter 字面量应降级')
  const sibling = compile({ id: 't', type: 'text', props: { text: '坏', when: 'true' } })
  assert.equal(sibling.ast.root.children.at(-1).type, 'metric', '兄弟必须保留')
})

test('progress.value 允许 $state 绑定（渲染时解析），字面量仍要 >= 0 数字', () => {
  const compile = (value) => validateAst({ fallback: 'f', state: { r: { done: 3 } }, root: { id: 'r', type: 'column', children: [{ id: 'p', type: 'progress', props: { label: '完成', value, max: 10 } }] } })
  assert.equal(compile(3).degraded, 0)
  assert.equal(compile('$state.r.done').degraded, 0, '绑定应放行')
  assert.equal(compile('3').degraded, 1, '字符串数字仍应拒绝')
  assert.equal(compile(-1).degraded, 1)
})

test('metric/progress 数值读数编译 state 表达式并保留旧文本路径', () => {
  const result = validateAst({ state: { n: 4 }, root: { type: 'column', children: [
    { type: 'metric', props: { label: '结果', value: 'round($state.n * 2)', delta: '$state.n - 3', note: '原样说明' } },
    { type: 'metric', props: { label: '文字', value: '等待输入', delta: '保持稳定' } },
    { type: 'metric', props: { label: '旧语法', value: 'formatTime($state.n)' } },
    { type: 'metric', props: { label: '数据域', value: '$state.n + $data.x' } },
    { type: 'progress', props: { label: '进度', value: '$state.n * 5', max: 'max($state.n, 1)' } },
    { type: 'progress', props: { label: '绑定上限', value: 2, max: '$state.n' } },
  ] } })
  assert.equal(result.ok, true)
  assert.equal(result.degraded, 0)
  const [computed, plain, unsupported, mixed, progress, boundMax] = result.ast.root.children
  assert.deepEqual(Object.keys(computed.readoutExpressions).sort(), ['delta', 'value'])
  assert.equal(computed.readoutExpressions.value.refs[0].scope, 'state')
  assert.equal(computed.props.note, '原样说明')
  assert.equal(plain.readoutExpressions, undefined)
  assert.equal(unsupported.readoutExpressions, undefined, '不支持的旧表达式仍按字面值保留')
  assert.equal(mixed.readoutExpressions, undefined, '$data 不参与读数表达式')
  assert.deepEqual(Object.keys(progress.readoutExpressions).sort(), ['max', 'value'])
  assert.equal(boundMax.props.max, '$state.n')

  const invalidProgress = validateAst({ root: { type: 'progress', props: { value: '$state.n + $data.x' } } })
  assert.equal(invalidProgress.ok, false, 'progress 仍要求数字、状态绑定或 state 表达式')
})

test('diagram：坏 id / 重复 id / 未知引用只局部降级，预算超限整图降级', () => {
  const compile = (children) => validateAst({ fallback: 'f', root: { id: 'r', type: 'column', children: [{ id: 'd', type: 'diagram', props: {}, children }] } })
  const nodes = (result) => result.ast.root.children[0].children.filter((child) => child.type === 'node')
  const ok = compile([
    { id: 'l1', type: 'lane', props: { label: 'A' }, children: [{ id: 'n1', type: 'node', props: { id: 'a', label: '甲' } }] },
    { id: 'n2', type: 'node', props: { id: 'b', label: '乙' } },
    { id: 'e1', type: 'edge', props: { from: 'a', to: 'b', kind: 'dashed' } },
  ])
  assert.equal(ok.ok, true)
  assert.equal(ok.degraded, 0)
  // 重复 id：后出现的降级为注释文本，先到的保留
  const dup = compile([
    { id: 'n1', type: 'node', props: { id: 'a', label: '甲' } },
    { id: 'n2', type: 'node', props: { id: 'a', label: '又甲' } },
  ])
  assert.equal(dup.degraded, 1)
  assert.equal(nodes(dup).length, 1)
  // 未知引用：只降级该边，节点保留
  const unknown = compile([
    { id: 'n1', type: 'node', props: { id: 'a', label: '甲' } },
    { id: 'e1', type: 'edge', props: { from: 'a', to: 'ghost' } },
  ])
  assert.equal(unknown.degraded, 1)
  assert.equal(nodes(unknown).length, 1)
  // edge.kind 枚举
  const badKind = compile([
    { id: 'n1', type: 'node', props: { id: 'a', label: '甲' } },
    { id: 'n2', type: 'node', props: { id: 'b', label: '乙' } },
    { id: 'e1', type: 'edge', props: { from: 'a', to: 'b', kind: 'wavy' } },
  ])
  assert.equal(badKind.degraded, 1)
  // 泳道超过 6 列：整图降级
  const wide = compile(Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, type: 'lane', props: {}, children: [{ id: `n${i}`, type: 'node', props: { id: 'x' + i, label: 'n' } }] })))
  assert.equal(wide.degraded, 1)
})
