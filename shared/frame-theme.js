/**
 * 沙箱文档（```html 围栏）的宿主主题预设。
 *
 * 为什么需要它：iframe 是不透明源的独立文档，看不见宿主的 CSS 变量，
 * 模型手写的深色卡片很容易和 DSH 本体风格对不上。这里在渲染时从宿主 DOM 采样
 * 设计令牌（--dsw-alias-* / --dsw-font-* / --dsw-radius-*），解析成绝对色值后
 * 以内联 <style> 注入沙箱文档，于是文档"天生就像宿主的一部分"。
 *
 * 设计约束：
 *   - 只读采样，不写宿主 DOM（探针元素同步创建/移除，position:fixed 隐藏）；
 *   - 宿主没有令牌时回退到内置深色中性色板，测试与独立浏览器里同样可用；
 *   - 预设样式排在最前面，文档自带 <style> 在后 → 同优先级下文档永远能覆盖预设；
 *   - 不引入任何脚本：预设纯 CSS（含 color-mix 派生层级），JS 执行仍为 0。
 */

/** 预设类名统一 mi- 前缀，语义对齐 IUI 同名组件（card/metric/badge/callout/progress…）。 */
export const FRAME_PRESET_ATTR = 'data-miopiik-frame-preset'

const FALLBACK = {
  bg: '#0d1117',
  surface1: '#161b22',
  surface2: '#1f2630',
  text: '#e6edf3',
  muted: '#9aa7b8',
  faint: '#6d7b8c',
  border: 'rgba(230, 237, 243, 0.14)',
  borderStrong: 'rgba(230, 237, 243, 0.26)',
  accent: '#4176e6',
  link: '#6cabff',
  success: '#3fb950',
  warn: '#d29922',
  danger: '#f85149',
  business: '#a371f7',
  codeBg: '#141a22',
  font: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  rsm: '6px',
  rmd: '8px',
  rlg: '12px',
}

/** 颜色令牌：宿主变量名按优先级尝试；全部缺失时用 FALLBACK。 */
const COLOR_TOKENS = {
  bg: ['--dsw-alias-bg-base'],
  surface1: ['--dsw-alias-bg-layer-1'],
  surface2: ['--dsw-alias-bg-layer-2'],
  text: ['--dsw-alias-label-primary'],
  muted: ['--dsw-alias-label-secondary'],
  faint: ['--dsw-alias-label-tertiary'],
  border: ['--dsw-alias-border-l1'],
  borderStrong: ['--dsw-alias-border-l2', '--dsw-alias-border-l3'],
  accent: ['--dsw-alias-brand-primary', '--dsw-static-deepseek-500'],
  link: ['--dsw-alias-link', '--dsw-static-deepseek-500'],
  success: ['--dsw-alias-state-success-primary'],
  warn: ['--dsw-alias-state-warn-primary'],
  danger: ['--dsw-alias-state-error-primary'],
  business: ['--dsw-alias-state-business-primary'],
  codeBg: ['--dsw-alias-markdown-code-block', '--dsw-alias-bg-layer-2'],
}

/** 非颜色令牌：直接取变量原文（不含 var() 才可用）。 */
const PLAIN_TOKENS = {
  font: ['--dsw-font-family'],
  mono: ['--dsw-font-mono'],
  rsm: ['--dsw-radius-sm'],
  rmd: ['--dsw-radius-md'],
  rlg: ['--dsw-radius-lg'],
}

function firstVar(styles, names) {
  for (const style of styles) {
    if (style === null || style === undefined) continue
    for (const name of names) {
      const value = String(style.getPropertyValue(name) ?? '').trim()
      if (value !== '') return value
    }
  }
  return ''
}

/**
 * 从宿主文档采样主题。采样失败（无 document / 无 DOM）时整体回退常量，
 * 保证 node 测试与独立浏览器里同样产出可用文档。
 * @param {Document|null|undefined} doc
 */
export function readHostTheme(doc) {
  const theme = { ...FALLBACK }
  if (doc === null || doc === undefined || typeof doc.createElement !== 'function' || doc.documentElement === null) return theme
  const view = doc.defaultView
  if (view === null || view === undefined || typeof view.getComputedStyle !== 'function') return theme
  // 令牌可能定义在 :root，也可能挂在 body/主题容器上（自定义属性会继承）——两处都看。
  const styles = [view.getComputedStyle(doc.documentElement)]
  if (doc.body !== null && doc.body !== undefined) styles.push(view.getComputedStyle(doc.body))
  const probe = doc.createElement('span')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:0;height:0;overflow:hidden;pointer-events:none'
  const host = doc.body ?? doc.documentElement
  host.appendChild(probe)
  try {
    // 颜色走「探针解析」：自定义属性可能是 var() 链或 color-mix()，
    // 借一次 color 计算拿到绝对 rgb()，才能安全搬进不透明源文档。
    for (const key of Object.keys(COLOR_TOKENS)) {
      const raw = firstVar(styles, COLOR_TOKENS[key])
      if (raw === '') continue
      probe.style.color = raw
      const resolved = String(view.getComputedStyle(probe).color ?? '').trim()
      if (resolved !== '' && resolved !== 'rgba(0, 0, 0, 0)') theme[key] = resolved
    }
    for (const key of Object.keys(PLAIN_TOKENS)) {
      const raw = firstVar(styles, PLAIN_TOKENS[key])
      if (raw !== '' && raw.indexOf('var(') === -1) theme[key] = raw
    }
  } finally {
    probe.remove()
  }
  return theme
}

/**
 * 预设样式表：令牌 + 基础排版 + mi-* 组件词汇。
 * @param {ReturnType<typeof readHostTheme>} theme
 * @returns {string} 可内联的 CSS
 */
