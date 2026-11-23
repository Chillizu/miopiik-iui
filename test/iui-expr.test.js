import test from 'node:test'
import assert from 'node:assert/strict'

import { EXPR_LIMITS, compileExpr, evaluateExpr } from '../shared/iui-expr.js'

const run = (source, scope = {}) => {
  const compiled = compileExpr(source)
  assert.equal(compiled.ok, true, `compile failed: ${source} :: ${compiled.error}`)
  return evaluateExpr(compiled, scope)
}

const value = (source, scope = {}) => {
  const result = run(source, scope)
  assert.equal(result.ok, true, `eval failed: ${source} :: ${result.error}`)
  return result.value
}

const rejected = (source, scope = {}) => {
  const compiled = compileExpr(source)
  if (compiled.ok === false) return compiled.error
  const result = evaluateExpr(compiled, scope)
  assert.equal(result.ok, false, `expected rejection: ${source}`)
  return result.error
}

test('expr: 算术、优先级、括号与一元运算', () => {
  assert.equal(value('1 + 2 * 3'), 7)
  assert.equal(value('(1 + 2) * 3'), 9)
  assert.equal(value('10 - 4 / 2'), 8)
  assert.equal(value('-5 + 2'), -3)
  assert.equal(value('7 % 4'), 3)
  assert.equal(value('+5'), 5)
})

test('expr: 比较、逻辑与三元', () => {
  assert.equal(value('2 > 1'), true)
  assert.equal(value('2 <= 1'), false)
  assert.equal(value('1 == 1'), true)
  assert.equal(value('1 != 2'), true)
  assert.equal(value("'a' == 'a'"), true)
  assert.equal(value('true && false'), false)
  assert.equal(value('true || false'), true)
  assert.equal(value('!false'), true)
  assert.equal(value('2 > 1 ? 10 : 20'), 10)
  assert.equal(value("'steady' == 'steady' ? 120 : 300"), 120)
  // 逻辑短路：左侧已决定时不求值右侧（右侧是未定义引用）
  assert.equal(value('false && $state.missing'), false)
  assert.equal(value('true || $state.missing'), true)
})

test('expr: 字符串拼接与数组/对象字面量', () => {
  assert.equal(value('"当前容量不足，" + 200 + " 项进入队列"'), '当前容量不足，200 项进入队列')
  assert.deepEqual(value('[["缓存直达", 72], ["后台完成", 48]]'), [['缓存直达', 72], ['后台完成', 48]])
  assert.deepEqual(value('{scenario: "steady", requests: 120, completionPct: 100}'), { scenario: 'steady', requests: 120, completionPct: 100 })
  assert.deepEqual(value('[]'), [])
  assert.deepEqual(value('{}'), {})
})

test('expr: 函数白名单与错误参数', () => {
  assert.equal(value('round(33.5)'), 34)
  assert.equal(value('round(32.4)'), 32)
  assert.equal(value('floor(2.9)'), 2)
  assert.equal(value('ceil(2.1)'), 3)
  assert.equal(value('abs(-7)'), 7)
  assert.equal(value('min(3, 1, 2)'), 1)
  assert.equal(value('max(3, 1, 2)'), 3)
  assert.equal(value('clamp(15, 0, 10)'), 10)
  assert.match(rejected('clamp(5, 10, 0)'), /lo <= hi/u)
  assert.match(rejected('round(1, 2)'), /参数个数/u)
  assert.match(rejected('min("a")'), /有限数字/u)
  // 非白名单函数/成员访问一律拒绝
  assert.match(rejected('eval(1)'), /未知标识符/u)
  assert.match(rejected('Math.round(1)'), /未知标识符|不支持的字符/u)
  assert.match(rejected('$state.a.toString()'), /不支持|多余内容/u)
})

test('expr: 只读 $state/$data 点号路径', () => {
  const scope = { state: { r: { workers: 6, hitRate: 60 }, d: { n: 300 } }, data: {} }
  assert.equal(value('$state.r.workers * 20', scope), 120)
  assert.equal(value('round($state.d.n * $state.r.hitRate / 100)', scope), 180)
  assert.match(rejected('$state.r.workers = 2'), /不支持|多余/u)
  assert.match(rejected('$state.a.__proto__'), /不安全/u)
  assert.match(rejected('$state.a.constructor'), /不安全/u)
  assert.match(rejected('$state'), /引用只允许/u)
  assert.match(rejected('$data'), /引用只允许/u)
})

