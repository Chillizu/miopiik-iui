/**
 * IUI 安全表达式 v1（实验层）：自有 tokenizer + 递归下降解析器 + 纯函数求值。
 *
 * 设计边界：
 *  - 模型/示例只产出**表达式源码字符串**；本模块绝不使用 eval / new Function，
 *    不产生可执行代码，解析结果只是一棵受限 JSON AST；
 *  - 表达式只能读 `$state.*` / `$data.*` 的只读点号路径，不能调用对象方法、不能赋值、
 *    不能访问任意成员（`.constructor` 等一律拒绝）；
 *  - 函数只允许白名单内的纯函数（round/floor/ceil/abs/min/max/clamp）；
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
  cache: 256,
})

const RESERVED = new Set(['__proto__', 'prototype', 'constructor'])
const FUNCTIONS = Object.freeze({ round: 1, floor: 1, ceil: 1, abs: 1, min: -1, max: -1, clamp: 3 })
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
    if (arity === -1 ? args.length < 1 : args.length !== arity) return fail(`${name} 参数个数不合法`)
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
    result = parsed.ok === false ? fail(parsed.error) : { ok: true, source: text, program: parsed.program }
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

function inspectResult(value, depth = 0) {
  if (depth > EXPR_LIMITS.resultDepth) return fail('表达式结果嵌套超限')
  if (value === null || typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'number') return finite(value)
  if (typeof value === 'string') {
    return value.length <= EXPR_LIMITS.stringLength ? { ok: true, value } : fail('表达式结果字符串超限')
  }
  if (Array.isArray(value)) {
    if (value.length > EXPR_LIMITS.items) return fail('表达式结果数组超限')
    const out = []
    for (const item of value) {
      const safe = inspectResult(item, depth + 1)
      if (safe.ok === false) return safe
      out.push(safe.value)
    }
    return { ok: true, value: out }
  }
  if (isRecord(value)) {
    const keys = Object.keys(value)
    if (keys.length > EXPR_LIMITS.items) return fail('表达式结果对象超限')
    const out = {}
    for (const key of keys) {
      if (key.length > 64 || RESERVED.has(key)) return fail(`表达式结果含不安全键：${key}`)
      const safe = inspectResult(value[key], depth + 1)
      if (safe.ok === false) return safe
      out[key] = safe.value
    }
    return { ok: true, value: out }
  }
  return fail('表达式结果类型不合法')
}

function equality(a, b) {
  if (a === b) return true
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

function evaluate(node, scope, depth = 0) {
  if (depth > EXPR_LIMITS.depth) return fail('表达式求值嵌套超限')
  if (node.t === 'num' || node.t === 'str' || node.t === 'lit') return { ok: true, value: node.v }
  if (node.t === 'ref') return readPath(scope, node.scope, node.key)
  if (node.t === 'unary') {
    const operand = evaluate(node.x, scope, depth + 1)
    if (operand.ok === false) return operand
    if (node.op === '!') {
      if (typeof operand.value !== 'boolean') return fail('! 只接受布尔值')
      return { ok: true, value: !operand.value }
    }
    if (!numeric(operand.value)) return fail('一元运算符只接受有限数字')
    return { ok: true, value: node.op === '-' ? -operand.value : operand.value }
  }
  if (node.t === 'cond') {
    const condition = evaluate(node.c, scope, depth + 1)
    if (condition.ok === false) return condition
    return evaluate(condition.value ? node.a : node.b, scope, depth + 1)
  }
  if (node.t === 'bin') {
    const left = evaluate(node.l, scope, depth + 1)
    if (left.ok === false) return left
    if (node.op === '&&' || node.op === '||') {
      if (typeof left.value !== 'boolean') return fail(`${node.op} 只接受布尔值`)
      if (node.op === '&&' && left.value === false) return { ok: true, value: false }
      if (node.op === '||' && left.value === true) return { ok: true, value: true }
      const right = evaluate(node.r, scope, depth + 1)
      if (right.ok === false) return right
      if (typeof right.value !== 'boolean') return fail(`${node.op} 只接受布尔值`)
      return { ok: true, value: right.value }
    }
    const right = evaluate(node.r, scope, depth + 1)
    if (right.ok === false) return right
    const a = left.value
    const b = right.value
    if (node.op === '+' && (typeof a === 'string' || typeof b === 'string')) {
      const okType = (v) => typeof v === 'string' || numeric(v) || typeof v === 'boolean'
      if (!okType(a) || !okType(b)) return fail('字符串拼接只接受 string/number/boolean')
      return { ok: true, value: String(a) + String(b) }
    }
    if (node.op === '==' || node.op === '!=') return { ok: true, value: equality(a, b) === (node.op === '==') }
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
      const value = evaluate(item, scope, depth + 1)
      if (value.ok === false) return value
      out.push(value.value)
    }
    return { ok: true, value: out }
  }
  if (node.t === 'obj') {
    const out = {}
    for (const [key, valueNode] of node.entries) {
      const value = evaluate(valueNode, scope, depth + 1)
      if (value.ok === false) return value
      out[key] = value.value
    }
    return { ok: true, value: out }
  }
  if (node.t === 'call') {
    const args = []
    for (const argNode of node.args) {
      const value = evaluate(argNode, scope, depth + 1)
      if (value.ok === false) return value
      args.push(value.value)
    }
    if (!args.every(numeric)) return fail(`${node.name} 只接受有限数字`)
    if (node.name === 'round') return finite(Math.round(args[0]))
    if (node.name === 'floor') return finite(Math.floor(args[0]))
    if (node.name === 'ceil') return finite(Math.ceil(args[0]))
    if (node.name === 'abs') return finite(Math.abs(args[0]))
    if (node.name === 'min') return finite(Math.min(...args))
    if (node.name === 'max') return finite(Math.max(...args))
    if (args[1] > args[2]) return fail('clamp 需要 lo <= hi')
    return finite(Math.min(args[2], Math.max(args[1], args[0])))
  }
  return fail('未知表达式节点')
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
    const value = evaluate(program, scope ?? {}, 0)
    if (value.ok === false) return value
    return inspectResult(value.value)
  } catch {
    return fail('expr 求值失败')
  }
}
