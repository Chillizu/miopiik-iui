# 开发 / 验收脚本说明

`npm test` 只跑离线单元测试与结构检查，**不需要** DSH 安装、运行中的 Web 服务、
Playwright、真实会话日志或 Chromium。本文列出的脚本属于本地开发 / 验收工具，
需要真实 DSH 环境，**不接入 `npm test` / CI**。

## 1. 自检命令（干净 clone 可直接跑）

```sh
npm test                 # node --test
npm run check            # node tools/check-release.mjs（真实 npm pack + 解包校验，JSON 报告）
npm run build:check      # node tools/build.mjs --check（生成物 client.js 是否同步）
npm run icon:check       # node tools/icon-check.mjs（根 icon.svg 静态检查）
```

`test/browser/renderer.browser.test.js` 在找到 Chromium 时会真实渲染；没有 Chromium 时
`test.skip`，不硬失败。fork 生成、真实回放、profile 安装等宿主相关验证全部在下面的
dev 脚本里。

## 2. 环境变量（默认值只基于 `os.homedir()`）

| 变量 | 用途 | 默认 |
|---|---|---|
| `MIOPIIK_DSH_HOME` | DSH 用户目录 | `~/.dsh` |
| `MIOPIIK_DSH_DIR` | DSH 安装根（解析上游 `dsh-client-ui-chat`） | 依次探测 `~/.npm-global/lib/node_modules/@deepseek-ai/dsh` 等常见 npm 全局前缀 |
| `MIOPIIK_PROFILE_NODE_MODULES` | profile 依赖目录（Playwright 等） | `$MIOPIIK_DSH_HOME/profiles/web/node_modules` |
| `MIOPIIK_DSH_SESSIONS_DIR` | 某个 workspace 的真实会话目录 | `$MIOPIIK_DSH_HOME/sessions`（bench/回放脚本通常要显式指向 `.../sessions/<workspace-dir>`） |
| `MIOPIIK_CHROMIUM` / `CHROMIUM_PATH` | 本地 Chromium 可执行文件 | `/usr/bin/chromium` |
| `MIOPIIK_DSH_BASE_URL` | 本地 DSH Web 地址 | `http://127.0.0.1:3080` |
| `DSH_BIN` | `install-plugin.mjs` 调用的 `dsh` 可执行文件 | `dsh`（PATH 中） |
| `MIOPIIK_ICON_ORIGINAL` | 用户设计原稿路径（只读逐字节比对） | `~/Downloads/DSH Plugin icons/Organized/IUI.svg`（不存在则跳过比对） |

## 3. fork 补丁生成器

`tools/fork-chat-embeds.mjs`（聊天内联渲染的实验性宿主 fork）：

```sh
node tools/fork-chat-embeds.mjs --check   # 只读校验；不重建、不删除任何东西
node tools/fork-chat-embeds.mjs           # 生成/更新 fork（需要真实 DSH 安装）
```

- `--check` 在无 DSH 安装或未生成 fork 时打印明确提示，并按“无 fork 即无漂移”退出 0；
  干净 clone / CI 不会失败。
- 生成模式才要求宿主；没有 DSH 安装会给出可操作的错误（用 `MIOPIIK_DSH_DIR` 指向安装目录）。
- **不要重建正在被运行中服务加载的 fork**。生成会先删除再复制 fork 目录及其依赖链接；
  需要更新时先确认无 DSH 任务运行、备份 profile 覆盖链接，并按
  [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 的步骤安全重启。
- 生成位置可用 `MIOPIIK_FORK_DIR` / `MIOPIIK_FORK_PATCH` 覆盖到临时目录（回归测试即如此），
  避免触碰运行中的 fork。

## 4. 真实环境脚本（需要本地 DSH Web + Playwright）

以下脚本从 profile 的 `node_modules` 载入 Playwright，登录 token 从本机 `dsh-web`
服务日志读取；只读回放、隔离浏览器，**不向既有主会话发送模型消息**。
完整前置条件与安全约束见 [IUI-V1-RELEASE-CANDIDATE.md](IUI-V1-RELEASE-CANDIDATE.md)。

| 脚本 | 用途 |
|---|---|
| `tools/e2e-playwright.mjs` | 独立 IUI 设置页 + 原生预览 + 浏览器偏好 |
| `tools/e2e-gallery-replay.mjs` | 真实画廊会话只读回放 + 本地状态切换 + 原生思考折叠 |
| `tools/e2e-legacy-replay.mjs` | 含旧 `ink-view` 的历史会话只读回放（legacy adapter） |
| `tools/e2e-iui-user-sessions.mjs` | 两条用户授权真实会话的只读回放 |
| `tools/e2e-iui-model.mjs` | 在新建空会话里验证模型按 `iui` 围栏输出 |
| `tools/e2e-dual-settings.mjs` | Agent + IUI 双装时的插件页冒烟（需要 MiOpIIk Agent 已安装） |
| `tools/e2e-iui.mjs` | 早期 IUI 冒烟脚本（保留作历史参考） |

`tools/bench-formats.mjs` / `tools/analyze-bench.mjs` 做真实模型输出格式 benchmark，
需要 `MIOPIIK_DSH_SESSIONS_DIR` 指向真实 workspace 会话目录，且会新建会话发送测试提示词；
只在明确的测试环境使用。

## 5. 离线历史回放校验

```sh
node tools/dev/legacy-replay-offline.mjs ~/.dsh/sessions/<workspace-dir>
```

只读解压 `*.jsonl.zstd`，找出历史 ```ink-view 围栏，经 `shared/markdown-segments.js` +
`shared/legacy-widgets.js` + `shared/iui-ast.js` 映射与校验，输出统计 JSON。不写任何文件，
不需要运行中的 DSH；缺少参数时退出码 2。真实数据只在本机，因此不属于 `npm test`。
