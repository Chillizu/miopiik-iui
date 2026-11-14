import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chartMatrix, readBinding, validateAst } from '../shared/iui-ast.js'
import { parseMiopiikMl } from '../shared/miopiik-ml.js'

const compile = (source) => {
  const parsed = parseMiopiikMl(source)
  assert.equal(parsed.ok, true, parsed.errors?.join('；'))
  const result = validateAst(parsed.doc)
  return { parsed, result }
}

const walk = (node, type) => {
  if (node.type === type) return node
  for (const child of node.children ?? []) {
    const found = walk(child, type)
    if (found) return found
  }
  return null
}

test('真实自然生成语法：accent、Markdown 锚点、嵌套布局能正常渲染', () => {
  const source = `<ui title="自然 IUI" fallback="用纯文字展示">
    <grid columns="2">
      <card title="视觉语言">
        <paragraph>状态 <badge tone="accent">重点</badge>，参考 <link href="#iui-spec">规范入口</link>。</paragraph>
      </card>
      <card title="图表">
        <column><row><card><chart type="line" data='[32,38,35,44,49,53,58,61,57,66,72,78]'/></card></row></column>
      </card>
    </grid>
  </ui>`
  const { parsed, result } = compile(source)
  assert.deepEqual(parsed.degraded, [])
  assert.equal(result.ok, true, result.errors?.join(';'))
  assert.equal(result.degraded, 0)
  const badge = walk(result.ast.root, 'badge')
  assert.equal(badge.props.tone, 'accent')
  assert.equal(walk(result.ast.root, 'link').props.href, '#iui-spec')
  const chart = walk(result.ast.root, 'chart')
  assert.equal(chart.props.kind, 'line', 'type 必须被转换成 kind')
  assert.equal(chart.props.series.length, 12, 'data 必须归一为 series')
  assert.deepEqual(chartMatrix(chart.props.series).slice(0, 2), [['1', 32], ['2', 38]])
})

test('数字数组、数组对、对象点列，都按同一种受限图表语义归一', () => {
  assert.deepEqual(chartMatrix([2, 5]), [['1', 2], ['2', 5]])
  assert.deepEqual(chartMatrix([['一', 2], ['二', 5]]), [['一', 2], ['二', 5]])
  assert.deepEqual(chartMatrix([{ label: '一', value: 2 }, { label: '二', value: 5 }]), [['一', 2], ['二', 5]])
  assert.equal(chartMatrix([false, 1]), null)
  assert.equal(chartMatrix([1, Number.POSITIVE_INFINITY]), null)
  assert.equal(chartMatrix([]), null)
})

test('真实自然生成语法：state 嵌套绑定和图表 data 别名成功解析', () => {
  const source = `<ui title="本地交互" fallback="数量 10,486">
    <state name="range" value='{"current":{"total":"10,486","unit":"次","delta":"+18.2%"},"series":[980,1240,1105,1480,1720,2050,1911]}'/>
    <card title="当前周期">
      <segmented bind="$state.range" options='[{"label":"7天","value":{"current":{"total":"10,486","unit":"次","delta":"+18.2%"},"series":[980,1240,1105,1480,1720,2050,1911]}},{"label":"30天","value":{"current":{"total":"39,220","unit":"次","delta":"+9.6%"},"series":[760,820,790,860]}}]'/>
      <metric label="数量" value="$state.range.current.total" unit="$state.range.current.unit" delta="$state.range.current.delta"/>
      <chart type="line" data="$state.range.series"/>
    </card>
  </ui>`
  const { parsed, result } = compile(source)
  assert.deepEqual(parsed.degraded, [])
  assert.equal(result.ok, true)
  assert.equal(result.degraded, 0)
  const metric = walk(result.ast.root, 'metric')
  assert.equal(metric.props.unit, '$state.range.current.unit')
  assert.deepEqual(readBinding(metric.props.unit), { scope: 'state', key: 'range.current.unit' })
  const chart = walk(result.ast.root, 'chart')
  assert.equal(chart.props.kind, 'line')
  assert.equal(chart.props.series, '$state.range.series')
  assert.equal(result.ast.state.range.current.unit, '次')
})

test('安全边界：恶意 state key、协议外链接、错误图表输入安全降级/拒绝', () => {
  const prototype = compile(`<ui fallback="安全"><state name="__proto__" value='{"polluted":true}'/><text>正常</text></ui>`)
  assert.match(prototype.parsed.degraded.join(';'), /名称不安全/u)
  assert.equal({}.polluted, undefined)
  assert.deepEqual(Object.keys(prototype.result.ast.state), [])

  const poisoned = compile(`<ui fallback="安全"><state>{"range":{"__proto__":{"polluted":true}}}</state><text>正常</text></ui>`)
  assert.equal(poisoned.result.ok, false)
  const links = compile(`<ui fallback="安全"><row><paragraph><link href="//evil.example">坏链接</link></paragraph><chart kind="line" data='["x"]'/><metric label="正常" value="12"/></row></ui>`)
  assert.equal(links.result.ok, true)
  assert.ok(links.result.degraded >= 1, '协议外 link/chart 应被局部降级')
  assert.ok(walk(links.result.ast.root, 'metric'), '兄弟节点必须保留')
  assert.deepEqual(readBinding('$state.__proto__.polluted'), { literal: '$state.__proto__.polluted' })
})

test('模型常驻章程把用不用交给模型判断，并给出可解析的完整示例', () => {
  const prompt = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.match(prompt, /miopiik-ml/u)
  assert.match(prompt, /由你按内容判断/u)
  assert.match(prompt, /不要为了画界面去查源码/u)
  assert.doesNotMatch(prompt, /优先普通 Markdown/u)
  assert.doesNotMatch(prompt, /展示协议（Extra 层，删掉也不影响主干）/u)

  // 章程里的完整示例必须始终可解析、零降级：模型照抄的就是这些块。
  // 示例一律写成单行完整块，占位形式（<ui title="…">）不算示例。
  const blocks = prompt
    .split('\n')
    .filter((line) => line.includes('<ui') && line.includes('</ui>'))
    .map((line) => line.slice(line.indexOf('<ui'), line.lastIndexOf('</ui>') + '</ui>'.length))
  assert.ok(blocks.length >= 2, '章程至少应有两个完整示例')
  for (const block of blocks) {
    const parsed = parseMiopiikMl(block)
    assert.equal(parsed.ok, true, block)
    const result = validateAst(parsed.doc)
    assert.equal(result.ok, true, block)
    assert.equal(result.degraded + parsed.degraded.length, 0, block)
  }
})

// fork 是生成物（gitignore、不随仓库分发），干净 clone / CI 里不存在；
// 存在时才校验 fork 侧补丁，客户端自身的断言始终执行。
const forkClient = new URL('../upstream/dsh-client-ui-chat-embeds/lib/client.js', import.meta.url)

test('fork 的 inline/block 混排保留全宽布局，避免图表变窄', {
  skip: existsSync(forkClient) ? false : '未生成 upstream fork（gitignore 生成物），跳过 fork 侧检查',
}, () => {
  const fork = readFileSync(forkClient, 'utf8')
  assert.match(fork, /data-miopiik-block-wrap/u)
  assert.match(fork, /flexBasis: "100%"/u)
})

test('客户端块级渲染复用受控 AST 与状态绑定', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /IUI_AST.chartMatrix/u)
  assert.match(client, /resolve\(props.unit\)/u)
})
