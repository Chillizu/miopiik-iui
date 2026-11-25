#!/usr/bin/env node
/**
 * 生成"Markdown 受信嵌入"实验分支：把已安装的 ui-chat 客户端包复制到本仓库，
 * 只在 AssistantMarkdown 的 text 分支插入一个受控挂钩，其余保持与上游逐字节一致。
 *
 *   node tools/fork-chat-embeds.mjs          # 生成/更新分支（需要真实 DSH 安装）
 *   node tools/fork-chat-embeds.mjs --check  # 只校验分支是否与当前上游一致（只读，CI 用）
 *
 * 宿主位置用 MIOPIIK_DSH_DIR 覆盖，默认基于 os.homedir()；没有 DSH 安装时：
 *   - `--check` 打印明确提示并按"无 fork 即无漂移"退出 0（干净 clone / CI 不会失败）；
 *   - 生成模式直接给出可操作的错误并退出 1。
 *
 * 注意：不修改系统安装目录，不参与运行中服务；`--check` 绝不重建/改写 fork，也不删除
 * 依赖链接。启用需在 profile 配置里把 ui-chat 指向本目录并重启 DSH
 * （见 docs/UPSTREAM-MARKDOWN-EMBED.md）。
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// 输出位置可用环境变量覆盖（相对路径按当前工作目录解析）：回归测试写到临时目录，
// 避免重建正在被服务加载的 fork。
export const forkDir = resolve(process.env.MIOPIIK_FORK_DIR ?? join(root, 'upstream', 'dsh-client-ui-chat-embeds'))
export const patchPath = resolve(process.env.MIOPIIK_FORK_PATCH ?? join(root, 'patches', 'chat-markdown-embeds.patch'))

const MARK_BEGIN = '\t\t// >>> miopiik:markdown-embeds (fork patch; see docs/UPSTREAM-MARKDOWN-EMBED.md)'
const MARK_END = '\t\t// <<< miopiik:markdown-embeds'

/** DSH 安装候选；只基于 os.homedir()/系统前缀，避免把任何用户名写死。 */
const DSH_DIR_CANDIDATES = [
  join(homedir(), '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh'),
  join(homedir(), '.local', 'lib', 'node_modules', '@deepseek-ai', 'dsh'),
  '/usr/local/lib/node_modules/@deepseek-ai/dsh',
  '/usr/lib/node_modules/@deepseek-ai/dsh',
]

/**
 * 解析 DSH 安装目录：MIOPIIK_DSH_DIR 优先，其次探测常见 npm 全局前缀。
 * 返回的路径可能不存在（由调用方决定报错还是降级）。
 */
export function resolveDshDir() {
  if (process.env.MIOPIIK_DSH_DIR !== undefined && process.env.MIOPIIK_DSH_DIR !== '') return process.env.MIOPIIK_DSH_DIR
  for (const candidate of DSH_DIR_CANDIDATES) if (existsSync(join(candidate, 'package.json'))) return candidate
  return DSH_DIR_CANDIDATES[0]
}

export function isDshInstalled(dshDir = resolveDshDir()) {
  return existsSync(join(dshDir, 'package.json'))
}

/**
 * 从 DSH 安装目录解析上游 ui-chat。必须来自安装目录而不是 profile：profile 里可能已有本
 * fork 的覆盖链接，否则会把 fork 当成上游（自我复制）并把依赖根算到仓库里。
 */
export function resolveUpstreamDir(dshDir = resolveDshDir()) {
  if (!isDshInstalled(dshDir)) {
    throw new Error(`未找到 DSH 安装：${dshDir}。生成 fork 需要真实 DSH 安装；请用 MIOPIIK_DSH_DIR 指向它（通常是 npm root -g 下的 @deepseek-ai/dsh）。`)
  }
  let upstream
  try {
    upstream = dirname(createRequire(join(dshDir, 'package.json')).resolve('@deepseek-ai/dsh-client-ui-chat/package.json'))
  } catch (error) {
    throw new Error(`无法从 DSH 安装解析 @deepseek-ai/dsh-client-ui-chat（${error.code ?? error.message}）；请确认 MIOPIIK_DSH_DIR 指向完整的 DSH 安装。`)
  }
  const resolved = resolve(upstream)
  if (resolved.startsWith(root + '/')) {
    throw new Error(`上游解析到了本仓库（${resolved}），请检查 MIOPIIK_DSH_DIR 或 profile 覆盖链接`)
  }
  return resolved
}

