import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { IUI_VERSION, readBinding, resolveValue, validateAst } from '../shared/iui-ast.js'

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
