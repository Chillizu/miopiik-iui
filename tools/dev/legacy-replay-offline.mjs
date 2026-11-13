#!/usr/bin/env node
/**
 * 离线历史回放校验（只读，不接触运行中的 DSH 服务）。
 *
 *   node tools/dev/legacy-replay-offline.mjs <sessions-dir>
 *
 *  1. 解压真实 DSH 会话日志（*.jsonl.zstd，只读）
 *  2. 从 assistant 消息正文（data.message.content[*].text）里找出所有 ```ink-view 围栏
 *  3. 用本仓库 shared/markdown-segments.js 分段，shared/legacy-widgets.js 只读映射
 *     成 iui/1 AST，再走 shared/iui-ast.js validateAst
 *  4. 统计成功 / 局部降级 / 不可映射（按 fallback 文本处理）数量
 *
 * 只读取输入，不写任何文件。需要真实会话数据，因此**不属于 npm test / CI**；
 * 缺少参数时退出码为 2，没有会话数据时按空样本正常退出。
 * 示例：~/.dsh/sessions/<workspace-dir>
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

const [sessionsDir] = process.argv.slice(2)
if (sessionsDir === undefined) {
  console.error('用法：node tools/dev/legacy-replay-offline.mjs <sessions-dir>')
  process.exit(2)
}

const repoDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { splitTrustedMarkdown } = await import(new URL('../../shared/markdown-segments.js', import.meta.url).href)
const { adoptLegacySpec } = await import(new URL('../../shared/legacy-widgets.js', import.meta.url).href)
const { validateAst } = await import(new URL('../../shared/iui-ast.js', import.meta.url).href)

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.jsonl.zstd')) out.push(full)
  }
  return out
}

let files = []
try {
  files = walk(sessionsDir)
} catch (error) {
  console.error(`无法读取会话目录 ${sessionsDir}：${error.code ?? error.message}`)
  console.error('参数应指向真实 DSH 会话目录，例如 ~/.dsh/sessions/<workspace-dir>。')
  process.exit(2)
}
let scannedBytes = 0
let sessionFilesWithLegacy = 0
const specs = []
for (const file of files) {
  const raw = readFileSync(file)
  scannedBytes += raw.length
  let text
  try {
    text = zstdDecompressSync(raw).toString('utf8')
  } catch {
    continue
  }
  if (!text.includes('ink-view')) continue
  let found = 0
  for (const line of text.split('\n')) {
    if (!line.includes('ink-view')) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    const content = event?.data?.message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type !== 'text' || typeof part.text !== 'string') continue
      for (const match of part.text.matchAll(/```ink-view\r?\n([\s\S]*?)```/gu)) {
        found += 1
        specs.push({ file: file.replace(sessionsDir, ''), raw: match[1] })
      }
    }
  }
  if (found > 0) sessionFilesWithLegacy += 1
}

// 同一 spec 在多个快照/会话里重复出现是正常的；按内容去重后再统计"独立历史样本"
const unique = new Map()
for (const item of specs) {
  const key = item.raw.trim()
  if (!unique.has(key)) unique.set(key, { ...item, occurrences: 0 })
  unique.get(key).occurrences += 1
}

const results = { ok: 0, degraded: 0, unmappable: 0, invalid: 0 }
const details = []
for (const [raw, item] of unique) {
  const segments = splitTrustedMarkdown('```ink-view\n' + raw + '```')
  const seenAsBlock = segments.some((part) => part.kind === 'block')
  let spec
  try {
    spec = JSON.parse(raw)
  } catch {
    results.invalid += 1
    details.push({ widget: null, result: 'invalid-json', seenAsBlock })
    continue
  }
  const adopted = adoptLegacySpec(spec)
  if (!adopted.ok) {
    results.unmappable += 1
    details.push({ widget: spec.widget ?? null, result: 'unmappable->fallback-text', fallback: adopted.fallback ?? null, seenAsBlock, occurrences: item.occurrences })
    continue
  }
  const checked = validateAst(adopted.doc)
  if (!checked.ok) {
    results.invalid += 1
    details.push({ widget: spec.widget ?? null, result: 'invalid-ast', seenAsBlock })
    continue
  }
  if (checked.degraded > 0) results.degraded += 1
  else results.ok += 1
  details.push({ widget: spec.widget ?? null, result: checked.degraded > 0 ? 'ok-degraded' : 'ok', degraded: checked.degraded, seenAsBlock, occurrences: item.occurrences })
}

console.log(JSON.stringify({
  sessionsDir,
  repoDir,
  sessionFiles: files.length,
  scannedCompressedBytes: scannedBytes,
  sessionFilesWithLegacy,
  legacyFencedBlocks: specs.length,
  uniqueLegacySpecs: unique.size,
  results,
  details,
}, null, 2))
process.exitCode = results.invalid === 0 ? 0 : 1
