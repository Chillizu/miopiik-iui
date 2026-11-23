import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { parseMiopiikMl } from '../shared/miopiik-ml.js'
import { LIMITS, validateAst, writeStatePath } from '../shared/iui-ast.js'
import { compileExpr, exprRefs } from '../shared/iui-expr.js'

function check(source) {
  const parsed = parseMiopiikMl(source)
  assert.equal(parsed.ok, true, `parse failed: ${parsed.errors}`)
  return { parsed, checked: validateAst(parsed.doc) }
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function deriveNames(checked) {
  const names = []
  walk(checked.ast.root, (node) => { if (node.type === 'derive') names.push(node.props.name) })
  return names
}

const shell = (body, state = '{"r":{"workers":6,"hitRate":60}}') =>
  `<ui title="t" fallback="f"><state name="r" value='${state}'/><column>${body}</column></ui>`

test('round3: exprRefs 提取引用（去重、稳定排序、scope 区分）', () => {
  const compiled = compileExpr('round($state.d.n * $state.r.hitRate / 100) + $state.d.n + $data.x')
  const refs = exprRefs(compiled)
  assert.equal(refs.ok, true)
  assert.deepEqual(refs.refs.map((ref) => `${ref.scope}:${ref.key}`), ['data:x', 'state:d.n', 'state:r.hitRate'])
  assert.deepEqual(compiled.refs, refs.refs)
  // 未编译输入
  assert.equal(exprRefs({ ok: false, error: 'x' }).ok, false)
})

test('round3: 前向引用（依赖先于定义）可通过校验，文档顺序无关', () => {
  const { checked } = check(shell(`
    <derive name="d.z" expr="$state.d.a * 2"/>
    <derive name="d.a" expr="10"/>
  `))
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.deepEqual(deriveNames(checked), ['d.z', 'd.a'])
  assert.deepEqual(checked.derivePlan.map(({ name }) => name), ['d.a', 'd.z'])
  assert.equal(checked.degraded, 0)
})

test('round3: 自环与互环 derive 在校验期降级，其余 derive 保留', () => {
  const { checked } = check(shell(`
    <derive name="d.self" expr="$state.d.self + 1"/>
    <derive name="d.a" expr="$state.d.b + 1"/>
    <derive name="d.b" expr="$state.d.a + 1"/>
    <derive name="d.ok" expr="1 + 1"/>
  `))
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.deepEqual(deriveNames(checked), ['d.ok'])
  assert.ok(checked.degraded >= 3)
})

test('round3: derive 名称与控件 bind / 初始 state 冲突时降级', () => {
  const { checked } = check(`
    <ui title="t" fallback="f">
      <state name="r" value='{"workers":6}'/>
      <column>
        <slider label="w" bind="$state.r.workers" min="2" max="12"/>
        <derive name="r.workers" expr="1"/>
        <derive name="d.w" expr="$state.r.workers * 20"/>
      </column>
    </ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.deepEqual(deriveNames(checked), ['d.w'])
})

test('round3: 派生父子路径不能互相覆写，兄弟路径可共存', () => {
  const { checked } = check(shell(`
    <derive name="d.first" expr="1"/>
    <derive name="d" expr="2"/>
    <derive name="d.first.total" expr="3"/>
    <derive name="d.second" expr="4"/>
  `))
  assert.equal(checked.ok, true)
  assert.deepEqual(deriveNames(checked), ['d.first', 'd.second'])
  assert.equal(checked.degraded, 2)
})

test('round3: 被丢弃的子树和无效控件不占用派生路径', () => {
  const checked = validateAst({ root: { type: 'column', children: [
    { type: 'text', props: { text: 'x', bind: '$state.d.kept' }, children: [
      { type: 'derive', props: { name: 'd.kept', expr: '42' } },
    ] },
    { type: 'segmented', props: { bind: '$state.d.kept', options: [null] } },
    { type: 'derive', props: { name: 'd.kept', expr: '2' } },
  ] } })
  assert.equal(checked.ok, true)
  assert.deepEqual(deriveNames(checked), ['d.kept'])
  assert.equal(checked.ast.root.children[2].props.expr, '2')
  assert.equal(checked.degraded, 1)
})

test('round3: 未注册类型和非字符串类型局部降级', () => {
  const checked = validateAst({ root: { type: 'column', children: [
    { type: 'constructor' },
    { type: ['text'] },
    { type: 'text', props: { text: '仍然显示' } },
  ] } })
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 2)
  assert.equal(checked.ast.root.children[2].props.text, '仍然显示')
})

test('round3: 提前拒绝超限状态和节点，保留整块 fallback', () => {
  const root = { type: 'derive', props: { name: 'd.value', expr: '1' } }
  const state = { large: Array.from({ length: 12 }, () => 'x'.repeat(LIMITS.text)) }
  const oversized = validateAst({ fallback: 'f', state, root })
  assert.equal(oversized.ok, false)
  assert.match(oversized.errors[0], /state/u)
  assert.equal(oversized.fallback, 'f')

  const cyclic = {}
  cyclic.next = cyclic
  assert.equal(validateAst({ state: cyclic, root }).ok, false)
  const wide = validateAst({ root: { type: 'column', children: Array(LIMITS.nodes).fill(null) } })
  assert.equal(wide.ok, false)
  assert.match(wide.errors[0], /节点数/u)
})

test('round3: 本地写入原子保留状态预算并支持已有数组索引', () => {
  const state = { rows: [{ count: 1 }], untouched: { a: 2 } }
  const updated = writeStatePath(state, 'rows.0.count', 3)
  assert.deepEqual(updated.rows, [{ count: 3 }])
  assert.deepEqual(state.rows, [{ count: 1 }])
  assert.equal(updated.untouched, state.untouched)
  assert.deepEqual(writeStatePath(updated, 'rows.1', { count: 4 }).rows, [{ count: 3 }, { count: 4 }])
  for (const invalid of ['rows.length', 'rows.2.count', 'rows.128', 'rows.00', 'a.b.c.d.e.f.g.h.i']) {
    assert.equal(writeStatePath(state, invalid, 4), state, invalid)
  }

  const almostFull = { entries: Array.from({ length: 8 }, () => 'x'.repeat(LIMITS.text)) }
  const fits = writeStatePath(almostFull, 'filter', 'fine')
  assert.equal(fits.filter, 'fine')
  assert.equal(writeStatePath(fits, 'filter', 'x'.repeat(LIMITS.text)), fits)
})

test('round3: 分段控制校验目标和选项，保留结构化选项值', () => {
  const { checked } = check(shell(`
    <segmented bind="$state.r.mode" options='[{"label":"配置","value":{"count":1}},{"label":"默认","value":null}]'/>
    <segmented options='[{"label":"缺少绑定","value":1}]'/>
    <segmented bind="$state.r.mode" options='[null]'/>
    <segmented bind="$state.r.mode" options='[{"label":"缺少值"}]'/>
  `))
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 3)
  const [control] = checked.ast.root.children
  assert.equal(control.type, 'segmented')
  assert.deepEqual(control.props.options, [{ label: '配置', value: { count: 1 } }, { label: '默认', value: null }])
})

test('round3: 危险/未知属性从 AST 中剥离（JSON AST 输入），when/is/weight 保留', () => {
  const checked = validateAst({
    state: {},
    root: {
      type: 'column',
      props: { gap: 10, onClick: 'alert(1)', style: { color: 'red' }, 'data-evil': 'x' },
      children: [
        { type: 'text', props: { text: 'hello', dangerouslySetInnerHTML: { __html: '<img onerror=1>' } }, children: [] },
        { type: 'badge', props: { text: 'b', tone: 'success', weight: 'primary', when: '$state.missing' }, children: [] },
      ],
    },
  })
  assert.equal(checked.ok, true, checked.errors.join(';'))
  const props = []
  walk(checked.ast.root, (node) => props.push(node.props))
  assert.equal(props[0].onClick, undefined)
  assert.equal(props[0].style, undefined)
  assert.equal(props[0]['data-evil'], undefined)
  assert.equal(props[1].dangerouslySetInnerHTML, undefined)
  assert.equal(props[2].weight, 'primary')
  assert.equal(props[2].when, '$state.missing')
})

test('round3: weight 枚举校验（非法降级、合法保留）', () => {
  const bad = check(shell(`<metric label="x" value="1" weight="loud"/><text>t</text>`))
  assert.equal(bad.checked.degraded, 1)
  const good = check(shell(`<metric label="x" value="1" weight="secondary"/><text>t</text>`))
  assert.equal(good.checked.degraded, 0)
  let weight = null
  walk(good.checked.ast.root, (node) => { if (node.type === 'metric') weight = node.props.weight })
  assert.equal(weight, 'secondary')
})

test('round3: 根 density 枚举（合法写入 AST、非法整份 fail-closed）', () => {
  const inline = check(`<ui density="inline"><text>t</text></ui>`)
  assert.equal(inline.checked.ok, true)
  assert.equal(inline.checked.ast.density, 'inline')
  const compact = check(`<ui density="compact"><text>t</text></ui>`)
  assert.equal(compact.checked.ast.density, 'compact')
  const bad = validateAst({ density: 'huge', root: { type: 'text', props: { text: 't' }, children: [] }, state: {} })
  assert.equal(bad.ok, false)
  assert.match(bad.errors[0], /density/u)
})

test('round3: tone 保持静态枚举，绑定形态直接降级', () => {
  const { checked } = check(shell(`<badge text="x" tone="$state.r.workers"/><text>t</text>`))
  assert.equal(checked.ok, true)
  assert.ok(checked.degraded >= 1)
})

test('round3: copy 按钮数量上限 4，第 5 个降级', () => {
  const buttons = Array.from({ length: 5 }, (_, index) => `<button label="复制${index}" action="copy" value="x${index}"/>`).join('')
  const { checked } = check(shell(buttons + '<text>t</text>'))
  assert.equal(checked.ok, true, checked.errors.join(';'))
  let count = 0
  walk(checked.ast.root, (node) => { if (node.type === 'button') count += 1 })
  assert.equal(count, 4)
  assert.ok(checked.degraded >= 1)
})

test('round3: derive 数量按“合法 derive”计入 64 上限（非法不占额）', () => {
  const bad = '<derive name="d.bad" expr="1 +"/>'
  const derives = Array.from({ length: 64 }, (_, index) => `<derive name="d.v${index}" expr="1"/>`).join('') + bad
  const { checked } = check(shell(derives + '<text>t</text>'))
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.equal(deriveNames(checked).length, 64)
  assert.ok(checked.degraded >= 1)
})

test('round3: 生成 bundle 静态扫描——无 eval/Function/网络/脚本注入通道', () => {
  const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.equal(/\beval\s*\(/u.test(bundle), false, 'bundle 不应包含 eval 调用')
  assert.equal(bundle.includes('new Function('), false, 'bundle 不应包含 new Function')
  for (const needle of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'document.write', 'dangerouslySetInnerHTML', 'innerHTML =']) {
    assert.equal(bundle.includes(needle), false, `bundle 不应包含 ${needle}`)
  }
  assert.match(bundle, /navigator\.clipboard/u, 'copy 应只经 navigator.clipboard（唯一宿主动作）')
  const clipboardCalls = bundle.match(/clipboard\.writeText/gu) ?? []
  assert.ok(clipboardCalls.length >= 1 && clipboardCalls.length <= 3, `clipboard.writeText 出现 ${clipboardCalls.length} 次（应受控）`)
})
