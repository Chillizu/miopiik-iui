#!/usr/bin/env node
/**
 * 开发 / 验收脚本的本地环境解析。
 *
 * 这些脚本需要**真实 DSH 环境**（已安装的 DSH、登录中的本地 Web 服务、Playwright、
 * 真实会话日志），因此不属于 `npm test`，也不会在干净 clone 里自动运行。
 * 所有路径都可以用环境变量覆盖；默认值只基于 `os.homedir()`，不绑定任何用户名：
 *
 *   MIOPIIK_DSH_HOME               DSH 用户目录（默认 ~/.dsh）
 *   MIOPIIK_DSH_DIR                DSH 安装根（默认 ~/.npm-global/lib/node_modules/@deepseek-ai/dsh）
 *   MIOPIIK_PROFILE_NODE_MODULES   profile 依赖目录（默认 $MIOPIIK_DSH_HOME/profiles/web/node_modules）
 *   MIOPIIK_DSH_SESSIONS_DIR       某个 workspace 的会话目录
 *                                  （默认 $MIOPIIK_DSH_HOME/sessions；bench 脚本通常需要
 *                                   显式指向 ~/.dsh/sessions/<workspace-dir>）
 *   MIOPIIK_CHROMIUM               本地 Chromium 可执行文件（默认 /usr/bin/chromium）
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DSH_HOME = process.env.MIOPIIK_DSH_HOME ?? join(homedir(), '.dsh')
export const DSH_DIR = process.env.MIOPIIK_DSH_DIR ?? join(homedir(), '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh')
export const PROFILE_NODE_MODULES = process.env.MIOPIIK_PROFILE_NODE_MODULES ?? join(DSH_HOME, 'profiles', 'web', 'node_modules')
export const DSH_SESSIONS_DIR = process.env.MIOPIIK_DSH_SESSIONS_DIR ?? join(DSH_HOME, 'sessions')
export const CHROMIUM = process.env.MIOPIIK_CHROMIUM ?? process.env.CHROMIUM_PATH ?? '/usr/bin/chromium'

export const BASE_URL = process.env.MIOPIIK_DSH_BASE_URL ?? 'http://127.0.0.1:3080'

/** 从 profile 的依赖目录 require（Playwright 等宿主侧依赖只在那里）。 */
export function fromProfile() {
  return createRequire(join(PROFILE_NODE_MODULES, 'index.cjs'))
}

/** 载入 Playwright；缺失时抛出带修复提示的错误，而不是在脚本中途崩溃。 */
export function loadPlaywright() {
  try {
    return fromProfile()('playwright')
  } catch (error) {
    throw new Error(
      `无法从 ${PROFILE_NODE_MODULES} 载入 playwright（${error.code ?? error.message}）。`
      + '这些脚本属于本地 E2E，需在装好 DSH profile 依赖的开发机上运行；'
      + '可用 MIOPIIK_PROFILE_NODE_MODULES 指向正确的 node_modules。',
    )
  }
}

/** 会话目录必须是真实存在的 workspace 目录（bench 脚本需要显式覆盖）。 */
export function requireSessionsDir() {
  if (existsSync(DSH_SESSIONS_DIR)) return DSH_SESSIONS_DIR
  throw new Error(
    `会话目录不存在：${DSH_SESSIONS_DIR}。请用 MIOPIIK_DSH_SESSIONS_DIR 指向 `
    + '~/.dsh/sessions/<workspace-dir>（真实会话日志只在本机存在，不属于 npm test）。',
  )
}
