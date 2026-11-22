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
// 新主路径是 ```iui；```html 是无脚本沙箱文档通道（F-42）；```ink-view 只为历史消息保留只读兼容。
// 收尾围栏必须独占一行（≤3 空格缩进）：否则围栏内容里行内的 ```（例如示例代码、表格里的
// "```html" 字样）会把文档当场腰斩，前半截进沙箱帧、后半截漏成聊天正文（rc.13 实测翻车）。
export const BLOCK_FENCE = /^[ \t]{0,3}```(iui|ink-view|html)[ \t]*\r?\n([\s\S]*?)^[ \t]{0,3}```[ \t]*\r?$/gmu

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
  const source = String(text ?? '')
  const parts = []
  const pushText = (value) => {
    if (value !== '') parts.push({ kind: 'text', text: value })
  }
  let cursor = 0
  // 先切块级围栏，再在每段普通文本里切行内 token
  BLOCK_FENCE.lastIndex = 0
  let fence = BLOCK_FENCE.exec(source)
  while (fence !== null) {
    pushTrustedInline(source.slice(cursor, fence.index), pushText, parts)
    parts.push({ kind: 'block', raw: fence[2], lang: fence[1] })
    cursor = fence.index + fence[0].length
    fence = BLOCK_FENCE.exec(source)
  }
  pushTrustedInline(source.slice(cursor), pushText, parts)
  return parts.length === 0 ? [{ kind: 'text', text: source }] : parts
}

/** 其他语言的代码围栏：里面的内容一律原样保留，不识别 UI/行内标记。 */
const CODE_FENCE = /```[A-Za-z0-9_-]*[ \t]*\r?\n[\s\S]*?```/gu
/** 行首独立出现的顶层 <ui>…</ui>：模型偶尔忘了写围栏，仍按受控 ML 处理。 */
const BARE_UI = /(?:^|\n)[ \t]*(<ui\b[\s\S]*?<\/ui>)/gu

function pushTrustedInline(text, pushText, parts) {
  if (text === '') return
  let cursor = 0
  const handlePlain = (plain) => {
    BARE_UI.lastIndex = 0
    let bare = BARE_UI.exec(plain)
    let innerCursor = 0
    while (bare !== null) {
      pushInlineTokens(plain.slice(innerCursor, bare.index), pushText, parts)
      // 保留块前必要的换行，避免把上一段文字粘到块里
      parts.push({ kind: 'block', raw: bare[1], lang: 'ml-bare' })
      innerCursor = bare.index + bare[0].length
      bare = BARE_UI.exec(plain)
    }
    pushInlineTokens(plain.slice(innerCursor), pushText, parts)
  }
  CODE_FENCE.lastIndex = 0
  let fence = CODE_FENCE.exec(text)
  while (fence !== null) {
    handlePlain(text.slice(cursor, fence.index))
    pushText(fence[0])
    cursor = fence.index + fence[0].length
    fence = CODE_FENCE.exec(text)
  }
  handlePlain(text.slice(cursor))
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
  const source = String(text ?? '')
  BLOCK_FENCE.lastIndex = 0
  if (BLOCK_FENCE.test(source)) return true
  INLINE_TOKEN.lastIndex = 0
  return INLINE_TOKEN.test(source)
}

/** 块级专用切分：只按闭合围栏/行首裸 <ui> 分段，行内 token 保持字面量留在文本段里，
 *  交给 fork 层的「先原生渲染后 DOM 嫁接」（跨 token 完整性根修）。
 *  其他语言的代码围栏内的内容一律原样保留，不识别。 */
export function splitTrustedBlocks(text) {
  const source = String(text ?? '')
  const parts = []
  const pushText = (value) => {
    if (value !== '') parts.push({ kind: 'text', text: value })
  }
  const pushBareBlocks = (plain) => {
    BARE_UI.lastIndex = 0
    let bare = BARE_UI.exec(plain)
    let innerCursor = 0
    while (bare !== null) {
      pushText(plain.slice(innerCursor, bare.index))
      parts.push({ kind: 'block', raw: bare[1], lang: 'ml-bare' })
      innerCursor = bare.index + bare[0].length
      bare = BARE_UI.exec(plain)
    }
    pushText(plain.slice(innerCursor))
  }
  const handlePlain = (plain) => {
    CODE_FENCE.lastIndex = 0
    let fence = CODE_FENCE.exec(plain)
    let innerCursor = 0
    while (fence !== null) {
      pushBareBlocks(plain.slice(innerCursor, fence.index))
      pushText(fence[0])
      innerCursor = fence.index + fence[0].length
      fence = CODE_FENCE.exec(plain)
    }
    pushBareBlocks(plain.slice(innerCursor))
  }
  let cursor = 0
  BLOCK_FENCE.lastIndex = 0
  let fence = BLOCK_FENCE.exec(source)
  while (fence !== null) {
    handlePlain(source.slice(cursor, fence.index))
    parts.push({ kind: 'block', raw: fence[2], lang: fence[1] })
    cursor = fence.index + fence[0].length
    fence = BLOCK_FENCE.exec(source)
  }
  handlePlain(source.slice(cursor))
  return parts.length === 0 ? [{ kind: 'text', text: source }] : parts
}

/**
 * 流式增量：识别文本尾部未闭合的 iui 围栏。
 * fork 层在每个流式分片后调用：pre 交给原生 Markdown，live 交给 renderBlockStreaming。
 * @returns {{pre: string, live: string, hasOpen: boolean}}
 */
export function splitStreamingFence(text) {
  const source = String(text ?? '')
  const starts = [...source.matchAll(/^[ \t]{0,3}```iui[ \t]*\r?\n/gmu)]
  if (starts.length === 0) return { pre: source, live: '', hasOpen: false }
  const last = starts[starts.length - 1]
  const contentStart = last.index + last[0].length
  const tail = source.slice(contentStart)
  // 收尾与块级切分同规则：独占一行才算闭合，行内 ``` 不结束围栏。
  if (/^[ \t]{0,3}```[ \t]*\r?$/mu.test(tail)) return { pre: source, live: '', hasOpen: false }
  return { pre: source.slice(0, last.index), live: tail, hasOpen: true }
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