export function forkReady() {
  return existsSync(join(forkDir, 'lib', 'client.js'))
}

const HELPER = `${MARK_BEGIN}
		// 能力标记：补丁被加载时置位，IUI 设置页据此显示"补丁已生效"。
		globalThis.__miopiikMarkdownEmbedsHost = true;
		// 安装独立 IUI 后默认启用；显式关闭时才交回原生 Markdown。
		function miopiikEnabled() {
			try {
				if (typeof localStorage !== "undefined" && localStorage.getItem("miopiik.markdownEmbeds") === "0") return false;
				return true;
			} catch {
				return true;
			}
		}
		function miopiikRegistry() {
			const registry = globalThis.__miopiikMarkdownEmbeds;
			return registry !== undefined && typeof registry.renderBlock === "function" ? registry : null;
		}
		// One ordered segment list keeps the open IUI block in place when the fence closes.
		function miopiikBlockSegments(text, streaming) {
			try {
				if (!miopiikEnabled()) return null;
				const registry = miopiikRegistry();
				if (registry === null || typeof registry.segmentsBlocks !== "function") return null;
				const canRecover = typeof registry.renderBlockInterrupted === "function";
				const legacy = !canRecover && streaming && typeof registry.renderBlockStreaming === "function"
					? registry.splitStreamingFence?.(text) : null;
				const parts = registry.segmentsBlocks(legacy?.hasOpen ? legacy.pre : text, { includeOpenIui: canRecover });
				if (!Array.isArray(parts)) return null;
				if (!legacy?.hasOpen) return parts;
				return [...parts.filter(part => part.kind !== "text" || part.text !== ""), { kind: "block", lang: "iui", raw: legacy.live, open: true }];
			} catch {
				return null;
			}
		}
		// 跨 token 完整性根修：原生 Markdown 先渲染完整文本（加粗/选择/阅读顺序保留），
		// 挂载后把叶子文本里的受信 token 原位嫁接（幂等，每个渲染帧执行一次）。
		function MiopiikGraftText(props) {
			const ref = react.useRef(null);
			react.useLayoutEffect(() => {
				// 流式期间 React 每分片重渲，不做 DOM 突变；消息完成后一次性嫁接（稳态安全）。
				if (props.streaming === true || !miopiikEnabled()) return;
				const node = ref.current;
				if (node === null) return;
				const registry = miopiikRegistry();
				if (registry === null || typeof registry.graftInline !== "function") return;
				try {
					registry.graftInline(node);
				} catch {
					// 嫁接失败只影响受信 token 本身，原生文本保持原样
				}
			});
			return (0, react_jsx_runtime.jsx)("div", {
				ref,
				style: { display: "contents" },
				children: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, props)
			});
		}
		function miopiikRenderText(text, markdownProps, key) {
			const props = { ...markdownProps, text };
			if (text.includes("{{") && miopiikEnabled()) {
				try {
					const registry = miopiikRegistry();
					if (typeof registry?.segments === "function" && registry.segments(text).some(part => part.kind === "inline")) {
						return (0, react_jsx_runtime.jsx)(MiopiikGraftText, props, key);
					}
				} catch {
					// 无法识别行内标记时保留原生 Markdown。
				}
			}
			return (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, props, key);
		}
		const MiopiikBlockSegment = (0, react.memo)(function MiopiikBlockSegment({ raw, lang, mode, labels, mentions, pathImages }) {
			const registry = miopiikRegistry();
			try {
				const node = lang === "html" && typeof registry.renderHtmlBlock === "function"
					? registry.renderHtmlBlock(raw)
					: mode === "live" ? registry.renderBlockStreaming?.(raw)
					: mode === "interrupted" ? registry.renderBlockInterrupted?.(raw)
					: registry.renderBlock(raw);
				return node ?? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text: raw, streaming: mode === "live", labels, fileMentions: mentions, pathImages });
			} catch (error) {
				// 局部降级：块渲染失败只影响这一段，交回纯文本
				return (0, react_jsx_runtime.jsx)("span", { "data-miopiik-embed-fallback": String(error && error.message || error) }, raw);
			}
		});
${MARK_END}`

