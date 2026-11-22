import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { hasTrustedMarkup, splitStreamingFence, splitTrustedBlocks, splitTrustedMarkdown } from '../shared/markdown-segments.js'

const root = fileURLToPath(new URL('..', import.meta.url))
// fork 是生成物（.gitignore），干净 clone / CI 里不存在；存在时才校验补丁对齐。
const forkClient = new URL('../upstream/dsh-client-ui-chat-embeds/lib/client.js', import.meta.url)

test('纯 Markdown 不切分：没有受信标记时与原生完全一致', () => {
  const md = '**加粗** 与 [链接](https://example.com) 还有 `代码`。'
  assert.equal(hasTrustedMarkup(md), false)
  assert.deepEqual(splitTrustedMarkdown(md), [{ kind: 'text', text: md }])
})

test('行内 token：文字与 badge/icon 顺序保留（同一行混排）', () => {
  const parts = splitTrustedMarkdown('新版正文 {{badge:success:已实现}}，折叠 {{badge:warning:待修复}} 见 {{icon:check}}。')
  assert.deepEqual(parts.map((p) => p.kind), ['text', 'inline', 'text', 'inline', 'text', 'inline', 'text'])
  assert.equal(parts[0].text, '新版正文 ')
  assert.deepEqual(parts[1].node, { type: 'badge', props: { tone: 'success', text: '已实现' } })
  assert.equal(parts[3].node.props.tone, 'warning')
  assert.equal(parts[5].node.type, 'icon')
})

test('块级围栏：iui fence 单独成段，前后文字保持原样', () => {
  const md = '前文\n```iui\n<ui fallback="f"><text>hi</text></ui>\n```\n后文'
  const parts = splitTrustedMarkdown(md)
  assert.deepEqual(parts.map((p) => p.kind), ['text', 'block', 'text'])
  assert.match(parts[1].raw, /<ui fallback="f">/)
})

test('未闭合围栏/非法 token 原样保留，绝不吞内容', () => {
  const partial = '半截 ```iui\n<ui fallback="f">'
  assert.deepEqual(splitTrustedMarkdown(partial), [{ kind: 'text', text: partial }])
  const bad = '{{badge:}} 与 {{unknown:1}}'
  const parts = splitTrustedMarkdown(bad)
  assert.deepEqual(parts, [{ kind: 'text', text: bad }])
})

test('中文与嵌套链接文本不被破坏；HTML 不被解析', () => {
  const md = '见 [文档](https://example.com)，{{badge:neutral:新}} <script>alert(1)</script>'
  const parts = splitTrustedMarkdown(md)
  const text = parts.filter((p) => p.kind === 'text').map((p) => p.text).join('')
  assert.ok(text.includes('[文档](https://example.com)'))
  assert.ok(text.includes('<script>alert(1)</script>'), 'HTML 应原样交给 Markdown 渲染（不会被执行）')
  assert.equal(parts.filter((p) => p.kind === 'inline').length, 1)
})

