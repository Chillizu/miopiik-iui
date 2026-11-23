/**
 * Markdown 正文切分：把"受信 token"从普通 Markdown 里切出来，其余原样交给 MarkdownText。
 *
 * 只认受控标记，绝不把任意 HTML 当组件：
 *   - 块级：```iui 围栏（miopiik-ml 或 JSON AST）；```ink-view 仅历史只读兼容
 *   - 块级容错：模型忘了写围栏时，行首独立出现的顶层 <ui>…</ui> 也按受控 ML 解析
 *     （仍走同一套 AST 校验；解析失败原样保留为文本，不执行任何 HTML）
 *   - 行内：{{badge:success:已实现}} / {{icon:check}} / {{code:iapi}}
 *
 * 设计约束：
 *   - 只做切分，不做 HTML/JS 解析；未知或格式不正确的 token 原样留在文本里；
 *   - 切分点只在标记边界，跨标记的 Markdown 结构（如跨越 token 的加粗）会各自渲染——已记录为限制；
 *   - 返回顺序即渲染顺序，保证"同一行文字混排"。
 */

export const INLINE_TOKEN = /\{\{(badge|icon|code):([^{}\n]{1,120}?)\}\}/gu
// 保留旧正则导出，实际切分由 scanFences 保留外层 Markdown 代码围栏。
export const BLOCK_FENCE = /^[ \t]{0,3}```(iui|ink-view|html)[ \t]*\r?\n([\s\S]*?)^[ \t]{0,3}```[ \t]*\r?$/gmu

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)(\r?\n|$)/gmu
const TRUSTED_FENCE = /^(iui|ink-view|html)[ \t]*$/u
const BARE_UI = /(?:^|\n)[ \t]*(<ui\b[\s\S]*?<\/ui>)/gu

function scanFences(source) {
  const fences = []
  let open = null
  for (const match of source.matchAll(FENCE_LINE)) {
    const [line, marker, info, newline] = match
    if (open !== null) {
      if (marker[0] === open.marker[0] && marker.length >= open.marker.length && /^[ \t]*$/u.test(info)) {
        open.contentEnd = match.index
        open.end = match.index + line.length - newline.length
        open = null
      }
      continue
    }
    if (marker[0] === '`' && info.includes('`')) continue
    const trusted = marker === '```' && newline !== '' ? TRUSTED_FENCE.exec(info) : null
    open = {
      marker,
      lang: trusted?.[1] ?? null,
      start: match.index,
      contentStart: match.index + line.length,
      contentEnd: null,
      end: null,
    }
    fences.push(open)
  }
  return fences
}

function readInline(kind, payload) {
  if (kind === 'icon') {
    const name = payload.trim()
    return { type: 'icon', props: { name, label: name } }
  }
  if (kind === 'code') return { type: 'code', props: { text: payload } }
  // badge: tone:文本；tone 省略时按 neutral
  const match = /^(neutral|success|warning|danger):([\s\S]+)$/u.exec(payload.trim())
  if (match !== null) return { type: 'badge', props: { tone: match[1], text: match[2].trim() } }
  return { type: 'badge', props: { tone: 'neutral', text: payload.trim() } }
}

/**
 * @param text 模型输出的正文
 * @returns {Array<{kind:'text', text:string} | {kind:'block', raw:string} | {kind:'inline', node:object}>}
 */
export function splitTrustedMarkdown(text) {
  return splitMarkdown(text, true)
}

function pushInlineTokens(text, pushText, parts) {
  if (text === '') return
  INLINE_TOKEN.lastIndex = 0
  let cursor = 0
  let match = INLINE_TOKEN.exec(text)
  while (match !== null) {
    pushText(text.slice(cursor, match.index))
    parts.push({ kind: 'inline', node: readInline(match[1], match[2]) })
    cursor = match.index + match[0].length
    match = INLINE_TOKEN.exec(text)
  }
  pushText(text.slice(cursor))
}

/** 是否含任何受信标记（用于快速路径：没有标记时行为与原生完全一致）。 */
export function hasTrustedMarkup(text) {
  return splitTrustedMarkdown(text).some((part) => part.kind !== 'text')
}

/** 块级专用切分：只按闭合围栏/行首裸 <ui> 分段，行内 token 保持字面量留在文本段里，
 *  交给 fork 层的「先原生渲染后 DOM 嫁接」（跨 token 完整性根修）。
 *  其他语言的代码围栏内的内容一律原样保留，不识别。 */
