# 开发 / 验收脚本说明

`npm test` 仅执行离线单元测试与结构检查，无需安装 DSH、启动 Web 服务、准备真实会话日志或安装 Playwright。本文列出的开发与端到端验收脚本需配合本机真实 DSH 环境运行，不纳入 `npm test` 与 CI。

## 1. 离线自检命令（干净 clone 可直接执行）

```sh
npm test                 # node --test
npm run check            # node tools/check-release.mjs（真实 npm pack + 解包校验，输出 JSON 报告）
npm run build:check      # node tools/build.mjs --check（校验生成物 client.js 与源码同步）
npm run icon:check       # node tools/icon-check.mjs（根 icon.svg 静态检查）
```

`test/browser/renderer.browser.test.js` 在本机存在 Chromium 时执行真实 DOM 渲染断言；未安装 Chromium 时自动 `test.skip`。

## 2. 环境变量（默认值基于 `os.homedir()`）

| 变量 | 用途 | 默认 |
|---|---|---|
| `MIOPIIK_DSH_HOME` | DSH 用户目录 | `~/.dsh` |
| `MIOPIIK_DSH_DIR` | DSH 安装根目录（用于读取上游 `dsh-client-ui-chat`） | 依次探测 `~/.npm-global/lib/node_modules/@deepseek-ai/dsh` 等常见全局 npm 前缀 |
| `MIOPIIK_PROFILE_NODE_MODULES` | profile 依赖目录（用于加载 Playwright 等） | `$MIOPIIK_DSH_HOME/profiles/web/node_modules` |
| `MIOPIIK_DSH_SESSIONS_DIR` | 工作区的会话日志目录 | `$MIOPIIK_DSH_HOME/sessions`（回放或 benchmark 脚本通常需指向具体的 `.../sessions/<workspace-dir>`） |
| `MIOPIIK_CHROMIUM` / `CHROMIUM_PATH` | 本地 Chromium 可执行文件路径 | `/usr/bin/chromium` |
| `MIOPIIK_DSH_BASE_URL` | 本地 DSH Web 地址 | `http://127.0.0.1:3080` |
| `DSH_BIN` | `install-plugin.mjs` 调用的 `dsh` 可执行文件 | `dsh`（从 `PATH` 解析） |
| `MIOPIIK_ICON_ORIGINAL` | 设计原稿路径（用于只读逐字节比对） | `~/Downloads/DSH Plugin icons/Organized/IUI.svg`（不存在时跳过比对） |

## 3. fork 补丁生成器

`tools/fork-chat-embeds.mjs` 用于生成聊天内联渲染所需的本地 `ui-chat` fork：

```sh
node tools/fork-chat-embeds.mjs --check   # 只读校验，不创建或删除任何文件
node tools/fork-chat-embeds.mjs           # 生成或更新 fork（需已安装 DSH）
```

- `--check` 在无 DSH 安装或尚未生成 fork 的环境中打印提示并以退出码 `0` 结束。
- 生成模式需要可解析的 DSH 安装目录（找不到时可通过 `MIOPIIK_DSH_DIR` 指定）。
- 生成模式会先清理再重建目标 fork 目录及其 `node_modules` 软链；请仅在无运行中任务加载该目录时执行更新，并按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 的步骤备份与重启。
- 可通过 `MIOPIIK_FORK_DIR` 与 `MIOPIIK_FORK_PATCH` 将生成目标指向临时目录（单测即采用此方式隔离）。

## 4. 本地端到端验收脚本（需运行中的 DSH Web + Playwright）

以下脚本从 profile 的 `node_modules` 加载 Playwright，从本机 `dsh-web` 日志读取登录 token，在隔离浏览器上下文中执行验证，且不会向既有主会话发送测试消息。前置条件见 [IUI-V1-RELEASE-CANDIDATE.md](IUI-V1-RELEASE-CANDIDATE.md)。

| 脚本 | 用途 |
|---|---|
| `tools/e2e-playwright.mjs` | 验证独立 IUI 插件页、设置页、实时预览与浏览器本地开关 |
| `tools/e2e-gallery-replay.mjs` | 只读回放画廊会话，验证三展区渲染、本地状态切换与原生思考折叠 |
| `tools/e2e-legacy-replay.mjs` | 只读回放包含旧 `ink-view` 围栏的历史会话（验证 legacy adapter） |
| `tools/e2e-iui-user-sessions.mjs` | 只读回放两条授权会话并验证全宽排版 |
| `tools/e2e-iui-model.mjs` | 在新建独立空会话中验证模型输出 `iui` 围栏 |
| `tools/e2e-dual-settings.mjs` | 验证 Agent 与 IUI 双插件同装时的插件页与设置页 |
| `tools/e2e-iui.mjs` | 早期 IUI 冒烟脚本（历史归档） |

`tools/bench-formats.mjs` 与 `tools/analyze-bench.mjs` 用于对比模型输出格式（需将 `MIOPIIK_DSH_SESSIONS_DIR` 指向目标工作区会话目录，并在新建测试会话中运行）。

## 5. 离线历史会话回放统计

```sh
node tools/dev/legacy-replay-offline.mjs ~/.dsh/sessions/<workspace-dir>
```

该脚本只读解压指定目录下的 `*.jsonl.zstd` 会话日志，提取历史 ```ink-view 围栏，依次通过 `shared/markdown-segments.js`、`shared/legacy-widgets.js` 与 `shared/iui-ast.js` 执行只读映射与校验，并输出统计 JSON。脚本不修改任何文件，也不依赖运行中的 DSH 服务。
