#!/usr/bin/env node
/**
 * 自然触发探针：6 个中性提示，每个开一个全新会话，观察模型是否**自发**使用 IUI。
 *
 * 提示词里不出现“展示 / 画 / 界面 / 组件”等字样，避免诱导。
 * 判定以会话日志里的 assistant 原文为准：围栏 ```iui、裸 <ui> 标签、行内 token 都算使用了 IUI。
 *
 *   node tools/probe-naturalness.mjs [--label v3] [--repeat 2]
 *
 * 结果写到 .dsh/tmp/probe-<label>-<时间>.json，并在 stdout 打印汇总。
 * 只新建空白会话，不触碰任何既有会话；token 只从本机 journalctl 读取、不落盘。
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BASE_URL as BASE, CHROMIUM, loadPlaywright } from './dev-env.mjs'

const PROBES = [
  { id: 'trend', expect: 'positive', prompt: '最近三轮测试通过数：31、30、28。帮我判断趋势，并说明值不值得担心。' },
  { id: 'compare', expect: 'positive', prompt: 'A 方案成本 12 万、耗时 3 周、风险中；B 方案成本 18 万、耗时 5 周、风险低。选哪个？' },
  { id: 'health', expect: 'positive', prompt: '上周请求量：周一 420、周二 510、周三 475、周四 610、周五 580，成功率 98.2%，延迟 p99 42ms。这周健不健康？' },
  { id: 'status', expect: 'positive', prompt: '发布前的四项检查：测试通过、CI 绿、文档完成、干净环境安装未验证。现在什么状态？' },
  { id: 'progress', expect: 'positive', prompt: '这次迁移一共 12 个任务，已完成 9 个，其中 2 个是今天完成的。还剩多少，进度怎么样？' },
  { id: 'prose', expect: 'negative', prompt: '用两三句话解释 HTTP/2 和 HTTP/3 的核心区别。' },
]

const SESSIONS_ROOT = process.env.MIOPIIK_DSH_SESSIONS_ROOT ?? join(homedir(), '.dsh', 'sessions')
const OUT_DIR = process.env.MIOPIIK_PROBE_OUT ?? join(process.cwd(), '.dsh', 'tmp')
const FENCE = String.fromCharCode(96).repeat(3)

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1] !== undefined ? process.argv[index + 1] : fallback
}
const label = arg('label', 'run')
const repeat = Math.max(1, Number(arg('repeat', '1')))

function loginUrl() {
  const log = execFileSync('journalctl', ['--user', '-u', 'dsh-web', '-o', 'cat'], { encoding: 'utf8' })
  const matches = [...log.matchAll(/http:\/\/127\.0\.0\.1:3080\/\?token=([A-Za-z0-9_-]+)/gu)]
  if (matches.length === 0) throw new Error('没有可用登录 token')
  return `${BASE}/?token=${matches[matches.length - 1][1]}`
}

/** 全盘扫描会话日志，找出 user 消息里含该提示词的那个会话（不依赖“最新会话”猜测）。 */
function findSessionByPrompt(prompt, sinceMs) {
  for (const workspace of readdirSync(SESSIONS_ROOT)) {
    const dir = join(SESSIONS_ROOT, workspace)
    if (!statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      if (!name.startsWith('session-')) continue
      const file = join(dir, name, 'session.v4.jsonl.zstd')
      if (!existsSync(file) || statSync(file).mtimeMs < sinceMs) continue
      let events
      try {
        events = execFileSync('zstd', ['-dc', file], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
          .trim()
          .split('\n')
          .map((line) => {
            try {
              return JSON.parse(line)
            } catch {
              return null
            }
          })
          .filter(Boolean)
      } catch {
        continue
      }
      const userText = events
        .filter((event) => event.type === 'user/message')
        .map((event) => (event.data.content ?? []).filter((block) => block.type === 'text').map((block) => block.text).join(''))
        .join('\n')
      if (!userText.includes(prompt)) continue
      let text = ''
      let outputTokens = 0
      for (const event of events) {
        if (event.type !== 'assistant/message') continue
        outputTokens += event.data?.usage?.outputTokens ?? 0
        for (const block of event.data?.message?.content ?? []) if (block.type === 'text') text += block.text
      }
      return { workspace, session: name, file, text, outputTokens }
    }
  }
  return null
}

/** 会话原文里出现哪些 IUI 形式：围栏块、裸 <ui> 标签、行内 token。 */
function classify(text) {
  const blockPattern = new RegExp(FENCE + 'iui[ \\t]*\\r?\\n([\\s\\S]*?)' + FENCE, 'gu')
  const fencedBlocks = [...text.matchAll(blockPattern)]
  const fenced = fencedBlocks.length
  // 围栏块里的 <ui> 属于“围栏形态”，不算漏围栏；只看围栏之外是否还有裸标签。
  const stripped = text.replace(blockPattern, '')
  const bareUi = [...stripped.matchAll(/<ui\b/gu)].length
  const inline = [...text.matchAll(/\{\{[a-z]+:[^}]*\}\}/gu)].length
  const used = fenced > 0 || bareUi > 0 || inline > 0
  return { fenced, bareUi, inline, used, form: fenced > 0 ? 'fenced' : bareUi > 0 ? 'bare' : inline > 0 ? 'inline' : 'none' }
}

