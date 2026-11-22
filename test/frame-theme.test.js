import test from 'node:test'
import assert from 'node:assert/strict'

import { FRAME_PRESET_ATTR, framePresetCss, framePresetStyle, readHostTheme } from '../shared/frame-theme.js'

test('无宿主文档时回退内置色板：预设 CSS 自带全部 mi-* 变量与组件词汇', () => {
  const theme = readHostTheme(null)
  assert.equal(theme.accent, '#4176e6')
  const css = framePresetCss(theme)
  for (const name of ['--mi-bg', '--mi-surface1', '--mi-text', '--mi-muted', '--mi-border', '--mi-accent', '--mi-r-lg', '--mi-font']) {
    assert.ok(css.includes(name + ':'), '预设应包含变量 ' + name)
  }
  for (const cls of ['.mi-card', '.mi-row', '.mi-grid', '.mi-metric', '.mi-badge', '.mi-callout', '.mi-progress', '.mi-divider']) {
    assert.ok(css.includes(cls), '预设应包含组件类 ' + cls)
  }
  assert.ok(css.includes('[data-tone=success]'), 'tone 走 data-tone 属性（文档不用记类名组合）')
  assert.ok(css.includes('[data-tone=danger]'))
  const tag = framePresetStyle(theme)
  assert.ok(tag.startsWith('<style ' + FRAME_PRESET_ATTR + '="1">'))
  assert.ok(tag.endsWith('</style>'))
})

test('从宿主采样设计令牌：颜色经探针解析成绝对色值，非颜色令牌取原文，探针必移除', () => {
  const vars = {
    '--dsw-alias-bg-base': 'var(--dsw-static-neutral-bluish-1000)',
    '--dsw-alias-label-primary': '#e6edf3',
    '--dsw-alias-brand-primary': 'var(--dsw-static-deepseek-500)',
    '--dsw-font-family': 'Inter, sans-serif',
    '--dsw-radius-lg': 'calc(8px + 4px)',
    '--dsw-radius-md': 'var(--not-resolvable)',
  }
  let removed = false
  const probe = {
    style: { cssText: '', color: '' },
    setAttribute() {},
    remove() {
      removed = true
    },
  }
  const rootStyle = { getPropertyValue: (name) => vars[name] ?? '' }
  const doc = {
    documentElement: {},
    body: { appendChild() {} },
    createElement: () => probe,
    defaultView: {
      // 探针：任何 var()/color-mix() 都会被这次计算折成绝对色值
      getComputedStyle: (node) => (node === probe ? { color: 'rgb(240, 246, 252)' } : rootStyle),
    },
  }
  const theme = readHostTheme(doc)
  assert.equal(removed, true, '探针必须同步移除，不污染宿主 DOM')
  assert.equal(theme.bg, 'rgb(240, 246, 252)', '颜色令牌应解析为绝对色值')
  assert.equal(theme.text, 'rgb(240, 246, 252)')
  assert.equal(theme.font, 'Inter, sans-serif', '字体令牌直接取原文')
  assert.equal(theme.rlg, 'calc(8px + 4px)', 'calc() 原样保留')
  assert.equal(theme.rmd, '8px', '含 var() 的令牌不可搬进不透明文档，回退内置值')
  assert.equal(theme.mono, readHostTheme(null).mono, '缺失令牌保持内置回退')
})