const PATCHED_TEXT_CASE = `\t\t\t\t\tcase "text": {
						const text = block.text;
						const segments = miopiikBlockSegments(text, streaming) ?? [{ kind: "text", text }];
						const markdownProps = { streaming, labels, fileMentions: mentions, pathImages };
						if (segments.length === 1 && segments[0].kind === "text") {
							rendered.push(miopiikRenderText(text, { ...markdownProps, textInteractionSource }, i));
							break;
						}
						const segmentNodes = [];
						let hasLiveBlock = false;
						segments.forEach((part, partIndex) => {
							if (part.kind === "text") {
								if (part.text !== "") segmentNodes.push(miopiikRenderText(part.text, markdownProps, i + ":" + partIndex));
								return;
							}
							const mode = part.open === true ? (streaming === true ? "live" : "interrupted") : undefined;
							if (mode === "live") hasLiveBlock = true;
							// 块组件必须独占整行，不能被外层 flex 压成窄卡片。
							segmentNodes.push((0, react_jsx_runtime.jsx)("div", {
								"data-miopiik-block-wrap": "1",
								style: { width: "100%", flexBasis: "100%", minWidth: 0 },
								children: (0, react_jsx_runtime.jsx)(MiopiikBlockSegment, { raw: part.raw, lang: part.lang, mode, labels, mentions, pathImages })
							}, i + ":" + partIndex + ":block"));
						});
						rendered.push((0, react_jsx_runtime.jsx)("div", {
							"data-miopiik-segments": "block",
							"data-miopiik-stream": hasLiveBlock ? "1" : undefined,
							style: { width: "100%", minWidth: 0 },
							children: segmentNodes
						}, i));
						break;
					}`

/** 用锚点定位 AssistantMarkdown 里的 text 分支，避免依赖具体缩进/换行。 */
function locateTextCase(source) {
  const fnIndex = source.indexOf('const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown(')
  if (fnIndex < 0) throw new Error('找不到 AssistantMarkdown 定义位置')
  const caseIndex = source.indexOf('case "text":', fnIndex)
  if (caseIndex < 0) throw new Error('找不到 AssistantMarkdown 的 text 分支')
  const breakIndex = source.indexOf('break;', caseIndex)
  if (breakIndex < 0) throw new Error('找不到 text 分支的 break')
  return { fnIndex, start: caseIndex, end: breakIndex + 'break;'.length }
}

/**
 * fork 目录是"另一个包"，Node 会从它自己向上找 node_modules；
 * 因此必须链到 DSH 安装的依赖树，否则 lib/index.js 会 ERR_MODULE_NOT_FOUND（如 @deepseek-ai/schemastery）。
 * 这个链接是生成物的一部分：重建 fork 时必须恢复，--check 只校验、不删除。
 */
function dependencyRoot(upstreamDir) {
  return resolve(upstreamDir, '..', '..')
}

function ensureDependencyLink(dir, upstreamDir, { create = true } = {}) {
  const link = join(dir, 'node_modules')
  const target = dependencyRoot(upstreamDir)
  if (create) {
    rmSync(link, { recursive: true, force: true })
    symlinkSync(target, link, 'dir')
  }
  const requireFromFork = createRequire(join(dir, 'lib', 'index.js'))
  const checks = ['@deepseek-ai/schemastery']
  const resolved = {}
  for (const name of checks) {
    try {
      resolved[name] = requireFromFork.resolve(name)
    } catch (error) {
      resolved[name] = `MISSING (${error.code})`
    }
  }
  return { link, target, present: existsSync(link), resolved }
}

function patchSource(source) {
  if (source.includes(MARK_BEGIN)) return { source, alreadyPatched: true }
  const { fnIndex, start, end } = locateTextCase(source)
  let next = source.slice(0, start) + PATCHED_TEXT_CASE.trim() + source.slice(end)
  const anchorAt = next.indexOf('const AssistantMarkdown = (0, react.memo)(function AssistantMarkdown(')
  if (anchorAt < 0) throw new Error('找不到 AssistantMarkdown 定义位置')
  next = next.slice(0, anchorAt) + HELPER + '\n' + next.slice(anchorAt)
  void fnIndex
  return { source: next, alreadyPatched: false }
}

