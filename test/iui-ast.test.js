import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IUI_VERSION, chartTraces, readBinding, resolveValue, validateAst } from '../shared/iui-ast.js'
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