const browser = await loadPlaywright().chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const results = []
try {
  for (let round = 1; round <= repeat; round += 1) {
    for (const probe of PROBES) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await context.addInitScript(() => {
        try {
          localStorage.setItem('miopiik.inlineBody', '1')
        } catch {}
      })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)))
      try {
        await page.goto(loginUrl(), { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1200)
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(2500)

        const fresh = page.getByRole('button', { name: /新建会话|新会话/ }).first()
        if ((await fresh.count()) === 0) throw new Error('没有新建会话按钮')
        await fresh.click()
        await page.waitForTimeout(2200)
        const guard = await page.evaluate(() => {
          const el = document.querySelector('textarea, [contenteditable="true"]')
          return {
            empty: (el?.value ?? el?.innerText ?? '').trim() === '',
            steps: document.querySelectorAll('[data-chat-flow-kind="assistant-step"]').length,
          }
        })
        if (guard.empty !== true || guard.steps !== 0) throw new Error('不是空白新会话')

        const input = page.locator('textarea, [contenteditable="true"]').first()
        await input.click()
        await page.keyboard.insertText(probe.prompt)
        await page.waitForTimeout(250)
        const started = Date.now()
        const send = page.getByRole('button', { name: /发送|Send/i }).first()
        if (await send.count()) await send.click()
        else await page.keyboard.press('Enter')

        // 模型回合结束：已有 assistant-step，且“深度求索中”连续两次不出现。
        let idle = 0
        for (let i = 0; i < 180; i += 1) {
          await page.waitForTimeout(1000)
          const state = await page.evaluate(() => ({
            steps: document.querySelectorAll('[data-chat-flow-kind="assistant-step"]').length,
            thinking: /深度求索中|生成中|停止生成/.test(document.body.innerText),
          }))
          if (state.steps > 0 && state.thinking === false) {
            idle += 1
            if (idle >= 2) break
          } else idle = 0
        }

        const dom = await page.evaluate(() => ({
          blocks: document.querySelectorAll('[data-iui-output]').length,
          metrics: document.querySelectorAll('[data-iui-metric]').length,
          charts: document.querySelectorAll('[data-iui-chart]').length,
          literalFence: document.body.innerText.includes(String.fromCharCode(96, 96, 96) + 'iui'),
        }))
        const elapsedMs = Date.now() - started

        const session = findSessionByPrompt(probe.prompt, started)
        const text = session?.text ?? ''
        const kinds = classify(text)
        results.push({
          probe: probe.id,
          round,
          expect: probe.expect,
          used: kinds.used,
          fenced: kinds.fenced,
          bareUi: kinds.bareUi,
          inline: kinds.inline,
          chars: text.length,
          outputTokens: session?.outputTokens ?? null,
          dom,
          elapsedMs,
          session: session?.session ?? null,
          errors,
        })
        console.log(
          `[r${round} ${probe.id}] used=${kinds.used} fenced=${kinds.fenced} bare=${kinds.bareUi} inline=${kinds.inline} dom=${dom.blocks}b/${dom.metrics}m/${dom.charts}c tokens=${session?.outputTokens ?? '?'} ${elapsedMs}ms`,
        )
      } catch (error) {
        results.push({ probe: probe.id, round, expect: probe.expect, error: String(error.message ?? error) })
        console.log(`[r${round} ${probe.id}] ERROR ${error.message ?? error}`)
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser.close()
}

mkdirSync(OUT_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
const outFile = join(OUT_DIR, `probe-${label}-${stamp}.json`)
writeFileSync(outFile, JSON.stringify({ label, ranAt: new Date().toISOString(), repeat, results }, null, 2))
const positives = results.filter((row) => row.expect === 'positive')
const negatives = results.filter((row) => row.expect === 'negative')
const rate = (list) => `${list.filter((row) => row.used).length}/${list.length}`
console.log(`\nsummary label=${label} positives=${rate(positives)} negatives=${rate(negatives)} report=${outFile}`)