export function build(upstreamDir = resolveUpstreamDir()) {
  const upstream = readFileSync(join(upstreamDir, 'lib', 'client.js'), 'utf8')
  const { source: patched, alreadyPatched } = patchSource(upstream)
  rmSync(forkDir, { recursive: true, force: true })
  mkdirSync(forkDir, { recursive: true })
  cpSync(upstreamDir, forkDir, { recursive: true })
  writeFileSync(join(forkDir, 'lib', 'client.js'), patched, 'utf8')
  // 语法自检（浏览器侧是普通 CommonJS 包装，node --check 可验语法）
  execFileSync(process.execPath, ['--check', join(forkDir, 'lib', 'client.js')], { stdio: 'pipe' })
  const deps = ensureDependencyLink(forkDir, upstreamDir)
  if (Object.values(deps.resolved).some((value) => value.startsWith('MISSING'))) {
    throw new Error(`fork 依赖解析失败：${JSON.stringify(deps.resolved)}（检查 ${deps.target} 是否存在）`)
  }

  // diff 在有差异时退出码为 1，属正常，不能被当成失败
  let diff = ''
  try {
    diff = execFileSync('diff', ['-u', '--label', 'a/upstream/lib/client.js', '--label', 'b/upstream/lib/client.js', join(upstreamDir, 'lib', 'client.js'), join(forkDir, 'lib', 'client.js')], { encoding: 'utf8' })
  } catch (error) {
    diff = String(error.stdout ?? '')
  }
  mkdirSync(dirname(patchPath), { recursive: true })
  writeFileSync(patchPath, diff, 'utf8')
  return { alreadyPatched, patchBytes: diff.length, patchPath, dependencies: deps, upstreamDir }
}

/**
 * --check：只读校验。任何分支都不创建、不删除、不改写文件；
 * 缺少 DSH 安装或 fork 时按"无 fork 即无漂移"通过并给出明确提示。
 */
export function check() {
  const dshDir = resolveDshDir()
  if (!isDshInstalled(dshDir)) {
    console.log(`未找到 DSH 安装（${dshDir}）。没有宿主就没有 generated fork，也就没有可校验的漂移；--check 通过。可用 MIOPIIK_DSH_DIR 指向真实 DSH 安装。`)
    return { ok: true, mode: 'no-dsh', dshDir }
  }
  if (!forkReady()) {
    console.log(`未找到 fork（${forkDir}；生成物、不入库），无 fork 即无漂移；--check 通过。需要内联渲染时再运行 node tools/fork-chat-embeds.mjs。`)
    return { ok: true, mode: 'no-fork' }
  }
  const upstreamDir = resolveUpstreamDir(dshDir)
  const upstream = readFileSync(join(upstreamDir, 'lib', 'client.js'), 'utf8')
  const { source } = patchSource(upstream)
  const current = readFileSync(join(forkDir, 'lib', 'client.js'), 'utf8')
  // 只读校验：绝不创建/删除任何东西（尤其是正在被服务加载的 fork 与其依赖链接）
  const deps = ensureDependencyLink(forkDir, upstreamDir, { create: false })
  const problems = []
  if (current !== source) problems.push('分支与上游/补丁不一致，请运行 node tools/fork-chat-embeds.mjs')
  if (deps.present !== true) problems.push('fork 缺少 node_modules 依赖链接，请重新生成')
  if (Object.values(deps.resolved).some((value) => value.startsWith('MISSING'))) problems.push('fork 依赖解析失败')
  if (problems.length > 0) {
    console.error(problems.join('；'))
    return { ok: false, mode: 'drift', problems }
  }
  console.log('分支一致')
  return { ok: true, mode: 'in-sync' }
}

function main() {
  if (process.argv.includes('--check')) {
    if (!check().ok) process.exitCode = 1
    return
  }
  const dshDir = resolveDshDir()
  if (!isDshInstalled(dshDir)) {
    console.error(`生成 fork 需要真实 DSH 安装，但未找到：${dshDir}`)
    console.error('请用 MIOPIIK_DSH_DIR 指向 DSH 安装目录（通常是 `npm root -g`/@deepseek-ai/dsh），或先安装 DSH。')
    process.exitCode = 1
    return
  }
  const upstreamDir = resolveUpstreamDir(dshDir)
  const result = build(upstreamDir)
  console.log(JSON.stringify({ ...result, forkDir }, null, 2))
}

const invokedDirectly = process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedDirectly) main()
