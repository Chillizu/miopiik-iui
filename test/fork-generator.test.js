import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import { splitTrustedBlocks, splitTrustedMarkdown } from '../shared/markdown-segments.js'
import { isDshInstalled, resolveUpstreamDir } from '../tools/fork-chat-embeds.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tmp = join(root, '.dsh', 'tmp', 'fork-generator-test')
const patch = join(root, '.dsh', 'tmp', 'fork-generator-test.patch')
const noDsh = join(root, '.dsh', 'tmp', 'fork-generator-test-no-dsh')

function run(args = [], env = {}) {
  return execFileSync(process.execPath, ['tools/fork-chat-embeds.mjs', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, MIOPIIK_FORK_DIR: tmp, MIOPIIK_FORK_PATCH: patch, ...env },
  })
}

/**
 * fork 生成需要真实 DSH 安装（有可解析的 @deepseek-ai/dsh-client-ui-chat）。
 * 干净 clone / CI 没有宿主时整组生成回归跳过，而不是假装通过或写死本机路径。
 */
function hostAvailable() {
  try {
    return isDshInstalled() && resolveUpstreamDir() !== ''
  } catch {
    return false
  }
}

const hostSkip = hostAvailable()
  ? false
  : '需要真实 DSH 安装（可用 MIOPIIK_DSH_DIR 指定 DSH 安装目录）；无宿主时跳过 fork 生成回归'

test('生成器 --check 在无 DSH 安装时明确提示并按“无 fork 即无漂移”退出 0', () => {
  const missingFork = join(tmp, 'never-generated')
  rmSync(missingFork, { recursive: true, force: true })
  const out = run(['--check'], { MIOPIIK_DSH_DIR: noDsh, MIOPIIK_FORK_DIR: missingFork })
  assert.match(out, /未找到 DSH 安装/u, '缺少 DSH 时必须给出明确提示，而不是崩溃')
  // 只读：绝不创建 fork 目录或依赖链接
  assert.equal(existsSync(missingFork), false, '--check 不应创建 fork 目录')
})

test('生成器：重建 fork 后必须恢复 node_modules 依赖链接（曾因 rmSync 丢失导致插件 import 失败）', { skip: hostSkip }, () => {
  rmSync(tmp, { recursive: true, force: true })
  rmSync(patch, { force: true })
  const first = JSON.parse(run())
  assert.equal(first.dependencies.present, true)
  assert.match(first.dependencies.resolved['@deepseek-ai/schemastery'], /schemastery/u)
  assert.equal(lstatSync(join(tmp, 'node_modules')).isSymbolicLink(), true)

  // 第二次重建：链接必须仍然存在且可解析
  const second = JSON.parse(run())
  assert.equal(second.dependencies.present, true)
  assert.match(second.dependencies.resolved['@deepseek-ai/schemastery'], /schemastery/u)

  // 上游解析必须来自 DSH 安装，不能解析到本仓库（否则会自我复制）
  assert.ok(!first.upstreamDir.startsWith(root + '/'), `上游不应来自仓库：${first.upstreamDir}`)
})

