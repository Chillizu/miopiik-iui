/**
 * IUI AST v1（实验层）：有限的受信组件 + 任意组合 + 局部状态绑定。
 *
 * 设计边界：
 *  - 模型/示例只产出**结构**（组件树 + 属性 + 状态初值 + 声明式绑定），不产出 CSS/JS；
 *  - 组件类型必须在 REGISTRY 白名单内，未知类型→所在子树降级为 fallback 文本；
 *  - 绑定只允许 `$state.<key>` 与 `$data.<key>` 两种形式，不做表达式求值；
 *  - 本地交互控件（segmented/toggle/slider/input）只**写** $state；when/filter 只**读** $state，
 *    一切交互停留在浏览器内，外部动作仍归口工具面；
 *  - 预算（节点数/深度/数据量）在这里统一拒绝，由调用方决定降级策略。
 */

import { EXPR_LIMITS, compileExpr } from './iui-expr.js'

export const IUI_VERSION = 'iui/1'

export const REGISTRY = Object.freeze({
  text: { props: { text: 'string' }, children: false },
  metric: { props: { label: 'string', value: 'value', unit: 'string?', note: 'string?', delta: 'string?', caption: 'string?', tone: 'string?' }, children: false },
  row: { props: { gap: 'number?' }, children: true },
  column: { props: { gap: 'number?' }, children: true },
  card: { props: { title: 'string?', subtitle: 'string?', gap: 'number?', span: 'number?', align: 'string?' }, children: true },
  grid: { props: { columns: 'number?', gap: 'number?', align: 'string?' }, children: true },
  table: { props: { columns: 'value', rows: 'value', caption: 'string?', filter: 'string?' }, children: false },
  // 行内原语：与文字同处一行，顺序即 AST 顺序（不是另开卡片）
  paragraph: { props: { gap: 'number?' }, children: true },
  badge: { props: { text: 'string', tone: 'string?' }, children: false },
  icon: { props: { name: 'string', label: 'string?' }, children: false },
  emphasis: { props: { text: 'string', strong: 'boolean?' }, children: false },
  code: { props: { text: 'string' }, children: false },
  link: { props: { text: 'string', href: 'string' }, children: false },
  // 块级反馈原语
  callout: { props: { tone: 'string?', title: 'string?', text: 'string?' }, children: true },
  progress: { props: { label: 'string?', value: 'number', max: 'number?', tone: 'string?' }, children: false },
  empty: { props: { text: 'string?', title: 'string?', description: 'string?', icon: 'string?' }, children: false },
  chart: { props: { kind: 'string', series: 'value', source: 'string?' }, children: false },
  drawing: { props: { width: 'number', height: 'number', label: 'string' }, children: true },
  view: { props: { label: 'string', caption: 'string?' }, children: true },
  rect: { props: { x: 'number', y: 'number', width: 'number', height: 'number', rx: 'number?', fill: 'string?', stroke: 'string?', strokeWidth: 'number?', opacity: 'number?' }, children: false },
  circle: { props: { cx: 'number', cy: 'number', r: 'number', fill: 'string?', stroke: 'string?', strokeWidth: 'number?', opacity: 'number?' }, children: false },
  line: { props: { x1: 'number', y1: 'number', x2: 'number', y2: 'number', stroke: 'string?', strokeWidth: 'number?', strokeDasharray: 'string?', opacity: 'number?' }, children: false },
  path: { props: { d: 'string', fill: 'string?', stroke: 'string?', strokeWidth: 'number?', opacity: 'number?' }, children: false },
  label: { props: { x: 'number', y: 'number', text: 'value', fill: 'string?', size: 'number?', align: 'string?', opacity: 'number?' }, children: false },
  segmented: { props: { label: 'string?', options: 'value', bind: 'string' }, children: false },
  divider: { props: { label: 'string?' }, children: false },
  // 本地交互控件：只写 $state，与 segmented 同一模型，不产生消息/工具调用
  toggle: { props: { label: 'string?', bind: 'string' }, children: false },
  slider: { props: { label: 'string?', bind: 'string', min: 'number?', max: 'number?', step: 'number?', unit: 'string?' }, children: false },
  input: { props: { label: 'string?', bind: 'string', placeholder: 'string?' }, children: false },
  // 派生状态、折叠和动作。只有 copy 接触宿主剪贴板。
  derive: { props: { name: 'string', expr: 'string' }, children: false },
  details: { props: { label: 'string', tone: 'string?' }, children: true },
  button: { props: { label: 'string', action: 'string', bind: 'string?', value: 'value', min: 'number?', max: 'number?', done: 'string?', unsupported: 'string?' }, children: false },
  // 过程与清单：steps 只接受 step 子节点（与 paragraph 只接受行内组件同一校验模式）
  steps: { props: {}, children: true },
  step: { props: { title: 'string', note: 'string?', tone: 'string?' }, children: false },
  // 结构图形：lane 是显式列，散装 node 由解析层汇成首列；edge 是唯一的方向性原语
  diagram: { props: { title: 'string?', source: 'string?' }, children: true },
  lane: { props: { label: 'string?' }, children: true },
  node: { props: { id: 'string', label: 'string', tone: 'string?', note: 'string?' }, children: false },
  edge: { props: { from: 'string', to: 'string', label: 'string?', kind: 'string?' }, children: false },
})