export function framePresetCss(theme) {
  const t = theme === undefined || theme === null ? FALLBACK : { ...FALLBACK, ...theme }
  const tone = (name, value) => `[data-tone=${name}]{--mi-tone:${value}}`
  return [
    ':root{',
    `--mi-bg:${t.bg};--mi-surface1:${t.surface1};--mi-surface2:${t.surface2};`,
    `--mi-text:${t.text};--mi-muted:${t.muted};--mi-faint:${t.faint};`,
    `--mi-border:${t.border};--mi-border-strong:${t.borderStrong};`,
    `--mi-accent:${t.accent};--mi-link:${t.link};`,
    `--mi-success:${t.success};--mi-warn:${t.warn};--mi-danger:${t.danger};--mi-business:${t.business};`,
    `--mi-code-bg:${t.codeBg};--mi-font:${t.font};--mi-mono:${t.mono};`,
    `--mi-r-sm:${t.rsm};--mi-r-md:${t.rmd};--mi-r-lg:${t.rlg};`,
    'color-scheme:light dark;',
    '}',
    '*{box-sizing:border-box}',
    'body{margin:0;padding:16px 18px;background:var(--mi-bg);color:var(--mi-text);font:14px/1.62 var(--mi-font);-webkit-font-smoothing:antialiased}',
    'h1,h2,h3,h4{margin:0 0 8px;line-height:1.35;font-weight:600}',
    'h1{font-size:18px}h2{font-size:15px}h3{font-size:13.5px}h4{font-size:12.5px}',
    'p{margin:0 0 10px}p:last-child{margin-bottom:0}',
    'a{color:var(--mi-link);text-decoration:none}a:hover{text-decoration:underline}',
    'small,.mi-muted{font-size:12px;color:var(--mi-muted)}',
    'code{font-family:var(--mi-mono);font-size:12px;padding:1px 5px;border:1px solid var(--mi-border);border-radius:var(--mi-r-sm);background:var(--mi-code-bg)}',
    'pre{margin:0 0 10px;padding:12px;border:1px solid var(--mi-border);border-radius:var(--mi-r-md);background:var(--mi-code-bg);overflow:auto}',
    'pre code{padding:0;border:0;background:none}',
    'table{width:100%;border-collapse:collapse;font-size:12.5px}',
    'th,td{padding:6px 8px;text-align:left;border-bottom:1px solid var(--mi-border)}',
    'th{color:var(--mi-muted);font-weight:500}tr:last-child td{border-bottom:0}',
    'blockquote{margin:0 0 10px;padding:2px 0 2px 12px;border-left:2px solid var(--mi-border-strong);color:var(--mi-muted)}',
    'hr{margin:14px 0;border:0;border-top:1px solid var(--mi-border)}',
    'img{max-width:100%;border-radius:var(--mi-r-sm)}',
    '.mi-card{padding:12px 14px;border:1px solid var(--mi-border);border-radius:var(--mi-r-lg);background:var(--mi-surface1)}',
    '.mi-card>.mi-card-title{display:block;margin:0 0 6px;font-size:12.5px;font-weight:600;color:var(--mi-text)}',
    '.mi-row{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-start}',
    '.mi-row>*{flex:1 1 0;min-width:0}',
    '.mi-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}',
    '.mi-metric{padding:10px 12px;border:1px solid var(--mi-border);border-radius:var(--mi-r-lg);background:var(--mi-surface1)}',
    '.mi-metric .mi-label{display:block;font-size:11px;letter-spacing:.2px;color:var(--mi-muted)}',
    '.mi-metric .mi-value{display:block;margin-top:2px;font-size:21px;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums}',
    '.mi-metric .mi-unit{margin-left:3px;font-size:12px;font-weight:400;color:var(--mi-muted)}',
    '.mi-badge{display:inline-block;padding:0 8px;border:1px solid var(--mi-border);border-radius:99px;background:var(--mi-surface2);color:var(--mi-muted);font-size:11px;line-height:18px;vertical-align:1px}',
    '.mi-callout{padding:9px 12px;border:1px solid var(--mi-border);border-left:2px solid var(--mi-border-strong);border-radius:var(--mi-r-md);background:var(--mi-surface1);color:var(--mi-muted);font-size:12.5px}',
    '.mi-callout .mi-callout-title{display:block;margin-bottom:3px;color:var(--mi-text);font-weight:600;font-size:12.5px}',
    '.mi-progress{height:6px;border-radius:99px;background:var(--mi-surface2);overflow:hidden}',
    '.mi-progress>i{display:block;height:100%;border-radius:99px;background:var(--mi-accent)}',
    '.mi-divider{height:1px;margin:14px 0;background:var(--mi-border)}',
    '[data-tone]{--mi-tone:var(--mi-muted)}',
    tone('brand', 'var(--mi-accent)'),
    tone('success', 'var(--mi-success)'),
    tone('warn', 'var(--mi-warn)'),
    tone('danger', 'var(--mi-danger)'),
    tone('business', 'var(--mi-business)'),
    '.mi-badge[data-tone]{color:var(--mi-tone);border-color:color-mix(in srgb,var(--mi-tone) 45%,transparent);background:color-mix(in srgb,var(--mi-tone) 12%,transparent)}',
    '.mi-callout[data-tone]{border-left-color:var(--mi-tone)}',
    '.mi-progress[data-tone]>i{background:var(--mi-tone)}',
    '.mi-metric[data-tone] .mi-value{color:var(--mi-tone)}',
  ].join('')
}

/** 注入用的完整 <style> 标签（含标记属性，便于测试与去重排查）。 */
export function framePresetStyle(theme) {
  return '<style ' + FRAME_PRESET_ATTR + '="1">' + framePresetCss(theme) + '</style>'
}
