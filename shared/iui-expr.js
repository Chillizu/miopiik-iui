/**
 * IUI 安全表达式 v1（实验层）：自有 tokenizer + 递归下降解析器 + 纯函数求值。
 *
 * 设计边界：
 *  - 模型/示例只产出**表达式源码字符串**；本模块绝不使用 eval / new Function，
 *    不产生可执行代码，解析结果只是一棵受限 JSON AST；
 *  - 表达式只能读 `$state.*` / `$data.*` 的只读点号路径，不能调用对象方法、不能赋值、
 *    不能访问任意成员（`.constructor` 等一律拒绝）；
 *  - 函数只允许白名单内的纯标量、序列与数值运算；
 *  - 预算（源码长度/token/嵌套深度/结果体量）统一拒绝；失败返回结构化错误，不抛异常；
 *  - 纯函数、确定性；compile 结果按源码做有界缓存（≤ 256 项）。
 */

export const EXPR_LIMITS = Object.freeze({
  chars: 1000,
  tokens: 256,
  depth: 24,
  items: 128,
  resultDepth: 8,
  stringLength: 2000,
  resultChars: 16384,
  matrixCells: 4096,
  work: 32768,
  decimalPlaces: 12,
  cache: 256,
})

const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])
const SEQUENCE_ARITY = Object.freeze({
  len: 1, at: 2, gather: 2, dot: 2, matvec: 2, scale: 2, softmax: 1, roundEach: 2, zip: [2, 6], join: 2, sample: 2,
})
const FUNCTIONS = Object.freeze({ round: [1, 2], floor: 1, ceil: 1, abs: 1, sin: 1, cos: 1, exp: 1, when: 3, min: -1, max: -1, clamp: 3, ...SEQUENCE_ARITY })
const SCOPES = new Set(['state', 'data'])
const IDENT_START = /[A-Za-z_]/u
const IDENT_PART = /[A-Za-z0-9_]/u
const DIGIT = /[0-9]/u
const PUNCT2 = new Set(['==', '!=', '<=', '>=', '&&', '||'])
const PUNCT1 = new Set(['+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', '[', ']', '{', '}', ','])

function fail(error) {
  return { ok: false, error }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 词法分析：失败返回 {ok:false}；成功返回 token 数组（末尾带 eof）。 */
function tokenize(source) {
  const tokens = []
  const push = (token) => {
    tokens.push(token)
    return tokens.length <= EXPR_LIMITS.tokens
  }
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    // 数字：整数/小数（不支持指数、不允许前导 .）
    if (DIGIT.test(ch)) {
      let j = i
      while (j < source.length && DIGIT.test(source[j])) j += 1
      if (source[j] === '.') {
        j += 1
        const fracStart = j
        while (j < source.length && DIGIT.test(source[j])) j += 1
        if (j === fracStart) return fail('数字的小数部分不能为空')
      }
      const raw = source.slice(i, j)
      const value = Number(raw)
      if (!Number.isFinite(value)) return fail(`数字不合法：${raw}`)
      if (!push({ t: 'num', v: value })) return fail('表达式 token 数超限')
      i = j
      continue
    }
    // 字符串：只支持 ' 与 "，转义仅 \\ \' \" \n \t
    if (ch === '"' || ch === "'") {
      let j = i + 1
      let out = ''
      let closed = false
      while (j < source.length) {
        const c = source[j]
        if (c === '\\') {
          const next = source[j + 1]
          if (next === '\\') out += '\\'
          else if (next === "'" || next === '"') out += next
          else if (next === 'n') out += '\n'
          else if (next === 't') out += '\t'
          else return fail(`不支持的转义：\\${String(next ?? '')}`)
          j += 2
          continue
        }
        if (c === ch) {
          closed = true
          j += 1
          break
        }
        if (c === '\n' || c === '\r') return fail('字符串不能跨行')
        out += c
        j += 1
      }
      if (!closed) return fail('字符串没有闭合')
      if (!push({ t: 'str', v: out })) return fail('表达式 token 数超限')
      i = j
      continue
    }
    // 作用域引用：$state.a.b / $data.a.b
    if (ch === '$') {
      const match = /^\$(state|data)((?:\.[A-Za-z_][A-Za-z0-9_]*)+)/u.exec(source.slice(i))
      if (match === null) return fail('引用只允许 $state.* 或 $data.* 的点号路径')
      const scope = match[1]
      const key = match[2].slice(1)
      if (!SCOPES.has(scope) || key.split('.').some((part) => RESERVED.has(part))) return fail(`不安全的引用：$${scope}.${key}`)
      if (!push({ t: 'ref', scope, key })) return fail('表达式 token 数超限')
      i += match[0].length
      continue
    }
    // 标识符：true/false/null、函数名（白名单在解析期校验）、对象字面量键
    if (IDENT_START.test(ch)) {
      let j = i + 1
      while (j < source.length && IDENT_PART.test(source[j])) j += 1
      const word = source.slice(i, j)
      if (!push({ t: 'ident', v: word })) return fail('表达式 token 数超限')
      i = j
      continue
    }
    // 双字符运算符
    const two = source.slice(i, i + 2)
    if (PUNCT2.has(two)) {
      if (!push({ t: 'punc', v: two })) return fail('表达式 token 数超限')
      i += 2
      continue
    }
    if (PUNCT1.has(ch)) {
      if (!push({ t: 'punc', v: ch })) return fail('表达式 token 数超限')
      i += 1
      continue
    }
    return fail(`不支持的字符：${ch}`)
  }
  tokens.push({ t: 'eof', v: '' })
  return { ok: true, tokens }
}

