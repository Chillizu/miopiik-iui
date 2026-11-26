import test from 'node:test'
import assert from 'node:assert/strict'
import { drawingProps, LIMITS, resolveValue, validateAst } from '../shared/iui-ast.js'
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

test('drawing repeat keeps bounded templates, item sources, data expressions and text aliases', () => {
  const checked = check(`<ui><state name="items" value='[{"x":12,"name":"甲"}]'/><drawing width="120" height="80" label="列表">
    <repeat items="$state.items"><circle cx="$data.item.x + 0" cy="40" r="6" when="$data.item.x > 0"/><text x="$data.item.x" y="60">$data.item.name</text></repeat>
  </drawing></ui>`)
  assert.equal(checked.ok, true)
  assert.equal(LIMITS.drawingShapes, 64)
  const repeat = checked.ast.root.children[0]
  assert.equal(repeat.type, 'repeat')
  assert.equal(repeat.props.items, '$state.items')
  assert.deepEqual(repeat.children.map((shape) => shape.type), ['circle', 'label'])
  assert.equal(repeat.children[0].props.cx, '$data.item.x + 0')
  assert.equal(repeat.children[0].geometryExpressions.cx.ok, true)
  assert.equal(repeat.children[0].conditionExpression.ok, true)
  assert.equal(repeat.children[1].props.text, '$data.item.name')

  const literal = check(`<ui><drawing width="80" height="60" label="空"><repeat items="[]"><circle cx="1" cy="1" r="1"/></repeat></drawing></ui>`)
  assert.equal(literal.ok, true)
  assert.deepEqual(literal.ast.root.children[0].props.items, [])
  assert.equal(check(`<ui><drawing width="80" height="60" label="视图"><view label="视图"><repeat items="$data.rows"><circle cx="1" cy="1" r="1"/></repeat></view></drawing></ui>`).ok, true)
  for (const body of [
    '<repeat items="items"><circle cx="1" cy="1" r="1"/></repeat>',
    '<repeat items="$state.items"><repeat items="$state.items"><circle cx="1" cy="1" r="1"/></repeat></repeat>',
    '<repeat items="$state.items"><button label="x" action="copy" value="y"/></repeat>',
  ]) assert.equal(check(`<ui><drawing width="80" height="60" label="坏">${body}</drawing></ui>`).ok, false)
  const tooManyTemplates = '<repeat items="[]">' + '<circle cx="1" cy="1" r="1"/>'.repeat(65) + '</repeat>'
  assert.equal(check(`<ui><drawing width="80" height="60" label="多">${tooManyTemplates}</drawing></ui>`).ok, false)
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

test('drawing position pairs share local data and normalize to ordinary bounded SVG geometry', () => {
  const checked = check(`<ui><state name="p" value="[20,30]"/><drawing width="160" height="100" label="端点">
    <circle at="$state.p" r="5"/>
    <line from="[0,0]" to="$state.p"/>
    <path points='[[0,0],[10,20],$state.p]' stroke="accent"/>
    <text at="$state.p" dx="4" dy="-5">端点</text>
    <rect at="[40,30]" width="20" height="10"/>
  </drawing></ui>`)
  assert.equal(checked.ok, true)
  assert.equal(checked.degraded, 0)
  const resolve = (value) => resolveValue(value, { state: checked.ast.state })
  const shapes = checked.ast.root.children.map((node) => drawingProps(node.type, node.props, resolve, (key) => {
    const expression = node.geometryExpressions?.[key]
    return expression === undefined ? undefined : evaluateExpr(expression, { state: checked.ast.state }).value
  }))
  assert.deepEqual(shapes, [
    { cx: 20, cy: 30, r: 5 },
    { x1: 0, y1: 0, x2: 20, y2: 30 },
    { d: 'M 0 0 L 10 20 L 20 30', stroke: 'accent' },
    { x: 24, y: 25, text: '端点' },
    { x: 40, y: 30, width: 20, height: 10 },
  ])
  assert.equal(drawingProps('circle', { at: '$state.p', r: 5 }, () => [3000, 20]), null)
  assert.equal(drawingProps('label', { at: [2048, 10], dx: 1, text: '溢出' }), null)
  assert.equal(drawingProps('circle', { at: [1, 2], cx: 1, cy: 2, r: 5 }), null)
  assert.equal(drawingProps('line', { from: [1, 2], x1: 1, y1: 2, x2: 3, y2: 4 }), null)
  assert.equal(drawingProps('path', { d: 'M0 0 L1 1', points: [[0, 0], [1, 1]] }), null)
  assert.equal(drawingProps('path', { points: Array.from({ length: 33 }, (_, i) => [i, i]) }), null)
})

test('numeric drawing expressions use local state and retain SVG field bounds', () => {
  const checked = check(`<ui><drawing width="300" height="120" label="负载示意">
    <rect x="20" y="20" width="$state.load * 10" height="30" opacity="$state.load / 10"/>
    <label x="20" y="100" text="$state.load + ' 项'"/>
    <rect x="20" y="40" width="40" height="30" fill="$state.online ? 'success' : 'border'" stroke="$state.online ? 'accent' : 'muted'"/>
    <circle cx="60" cy="60" r="8" fill="$state.online ? 'url(https://example.com)' : 'lime'"/>
  </drawing></ui>`)
  assert.equal(checked.degraded, 0)
  const [shape, label, colors, unsafeColors] = checked.ast.root.children
  const render = (load, item = shape) => {
    const scope = { state: { load, online: true } }
    return drawingProps(item.type, item.props, (value) => resolveValue(value, scope),
      (key) => evaluateExpr(item.geometryExpressions[key], scope).value)
  }
  assert.equal(render(4).width, 40)
  assert.equal(render(7).opacity, 0.7)
  assert.equal(render(6, label).text, '6 项')
  assert.equal(render(11), null)
  assert.equal(render(0, colors).fill, 'success')
  assert.equal(render(0, colors).stroke, 'accent')
  const offline = { state: { online: false } }
  const colorProps = (item, scope) => drawingProps(item.type, item.props,
    (value) => resolveValue(value, scope),
    (key) => evaluateExpr(item.geometryExpressions[key], scope).value)
  assert.equal(colorProps(colors, offline).fill, 'border')
  assert.equal(colorProps(colors, offline).stroke, 'muted')
  assert.equal(colorProps(unsafeColors, { state: { online: true } }), null)
  assert.equal(colorProps(unsafeColors, { state: { online: false } }), null)
  assert.equal(drawingProps('circle', { cx: 1, cy: 1, r: 1, fill: 'chartreuse' }), null)
  assert.equal(drawingProps('path', { d: '$state.path' }, () => 'M 0 0 L 1 1'), null)
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
  assert.equal(drawingProps('rect', { x: 1, y: 1, width: 0, height: 40 }).width, 0)
  assert.equal(drawingProps('rect', { x: 1, y: 1, width: -1, height: 40 }), null)
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
  assert.equal(drawingProps('label', { ...label.props, align: 'left' }).align, 'start')
  assert.equal(drawingProps('label', { ...label.props, align: 'right' }).align, 'end')
})

test('drawing view selection shares state binding validation with views', () => {
  const parsed = parseMiopiikMl(`<ui><state name="mode" value='"before"'/>
    <drawing width="240" height="120" label="状态对照" bind="$state.mode">
      <line from="[10,80]" to="[230,80]" stroke="border"/>
      <view label="之前" value="before"/>
      <view label="之后" value="after"/>
    </drawing></ui>`)
  assert.equal(parsed.ok, true)
  const checked = validateAst(parsed.doc)
  assert.equal(checked.ok, true)
  const drawing = checked.ast.root
  assert.equal(drawing.props.bind, '$state.mode')
  assert.deepEqual(drawing.children.filter((node) => node.type === 'view').map((view) => view.props.value), ['before', 'after'])

  const legacy = check(`<ui><drawing width="80" height="60" label="旧图">
    <circle cx="10" cy="10" r="4"/><view label="一个视图" value="ignored" caption="保留旧行为。"/>
  </drawing></ui>`)
  assert.equal(legacy.degraded, 0)
  assert.equal(legacy.ast.root.children[1].props.value, undefined)

  const badValues = [
    ['same', 'same'],
    ['same', undefined],
    [{ bad: 1 }, 'other'],
  ]
  for (const [first, second] of badValues) {
    const pane = (label, value) => ({ type: 'view', props: {
      label, ...(value === undefined ? {} : { value }), caption: label,
    }, children: [] })
    const result = validateAst({ state: { mode: 'same' }, root: { type: 'drawing', props: {
      width: 80, height: 60, label: '坏', bind: '$state.mode',
    }, children: [
      { type: 'circle', props: { cx: 10, cy: 10, r: 4 } }, pane('甲', first), pane('乙', second),
    ] } })
    assert.equal(result.ok, false, JSON.stringify([first, second]))
  }

  const conflict = validateAst({ state: { mode: 'before' }, root: { type: 'column', children: [
    { type: 'drawing', props: { width: 80, height: 60, label: '绑定', bind: '$state.mode' }, children: [
      { type: 'circle', props: { cx: 10, cy: 10, r: 4 } },
      { type: 'view', props: { label: '甲', value: 'before', caption: '甲' }, children: [] },
      { type: 'view', props: { label: '乙', value: 'after', caption: '乙' }, children: [] },
    ] },
    { type: 'derive', props: { name: 'mode', expr: '"after"' } },
  ] } })
  assert.equal(conflict.ok, true)
  assert.equal(conflict.ast.root.children[0].type, 'drawing')
  assert.equal(conflict.ast.root.children[1].degraded, true, 'derive 不能覆盖绘图控件绑定路径')

  const partialViews = validateAst({ state: { mode: 'valid' }, root: { type: 'views', props: {
    bind: '$state.mode',
  }, children: [
    { type: 'view', props: { label: '保留', value: 'valid', caption: '可读' }, children: [] },
    { type: 'view', props: { label: '降级', value: { bad: 1 }, caption: '无效值' }, children: [] },
  ] } })
  assert.equal(partialViews.degraded, 1)
  assert.deepEqual(partialViews.ast.root.children.map((view) => view.props.value), ['valid'])
})

test('view counts and all declared shapes share the drawing budget', () => {
  const place = (content) => `<ui fallback="无图对照"><drawing width="240" height="120" label="对照">${content}</drawing></ui>`
  const shape = '<circle cx="10" cy="20" r="2"/>'
  const view = (index, content = shape) => `<view label="选项 ${index}">${content}</view>`
  const single = check(place(view(1)))
  assert.equal(single.ok, true)
  assert.equal(single.degraded, 0)
  assert.equal(single.ast.root.children[0].children[0].type, 'circle')
  assert.equal(check(place(view(1, ''))).ok, false)
  assert.equal(check(place(view(1, '<button label="不能放在图里" action="copy" value="示例"/>'))).ok, false)
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