export const LIMITS = Object.freeze({ nodes: 120, depth: 6, series: 60, options: 6, text: 2000, stateBytes: 16384, diagramLanes: 6, diagramNodes: 24, diagramEdges: 24, derive: 64 })

/** 行内原语：paragraph 只接受这些子节点，保证"同一行文字混排"的语义。 */
export const INLINE_TYPES = Object.freeze(['text', 'badge', 'icon', 'emphasis', 'code', 'link'])
export const TONES = Object.freeze(['neutral', 'success', 'warning', 'danger', 'info', 'accent'])
export const ICONS = Object.freeze(['check', 'alert', 'dot', 'arrow-right', 'spark', 'chart', 'layers', 'shield', 'clock', 'inbox', 'info'])

const BIND = /^\$(state|data)\.([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)$/u
const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])
const STATE_ARRAY_ITEMS = 128
const STATE_DEPTH = 8
const STATE_KEY_LENGTH = 64

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 只允许 `$state.x` / `$data.x`，其余原样返回。 */
export function readBinding(value) {
  if (typeof value !== 'string') return { literal: value }
  const match = BIND.exec(value)
  return match === null || match[2].split('.').some((part) => RESERVED.has(part)) ? { literal: value } : { scope: match[1], key: match[2] }
}

/** 解析绑定到实际值（无表达式、无函数）。 */
export function resolveValue(value, scope) {
  const binding = readBinding(value)
  if (binding.scope === undefined) return binding.literal
  // 只按点号取属性，不求值、不调用函数
  let cursor = scope[binding.scope]
  for (const part of binding.key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

/**
 * 把受信图表输入统一变成 [标签, 数值] 点列。
 * 模型常给数字数组、[label,value] 数组或 {label,value}；三种都受限解析，不用表达式。
 */
export function chartMatrix(series) {
  if (!Array.isArray(series) || series.length === 0 || series.length > LIMITS.series) return null
  const rows = []
  for (let i = 0; i < series.length; i += 1) {
    const item = series[i]
    let label = String(i + 1)
    let raw
    if (typeof item === 'number') raw = item
    else if (Array.isArray(item) && item.length >= 2) {
      label = String(item[0])
      raw = item[1]
    } else if (isRecord(item)) {
      label = String(item.label ?? i + 1)
      raw = item.value
    } else return null
    const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')
      ? Number(raw)
      : NaN
    if (!Number.isFinite(value) || label.length > 100) return null
    rows.push([label, value])
  }
  return rows
}

/** Inline datasets use the same bounded expression grammar as derive. */
function compileDataset(value) {
  if (typeof value !== 'string' || readBinding(value).scope !== undefined) return null
  const compiled = compileExpr(value)
  return compiled.ok ? compiled : null
}

/** 本地状态也是来自模型的 JSON；避免超大对象和原型属性污染。 */
function stateSafe(value, depth = 0, budget = { remaining: LIMITS.stateBytes }) {
  // 每个值和键至少占一个字符，先限制遍历，再对有限结果计算序列化体积。
  budget.remaining -= typeof value === 'string' ? value.length + 1 : 1
  if (depth > STATE_DEPTH || budget.remaining < 0) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= LIMITS.text
  if (Array.isArray(value)) return value.length <= STATE_ARRAY_ITEMS && value.every((item) => stateSafe(item, depth + 1, budget))
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  return keys.length <= 64 && keys.every((key) => {
    budget.remaining -= key.length + 1
    return key.length <= STATE_KEY_LENGTH && !RESERVED.has(key) && stateSafe(value[key], depth + 1, budget)
  })
}

function fitsStateBudget(value) {
  try {
    return stateSafe(value) && JSON.stringify(value).length <= LIMITS.stateBytes
  } catch {
    return false
  }
}

/** 本地写入只复制目标分支，保留原状态直到新值通过完整状态预算。 */
export function writeStatePath(source, path, value) {
  if (!isRecord(source) || typeof path !== 'string' || path.length > STATE_DEPTH * (STATE_KEY_LENGTH + 1)) return source
  const parts = path.split('.')
  if (parts.length > STATE_DEPTH || parts.some((part) => part.length > STATE_KEY_LENGTH || !/^[A-Za-z0-9_]+$/u.test(part) || RESERVED.has(part))) return source

  const updated = { ...source }
  let container = updated
  for (const [index, part] of parts.entries()) {
    if (Array.isArray(container)) {
      // 数组只允许替换或追加有效索引，不能写 length 或制造稀疏数组。
      if (!/^(0|[1-9]\d*)$/u.test(part) || Number(part) >= STATE_ARRAY_ITEMS || Number(part) > container.length) return source
    }
    if (index === parts.length - 1) {
      if (Object.hasOwn(container, part) && Object.is(container[part], value)) return source
      container[part] = value
    } else {
      const child = Object.hasOwn(container, part) ? container[part] : undefined
      container[part] = Array.isArray(child) ? [...child] : isRecord(child) ? { ...child } : {}
      container = container[part]
    }
  }
  return fitsStateBudget(updated) ? updated : source
}

/** 任意组件都可携带的通用属性：显隐（when/is）与语义重要程度（weight）。 */
export const UNIVERSAL_PROPS = Object.freeze(['when', 'is', 'weight'])
export const WEIGHTS = Object.freeze(['primary', 'secondary', 'optional'])
export const DENSITIES = Object.freeze(['inline', 'compact', 'panel', 'auto'])
const DERIVE_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u
const MAX_COPY_BUTTONS = 4

const DRAWING_SHAPES = new Set(['rect', 'circle', 'line', 'path', 'label'])
const DRAWING_MAX_SHAPES = 64
const DRAWING_MAX_VIEWS = 6
const DRAWING_COLOR = new Set(['text', 'muted', 'border', 'surface', 'accent', 'neutral', 'success', 'warning', 'danger', 'info', 'none'])
const DRAWING_ALIGN = new Set(['start', 'middle', 'end'])
const DRAWING_STATIC = new Set(['d', 'align', 'strokeDasharray'])
const DRAWING_AXIS = [-2048, 2048]
const DRAWING_VIEWPORT = [24, 1024]
const DRAWING_LENGTH = [0.1, 2048]
const DRAWING_NUMERIC_LIMITS = { width: DRAWING_LENGTH, height: DRAWING_LENGTH, r: DRAWING_LENGTH, rx: [0, 1024], size: [8, 64], strokeWidth: [0, 24], opacity: [0, 1] }
const DRAWING_PATH_ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
const DRAWING_PATH_TOKEN = /[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:[0-9]*\.[0-9]+|[0-9]+\.?)(?:[Ee][+-]?[0-9]+)?|[ ,\t\r\n]+/gu

function boundedDrawingNumber(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function normalizeDrawingPath(value) {
  if (typeof value !== 'string' || value.length > 1400) return null
  const tokens = []
  let cursor = 0
  let command = null
  let remaining = 0
  let awaitingGroup = false
  let segments = 0
  for (const match of value.matchAll(DRAWING_PATH_TOKEN)) {
    if (match.index !== cursor) return null
    const token = match[0]
    cursor += token.length
    if (/^[ ,\t\r\n]/u.test(token)) continue
    tokens.push(token)
    const upper = token.toUpperCase()
    if (Object.hasOwn(DRAWING_PATH_ARITY, upper)) {
      if (remaining !== 0 || awaitingGroup || (command === null && upper !== 'M')) return null
      command = upper
      awaitingGroup = upper !== 'Z'
      if (upper === 'Z') segments += 1
    } else {
      if (command === null || command === 'Z') return null
      const arity = DRAWING_PATH_ARITY[command]
      if (remaining === 0) remaining = arity
      const position = arity - remaining
      const number = Number(token)
      if (!boundedDrawingNumber(number, ...DRAWING_AXIS)) return null
      if (command === 'A' && ((position < 2 && number < 0) || ((position === 3 || position === 4) && token !== '0' && token !== '1'))) return null
      remaining -= 1
      if (remaining === 0) {
        awaitingGroup = false
        segments += 1
      }
    }
    if (segments > 96) return null
  }
  return cursor === value.length && remaining === 0 && !awaitingGroup && segments > 0 ? tokens.join(' ') : null
}

function drawingAttribute(type, key, value) {
  if (key === 'd') return normalizeDrawingPath(value)
  if (key === 'fill' || key === 'stroke') return DRAWING_COLOR.has(value) ? value : null
  if (key === 'align') return value === 'center' ? 'middle' : DRAWING_ALIGN.has(value) ? value : null
  if (key === 'strokeDasharray') {
    if (typeof value !== 'string' || value.length > 80) return null
    const lengths = value.trim().split(/[\s,]+/u)
    if (lengths.length > 8 || lengths.some((part) => !/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(part) || !boundedDrawingNumber(Number(part), 0, 128))) return null
    return lengths.map(Number).join(' ')
  }
  if (key === 'label' || key === 'text' || key === 'caption') {
    if (key === 'text' && typeof value === 'number' && Number.isFinite(value)) return String(value)
    const maxLength = key === 'caption' ? 280 : type === 'view' ? 48 : 180
    return typeof value === 'string' && value.trim() !== '' && value.length <= maxLength ? value : null
  }
  const limits = type === 'drawing' ? DRAWING_VIEWPORT : DRAWING_NUMERIC_LIMITS[key] ?? DRAWING_AXIS
  return boundedDrawingNumber(value, ...limits) ? value : null
}

/** SVG props are allowlisted and revalidated after resolving the permitted bindings. */
export function drawingProps(type, props, resolve = null) {
  if (type !== 'drawing' && type !== 'view' && !DRAWING_SHAPES.has(type)) return null
  const safe = {}
  for (const [key, rule] of Object.entries(REGISTRY[type].props)) {
    let value = props?.[key]
    if (value === undefined && rule.endsWith('?')) continue
    const canBind = !DRAWING_STATIC.has(key) && (type !== 'drawing' || key === 'label')
    const bound = canBind && readBinding(value).scope !== undefined
    if (bound) {
      if (resolve === null) {
        safe[key] = value
        continue
      }
      value = resolve(value)
    }
    const normalized = drawingAttribute(type, key, value)
    if (normalized === null && type === 'view' && key === 'caption' && (bound || typeof value === 'string' && value.trim() === '')) continue
    if (normalized === null) return null
    safe[key] = normalized
  }
  return safe
}
const LOCAL_BUTTON_ACTIONS = Object.freeze(['set', 'append', 'pop', 'reset'])
const DEFAULT_APPEND_LIMIT = 32

/** The next value of a local binding. Undefined means there is no valid transition. */
export function localActionValue(state, initialState, props, value) {
  if (props.action === 'set') return value
  if (props.action === 'reset') return resolveValue(props.bind, { state: initialState })
  const current = resolveValue(props.bind, { state })
  if (!Array.isArray(current)) return undefined
  if (props.action === 'append' && value !== undefined && current.length < (props.max ?? DEFAULT_APPEND_LIMIT)) return [...current, value]
  if (props.action === 'pop' && current.length > (props.min ?? 0)) return current.slice(0, -1)
  return undefined
}

/** 在通过结构校验的节点中检测派生路径冲突和循环。 */
function planDerives(defs, bindPaths, state) {
  const rejected = new Map()
  if (defs.length === 0) return { ordered: [], rejected }

  // 初始 state 的每个顶层路径都拥有整个子树，比较根键即可。
  const statePaths = Object.keys(state)
  const byName = new Map()
  const conflict = (a, b) => a === b || a.startsWith(b + '.') || b.startsWith(a + '.')
  const deps = new Map()
  for (const [index, def] of defs.entries()) {
    const { name, expr } = def.node.props
    if (typeof name !== 'string' || name.length > 200 || !DERIVE_NAME.test(name) || name.split('.').some((part) => RESERVED.has(part))) {
      rejected.set(index, 'derive.name 需要安全的点号路径')
    } else if (byName.has(name)) {
      rejected.set(index, `derive.name 重复：${name}`)
    } else {
      const deriveHit = [...byName.keys()].find((path) => conflict(name, path))
      const bindHit = bindPaths.find((path) => conflict(name, path))
      const stateHit = statePaths.find((path) => conflict(name, path))
      if (deriveHit !== undefined) rejected.set(index, `derive.name 与派生路径冲突：${deriveHit}`)
      else if (bindHit !== undefined) rejected.set(index, `derive.name 与控件绑定冲突：${bindHit}`)
      else if (stateHit !== undefined) rejected.set(index, `derive.name 与初始 state 冲突：${stateHit}`)
      else if (typeof expr !== 'string' || expr.trim() === '') rejected.set(index, 'derive.expr 必填')
      else if (expr.length > EXPR_LIMITS.chars) rejected.set(index, `derive.expr 超过 ${EXPR_LIMITS.chars} 字符`)
      else {
        const compiled = compileExpr(expr)
        if (!compiled.ok) rejected.set(index, `derive.expr 不合法：${compiled.error}`)
        else byName.set(name, { index, name, compiled })
      }
    }
  }

  for (const { index, compiled } of byName.values()) {
    const set = new Set()
    for (const ref of compiled.refs) {
      if (ref.scope !== 'state') continue
      for (const [name, target] of byName) {
        if (ref.key === name || ref.key.startsWith(name + '.')) set.add(target.index)
      }
    }
    deps.set(index, set)
  }
  // 自环与循环检测（DFS 三色）
  const color = new Map()
  const stack = []
  const cyclic = new Set()
  const visit = (index) => {
    color.set(index, 1)
    stack.push(index)
    for (const next of deps.get(index) ?? []) {
      if (next === index) cyclic.add(index)
      else if (color.get(next) === 1) {
        const pos = stack.indexOf(next)
        if (pos >= 0) for (let at = pos; at < stack.length; at += 1) cyclic.add(stack[at])
      } else if (color.get(next) === undefined) visit(next)
    }
    stack.pop()
    color.set(index, 2)
  }
  for (const index of deps.keys()) if (color.get(index) === undefined) visit(index)
  for (const index of cyclic) rejected.set(index, `derive 循环引用：${defs[index].node.props.name}`)
  let deriveCount = 0
  for (const { index } of byName.values()) {
    if (rejected.has(index)) continue
    deriveCount += 1
    if (deriveCount > LIMITS.derive) rejected.set(index, `derive 最多 ${LIMITS.derive} 个`)
  }

  // 按原运行时的就绪队列排序。无依赖条目先按文档顺序入队，再加入解除依赖的条目。
  const active = [...byName.values()].filter(({ index }) => !rejected.has(index))
  const waiting = new Map(active.map((entry) => [entry.index, { entry, count: 0, dependents: [] }]))
  for (const [index, item] of waiting) {
    for (const dependency of deps.get(index)) {
      const target = waiting.get(dependency)
      if (target === undefined) continue
      item.count += 1
      target.dependents.push(item)
    }
  }
  const ready = [...waiting.values()].filter((item) => item.count === 0)
  const ordered = []
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const { entry, dependents } = ready[cursor]
    ordered.push({ name: entry.name, compiled: entry.compiled })
    for (const dependent of dependents) {
      dependent.count -= 1
      if (dependent.count === 0) ready.push(dependent)
    }
  }
  return { ordered, rejected }
}

/**
 * 校验并规范化一棵 AST（**局部容错**）。
 *
 * 规则：
 *  - 根节点不合法 / 深度或节点预算超限 → 整份拒绝（安全边界，不尝试修复）；
 *  - 子节点不合法 → 只把该子树替换成 fallback 文本节点，兄弟与父布局保留；
 *  - 未知组件、props 不合法、subtree 预算越界都走同一条降级路径。
 *
 * @returns {{ok:true, ast, derivePlan:Array, errors:string[], degraded:number} | {ok:false, errors:string[], fallback:string}}
 */
export function validateAst(input) {
  const fatal = []
  const diagnostics = []
  let nodes = 0
  let degraded = 0
  let copyButtons = 0
  const derives = []
  const bindPaths = []
  const fallback = typeof input?.fallback === 'string' ? input.fallback : ''
  const state = input?.state ?? {}
  if (!isRecord(state) || !fitsStateBudget(state)) {
    return { ok: false, errors: ['state 超过容量预算或包含不安全属性'], fallback }
  }
  // 根级 density：安全枚举，非法值整份拒绝（根属性 fail-closed）
  const density = input?.density === undefined || input?.density === null || input?.density === '' ? 'panel' : input.density
  if (!DENSITIES.includes(density)) {
    return { ok: false, errors: [`density 只能是 ${DENSITIES.join('/')}`], fallback }
  }

  const failNode = (node, path, reason) => {
    degraded += 1
    diagnostics.push(`${path}: ${reason}`)
    const text = typeof node?.fallback === 'string' ? node.fallback.slice(0, LIMITS.text) : ''
    return { id: `${path}-degraded`, type: 'text', props: { text }, children: [], degraded: true }
  }

  const walk = (node, depth, path, parentType) => {
    if (depth > LIMITS.depth) {
      fatal.push(`${path} 超过最大深度 ${LIMITS.depth}`)
      return null
    }
    nodes += 1
    if (nodes > LIMITS.nodes) {
      fatal.push(`节点数超过 ${LIMITS.nodes}`)
      return null
    }
    if (!isRecord(node)) return failNode(node, path, '不是对象')
    if (node.type === 'text' && node.degraded === true) {
      const text = typeof node.props?.text === 'string' ? node.props.text.slice(0, LIMITS.text) : ''
      return { id: typeof node.id === 'string' ? node.id : path, type: 'text', props: { text }, children: [], degraded: true }
    }
    if (typeof node.type !== 'string') return failNode(node, path, '组件类型需要字符串')
    if (!Object.hasOwn(REGISTRY, node.type)) return failNode(node, path, `未知组件类型 ${node.type}`)
    const shape = DRAWING_SHAPES.has(node.type)
    if (parentType === 'drawing' && !shape && node.type !== 'view') return failNode(node, path, 'drawing 只接受图形原语与 view')
    if (node.type === 'view' && parentType !== 'drawing') return failNode(node, path, 'view 需要直接放在 drawing 里')
    if (parentType === 'view' && !shape) return failNode(node, path, 'view 只接受图形原语')
    if (shape && parentType !== 'drawing' && parentType !== 'view') return failNode(node, path, '图形原语需要放在 drawing 或 view 里')
    const spec = REGISTRY[node.type]
    if (spec.children && Array.isArray(node.children) && node.children.length > LIMITS.nodes - nodes) {
      fatal.push(`节点数超过 ${LIMITS.nodes}`)
      return null
    }
    const props = isRecord(node.props) ? node.props : {}
    if (props.weight !== undefined && !WEIGHTS.includes(props.weight)) {
      return failNode(node, path, 'weight 只能是 primary/secondary/optional')
    }
    const writesState = node.type === 'button' ? LOCAL_BUTTON_ACTIONS.includes(props.action) : Object.hasOwn(spec.props, 'bind')
    const binding = writesState ? readBinding(props.bind) : null
    if (binding !== null && binding.scope !== 'state') return failNode(node, path, `${node.type} 需要 bind="$state.*"`)
    if (node.type === 'segmented') {
      const options = props.options
      if (!Array.isArray(options) || options.length === 0 || options.length > LIMITS.options) {
        return failNode(node, path, `options 需要 1–${LIMITS.options} 项`)
      }
      for (const option of options) {
        if (!isRecord(option) || typeof option.label !== 'string' || option.label.trim() === '' || option.label.length > LIMITS.text
          || !Object.hasOwn(option, 'value') || !fitsStateBudget(option.value)) {
          return failNode(node, path, 'options 各项需要 label 和安全的 JSON value')
        }
      }
    }
    if (node.type === 'slider') {
      for (const key of ['min', 'max', 'step']) {
        if (props[key] !== undefined && (typeof props[key] !== 'number' || !Number.isFinite(props[key]))) {
          return failNode(node, path, `slider.${key} 需要数字`)
        }
      }
      if (typeof props.step === 'number' && props.step <= 0) return failNode(node, path, 'slider.step 需为正数')
      if (typeof props.min === 'number' && typeof props.max === 'number' && props.max <= props.min) {
        return failNode(node, path, 'slider.max 需大于 slider.min')
      }
    }
    if (node.type === 'details') {
      if (typeof props.label !== 'string' || props.label.trim() === '') return failNode(node, path, 'details.label 必填')
      if (props.tone !== undefined && !TONES.includes(props.tone)) return failNode(node, path, `details.tone 只能是 ${TONES.join('/')}`)
    }
    if (node.type === 'button') {
      if (typeof props.label !== 'string' || props.label.trim() === '') return failNode(node, path, 'button.label 必填')
      if (props.action === 'copy') {
        if (props.value === undefined) return failNode(node, path, 'button.value 必填')
        copyButtons += 1
        if (copyButtons > MAX_COPY_BUTTONS) return failNode(node, path, `copy 按钮最多 ${MAX_COPY_BUTTONS} 个`)
        if (typeof props.value === 'string' && readBinding(props.value).scope === undefined) {
          if (props.value.length > LIMITS.text) return failNode(node, path, 'button.value 文本超限')
        } else if (props.value !== null && typeof props.value === 'object') {
          let bytes = Infinity
          try { bytes = JSON.stringify(props.value).length } catch { /* 循环输入拒绝 */ }
          if (bytes > LIMITS.stateBytes) return failNode(node, path, 'button.value 超出容量预算')
        }
      } else {
        if (!writesState) return failNode(node, path, 'button.action 需要 copy、set、append、pop 或 reset')
        if ((props.action === 'append' || props.action === 'set') && !fitsStateBudget(props.value)) {
          return failNode(node, path, 'button.value 需要安全的 JSON 值')
        }
        if (props.action === 'append' && props.max !== undefined
          && (!Number.isInteger(props.max) || props.max < 1 || props.max > STATE_ARRAY_ITEMS)) {
          return failNode(node, path, `button.max 需要 1–${STATE_ARRAY_ITEMS} 的整数`)
        }
        if (props.action === 'pop' && props.min !== undefined
          && (!Number.isInteger(props.min) || props.min < 0 || props.min >= STATE_ARRAY_ITEMS)) {
          return failNode(node, path, `button.min 需要 0–${STATE_ARRAY_ITEMS - 1} 的整数`)
        }
      }
    }
    if (node.type === 'steps') {
      const kids = Array.isArray(node.children) ? node.children : []
      if (kids.length === 0) return failNode(node, path, 'steps 至少需要一个 step')
      const bad = kids.find((child) => child === null || typeof child !== 'object' || child.type !== 'step')
      if (bad !== undefined) return failNode(node, path, 'steps 只接受 step 子节点')
    }
    if (node.type === 'step') {
      if (typeof props.title !== 'string' || props.title.trim() === '') return failNode(node, path, 'step.title 必填')
      if (props.tone !== undefined && !TONES.includes(props.tone)) return failNode(node, path, `step.tone 只能是 ${TONES.join('/')}`)
    }
    if (node.type === 'lane') {
      const kids = Array.isArray(node.children) ? node.children : []
      const bad = kids.find((child) => child === null || typeof child !== 'object' || child.type !== 'node')
      if (bad !== undefined) return failNode(node, path, 'lane 只接受 node 子节点')
      const count = kids.filter((child) => child.type === 'node').length
      if (count === 0 || count > 8) return failNode(node, path, 'lane 需要 1-8 个 node')
    }
    if (node.type === 'node' && (typeof props.label !== 'string' || props.label.trim() === '')) {
      return failNode(node, path, 'node.label 必填')
    }
    if (node.type === 'node' && props.tone !== undefined && !TONES.includes(props.tone)) {
      return failNode(node, path, `node.tone 只能是 ${TONES.join('/')}`)
    }
    if (node.type === 'edge') {
      if (typeof props.from !== 'string' || props.from === '' || typeof props.to !== 'string' || props.to === '') {
        return failNode(node, path, 'edge 需要 from/to')
      }
      if (props.kind !== undefined && !['solid', 'dashed'].includes(props.kind)) {
        return failNode(node, path, 'edge.kind 只能为 solid/dashed')
      }
    }
    if (node.type === 'diagram') {
      const kids = Array.isArray(node.children) ? node.children : []
      const badType = kids.find((child) => child === null || typeof child !== 'object' || !['lane', 'node', 'edge', 'text'].includes(child.type))
      if (badType !== undefined) return failNode(node, path, 'diagram 只接受 lane/node/edge 与注释文本')
      const lanes = kids.filter((child) => child.type === 'lane')
      const freeNodes = kids.filter((child) => child.type === 'node')
      const edges = kids.filter((child) => child.type === 'edge')
      // 先收幸存 id：坏 id / 重复 id 只降级该 node，图与其余内容保留
      const seen = new Set()
      const ids = new Set()
      const survivors = new Set()
      const markNode = (child) => {
        const id = child?.props?.id
        if (typeof id === 'string' && /^[A-Za-z_][A-Za-z0-9_-]{0,31}$/u.test(id) && !seen.has(id)) {
          seen.add(id)
          ids.add(id)
          survivors.add(child)
          return true
        }
        return false
      }
      freeNodes.forEach(markNode)
      for (const lane of lanes) for (const child of (Array.isArray(lane.children) ? lane.children : [])) if (typeof child === 'object' && child !== null && child.type === 'node') markNode(child)
      if (ids.size === 0) return failNode(node, path, 'diagram 至少需要一个 node')
      if (ids.size > LIMITS.diagramNodes) return failNode(node, path, `节点最多 ${LIMITS.diagramNodes} 个`)
      if (lanes.length + (freeNodes.length > 0 ? 1 : 0) > LIMITS.diagramLanes) return failNode(node, path, `泳道最多 ${LIMITS.diagramLanes} 列`)
      if (edges.length > LIMITS.diagramEdges) return failNode(node, path, `连线最多 ${LIMITS.diagramEdges} 条`)
      const brokenNode = (child) => failNode(child, `${path} node`, 'node.id 缺失、不安全或重复')
      const brokenEdge = (child) => failNode(child, `${path} edge`, `edge 引用未知节点：${String(child?.props?.from ?? '')} → ${String(child?.props?.to ?? '')}`)
      const rewrittenLanes = lanes.map((lane) => ({
        ...lane,
        children: (Array.isArray(lane.children) ? lane.children : []).map((child) =>
          typeof child === 'object' && child !== null && child.type === 'node' && !survivors.has(child) ? brokenNode(child) : child,
        ),
      }))
      node = {
        ...node,
        children: kids.map((child) => {
          if (child.type === 'lane') return rewrittenLanes[lanes.indexOf(child)] ?? child
          if (child.type === 'node') return survivors.has(child) ? child : brokenNode(child)
          if (child.type === 'edge') return ids.has(child.props?.from ?? '') && ids.has(child.props?.to ?? '') ? child : brokenEdge(child)
          return child
        }),
      }
    }
    if (node.type === 'table' && props.filter !== undefined && readBinding(props.filter).scope !== 'state') {
      return failNode(node, path, 'table.filter 只能绑定 $state.*')
    }
    if (props.when !== undefined && typeof props.when !== 'boolean' && readBinding(props.when).scope !== 'state') {
      return failNode(node, path, 'when 需要布尔值或 $state.* 绑定')
    }
    let datasetExpression = null
    if (node.type === 'chart') {
      if (!['bar', 'line', 'donut'].includes(props.kind ?? 'bar')) return failNode(node, path, 'chart.kind 只能为 bar/line/donut')
      const binding = readBinding(props.series)
      if (binding.scope === undefined && chartMatrix(binding.literal) === null) {
        datasetExpression = compileDataset(binding.literal)
        if (datasetExpression === null) return failNode(node, path, 'chart.series 需要点列、状态绑定或纯表达式')
      }
    }
    let comparison = false
    if (node.type === 'drawing') {
      const children = Array.isArray(node.children) ? node.children : []
      const views = children.filter((child) => child?.type === 'view')
      comparison = views.length > 0
      const count = children.length - views.length + views.reduce((sum, child) => sum + (Array.isArray(child.children) ? child.children.length : 0), 0)
      if (views.length === 1 || views.length > DRAWING_MAX_VIEWS) return failNode(node, path, `drawing 需要 2–${DRAWING_MAX_VIEWS} 个 view 来展示对照`)
      if (count === 0 || count > DRAWING_MAX_SHAPES) return failNode(node, path, `drawing 需要 1–${DRAWING_MAX_SHAPES} 个图形原语`)
    }
    if ((node.type === 'drawing' || node.type === 'view' || shape) && drawingProps(node.type, props) === null) {
      return failNode(node, path, `${node.type} 的图形属性无效或超出预算`)
    }
    if (node.type === 'text' && typeof props.text === 'string' && props.text.length > LIMITS.text) {
      return failNode(node, path, `text 超过 ${LIMITS.text} 字`)
    }
    if (node.type === 'table') {
      // columns/rows 可为字面量，也可绑定到 $state.*（派生状态）；绑定形态在渲染期解析后再归一。
      const columnsBound = readBinding(props.columns).scope !== undefined
      const rowsBinding = readBinding(props.rows)
      datasetExpression = compileDataset(rowsBinding.literal)
      const rowsBound = rowsBinding.scope !== undefined || datasetExpression !== null
      if (!columnsBound && (!Array.isArray(props.columns) || props.columns.length === 0 || props.columns.length > 12)) return failNode(node, path, 'table 需要 1–12 列')
      if (!rowsBound && !Array.isArray(props.rows)) return failNode(node, path, 'table 需要 rows 数组或 $state 绑定')
      if (!rowsBound && Array.isArray(props.rows) && props.rows.length > 200) return failNode(node, path, 'table 最多 200 行')
      if (!columnsBound) {
        const columnsOk = props.columns.every((column) => typeof column === 'string' || (isRecord(column) && typeof column.label === 'string' && (column.key === undefined || (typeof column.key === 'string' && !RESERVED.has(column.key) && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(column.key)))))
        if (!columnsOk) return failNode(node, path, 'table.columns 需要字符串或 {key,label} 描述符')
      }
      if (!rowsBound) {
        const rowsOk = props.rows.every((row) => Array.isArray(row) || (row !== null && typeof row === 'object'))
        if (!rowsOk) return failNode(node, path, 'table.rows 的每一项需要数组或对象')
      }
      if (columnsBound || rowsBound || props.caption !== undefined) {
        // 绑定形态没有静态体积可比，只校验绑定路径安全性（readBinding 已保证）
        const staticBytes = JSON.stringify({ columns: columnsBound ? undefined : props.columns, rows: rowsBound ? undefined : props.rows }).length
        if (staticBytes > LIMITS.stateBytes) return failNode(node, path, 'table 数据超出容量预算')
      }
      if (JSON.stringify(props).length > LIMITS.stateBytes) return failNode(node, path, 'table 数据超出容量预算')
    }
    if (node.type === 'paragraph') {
      const inlineKids = Array.isArray(node.children) ? node.children : []
      const bad = inlineKids.find((child) => child === null || typeof child !== 'object' || !INLINE_TYPES.includes(child.type))
      if (bad !== undefined) return failNode(node, path, `paragraph 只接受行内组件（${INLINE_TYPES.join('/')}）`)
    }
    if (node.type === 'badge' && props.tone !== undefined && !TONES.includes(props.tone)) {
      return failNode(node, path, `badge.tone 只能是 ${TONES.join('/')}`)
    }
    if (node.type === 'callout' && props.tone !== undefined && !TONES.includes(props.tone)) {
      return failNode(node, path, `callout.tone 只能是 ${TONES.join('/')}`)
    }
    for (const type of ['metric', 'progress']) {
      if (node.type === type && props.tone !== undefined && !TONES.includes(props.tone)) {
        return failNode(node, path, `${type}.tone 只能是 ${TONES.join('/')}`)
      }
    }
    if (node.type === 'icon' && !ICONS.includes(props.name)) {
      // 未知图标名不整节点丢弃：降级为 dot，保留语义可选性（图标只是装饰）
      props.name = 'dot'
    }
    if (node.type === 'link') {
      const href = typeof props.href === 'string' ? props.href : ''
      // 只接受 https 绝对地址或站内相对路径（以 / 开头）；javascript:/data: 等一律拒绝
      if (!/^(https:\/\/[^\s]+|\/(?!\/)[^\s]*|#[A-Za-z][A-Za-z0-9_-]*)$/u.test(href)) return failNode(node, path, 'link 只接受 https、站内路径或安全锚点')
    }
    if (node.type === 'progress') {
      // value 允许 $state 绑定（渲染时解析为数字）；字面量则必须是 >= 0 的数字
      const bound = typeof props.value === 'string' && readBinding(props.value).scope === 'state'
      if (!bound && (typeof props.value !== 'number' || !Number.isFinite(props.value) || props.value < 0)) {
        return failNode(node, path, 'progress.value 需要 >= 0 的数字或 $state 绑定')
      }
      if (props.max !== undefined && (typeof props.max !== 'number' || props.max <= 0)) {
        return failNode(node, path, 'progress.max 需要正数')
      }
    }
    if (node.type === 'grid' && props.columns !== undefined) {
      const columns = props.columns
      if (typeof columns !== 'number' || !Number.isInteger(columns) || columns < 1 || columns > 6) {
        return failNode(node, path, 'grid.columns 需要 1–6 的整数')
      }
    }
    const children = []
    if (spec.children && Array.isArray(node.children)) {
      for (const [index, child] of node.children.entries()) {
        const walked = walk(child, depth + 1, `${path}.children[${index}]`, node.type)
        if (walked === null) return null
        children.push(walked)
      }
    }
    if (comparison && !children.some((child) => DRAWING_SHAPES.has(child.type) || child.type === 'view' && child.children.some((part) => DRAWING_SHAPES.has(part.type)))) {
      return failNode(node, path, 'drawing 对照需要至少一个可验证的图形原语')
    }
    // 属性白名单：只保留组件 REGISTRY 声明的 props + 通用属性，未知属性（onClick/style/…）一律剥离
    const allowed = new Set([...Object.keys(spec.props), ...UNIVERSAL_PROPS])
    const safeProps = {}
    for (const key of Object.keys(props)) {
      if (allowed.has(key)) safeProps[key] = props[key]
    }
    const normalized = { id: typeof node.id === 'string' && node.id !== '' ? node.id : path, type: node.type, props: safeProps, children }
    if (typeof node.fallback === 'string' && node.fallback.trim() !== '') normalized.fallback = node.fallback.slice(0, LIMITS.text)
    if (datasetExpression !== null) normalized.datasetExpression = datasetExpression
    if (node.type === 'derive') derives.push({ node: normalized, source: node, path })
    if (binding !== null) bindPaths.push(binding.key)
    return normalized
  }

  const root = walk(input?.root, 1, 'root')
  if (fatal.length > 0 || root === null) return { ok: false, errors: fatal, fallback }
  const { ordered: derivePlan, rejected } = planDerives(derives, bindPaths, state)
  for (const [index, reason] of rejected) {
    const derive = derives[index]
    Object.assign(derive.node, failNode(derive.source, derive.path, reason))
  }
  // 根节点若只能降级，等于整份文档没有可信结构 → 整段拒绝（不做半残渲染）
  if (root.degraded === true) {
    return { ok: false, errors: diagnostics.length === 0 ? ['根节点不合法'] : diagnostics, fallback: fallback || root.props.text }
  }
  return {
    ok: true,
    errors: [],
    degraded,
    diagnostics,
    derivePlan,
    ast: { version: IUI_VERSION, state, root, density, fallback, title: typeof input?.title === 'string' ? input.title : '' },
  }
}

/** 表格归一：列可为字符串或 {key,label}，行可为二维数组或对象；输出纯二维字符串表。 */
export function tableMatrix(props) {
  const rawColumns = Array.isArray(props?.columns) ? props.columns : []
  const columns = rawColumns.map((column) => {
    if (typeof column === 'string') return { key: null, label: column }
    const key = typeof column?.key === 'string' ? column.key : null
    return { key, label: String(column?.label ?? column?.key ?? '') }
  })
  const matrix = (Array.isArray(props?.rows) ? props.rows : []).map((row) => {
    if (Array.isArray(row)) return columns.map((_, index) => row[index] ?? '')
    return columns.map((column) => {
      if (column.key !== null) return row?.[column.key] ?? ''
      return row?.[column.label] ?? ''
    })
  })
  return { columns: columns.map((column) => column.label), rows: matrix }
}

/** 局部降级：把一段文本包成合法的 text 节点（客户端/测试共用）。 */
export function degradeToText(text) {
  return { id: 'degraded', type: 'text', props: { text: String(text ?? '') }, children: [] }
}