/** 递归下降解析；深度预算在入口处统一检查。 */
function createParser(tokens) {
  let index = 0
  const peek = () => tokens[index]
  const next = () => tokens[index++]
  const isPunc = (value) => peek().t === 'punc' && peek().v === value
  const eat = (value) => {
    if (!isPunc(value)) return false
    index += 1
    return true
  }
  const expect = (value) => (eat(value) ? null : fail(`缺少 ${value}`))

  const parseExpression = (depth) => {
    if (depth > EXPR_LIMITS.depth) return fail('表达式嵌套超限')
    const condition = parseOr(depth)
    if (condition.ok === false) return condition
    if (!eat('?')) return condition
    const onTrue = parseExpression(depth + 1)
    if (onTrue.ok === false) return onTrue
    const colon = expect(':')
    if (colon !== null) return colon
    const onFalse = parseExpression(depth + 1)
    if (onFalse.ok === false) return onFalse
    return { ok: true, node: { t: 'cond', c: condition.node, a: onTrue.node, b: onFalse.node } }
  }

  const binary = (parseHigher, ops) => (depth) => {
    const first = parseHigher(depth)
    if (first.ok === false) return first
    let left = first.node
    for (;;) {
      const token = peek()
      if (token.t !== 'punc' || !ops.has(token.v)) break
      index += 1
      const right = parseHigher(depth)
      if (right.ok === false) return right
      left = { t: 'bin', op: token.v, l: left, r: right.node }
    }
    return { ok: true, node: left }
  }

  const parseOr = binary((depth) => parseAnd(depth), new Set(['||']))
  const parseAnd = binary((depth) => parseEquality(depth), new Set(['&&']))
  const parseEquality = binary((depth) => parseRelational(depth), new Set(['==', '!=']))
  const parseRelational = binary((depth) => parseAdditive(depth), new Set(['<', '<=', '>', '>=']))
  const parseAdditive = binary((depth) => parseMultiplicative(depth), new Set(['+', '-']))
  const parseMultiplicative = binary((depth) => parseUnary(depth), new Set(['*', '/', '%']))

  function parseUnary(depth) {
    if (depth > EXPR_LIMITS.depth) return fail('表达式嵌套超限')
    if (isPunc('-') || isPunc('+') || isPunc('!')) {
      const op = next().v
      const operand = parseUnary(depth + 1)
      if (operand.ok === false) return operand
      return { ok: true, node: { t: 'unary', op, x: operand.node } }
    }
    return parsePrimary(depth)
  }

  function parseCall(depth, name) {
    index += 1 // '('
    const args = []
    if (!isPunc(')')) {
      for (;;) {
        const arg = parseExpression(depth + 1)
        if (arg.ok === false) return arg
        args.push(arg.node)
        if (args.length > EXPR_LIMITS.tokens) return fail('函数参数过多')
        if (!eat(',')) break
      }
    }
    const close = expect(')')
    if (close !== null) return close
    const arity = FUNCTIONS[name]
    const validArity = Array.isArray(arity)
      ? args.length >= arity[0] && args.length <= arity[1]
      : arity === -1 ? args.length >= 1 : args.length === arity
    if (!validArity) return fail(`${name} 参数个数不合法`)
    if (name === 'when') return { ok: true, node: { t: 'cond', c: args[0], a: args[1], b: args[2] } }
    return { ok: true, node: { t: 'call', name, args } }
  }

  function parseObject(depth) {
    index += 1 // '{'
    const entries = []
    if (!isPunc('}')) {
      for (;;) {
        const token = peek()
        let key
        if (token.t === 'ident') key = next().v
        else if (token.t === 'str') key = next().v
        else return fail('对象键只允许标识符或字符串')
        if (RESERVED.has(key)) return fail(`不安全的对象键：${key}`)
        const colon = expect(':')
        if (colon !== null) return colon
        const value = parseExpression(depth + 1)
        if (value.ok === false) return value
        entries.push([key, value.node])
        if (entries.length > EXPR_LIMITS.items) return fail('对象项数超限')
        if (!eat(',')) break
      }
    }
    const close = expect('}')
    if (close !== null) return close
    return { ok: true, node: { t: 'obj', entries } }
  }

  function parseArray(depth) {
    index += 1 // '['
    const items = []
    if (!isPunc(']')) {
      for (;;) {
        const item = parseExpression(depth + 1)
        if (item.ok === false) return item
        items.push(item.node)
        if (items.length > EXPR_LIMITS.items) return fail('数组项数超限')
        if (!eat(',')) break
      }
    }
    const close = expect(']')
    if (close !== null) return close
    return { ok: true, node: { t: 'arr', items } }
  }

  function parsePrimary(depth) {
    if (depth > EXPR_LIMITS.depth) return fail('表达式嵌套超限')
    const token = peek()
    if (token.t === 'num') {
      next()
      return { ok: true, node: { t: 'num', v: token.v } }
    }
    if (token.t === 'str') {
      next()
      return { ok: true, node: { t: 'str', v: token.v } }
    }
    if (token.t === 'ref') {
      next()
      return { ok: true, node: { t: 'ref', scope: token.scope, key: token.key } }
    }
    if (token.t === 'ident') {
      const word = token.v
      if (word === 'true' || word === 'false' || word === 'null') {
        next()
        return { ok: true, node: { t: 'lit', v: word === 'true' ? true : word === 'false' ? false : null } }
      }
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, word)) {
        next()
        if (!isPunc('(')) return fail(`函数 ${word} 需要括号调用`)
        return parseCall(depth, word)
      }
      return fail(`未知标识符：${word}`)
    }
    if (eat('(')) {
      const inner = parseExpression(depth + 1)
      if (inner.ok === false) return inner
      const close = expect(')')
      if (close !== null) return close
      return inner
    }
    if (isPunc('[')) return parseArray(depth)
    if (isPunc('{')) return parseObject(depth)
    return fail(`意外的符号：${token.v === '' ? '结尾' : token.v}`)
  }

  return {
    parse() {
      const result = parseExpression(1)
      if (result.ok === false) return result
      if (peek().t !== 'eof') return fail(`多余内容：${peek().v === '' ? '结尾' : peek().v}`)
      return { ok: true, program: result.node }
    },
  }
}

