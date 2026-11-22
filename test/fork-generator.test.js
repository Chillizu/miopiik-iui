import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
  assert.match(client, /miopiikStreamSplit/u)
  // 补丁产物必须同时写出，供上游评审
  assert.match(readFileSync(patch, 'utf8'), /miopiik:markdown-embeds/u)
})
