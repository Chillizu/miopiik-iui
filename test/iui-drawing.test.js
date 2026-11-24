import test from 'node:test'
import assert from 'node:assert/strict'
import { drawingProps, resolveValue, validateAst } from '../shared/iui-ast.js'
import { evaluateExpr } from '../shared/iui-expr.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'

function check(source) {
  const parsed = parseMiopiikMl(source)
  assert.equal(parsed.ok, true)
  return validateAst(parsed.doc)
}

test('drawing composes closed SVG shapes, semantic colors and local state bindings', () => {
  const checked = check(`<ui fallback="图形结构">
    <state name="focus" value='{"active":true,"x":142,"description":"字段 A"}'/>
    <drawing width="360" height="210" label="$state.focus.description">
      <rect x="14" y="9" width="332" height="184" rx="9" fill="surface" stroke="border" stroke-width="2"/>
      <circle cx="$state.focus.x" cy="60" r="8" fill="accent" when="$state.focus.active"/>
      <line x1="40" y1="112" x2="240" y2="112" stroke="muted"/>
      <path d="M20 20 q 15 25 54 30 a 20 18 0 1 1 12 15 z" fill="none" stroke="accent"/>
      <label x="142" y="86" text="$state.focus.description" align="middle" size="14"/>
    </drawing>
  </ui>`)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const { root, state } = checked.ast
  const resolve = (value) => resolveValue(value, { state, data: {} })
  assert.deepEqual(drawingProps(root.type, root.props, resolve), { width: 360, height: 210, label: '字段 A' })
  assert.deepEqual(root.children.map((child) => child.type), ['rect', 'circle', 'line', 'path', 'label'])
  assert.equal(root.children[0].props.strokeWidth, 2)
  assert.equal(root.children[1].props.when, '$state.focus.active')
  assert.deepEqual(drawingProps('circle', root.children[1].props, resolve), { cx: 142, cy: 60, r: 8, fill: 'accent' })
  assert.equal(drawingProps('path', root.children[3].props, resolve).d, 'M 20 20 q 15 25 54 30 a 20 18 0 1 1 12 15 z')
  assert.equal(drawingProps('label', root.children[4].props, resolve).text, '字段 A')
})

test('drawings keep safe siblings and discard unsupported graphics attributes', () => {
  const checked = check(`<ui fallback="可访问文字">
    <drawing width="360" height="210" label="360">
      <rect x="0" y="0" width="30" height="30" fill="accent" onClick="bad()" style="display:none" href="https://example.com"/>
      <circle cx="100" cy="100" r="50" fill="url(https://example.com)"/>
      <path d="M 10 20 L 40 20 Z" stroke="https://example.com"/>
      <button label="按钮不能混入绘图" action="copy" value="1"/>
      <label x="130" y="100" text="210"/>
    </drawing>
  </ui>`)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 3)
  assert.equal(checked.ast.root.props.label, '360')
  assert.deepEqual(checked.ast.root.children.map((child) => child.type), ['rect', 'text', 'text', 'text', 'label'])
  assert.deepEqual(checked.ast.root.children[0].props, { x: 0, y: 0, width: 30, height: 30, fill: 'accent' })
  assert.equal(checked.ast.root.children[4].props.text, '210')
})

test('numeric drawing expressions use local state and retain SVG field bounds', () => {
  const checked = check(`<ui><drawing width="300" height="120" label="负载示意">
    <rect x="20" y="20" width="$state.load * 10" height="30" opacity="$state.load / 10"/>
    <rect x="20" y="40" width="40" height="30" fill="$state.load + 1"/>
  </drawing></ui>`)
  assert.equal(checked.degraded, 1)
  const shape = checked.ast.root.children[0]
  const render = (load) => {
    const scope = { state: { load } }
    return drawingProps('rect', shape.props, (value) => resolveValue(value, scope),
      (key) => evaluateExpr(shape.geometryExpressions[key], scope).value)
  }
  assert.equal(render(4).width, 40)
  assert.equal(render(7).opacity, 0.7)
  assert.equal(render(11), null)
})

test('drawing geometry, path operations and viewport have bounded safe ranges', () => {
  for (const invalid of [
    'L 12 16', 'M', 'M 1 2 C 4 5 6 7 8', 'M 1 2 L 3 4 e 1 2', 'M 1 2 Z 3 4',
    'M 0 0 A 5 5 0 2 0 6 8', 'M 0 0 A -1 5 0 0 1 8 10', 'M 4e999 0', 'M 2049 0',
    'M 0 0 L 10 10 url(https://example.com)', `M 0 0 ${'L 1 1 '.repeat(96)}`,
    `M 0 0 ${' '.repeat(1400)}`,
  ]) {
    assert.equal(drawingProps('path', { d: invalid }), null, invalid)
  }
  assert.equal(drawingProps('path', { d: 'm.5,-.5 1 0 h4 v2 c1 1 3 3 5 5 s6 6 8 8 q1 1 2 2 t3 4 a5 5 0 0 1 6 7 z' }).d,
    'm .5 -.5 1 0 h 4 v 2 c 1 1 3 3 5 5 s 6 6 8 8 q 1 1 2 2 t 3 4 a 5 5 0 0 1 6 7 z')
  assert.equal(drawingProps('drawing', { width: '$state.w', height: 32, label: '边界' }), null)
  assert.equal(drawingProps('drawing', { width: 32, height: 1025, label: '边界' }), null)
  assert.equal(drawingProps('rect', { x: 1, y: 1, width: 0, height: 40 }), null)
  assert.equal(drawingProps('label', { x: 1, y: 1, text: '大字'.repeat(120) }), null)
  assert.equal(check('<ui><path d="M 0 0 h 4"/></ui>').ok, false)
  const many = '<circle cx="0" cy="0" r="1"/>'.repeat(65)
  assert.equal(check(`<ui><drawing width="120" height="80" label="计数">${many}</drawing></ui>`).ok, false)
})