test('expr: 运行时错误不抛异常（未定义引用、除零、非有限结果）', () => {
  assert.match(rejected('$state.missing + 1'), /未定义/u)
  assert.match(rejected('1 / 0'), /除数不能为 0/u)
  assert.match(rejected('0 % 0'), /取模/u)
  assert.match(rejected('$state.huge * $state.huge', { state: { huge: 1e200 } }), /有限数字/u)
  assert.equal(value('1 + "x"'), '1x')
  assert.match(rejected('[1] + "x"'), /字符串拼接/u)
  assert.match(rejected('1 < "x"'), /两个数字或两个字符串/u)
})

test('expr: 语法/预算拒绝且从不使用 eval', () => {
  assert.match(rejected('1 +'), /意外|缺少/u)
  assert.match(rejected('"unterminated'), /没有闭合/u)
  assert.match(rejected('`template`'), /不支持的字符/u)
  assert.match(rejected('a = 1'), /不支持的字符|未知标识符/u)
  assert.match(rejected('1; 2'), /不支持|多余/u)
  assert.match(rejected(''), /不能为空/u)
  assert.match(rejected('x'.repeat(EXPR_LIMITS.chars + 1)), /超过/u)
  // 字面量数组先撞 token 预算；结果体量预算用作用域里的大数组验证
  const tooMany = '[' + Array.from({ length: EXPR_LIMITS.items + 1 }, () => '1').join(',') + ']'
  assert.match(rejected(tooMany), /token 数超限|数组项数超限/u)
  assert.match(rejected('$state.big', { state: { big: Array.from({ length: EXPR_LIMITS.items + 1 }, () => 1) } }), /超限/u)
  const tooDeep = '('.repeat(EXPR_LIMITS.depth + 2) + '1' + ')'.repeat(EXPR_LIMITS.depth + 2)
  assert.match(rejected(tooDeep), /嵌套超限/u)
  const tooDeepResult = '['.repeat(EXPR_LIMITS.resultDepth + 1) + '1' + ']'.repeat(EXPR_LIMITS.resultDepth + 1)
  assert.match(rejected(tooDeepResult), /嵌套超限/u)
  // 编译结果只是受限 AST，不含可执行函数
  const compiled = compileExpr('1 + 1')
  assert.equal(compiled.ok, true)
  assert.equal(typeof compiled, 'object')
  assert.equal(typeof compiled.source, 'string')
})

test('expr: 编译缓存返回等价结果且不改变语义', () => {
  const first = compileExpr('round(2.5)')
  const second = compileExpr('round(2.5)')
  assert.deepEqual(first, second)
  assert.equal(evaluateExpr(first, {}).value, 3)
})

test('expr: 契约四组样例公式逐项核对', () => {
  const compute = ({ n, workers, hitRate, fault }) => {
    const scope = { state: { r: { workers, hitRate, incident: fault } }, data: {} }
    const h = value('round($state.r.n * $state.r.hitRate / 100)', { state: { r: { n, hitRate } } })
    const m = n - h
    const cap = workers * (fault ? 12 : 20)
    const e = Math.min(m, cap)
    const q = Math.max(0, m - cap)
    const c = h + e
    const p = value('round(100 * $state.c / $state.n)', { state: { c, n } })
    return { n, h, m, cap, e, q, c, p }
  }
  assert.deepEqual(compute({ n: 120, workers: 6, hitRate: 60, fault: false }), { n: 120, h: 72, m: 48, cap: 120, e: 48, q: 0, c: 120, p: 100 })
  assert.deepEqual(compute({ n: 300, workers: 6, hitRate: 60, fault: false }), { n: 300, h: 180, m: 120, cap: 120, e: 120, q: 0, c: 300, p: 100 })
  assert.deepEqual(compute({ n: 300, workers: 2, hitRate: 20, fault: false }), { n: 300, h: 60, m: 240, cap: 40, e: 40, q: 200, c: 100, p: 33 })
  assert.deepEqual(compute({ n: 180, workers: 6, hitRate: 60, fault: true }), { n: 180, h: 108, m: 72, cap: 72, e: 72, q: 0, c: 180, p: 100 })
  // 场景因子：故障场景 CAP 系数 12，其余 20
  assert.equal(value("$state.r.workers * ($state.r.scenario == 'fault' ? 12 : 20)", { state: { r: { workers: 6, scenario: 'fault' } } }), 72)
  assert.equal(value("$state.r.workers * ($state.r.scenario == 'fault' ? 12 : 20)", { state: { r: { workers: 6, scenario: 'burst' } } }), 120)
})