/** 从编译后的受限 AST 中提取全部引用（去重、按 scope+key 排序，确定性）。 */
function collectRefs(program) {
  const refs = []
  const seen = new Set()
  const stack = [program]
  while (stack.length > 0) {
    const node = stack.pop()
    if (node === null || typeof node !== 'object') continue
    if (node.t === 'ref') {
      const key = node.scope + '\u0000' + node.key
      if (!seen.has(key)) {
        seen.add(key)
        refs.push({ scope: node.scope, key: node.key })
      }
      continue
    }
    if (node.t === 'cond') stack.push(node.a, node.b, node.c)
    else if (node.t === 'bin') stack.push(node.l, node.r)
    else if (node.t === 'unary') stack.push(node.x)
    else if (node.t === 'call') stack.push(...node.args)
    else if (node.t === 'arr') stack.push(...node.items)
    else if (node.t === 'obj') for (const [, value] of node.entries) stack.push(value)
  }
  refs.sort((a, b) => (a.scope === b.scope ? (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) : a.scope < b.scope ? -1 : 1))
  return refs
}

const cache = new Map()

/**
 * 编译表达式源码。源码只解析成受限 AST，不执行任何代码。
 * @param {unknown} source
 * @returns {{ok:true, source:string} | {ok:false, error:string}}
 */