export function splitTrustedBlocks(text) {
  return splitMarkdown(text, false)
}

function splitMarkdown(text, splitInline) {
  const source = String(text ?? '')
  const parts = []
  const pushText = (value) => {
    if (value === '') return
    const last = parts[parts.length - 1]
    if (last?.kind === 'text') last.text += value
    else parts.push({ kind: 'text', text: value })
  }
  const pushPlainText = splitInline ? (value) => pushInlineTokens(value, pushText, parts) : pushText
  const pushPlain = (plain) => {
    let innerCursor = 0
    for (const bare of plain.matchAll(BARE_UI)) {
      pushPlainText(plain.slice(innerCursor, bare.index))
      parts.push({ kind: 'block', raw: bare[1], lang: 'ml-bare' })
      innerCursor = bare.index + bare[0].length
    }
    pushPlainText(plain.slice(innerCursor))
  }

  let cursor = 0
  for (const fence of scanFences(source)) {
    pushPlain(source.slice(cursor, fence.start))
    if (fence.lang !== null && fence.end !== null) {
      parts.push({ kind: 'block', raw: source.slice(fence.contentStart, fence.contentEnd), lang: fence.lang })
    } else {
      pushText(source.slice(fence.start, fence.end ?? source.length))
    }
    cursor = fence.end ?? source.length
  }
  pushPlain(source.slice(cursor))
  return parts.length === 0 ? [{ kind: 'text', text: source }] : parts
}

/**
 * 流式增量：识别文本尾部未闭合的 iui 围栏。
 * fork 层在每个流式分片后调用：pre 交给原生 Markdown，live 交给 renderBlockStreaming。
 * @returns {{pre: string, live: string, hasOpen: boolean}}
 */
export function splitStreamingFence(text) {
  const source = String(text ?? '')
  const last = scanFences(source).at(-1)
  if (last?.lang !== 'iui' || last.end !== null) return { pre: source, live: '', hasOpen: false }
  return { pre: source.slice(0, last.start), live: source.slice(last.contentStart), hasOpen: true }
}

/**
 * DOM 级行内嫁接（跨 token 完整性根修）：
 * 让原生 Markdown 先渲染完整文本——加粗/斜体/选中复制/阅读顺序跨 token 保留，
 * 再把叶子文本节点里的受信 token 原位替换为组件 DOM。
 * 幂等：嫁接产物带 data-miopiik-graft 标记，重复调用只处理新增文本；
 * code/pre/script/style 内的 token 保持字面（不识别）。
 * @param {Element} root 原生 Markdown 渲染结果的根
 * @param {(kind: 'badge'|'icon'|'code', payload: string) => Element|null} build 组件 DOM 工厂
 * @returns {number} 本次嫁接的 token 数
 */
export function graftTrustedInline(root, build) {
  if (root === null || root === undefined || typeof root.querySelectorAll !== 'function' || typeof build !== 'function') return 0
  if (typeof document === 'undefined' || document === null || typeof document.createDocumentFragment !== 'function') return 0
  let count = 0
  const SKIP = new Set(['CODE', 'PRE', 'SCRIPT', 'STYLE', 'TEXTAREA'])
  const graftText = (textNode) => {
    const text = String(textNode.nodeValue ?? '')
    INLINE_TOKEN.lastIndex = 0
    if (INLINE_TOKEN.exec(text) === null) return
    INLINE_TOKEN.lastIndex = 0
    const frag = document.createDocumentFragment()
    let cursor = 0
    let match = INLINE_TOKEN.exec(text)
    while (match !== null) {
      if (match.index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, match.index)))
      const node = build(match[1], match[2])
      if (node !== null && node !== undefined) {
        if (typeof node.setAttribute === 'function') node.setAttribute('data-miopiik-graft', match[1])
        frag.appendChild(node)
      }
      count += 1
      cursor = INLINE_TOKEN.lastIndex
      match = INLINE_TOKEN.exec(text)
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)))
    if (textNode.parentNode !== null) textNode.parentNode.replaceChild(frag, textNode)
  }
  const walk = (element) => {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) graftText(child)
      else if (child.nodeType === 1 && !SKIP.has(String(child.tagName ?? '').toUpperCase()) && child.getAttribute?.('data-miopiik-graft') === null) walk(child)
    }
  }
  walk(root)
  return count
}
