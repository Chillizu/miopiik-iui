import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMiopiikMl } from '../shared/miopiik-ml.js'
import { validateAst } from '../shared/iui-ast.js'
import { compileExpr, evaluateExpr } from '../shared/iui-expr.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseAndValidate(source) {
  const parsed = parseMiopiikMl(source)
  assert.equal(parsed.ok, true, `parse failed: ${parsed.errors}`)
  return { parsed, checked: validateAst(parsed.doc) }
}

function walk(node, visit) {
  visit(node)
  for (const child of node.children ?? []) walk(child, visit)
}

function collectDerives(node, out = []) {
  if (node.type === 'derive') out.push(node.props)
  for (const child of node.children ?? []) collectDerives(child, out)
  return out
}

function writePath(source, path, value) {
  const parts = String(path).split('.')
  const clone = { ...source }
  let cursor = clone
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]
    const child = cursor[part]
    cursor[part] = child !== null && typeof child === 'object' ? { ...child } : {}
    cursor = cursor[part]
  }
  cursor[parts[parts.length - 1]] = value
  return clone
}

function applyDerives(ast) {
  let state = { ...ast.state }
  const values = {}
  for (const derive of collectDerives(ast.root)) {
    const compiled = compileExpr(derive.expr)
    assert.equal(compiled.ok, true, `derive ${derive.name} compile: ${compiled.error}`)
    const result = evaluateExpr(compiled, { state, data: {} })
    assert.equal(result.ok, true, `derive ${derive.name}: ${result.error}`)
    values[derive.name] = result.value
    state = writePath(state, derive.name, result.value)
  }
  return { state, values }
}

const base = `<ui title="t" fallback="f"><state name="r" value='{"a":1}'/><column>`