export function compileExpr(source) {
  if (typeof source !== 'string') return fail('expr 必须是字符串')
  const text = source.trim()
  if (text === '') return fail('expr 不能为空')
  if (text.length > EXPR_LIMITS.chars) return fail(`expr 超过 ${EXPR_LIMITS.chars} 字符`)
  const cached = cache.get(text)
  if (cached !== undefined) return cached
  const lexed = tokenize(text)
  let result
  if (lexed.ok === false) result = fail(lexed.error)
  else {
    const parsed = createParser(lexed.tokens).parse()
    result = parsed.ok === false ? fail(parsed.error) : { ok: true, source: text, program: parsed.program, refs: collectRefs(parsed.program) }
  }
  if (cache.size >= EXPR_LIMITS.cache) cache.delete(cache.keys().next().value)
  cache.set(text, result)
  return result
}

function readPath(scope, name, key) {
  let cursor = scope?.[name]
  for (const part of key.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return { ok: false, error: `未定义的引用：$${name}.${key}` }
    cursor = cursor[part]
  }
  if (cursor === undefined) return { ok: false, error: `未定义的引用：$${name}.${key}` }
  return { ok: true, value: cursor }
}

function numeric(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function finite(value) {
  return numeric(value) ? { ok: true, value } : { ok: false, error: '运算结果必须是有限数字' }
}

function spend(budget, units) {
  budget.remaining -= units
  return budget.remaining >= 0
}

/** 在复制输出时计量 JSON 大小，连同重复引用展开后的内容一起限额。 */
function inspectResult(value, work, depth = 0, space = { remaining: EXPR_LIMITS.resultChars }) {
  if (!spend(work, 1)) return fail('表达式求值预算超限')
  if (depth > EXPR_LIMITS.resultDepth) return fail('表达式结果嵌套超限')
  const tooLarge = () => fail('表达式结果总量超限')
  if (value === null || typeof value === 'boolean' || numeric(value)) {
    return spend(space, String(value).length) ? { ok: true, value } : tooLarge()
  }
  if (typeof value === 'number') return finite(value)
  if (typeof value === 'string') {
    if (value.length > EXPR_LIMITS.stringLength) return fail('表达式结果字符串超限')
    return spend(space, JSON.stringify(value).length) ? { ok: true, value } : tooLarge()
  }
  if (Array.isArray(value)) {
    if (value.length > EXPR_LIMITS.items) return fail('表达式结果数组超限')
    if (!spend(space, 2 + Math.max(0, value.length - 1))) return tooLarge()
    const out = []
    for (const item of value) {
      const safe = inspectResult(item, work, depth + 1, space)
      if (safe.ok === false) return safe
      out.push(safe.value)
    }
    return { ok: true, value: out }
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length > EXPR_LIMITS.items) return fail('表达式结果对象超限')
    if (!spend(space, 2 + Math.max(0, keys.length - 1))) return tooLarge()
    const out = {}
    for (const key of keys) {
      if (key.length > 64 || RESERVED.has(key)) return fail(`表达式结果含不安全键：${key}`)
      if (!spend(space, JSON.stringify(key).length + 1)) return tooLarge()
      const safe = inspectResult(value[key], work, depth + 1, space)
      if (safe.ok === false) return safe
      out[key] = safe.value
    }
    return { ok: true, value: out }
  }
  return fail('表达式结果类型不合法')
}

function boundedArray(value) {
  return Array.isArray(value) && value.length <= EXPR_LIMITS.items
}

function numericVector(array) {
  if (!boundedArray(array)) return false
  for (let index = 0; index < array.length; index += 1) {
    if (!Object.hasOwn(array, index) || !numeric(array[index])) return false
  }
  return true
}

