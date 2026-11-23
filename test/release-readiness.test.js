import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 单包发布检查：仓库根就是 miopiik-iui 包根。
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function runChecker() {
  const output = execFileSync(process.execPath, ['tools/check-release.mjs'], { cwd: root, encoding: 'utf8', timeout: 180000 })
  return JSON.parse(output)
}

function stubDsh() {
  const dir = mkdtempSync(join(tmpdir(), 'miopiik-iui-dsh-stub-'))
  const log = join(dir, 'calls.log')
  const bin = join(dir, 'dsh')
  writeFileSync(bin, `#!/bin/sh\necho "$@" >> "${log}"\nexit 0\n`, 'utf8')
  chmodSync(bin, 0o755)
  return { dir, log, bin }
}

test('发布检查：单包可独立打包，tarball 覆盖全部运行时依赖', () => {
  const report = runChecker()
  assert.equal(report.ok, true, JSON.stringify(report.package.problems))
  assert.equal(report.package.name, 'miopiik-iui')
  assert.equal(report.package.version, manifest.version)
  assert.ok(report.package.files >= 15, `tarball 文件数异常（${report.package.files}）`)
  assert.ok(report.package.runtimeDependencies >= 2, '运行时依赖未全部进入 tarball')
  // 体积约束（防止把 upstream fork 或 node_modules 打进包）
  assert.ok(report.package.unpackedBytes < 5 * 1024 * 1024, '解包体积异常')
  assert.equal(report.package.problems.length, 0)
})

test('版本策略：版本号与发布说明互相自证（rc 与 stable 都要写明状态与限制）', () => {
  assert.match(manifest.version, /^0\.\d+\.\d+(-rc\.\d+)?$/u, '版本号必须是 0.x.y 或 0.x.y-rc.N')
  assert.equal(manifest.private, undefined, 'IUI 不应标记 private')

  const notes = readFileSync(join(root, 'docs', 'RELEASE-NOTES.md'), 'utf8')
  assert.match(notes, /miopiik-iui 0\.1\.0-rc\.4/u, '发布说明必须写明历史版本')
  assert.match(notes, new RegExp('## miopiik-iui ' + manifest.version.replace(/\./gu, '\\.') + ' — '), '发布说明必须为当前版本（' + manifest.version + '）建节')
  assert.match(notes, /已知限制|blocker/iu, '发布说明必须列出限制')
  if (manifest.version.includes('-rc.')) {
    assert.match(notes, /prerelease|预发布/iu, 'rc 版本必须在发布说明里明确写为预发布')
  } else {
    assert.match(notes, /stable|正式版/iu, 'stable 版本必须在发布说明里明确写为正式版')
  }

  const matrix = readFileSync(join(root, 'docs', 'SUPPORT-MATRIX.md'), 'utf8')
  assert.match(matrix, /0\.2\.2-rc\.1/u, '支持矩阵需写明 DSH 测试基线')
  assert.match(matrix, /实验性 chat 包补丁/u, '支持矩阵需说明内联渲染的宿主补丁依赖')
  assert.match(matrix, /MiOpIIk IUI/u, '支持矩阵必须是 IUI 单包版')
  assert.equal(existsSync(join(root, 'docs', 'MIGRATION.md')), true, '缺少 docs/MIGRATION.md')
})

test('单包资产齐全，安装脚本默认 dry-run 且拒绝未确认写 web profile', () => {
  for (const file of [
    'README.md', 'LICENSE', 'icon.svg', 'cordis.patch.yml', 'index.js', 'client.js',
    'patches/chat-markdown-embeds.patch', 'shared/iui-ast.js', 'shared/miopiik-ml.js',
    'shared/markdown-segments.js', 'shared/legacy-widgets.js', 'locale/en.json', 'locale/zh.json',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} 缺失`)
  }
  const dry = execFileSync(process.execPath, ['tools/install-plugin.mjs', '--profile', 'cold-test'], { cwd: root, encoding: 'utf8' })
  assert.match(dry, /dry-run/u)

  const rejected = spawnSync(process.execPath, ['tools/install-plugin.mjs', '--profile', 'web', '--execute'], { cwd: root, encoding: 'utf8' })
  assert.equal(rejected.status, 2, '安装脚本必须拒绝未确认写入 web profile')
  assert.match(rejected.stderr, /正在使用的 web profile/u)
})

test('IUI 设置页显式告知宿主补丁状态（未打补丁时不静默失效）', () => {
  const settings = readFileSync(join(root, 'settings.js'), 'utf8')
  assert.match(settings, /__miopiikMarkdownEmbedsHost/u)
  assert.match(settings, /未检测到补丁/u)
  const generator = readFileSync(join(root, 'tools', 'fork-chat-embeds.mjs'), 'utf8')
  assert.match(generator, /globalThis\.__miopiikMarkdownEmbedsHost = true/u)
})

test('安装脚本 link 模式 --execute 真的调用 dsh（单包一次调用）', () => {
  const stub = stubDsh()
  execFileSync(process.execPath, ['tools/install-plugin.mjs', '--profile', 'cold-test', '--mode', 'link', '--execute'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DSH_BIN: stub.bin, PATH: `${stub.dir}:${process.env.PATH}` },
  })
  const calls = readFileSync(stub.log, 'utf8').trim()
  assert.equal(calls, `plugin --profile cold-test add ${root}`, 'link 模式应把本包根目录交给 dsh 一次')
})

test('安装脚本 tarball 模式 --execute 真的执行：用桩 dsh 验证实际产物路径被传入（单包一次调用）', () => {
  const stub = stubDsh()
  execFileSync(process.execPath, ['tools/install-plugin.mjs', '--profile', 'cold-test', '--mode', 'tarball', '--execute'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DSH_BIN: stub.bin, PATH: `${stub.dir}:${process.env.PATH}` },
    timeout: 180000,
  })
  const calls = readFileSync(stub.log, 'utf8').trim().split('\n')
  assert.equal(calls.length, 1, `单包只应安装一次，实际：\n${calls.join('\n')}`)
  const expected = join(root, '.dsh', 'tmp', 'packs', `${manifest.name}-${manifest.version}.tgz`)
  assert.equal(calls[0], `plugin --profile cold-test add ${expected}`)
  assert.equal(existsSync(expected), true, `打包产物不存在：${expected}`)
  // 命令里不允许再出现未替换的占位符
  assert.equal(calls.some((call) => call.includes('<') || call.includes('>')), false)
})

test('README 顶部版本与 package.json 一致，且状态标注与版本号相符（防止文档漂移）', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  const zh = readFileSync(join(root, 'README.zh-CN.md'), 'utf8')
  for (const [name, text] of [['README.md', readme], ['README.zh-CN.md', zh]]) {
    assert.ok(text.includes(`Version ${manifest.version}`), `${name} 顶部版本与 package.json（${manifest.version}）不一致`)
  }
  if (manifest.version.includes('-rc.')) {
    assert.match(readme, /prerelease/iu, 'rc 版本必须在 README 里明确写为预发布')
    assert.match(zh, /预发布/iu, 'rc 版本必须在中文 README 里明确写为预发布')
  } else {
    assert.match(readme, /stable/iu, 'stable 版本必须在 README 里明确写为正式版')
    assert.match(zh, /正式版|stable/iu, 'stable 版本必须在中文 README 里明确写为正式版')
    assert.match(readme, /known limitations?|限制/iu, 'stable 版本必须同时写明已知限制')
  }
})