test('实验原语：derive 解析保留表达式源码并可通过校验', () => {
  const { checked } = parseAndValidate(`${base}
    <derive name="d.x" expr="1 + 2 * 3"/>
    <derive name="d.arr" expr='[["a", 1]]'/>
    <text>t</text>
  </column></ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  const derives = collectDerives(checked.ast.root)
  assert.deepEqual(derives.map((d) => d.name), ['d.x', 'd.arr'])
  assert.equal(derives[1].expr, '[["a", 1]]')
})

test('实验原语：derive 非法名称/重复名称/非法表达式只降级自身', () => {
  const { checked } = parseAndValidate(`${base}
    <derive name="__proto__.x" expr="1"/>
    <derive name="d.dup" expr="1"/>
    <derive name="d.dup" expr="2"/>
    <derive name="d.bad" expr="1 +"/>
    <derive name="d.ok" expr="2"/>
    <text>t</text>
  </column></ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  const names = collectDerives(checked.ast.root).map((d) => d.name)
  assert.deepEqual(names, ['d.dup', 'd.ok'], '非法与重复 derive 应局部降级')
  assert.ok(checked.degraded >= 3)
})

test('实验原语：details 容器、button copy 白名单与降级', () => {
  const { checked } = parseAndValidate(`${base}
    <details label="展开计算口径"><p><text>公式</text></p></details>
    <button label="复制当前配置" action="copy" value="$state.d.config" done="已复制"/>
    <button label="危险动作" action="exec" value="x"/>
    <text>t</text>
  </column></ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  const types = []
  walk(checked.ast.root, (node) => types.push(node.type))
  assert.ok(types.includes('details'))
  assert.ok(types.includes('button'))
  // action 非 copy 的按钮必须降级为文本，不进入渲染树
  assert.equal(types.filter((type) => type === 'button').length, 1)
  assert.ok(checked.degraded >= 1)
})

test('实验原语：details 缺 label / button 缺 label 或 value 降级', () => {
  const { checked } = parseAndValidate(`${base}
    <details><p><text>x</text></p></details>
    <button action="copy" value="x"/>
    <button label="复制" action="copy"/>
    <text>t</text>
  </column></ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.ok(checked.degraded >= 3)
})

test('实验原语：table rows/columns 允许绑定派生状态（其余校验保留）', () => {
  const ok = parseAndValidate(`${base}
    <table columns='["a","b"]' rows="$state.d.rows" caption="c"/>
    <text>t</text>
  </column></ui>`)
  assert.equal(ok.checked.ok, true, ok.checked.errors.join(';'))
  const bad = parseAndValidate(`${base}
    <table columns="not-array" rows="$state.d.rows"/>
    <text>t</text>
  </column></ui>`)
  assert.equal(bad.checked.ok, true)
  assert.ok(bad.checked.degraded >= 1)
})

test('实验原语：derive 数量上限', () => {
  const derives = Array.from({ length: 66 }, (_, index) => `<derive name="d.v${index}" expr="1"/>`).join('')
  const { checked } = parseAndValidate(`${base}${derives}<text>t</text></column></ui>`)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  assert.equal(collectDerives(checked.ast.root).length, 64)
  assert.ok(checked.degraded >= 2)
})

test('M·O·T 演示：解析校验通过、预算内、四组样例由同一份状态实时推导', () => {
  const source = readFileSync(join(root, 'test/fixtures/mot/mot-demo.iui'), 'utf8')
  const { parsed, checked } = parseAndValidate(source)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  let nodes = 0
  walk(checked.ast.root, () => { nodes += 1 })
  assert.ok(nodes <= 120, `节点预算超限：${nodes}`)
  assert.equal(checked.degraded, 0, '演示文档不应有降级节点')
  assert.ok(parsed.degraded.length === 0)

  const scenarios = [
    { scenario: 'steady', workers: 6, hitRate: 60, expect: { n: 120, h: 72, m: 48, cap: 120, e: 48, q: 0, c: 120, p: 100 } },
    { scenario: 'burst', workers: 6, hitRate: 60, expect: { n: 300, h: 180, m: 120, cap: 120, e: 120, q: 0, c: 300, p: 100 } },
    { scenario: 'burst', workers: 2, hitRate: 20, expect: { n: 300, h: 60, m: 240, cap: 40, e: 40, q: 200, c: 100, p: 33 } },
    { scenario: 'fault', workers: 6, hitRate: 60, expect: { n: 180, h: 108, m: 72, cap: 72, e: 72, q: 0, c: 180, p: 100 } },
  ]
  for (const sample of scenarios) {
    const ast = { ...checked.ast, state: { ...checked.ast.state, r: { ...checked.ast.state.r, scenario: sample.scenario, workers: sample.workers, hitRate: sample.hitRate } } }
    const { values } = applyDerives(ast)
    for (const [key, expected] of Object.entries(sample.expect)) {
      assert.equal(values[`d.${key}`], expected, `${sample.scenario}/w${sample.workers}/h${sample.hitRate} 的 ${key}`)
    }
    assert.equal(values['d.overflow'], sample.expect.q > 0)
    assert.deepEqual(values['d.series'], [
      ['缓存直达 H', sample.expect.h],
      ['后台完成 E', sample.expect.e],
      ['排队 Q', sample.expect.q],
    ])
    assert.deepEqual(values['d.rows'].map((row) => row[1]), [sample.expect.h, sample.expect.e, sample.expect.q])
    assert.deepEqual(values['d.config'], {
      scenario: sample.scenario,
      requests: sample.expect.n,
      workers: sample.workers,
      hitRate: sample.hitRate,
      cacheHits: sample.expect.h,
      executed: sample.expect.e,
      queued: sample.expect.q,
      completed: sample.expect.c,
      completionPct: sample.expect.p,
    })
    if (sample.expect.q > 0) assert.equal(values['d.warnText'], `当前容量不足，${sample.expect.q} 项进入队列`)
  }
})

test('M·O·T 演示：任意参数变化都会改变派生结果（不是静态数据）', () => {
  const source = readFileSync(join(root, 'test/fixtures/mot/mot-demo.iui'), 'utf8')
  const { checked } = parseAndValidate(source)
  const baseline = applyDerives(checked.ast)
  const variants = [
    { scenario: 'fault' },
    { workers: 2 },
    { workers: 12 },
    { hitRate: 0 },
    { hitRate: 100 },
    { scenario: 'burst', workers: 2, hitRate: 20 },
  ]
  const seen = new Set([JSON.stringify(Object.fromEntries(['n', 'h', 'm', 'cap', 'e', 'q', 'c', 'p', 'overflow'].map((key) => [key, baseline.values[`d.${key}`]])))])
  for (const variant of variants) {
    const ast = { ...checked.ast, state: { ...checked.ast.state, r: { ...checked.ast.state.r, ...variant } } }
    const { values } = applyDerives(ast)
    const signature = JSON.stringify(Object.fromEntries(['n', 'h', 'm', 'cap', 'e', 'q', 'c', 'p', 'overflow'].map((key) => [key, values[`d.${key}`]])))
    seen.add(signature)
  }
  assert.ok(seen.size >= 5, `变量应产生多种派生结果，实际 ${seen.size}`)
})

test('stage-1：纯 0.1.1 快照只含既有组件，不含新原语', () => {
  const source = readFileSync(join(root, 'test/fixtures/mot/stage1-0.1.1.iui'), 'utf8')
  const { checked } = parseAndValidate(source)
  assert.equal(checked.ok, true, checked.errors.join(';'))
  const types = new Set()
  walk(checked.ast.root, (node) => types.add(node.type))
  for (const forbidden of ['derive', 'details', 'button']) assert.equal(types.has(forbidden), false, `stage-1 不得使用 ${forbidden}`)
  assert.ok(types.has('diagram') && types.has('chart') && types.has('table') && types.has('slider'))
})