function arrayIndex(array, index) {
  return Number.isSafeInteger(index) && index >= 0 && index < array.length && Object.hasOwn(array, index)
}

function dotProduct(left, right) {
  let result = 0
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index]
  return result
}

/** Interpolate an ordered numeric series. Equal x values use the last value at that x. */
function sampleLine(points, x, work) {
  if (points.length === 0 || !numeric(x)) return fail('sample 需要非空数值点列和有限横坐标')
  if (!spend(work, points.length)) return fail('表达式求值预算超限')
  let previousX = -Infinity
  let next = points.length
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!Array.isArray(point) || !numeric(point[0]) || !numeric(point[1]) || point[0] < previousX) {
      return fail('sample 需要按横坐标排序的 [x,y] 数值点')
    }
    if (point[0] > x && next === points.length) next = index
    previousX = point[0]
  }
  if (next === 0) return finite(points[0][1])
  const [leftX, leftY] = points[next - 1]
  if (next === points.length || x === leftX) return finite(leftY)
  const [rightX, rightY] = points[next]
  const distance = rightX - leftX
  const magnitude = Math.max(Math.abs(leftX), Math.abs(rightX)) || 1
  const left = leftX / magnitude
  const fraction = Number.isFinite(distance) ? (x - leftX) / distance
    : (x / magnitude - left) / (rightX / magnitude - left)
  return finite(leftY * (1 - fraction) + rightY * fraction)
}

function sequenceCall(name, args, work) {
  const [array, argument] = args
  if (!boundedArray(array)) return fail(`${name} 需要有界数组（最多 ${EXPR_LIMITS.items} 项）`)
  if (name === 'sample') return sampleLine(array, argument, work)
  if (name === 'len') return { ok: true, value: array.length }
  if (name === 'at') {
    return arrayIndex(array, argument)
      ? inspectResult(array[argument], work)
      : fail('at 需要未越界的整数索引')
  }
  if (name === 'gather') {
    if (!boundedArray(argument)) return fail('gather 需要有界整数索引数组')
    const values = []
    for (const index of argument) {
      if (!arrayIndex(array, index)) return fail('gather 需要未越界的整数索引')
      values.push(array[index])
    }
    return inspectResult(values, work)
  }
  if (name === 'zip') {
    if (!args.every((list) => boundedArray(list) && list.length === array.length)) return fail('zip 需要等长数组')
    const rows = Array.from({ length: array.length }, (_, index) => args.map((list) => list[index]))
    return inspectResult(rows, work)
  }
  if (name === 'join') {
    if (typeof argument !== 'string' || argument.length > EXPR_LIMITS.stringLength) return fail('join 需要有界字符串分隔符')
    if (!spend(work, array.length)) return fail('表达式求值预算超限')
    let length = Math.max(0, array.length - 1) * argument.length
    const parts = []
    for (const item of array) {
      if (item !== null && typeof item !== 'string' && !numeric(item) && typeof item !== 'boolean') return fail('join 只接受标量数组')
      const text = String(item)
      length += text.length
      if (length > EXPR_LIMITS.stringLength) return fail('join 结果字符串超限')
      parts.push(text)
    }
    return { ok: true, value: parts.join(argument) }
  }
  if (name === 'matvec') {
    if (!numericVector(argument)) return fail('matvec 需要有限数字向量')
    const cells = array.length * argument.length
    if (cells > EXPR_LIMITS.matrixCells) return fail('matvec 矩阵单元数超限')
    if (!spend(work, cells + array.length + argument.length)) return fail('表达式求值预算超限')
    const values = []
    for (const row of array) {
      if (!numericVector(row) || row.length !== argument.length) return fail('matvec 需要与向量长度匹配的矩形数值矩阵')
      const result = finite(dotProduct(row, argument))
      if (!result.ok) return result
      values.push(result.value)
    }
    return { ok: true, value: values }
  }
  if (!numericVector(array)) return fail(`${name} 需要有限数字向量`)
  if (!spend(work, array.length)) return fail('表达式求值预算超限')
  if (name === 'dot') {
    if (!numericVector(argument) || argument.length !== array.length) return fail('dot 需要等长有限数字向量')
    return finite(dotProduct(array, argument))
  }
  if (name === 'scale') {
    if (!numeric(argument)) return fail('scale 需要有限数字系数')
    const values = array.map((item) => item * argument)
    return values.every(numeric) ? { ok: true, value: values } : fail('运算结果必须是有限数字')
  }
  if (name === 'roundEach') {
    if (!Number.isInteger(argument) || argument < 0 || argument > EXPR_LIMITS.decimalPlaces) {
      return fail(`roundEach 小数位需要 0–${EXPR_LIMITS.decimalPlaces} 之间的整数`)
    }
    return { ok: true, value: array.map((item) => Number(item.toFixed(argument))) }
  }
  if (name === 'softmax') {
    if (array.length === 0) return fail('softmax 至少需要一个数值')
    const max = Math.max(...array)
    const weights = array.map((item) => Math.exp(item - max))
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    return { ok: true, value: weights.map((weight) => weight / total) }
  }
  return fail('未知序列函数')
}