test('生成器 --check 只读：不删除 fork、不删除依赖链接', { skip: hostSkip }, () => {
  if (!existsSync(join(tmp, 'lib', 'client.js'))) run()
  const before = lstatSync(join(tmp, 'node_modules'))
  const out = run(['--check'])
  assert.match(out, /一致/u)
  const after = lstatSync(join(tmp, 'node_modules'))
  assert.equal(existsSync(join(tmp, 'node_modules')), true)
  assert.equal(after.ino, before.ino, '--check 不应重建链接（inode 应保持不变）')
  const client = readFileSync(join(tmp, 'lib', 'client.js'), 'utf8')
  assert.match(client, /__miopiikMarkdownEmbeds/u)
  // rc.4 起安装独立 IUI 后默认开启，显式关闭（'0'）才交回原生 Markdown
  assert.match(client, /miopiik\.markdownEmbeds"\) === "0"\) return false/u)
  // L-11：行内 token 走「原生先渲染后 DOM 嫁接」，块级才走预切分；流式围栏有专门路由
  assert.match(client, /MiopiikGraftText/u)
  assert.match(client, /graftInline/u)
  assert.match(client, /includeOpenIui/u)
  // 补丁产物必须同时写出，供上游评审
  assert.match(readFileSync(patch, 'utf8'), /miopiik:markdown-embeds/u)
})

function renderPatchedText(registry, hooks = {}) {
  if (!existsSync(join(tmp, 'lib', 'client.js'))) run()
  const client = readFileSync(join(tmp, 'lib', 'client.js'), 'utf8')
  const helperStart = client.indexOf('// >>> miopiik:markdown-embeds')
  const assistantStart = client.indexOf('const AssistantMarkdown =', helperStart)
  const textStart = client.indexOf('case "text": {', assistantStart)
  const reasoningStart = client.indexOf('case "reasoning":', textStart)
  assert.ok(helperStart >= 0 && assistantStart > helperStart && textStart > assistantStart && reasoningStart > textStart)

  return runInNewContext(`${client.slice(helperStart, assistantStart)}
    (function render(text, streaming) {
      const block = { kind: "text", text };
      const labels = {}, mentions = [], pathImages = {}, rendered = [], i = 0, textInteractionSource = false;
      switch (block.kind) { ${client.slice(textStart, reasoningStart)} }
      return rendered[0];
    })`, {
    react: { memo: (component) => component, ...hooks },
    react_jsx_runtime: { jsx: (type, props, key) => ({ type, props, key }) },
    _deepseek_ai_dsh_client_ui_primitives: { MarkdownText: 'markdown' },
    __miopiikMarkdownEmbeds: {
      segmentsBlocks: splitTrustedBlocks,
      ...registry,
    },
  })
}

test('宿主在流式、闭合和中途停止时使用同一块组件和挂载位置', { skip: hostSkip }, () => {
  const render = renderPatchedText({
    renderBlock: () => 'closed',
    renderBlockStreaming: () => 'live',
    renderBlockInterrupted: () => 'interrupted',
  })

  const source = '正文\n```iui\n<ui><text>图解</text></ui>\n'
  const wrapper = (text, streaming) => render(text, streaming).props.children[1]
  const live = wrapper(source, true)
  const closed = wrapper(source + '```\n后文', true)
  const stopped = wrapper(source, false)
  assert.equal(live.key, closed.key)
  assert.equal(live.key, stopped.key)
  for (const [node, result] of [[live, 'live'], [closed, 'closed'], [stopped, 'interrupted']]) {
    const block = node.props.children
    assert.equal(block.type, live.props.children.type)
    assert.equal(block.type(block.props), result)
  }
})

test('行内标记在流式期间保持原生正文组件，回复定稿后嫁接', { skip: hostSkip }, () => {
  const scans = []
  const grafted = []
  const rootNode = {}
  const render = renderPatchedText({
    renderBlock: () => null,
    segments(text) {
      scans.push(text)
      return splitTrustedMarkdown(text)
    },
    graftInline: (node) => grafted.push(node),
  }, {
    useRef: () => ({ current: rootNode }),
    useLayoutEffect: (effect) => effect(),
  })

  const partial = '**状态 {{badge:success:完成'
  const token = partial + '}}'
  const final = token + '，继续输出**。'
  for (const text of [partial, token, final]) {
    const markdown = render(text, true)
    assert.equal(markdown.type, 'markdown')
    assert.equal(markdown.key, 0)
    assert.equal(markdown.props.text, text)
  }
  assert.deepEqual(scans, [])
  assert.deepEqual(grafted, [])

  const settled = render(final, false)
  assert.equal(settled.type.name, 'MiopiikGraftText')
  assert.equal(settled.key, 0)
  const markdown = settled.type(settled.props).props.children
  assert.equal(markdown.type, 'markdown')
  assert.equal(markdown.props.text, final)
  assert.deepEqual(scans, [final])
  assert.deepEqual(grafted, [rootNode])
})
