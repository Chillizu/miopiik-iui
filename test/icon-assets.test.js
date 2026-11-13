import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 独立仓库根即包根：单包、单图标（根 icon.svg）。
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconPath = join(root, 'icon.svg')
const MAX_ICON_BYTES = 256 * 1024
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// 用户设计原稿只读、不随仓库分发；默认路径基于 os.homedir()，可用环境变量覆盖。
const ORIGINAL = process.env.MIOPIIK_ICON_ORIGINAL
  ?? join(homedir(), 'Downloads', 'DSH Plugin icons', 'Organized', 'IUI.svg')

test('图标资产：根 icon.svg 满足 DSH 官方 icon 结构与设计约束', () => {
  const bytes = readFileSync(iconPath)
  assert.ok(bytes.length <= MAX_ICON_BYTES, '超过 256KiB')
  const text = bytes.toString('utf8')
  assert.match(text, /^<svg[\s>]/u)
  assert.match(text, /viewBox="0 0 36 36"/u, '画布尺寸应与设计稿一致')
  assert.doesNotMatch(text, /<script\b|on[a-z]+\s*=/iu, '图标里不允许脚本/事件')
  assert.doesNotMatch(text, /(?:xlink:)?href\s*=\s*"(?!#|data:)/iu, '不允许外部引用')
  // 渐变与遮罩是设计的一部分，不能被简化掉
  assert.match(text, /linearGradient/u, '丢失渐变')
  assert.match(text, /mask=|clip-path=/u, '丢失遮罩/裁剪')
})

test('包资产：通过 ./icon 导出图标，且 files 打包清单包含它', () => {
  assert.equal(manifest.exports?.['./icon'], './icon.svg', '缺少 "./icon" 导出')
  const target = resolve(root, manifest.exports['./icon'])
  assert.equal(statSync(target).isFile(), true)
  assert.equal(target, iconPath)
  assert.ok((manifest.files ?? []).includes('icon.svg'), 'files 未包含 icon.svg')
})

test('图标原稿逐字节比对（用户原稿只读、不随仓库分发）', {
  skip: existsSync(ORIGINAL) ? false : '未找到用户设计原稿（可用 MIOPIIK_ICON_ORIGINAL 指定）；跳过逐字节比对',
}, () => {
  const bytes = readFileSync(iconPath)
  assert.equal(bytes.equals(readFileSync(ORIGINAL)), true, '与 Organized 原稿不一致（不允许重绘）')
})

test('tools/icon-check.mjs：静态检查通过（JSON ok:true）', () => {
  const args = ['tools/icon-check.mjs']
  if (existsSync(ORIGINAL)) args.push('--original', ORIGINAL)
  const report = JSON.parse(execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 120000 }))
  assert.equal(report.ok, true, JSON.stringify(report.icon.problems))
  assert.equal(report.icon.path, 'icon.svg')
  assert.equal(report.icon.viewBox, '0 0 36 36')
  if (existsSync(ORIGINAL)) assert.equal(report.original.identical, true, 'icon-check 应确认与原稿逐字节一致')
})