function equality(a, b, work) {
  if (a === b) return { ok: true, value: true }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return { ok: true, value: false }
  const left = inspectResult(a, work)
  if (!left.ok) return left
  const right = inspectResult(b, work)
  if (!right.ok) return right
  return { ok: true, value: JSON.stringify(left.value) === JSON.stringify(right.value) }
}

function evaluate(node, scope, work, depth = 0) {
  if (!spend(work, 1)) return fail('表达式求值预算超限')
  if (depth > EXPR_LIMITS.depth) return fail('表达式求值嵌套超限')
  if (node.t === 'num' || node.t === 'str' || node.t === 'lit') return { ok: true, value: node.v }
  if (node.t === 'ref') return readPath(scope, node.scope, node.key)
  if (node.t === 'unary') {
    const operand = evaluate(node.x, scope, work, depth + 1)
    if (operand.ok === false) return operand
    if (node.op === '!') {
      if (typeof operand.value !== 'boolean') return fail('! 只接受布尔值')
      return { ok: true, value: !operand.value }
    }
    if (!numeric(operand.value)) return fail('一元运算符只接受有限数字')
    return { ok: true, value: node.op === '-' ? -operand.value : operand.value }
  }
  if (node.t === 'cond') {
    const condition = evaluate(node.c, scope, work, depth + 1)
    if (condition.ok === false) return condition
    return evaluate(condition.value ? node.a : node.b, scope, work, depth + 1)
  }
  if (node.t === 'bin') {
    const left = evaluate(node.l, scope, work, depth + 1)
    if (left.ok === false) return left
    if (node.op === '&&' || node.op === '||') {
      if (typeof left.value !== 'boolean') return fail(`${node.op} 只接受布尔值`)
      if (node.op === '&&' && left.value === false) return { ok: true, value: false }
      if (node.op === '||' && left.value === true) return { ok: true, value: true }
      const right = evaluate(node.r, scope, work, depth + 1)
      if (right.ok === false) return right
      if (typeof right.value !== 'boolean') return fail(`${node.op} 只接受布尔值`)
      return { ok: true, value: right.value }
    }
    const right = evaluate(node.r, scope, work, depth + 1)
    if (right.ok === false) return right
    const a = left.value
    const b = right.value
    if (node.op === '+' && (typeof a === 'string' || typeof b === 'string')) {
      const okType = (v) => typeof v === 'string' || numeric(v) || typeof v === 'boolean'
      if (!okType(a) || !okType(b)) return fail('字符串拼接只接受 string/number/boolean')
      return { ok: true, value: String(a) + String(b) }
    }
    if (node.op === '==' || node.op === '!=') {
      const equal = equality(a, b, work)
      return equal.ok ? { ok: true, value: equal.value === (node.op === '==') } : equal
    }
    const comparable = (numeric(a) && numeric(b)) || (typeof a === 'string' && typeof b === 'string')
    if (node.op === '<' || node.op === '<=' || node.op === '>' || node.op === '>=') {
      if (!comparable) return fail(`${node.op} 需要两个数字或两个字符串`)
      if (node.op === '<') return { ok: true, value: a < b }
      if (node.op === '<=') return { ok: true, value: a <= b }
      if (node.op === '>') return { ok: true, value: a > b }
      return { ok: true, value: a >= b }
    }
    if (!numeric(a) || !numeric(b)) return fail(`${node.op} 需要两个有限数字`)
    if (node.op === '+') return finite(a + b)
    if (node.op === '-') return finite(a - b)
    if (node.op === '*') return finite(a * b)
    if (node.op === '/') return b === 0 ? fail('除数不能为 0') : finite(a / b)
    return b === 0 ? fail('取模的除数不能为 0') : finite(a % b)
  }
  if (node.t === 'arr') {
    const out = []
    for (const item of node.items) {
      const value = evaluate(item, scope, work, depth + 1)
      if (value.ok === false) return value
      out.push(value.value)
    }
    return { ok: true, value: out }
  }
  if (node.t === 'obj') {
    const out = {}
    for (const [key, valueNode] of node.entries) {
      const value = evaluate(valueNode, scope, work, depth + 1)
      if (value.ok === false) return value
      out[key] = value.value
    }
    return { ok: true, value: out }
  }
  if (node.t === 'call') {
    const args = []
    for (const argNode of node.args) {
      const value = evaluate(argNode, scope, work, depth + 1)
      if (value.ok === false) return value
      args.push(value.value)
    }
    if (Object.hasOwn(SEQUENCE_ARITY, node.name)) return sequenceCall(node.name, args, work)
    if (!args.every(numeric)) return fail(`${node.name} 只接受有限数字`)
    if (node.name === 'round') {
      const [value, places = 0] = args
      if (!Number.isInteger(places) || places < 0 || places > EXPR_LIMITS.decimalPlaces) {
        return fail(`round 小数位需要 0–${EXPR_LIMITS.decimalPlaces} 之间的整数`)
      }
      return finite(places === 0 ? Math.round(value) : Number(value.toFixed(places)))
    }
    if (node.name === 'floor') return finite(Math.floor(args[0]))
    if (node.name === 'ceil') return finite(Math.ceil(args[0]))
    if (node.name === 'abs') return finite(Math.abs(args[0]))
    if (node.name === 'sin') return finite(Math.sin(args[0]))
    if (node.name === 'cos') return finite(Math.cos(args[0]))
    if (node.name === 'exp') return finite(Math.exp(args[0]))
    if (node.name === 'min') return finite(Math.min(...args))
    if (node.name === 'max') return finite(Math.max(...args))
    if (args[1] > args[2]) return fail('clamp 需要 lo <= hi')
    return finite(Math.min(args[2], Math.max(args[1], args[0])))
  }
  return fail('未知表达式节点')
}

