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

test('expr: 乘方保留数学优先级并拒绝非有限结果', () => {
  assert.equal(value('1 + 2 * 3 ^ 2'), 19)
  assert.equal(value('2 ^ 3 ^ 2'), 512)
  assert.equal(value('-2 ^ 2'), -4)
  assert.equal(value('(-2) ^ 2'), 4)
  assert.equal(value('2 ^ -3'), 0.125)
  assert.match(rejected('(-2) ^ 0.5'), /有限数字/u)
  assert.match(rejected('0 ^ -1'), /有限数字/u)
  assert.match(rejected('10 ^ 1000'), /有限数字/u)
  assert.match(rejected('"2" ^ 3'), /有限数字/u)
  assert.match(rejected(Array(30).fill('1').join(' ^ ')), /嵌套超限/u)
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
  assert.equal(value('round(32.456, 2)'), 32.46)
  assert.equal(value('round(-2.5, 0)'), -2)
  assert.equal(value('floor(2.9)'), 2)
  assert.equal(value('ceil(2.1)'), 3)
  assert.equal(value('abs(-7)'), 7)
  assert.ok(Math.abs(value('sin(1.5707963267948966)') - 1) < 1e-12)
  assert.ok(Math.abs(value('cos(3.141592653589793)') + 1) < 1e-12)
  assert.match(rejected('cos("0")'), /有限数字/u)
  assert.equal(value('exp(0)'), 1)
  assert.match(rejected('exp(1000)'), /有限数字/u)
  assert.equal(value('sqrt(9)'), 3)
  assert.equal(value('hypot(3, 4)'), 5)
  assert.equal(value('tan(0)'), 0)
  assert.ok(Math.abs(value('asin(1)') - Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(value('acos(0)') - Math.PI / 2) < 1e-12)
  assert.ok(Math.abs(value('atan(1)') - Math.PI / 4) < 1e-12)
  assert.ok(Math.abs(value('atan2(1, 1)') - Math.PI / 4) < 1e-12)
  assert.equal(value('pi'), Math.PI)
  assert.equal(value('round(sqrt($state.x * $state.x + $state.y * $state.y), 2)', { state: { x: 3, y: 4 } }), 5)
  assert.match(rejected('sqrt(-1)'), /有限数字/u)
  assert.match(rejected('asin(1.01)'), /有限数字/u)
  assert.match(rejected('acos(-1.01)'), /有限数字/u)
  assert.match(rejected('sqrt("4")'), /有限数字/u)
  assert.match(rejected('hypot(1)'), /参数个数/u)
  assert.match(rejected('atan2(1)'), /参数个数/u)
  assert.match(rejected('tan(1, 2)'), /参数个数/u)
  assert.match(rejected('pi()'), /多余|括号/u)
  assert.equal(value('when(false, 1 / 0, 42)'), 42)
  assert.equal(value('min(3, 1, 2)'), 1)
  assert.equal(value('max(3, 1, 2)'), 3)
  assert.equal(value('clamp(15, 0, 10)'), 10)
  assert.match(rejected('clamp(5, 10, 0)'), /lo <= hi/u)
  assert.match(rejected('round(1, 2, 3)'), /参数个数/u)
  assert.match(rejected('round(1, 13)'), /小数位/u)
  assert.match(rejected('min("a")'), /有限数字/u)
  // 非白名单函数/成员访问一律拒绝
  assert.match(rejected('eval(1)'), /未知标识符/u)
  assert.match(rejected('Math.round(1)'), /未知标识符|不支持的字符/u)
  assert.match(rejected('$state.a.toString()'), /不支持|多余内容/u)
})

test('expr: 极坐标偏移和绕点旋转使用弧度，并返回数值点', () => {
  assert.deepEqual(value('polar([4, 7], 0, pi / 2)'), [4, 7])
  assert.deepEqual(value('polar([4, 7], 3, 0)'), [7, 7])
  assert.deepEqual(value('polar([4, 7], -3, 0)'), [1, 7])
  assert.deepEqual(value('roundEach(polar([4, 7], 3, -pi / 2), 12)'), [4, 4])
  assert.deepEqual(value('rotate([4, 7], $state.origin, 0)', { state: { origin: [1e308, -1e308] } }), [4, 7])
  assert.deepEqual(value('rotate([4, 7], [4, 7], pi / 2)'), [4, 7])
  assert.deepEqual(value('roundEach(rotate([7, 7], [4, 7], pi / 2), 12)'), [4, 10])
  assert.deepEqual(value('roundEach(rotate(polar([4, 7], 3, 0), [4, 7], -pi / 2), 12)'), [4, 4])
})

test('expr: 点运算拒绝非有限数、错误形状及坐标溢出', () => {
  const scope = { state: { large: Number.MAX_VALUE, infinity: Infinity, sparse: Array(2) } }
  for (const [source, reason] of [
    ['polar([0, 0], 1)', /参数个数/u],
    ['rotate([0, 0], [0, 0], 1, 2)', /参数个数/u],
    ['polar([0], 1, 0)', /有限数字点/u],
    ['polar([0, 0, 0], 1, 0)', /有限数字点/u],
    ['polar([0, "0"], 1, 0)', /有限数字点/u],
    ['polar({x: 0, y: 0}, 1, 0)', /有限数字点/u],
    ['polar([0, 0], "1", 0)', /有限数字半径/u],
    ['polar([0, 0], 0, $state.infinity)', /有限数字弧度/u],
    ['polar([0, 0], $state.infinity, 0)', /有限数字半径/u],
    ['rotate($state.sparse, [0, 0], 0)', /有限数字点/u],
    ['rotate([0, 0], [0, $state.infinity], 0)', /有限数字原点/u],
    ['rotate([0, 0], [0, 0], true)', /有限数字弧度/u],
    ['len(polar([$state.large, 0], $state.large, 0))', /运算结果必须是有限数字/u],
    ['rotate([$state.large, 0], [-$state.large, 0], pi / 2)', /运算结果必须是有限数字/u],
  ]) assert.match(rejected(source, scope), reason, source)
})

test('expr: 序列索引、收集、并列与拼接保留数组顺序和类型', () => {
  assert.equal(value('len([])'), 0)
  assert.equal(value('len([1, [2, 3], null])'), 3)
  assert.deepEqual(value('at([1, [2, 3], null], 1)'), [2, 3])
  assert.deepEqual(value('gather(["A", "B", "C"], [2, 0, 2])'), ['C', 'A', 'C'])
  assert.deepEqual(value('gather([], [])'), [])
  assert.deepEqual(value('zip(["A", "B"], [1, 2], [true, false])'), [['A', 1, true], ['B', 2, false]])
  assert.deepEqual(value('zip([1], [2], [3], [4], [5], [6])'), [[1, 2, 3, 4, 5, 6]])
  assert.deepEqual(value('zip([], [])'), [])
  assert.equal(value('sample([[0,0],[4,12],[10,0]], 5)'), 10)
  assert.equal(value('sample([[0,0],[4,12],[4,20],[10,0]], 4)'), 20)
  assert.equal(value('sample([[0,0],[4,12],[10,0]], 100)'), 0)
  assert.match(rejected('sample([[4,0],[0,12]], 2)'), /排序/u)
  assert.equal(value('join(gather(["一", "二", "三"], [2, 0]), " → ")'), '三 → 一')
  assert.equal(value('join([null, true, 2], " ")'), 'null true 2')
  assert.equal(value('join([], ",")'), '')

  const shared = [['A']]
  const gathered = value('gather($state.a, [0, 0])', { state: { a: shared } })
  gathered[0].push('B')
  assert.deepEqual(shared, [['A']])
  assert.deepEqual(gathered[1], ['A'])
})

test('expr: 累积曲线在速率恢复后保留存量，并在真实归零时刻转平', () => {
  assert.deepEqual(value('accumulate([[0,300],[6,-50],[60,0]], 0)'), [[0, 0], [6, 1800], [42, 0], [60, 0]])
  assert.equal(value('sample(accumulate([[0,300],[6,-50],[60,0]], 0), 7)'), 1750)
  assert.deepEqual(value('accumulate([[1,-3],[3,2],[5,0]], 0)'), [[1, 0], [3, 0], [5, 4]])
  assert.match(rejected('accumulate([[0,2],[0,3]], 0)'), /严格按时间递增/u)
  assert.match(rejected('accumulate([[0,2],[3,0]], -1)'), /非负初值/u)
  assert.match(rejected('accumulate([[0,$state.rate],[10,0]], 0)', { state: { rate: 1e308 } }), /有限数字/u)
})

test('expr: 线性运算按矩形行向量求值并正确处理大数与小数', () => {
  assert.equal(value('dot([1, -3, 2], [4, 2, 5])'), 8)
  assert.equal(value('dot([], [])'), 0)
  assert.deepEqual(value('matvec([[1, 2, 3], [4, 5, 6]], [2, -1, 3])'), [9, 21])
  assert.deepEqual(value('matvec([], [1, 2])'), [])
  assert.deepEqual(value('scale([1, -2, 3], 0.5)'), [0.5, -1, 1.5])
  assert.deepEqual(value('roundEach([1.23456, -3.45678, 2], 2)'), [1.23, -3.46, 2])
  assert.deepEqual(value('roundEach($state.big, 12)', { state: { big: [1e300] } }), [1e300])
})

test('expr: softmax 先减最大值，大 logits 下保持归一', () => {
  const probabilities = value('softmax([10000, 10001, 10002])')
  const shifted = value('softmax([0, 1, 2])')
  assert.deepEqual(probabilities, shifted)
  assert.ok(Math.abs(probabilities.reduce((sum, item) => sum + item, 0) - 1) < 1e-14)
  assert.ok(probabilities[0] < probabilities[1] && probabilities[1] < probabilities[2])
  assert.deepEqual(value('softmax($state.extreme)', { state: { extreme: [-Number.MAX_VALUE, Number.MAX_VALUE] } }), [0, 1])
  assert.deepEqual(value('softmax([8000])'), [1])
})

test('expr: 序列与矩阵拒绝错误形状、类型、索引和非有限结果', () => {
  for (const [source, reason] of [
    ['len("ab")', /有界数组/u], ['at([1], -1)', /整数索引/u], ['at([1], 1)', /整数索引/u],
    ['at([1], "0")', /整数索引/u], ['gather([1, 2], [0.5])', /整数索引/u], ['gather([1], 0)', /索引数组/u],
    ['dot([1], [1, 2])', /等长/u], ['dot([1], ["2"])', /有限数字/u],
    ['matvec([[1, 2], [3]], [4, 5])', /矩形/u], ['matvec([[1, 2]], [3])', /矩形/u],
    ['scale([1], "2")', /有限数字系数/u], ['softmax([])', /至少/u], ['softmax([true])', /有限数字/u],
    ['roundEach([1], -1)', /小数位/u], ['roundEach([1], 13)', /小数位/u], ['roundEach([1], 1.5)', /小数位/u],
    ['zip([1], [])', /等长/u], ['zip([1])', /参数个数/u], ['zip([], [], [], [], [], [], [])', /参数个数/u],
    ['join([1], 0)', /字符串分隔符/u], ['join([[1]], ",")', /标量数组/u],
  ]) assert.match(rejected(source), reason, source)
  const scope = { state: { large: [1e300], infinity: [Infinity] } }
  assert.match(rejected('dot($state.large, $state.large)', scope), /有限数字/u)
  assert.match(rejected('len(scale($state.large, 10000000000))', scope), /有限数字/u)
  assert.match(rejected('softmax($state.infinity)', scope), /有限数字/u)
  assert.match(rejected('at($state.sparse, 0)', { state: { sparse: Array(1) } }), /整数索引/u)
})

test('expr: 序列操作、比较与输出遵守累计预算', () => {
  const text = '界'.repeat(1500)
  const data = { state: { text, list: Array.from({ length: 6 }, () => text) } }
  assert.equal(value('len($state.list)', data), 6)
  assert.match(rejected('join([$state.text, $state.text], ",")', data), /字符串超限/u)
  assert.match(rejected('len(zip($state.list, $state.list))', data), /结果总量/u)
  assert.match(rejected('gather($state.list, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])', data), /结果总量/u)
  assert.match(rejected('[$state.list, $state.list]', data), /结果总量/u)
  assert.match(rejected('[$state.list, $state.list] == [0]', data), /结果总量/u)
  assert.match(rejected('len($state.big)', { state: { big: Array(EXPR_LIMITS.items + 1).fill(0) } }), /有界数组/u)

  const vector = Array(64).fill(1)
  const row = Array(64).fill(2)
  const rows = Array(64).fill(row)
  const matvec = 'matvec($state.rows, $state.vector)'
  assert.deepEqual(value(matvec, { state: { rows, vector } }), Array(64).fill(128))
  assert.match(rejected(matvec, { state: { rows: [...rows, row], vector } }), /矩阵单元数超限/u)
  const repeated = `len([${Array(8).fill(matvec).join(', ')}])`
  assert.match(rejected(repeated, { state: { rows, vector } }), /求值预算超限/u)
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