test('bound drawing fields are validated again and paths stay literal', () => {
  const coordinates = { cx: '$state.x', cy: 8, r: '$state.r' }
  assert.deepEqual(drawingProps('circle', coordinates), coordinates)
  for (const state of [{ x: -2049, r: 8 }, { x: 1, r: Infinity }, { x: '7', r: 8 }, { x: 1, r: [] }]) {
    assert.equal(drawingProps('circle', coordinates, (value) => resolveValue(value, { state })), null)
  }
  assert.deepEqual(drawingProps('label', { x: 1, y: 1, text: '$state.count' }, () => 42), { x: 1, y: 1, text: '42' })
  assert.equal(drawingProps('path', { d: '$state.path' }, () => 'M 0 0 h 4'), null)
  const line = { x1: 1, x2: 2, y1: 1, y2: 2, stroke: '$state.color' }
  assert.deepEqual(drawingProps('line', line), line)
  assert.deepEqual(drawingProps('line', line, () => 'accent'), { ...line, stroke: 'accent' })
  assert.equal(drawingProps('line', line, () => 'url(https://example.com)'), null)
  assert.equal(drawingProps('line', { ...line, stroke: '$state.color ? "accent" : "text"' }), null)
  assert.deepEqual(drawingProps('circle', { cx: 10, cy: 20, r: 8, opacity: '$state.alpha' }, () => 0.4), { cx: 10, cy: 20, r: 8, opacity: 0.4 })
  assert.equal(drawingProps('circle', { cx: 10, cy: 20, r: 8, opacity: 1.1 }), null)
})

test('drawing view declarations preserve source order and revalidate label and caption bindings', () => {
  const checked = check(`<ui fallback="对照图">
    <state name="later" value='{"label":"改变后","caption":"出现新的圆形。","visible":true}'/>
    <drawing width="240" height="120" label="对照说明">
      <rect x="4" y="4" width="232" height="112"/>
      <view label="改变前" caption="共用外框。"/>
      <view label="$state.later.label" caption="$state.later.caption" when="$state.later.visible">
        <circle cx="40" cy="40" r="9"/>
      </view>
      <label x="120" y="105" align="center" text="共用标注"/>
    </drawing>
  </ui>`)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const { root, state } = checked.ast
  const [rect, before, after, label] = root.children
  assert.deepEqual([rect.type, before.type, after.type, label.type], ['rect', 'view', 'view', 'label'])
  assert.deepEqual(before.children, [])
  assert.deepEqual(drawingProps('view', after.props, (value) => resolveValue(value, { state })), { label: '改变后', caption: '出现新的圆形。' })
  assert.deepEqual(drawingProps('view', after.props, (value) => resolveValue(value, { state: { later: { label: '改变后' } } })), { label: '改变后' })
  assert.equal(drawingProps('label', label.props).align, 'middle')
})

test('view counts and all declared shapes share the drawing budget', () => {
  const place = (content) => `<ui fallback="无图对照"><drawing width="240" height="120" label="对照">${content}</drawing></ui>`
  const shape = '<circle cx="10" cy="20" r="2"/>'
  const view = (index, content = shape) => `<view label="选项 ${index}">${content}</view>`
  assert.equal(check(place(view(1))).ok, false)
  assert.equal(check(place(Array.from({ length: 7 }, (_, index) => view(index)).join(''))).ok, false)
  assert.equal(check(place('<view label="甲"/><view label="乙"/>')).ok, false)
  assert.equal(check(place('<view label="甲"><script>alert(1)</script></view><view label="乙"/>')).ok, false)
  assert.equal(check(place(shape + view(1, shape.repeat(32)) + view(2, shape.repeat(31)))).ok, true)
  assert.equal(check(place(shape + view(1, shape.repeat(32)) + view(2, shape.repeat(32)))).ok, false)
  assert.equal(check('<ui><view label="脱离图形">' + shape + '</view></ui>').ok, false)
  const checked = check(place(view(1, shape + '<button label="意外操作" action="copy" value="示例"/>' + view(3)) + view(2)))
  assert.equal(checked.degraded, 2)
  assert.deepEqual(checked.ast.root.children[0].children.map((child) => child.type), ['circle', 'text', 'text'])
  assert.equal(drawingProps('view', { label: '过长'.repeat(25) }), null)
  assert.equal(drawingProps('view', { label: '正常', caption: '过长'.repeat(141) }), null)
  assert.deepEqual(drawingProps('view', { label: '单独标注', caption: '  ' }), { label: '单独标注' })
})

test('line dash syntax is bounded and maps the declared widths onto the safe SVG attribute', () => {
  const checked = check(`<ui><drawing width="240" height="120" label="对照">
    <line x1="20" y1="20" x2="180" y2="20" stroke="muted" stroke-dasharray="3,4 .5"/>
  </drawing></ui>`)
  assert.equal(checked.degraded, 0)
  const props = checked.ast.root.children[0].props
  assert.equal(drawingProps('line', props).strokeDasharray, '3 4 0.5')
  for (const strokeDasharray of ['129', '1 -3', '1 '.repeat(9), 'url(https://example.com)', '$state.dash', [3, 4]]) {
    assert.equal(drawingProps('line', { ...props, strokeDasharray }), null)
  }
})