/**
 * 提取编译结果中的引用（供 derive 依赖图使用）。
 * @param {unknown} compiled
 * @returns {{ok:true, refs:Array<{scope:'state'|'data', key:string}>} | {ok:false, error:string}}
 */
export function exprRefs(compiled) {
  if (compiled === null || typeof compiled !== 'object' || compiled.ok !== true || typeof compiled.source !== 'string') {
    return fail('expr 未编译')
  }
  const fresh = compileExpr(compiled.source)
  if (fresh.ok === false) return fail(fresh.error)
  return { ok: true, refs: fresh.refs.map((ref) => ({ scope: ref.scope, key: ref.key })) }
}

/**
 * 在给定作用域内求值编译后的表达式。失败返回结构化错误，绝不抛异常。
 * @param {unknown} compiled
 * @param {{state?:object, data?:object}} scope
 * @returns {{ok:true, value:unknown} | {ok:false, error:string}}
 */
export function evaluateExpr(compiled, scope) {
  if (compiled === null || typeof compiled !== 'object' || compiled.ok !== true) {
    return fail(compiled !== null && typeof compiled === 'object' && typeof compiled.error === 'string' ? compiled.error : 'expr 未编译')
  }
  const fresh = compileExpr(compiled.source)
  if (fresh.ok === false) return fail(fresh.error)
  const program = fresh.program
  try {
    const work = { remaining: EXPR_LIMITS.work }
    const value = evaluate(program, scope ?? {}, work)
    if (value.ok === false) return value
    return inspectResult(value.value, work)
  } catch {
    return fail('expr 求值失败')
  }
}