test('fork 补丁与当前上游对齐，安装后默认开启，明确关闭时回原生', {
  skip: existsSync(forkClient) ? false : '未生成 upstream fork（gitignore 生成物），跳过补丁对齐检查',
}, (t) => {
  const out = execFileSync(process.execPath, ['tools/fork-chat-embeds.mjs', '--check'], { cwd: root, encoding: 'utf8' })
  if (!/一致/u.test(out)) {
    t.skip(`无法在当前环境校验 fork 对齐：${out.trim()}`)
    return
  }
  const forked = readFileSync(forkClient, 'utf8')
  // 挂钩必须存在，且显式关闭时恢复原生 Markdown；try/catch 确保局部降级。
  assert.match(forked, /__miopiikMarkdownEmbeds/u)
  assert.match(forked, /miopiik\.markdownEmbeds"\) === "0"\) return false/u)
  assert.match(forked, /data-miopiik-embed-fallback/u)
  // L-11：行内 token 改为原生先渲染后 DOM 嫁接；流式围栏有专门路由
  assert.match(forked, /MiopiikGraftText/u)
  assert.match(forked, /miopiikStreamSplit/u)
  // 原生 ReasoningRow 仍在（没有被我们替换）
  assert.match(forked, /function ReasoningRow/u)
  assert.match(forked, /case "reasoning":/u)
})

test('客户端只注册注册表，不在未打补丁的宿主里做任何替换', async () => {
  const { readFileSync } = await import('node:fs')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(client, /globalThis\.__miopiikMarkdownEmbeds/u)
  // 不再依赖 assistant-step 接管来渲染 iui：注册表与 IuiSheet 解耦
  assert.match(client, /renderBlock: \(raw\) =>/u)
})

test('容错：模型漏写围栏时，行首裸 <ui>…</ui> 仍按受控 ML 成为块级片段', () => {
  const parts = splitTrustedMarkdown('说明文字。\n\n<ui title="概览" fallback="f"><row><metric label="a" value="1"/></row></ui>\n\n后文。')
  assert.deepEqual(parts.map((part) => part.kind), ['text', 'block', 'text'])
  assert.equal(parts[1].lang, 'ml-bare')
  assert.match(parts[1].raw, /^<ui title="概览"/u)
})

test('容错不越界：代码围栏或行内代码里的 <ui> 不得被当成组件', () => {
  const fenced = splitTrustedMarkdown('示例：\n```js\nconst x = "<ui title=\\"a\\"></ui>"\n```\n结束')
  assert.equal(fenced.some((part) => part.kind === 'block'), false)
  const inline = splitTrustedMarkdown('提到行内代码 `<ui title="a"></ui>` 时不应渲染。')
  assert.equal(inline.some((part) => part.kind === 'block'), false)
})

test('容错仍受安全边界：裸 <ui> 解析失败时渲染层回退为文本（切分器不吞内容）', () => {
  const parts = splitTrustedMarkdown('<ui title="坏" fallback="f"><script>alert(1)</script></ui>')
  assert.equal(parts[0].kind, 'block')
  // 内容原样交给受信解析器；不会有任何 HTML/脚本执行路径
  assert.match(parts[0].raw, /script/u)
})

test('流式围栏切分：识别尾部未闭合的 iui 围栏，已闭合的不算', () => {
  // 没有围栏：整段是 pre
  assert.deepEqual(splitStreamingFence('普通回复文字'), { pre: '普通回复文字', live: '', hasOpen: false })
  // 已闭合：不流式
  const closed = '前言\n```iui\n<ui fallback="f"><metric label="A" value="1"/></ui>\n```\n'
  assert.equal(splitStreamingFence(closed).hasOpen, false)
  // 流式中：pre 是围栏之前的文本，live 是围栏内已到达的部分
  const open = '前言\n```iui\n<ui title="流式" fallback="f"><metric label="A" value'
  const split = splitStreamingFence(open)
  assert.equal(split.hasOpen, true)
  assert.equal(split.pre, '前言\n')
  assert.match(split.live, /^<ui title="流式"/u)
  // 多个围栏时只认最后一个
  const two = '```iui\n<ui>1</ui>\n```\n中段\n```iui\n<ui>2</u'
  const split2 = splitStreamingFence(two)
  assert.equal(split2.hasOpen, true)
  assert.match(split2.pre, /中段\n$/u)
  assert.match(split2.live, /^<ui>2<\/u$/u)
})

test('流式围栏切分：闭栏 ``` 之后视为已完成（即使后面还有文字）', () => {
  const done = '```iui\n<ui>ok</ui>\n```\n收尾文字'
  assert.equal(splitStreamingFence(done).hasOpen, false)
})

test('块级专用切分：行内 token 保持字面量留在文本段（交给 DOM 嫁接），围栏照常成块', () => {
  const md = '状态 {{badge:success:完成}}。\n```iui\n<ui fallback="f"><metric label="A" value="1"/></ui>\n```\n收尾'
  const parts = splitTrustedBlocks(md)
  assert.deepEqual(parts.map((part) => part.kind), ['text', 'block', 'text'])
  assert.match(parts[0].text, /\{\{badge:success:完成\}\}/u, '行内 token 不再被预切分')
  assert.equal(parts[1].kind, 'block')
  assert.match(parts[2].text.trim(), /^收尾$/u)
})

test('块级专用切分：没有块级标记时整段是一个文本段；裸 <ui> 与代码围栏保护照旧', () => {
  assert.deepEqual(splitTrustedBlocks('纯文本 {{icon:check}} 一句'), [{ kind: 'text', text: '纯文本 {{icon:check}} 一句' }])
  const bare = splitTrustedBlocks('裸块示例：\n<ui fallback="f"><text>x</text></ui>\n之后')
  assert.equal(bare.some((part) => part.kind === 'block' && part.lang === 'ml-bare'), true)
  const guarded = splitTrustedBlocks('```js\nconst s = "<ui title=\\"a\\"></ui>"\n```')
  assert.equal(guarded.some((part) => part.kind === 'block'), false, '代码围栏里的 <ui> 不识别')
})
