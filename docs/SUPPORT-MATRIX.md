# MiOpIIk IUI — 支持矩阵

本文只描述独立包 **MiOpIIk IUI**。MiOpIIk Agent 是另一个独立包（`miopiik-dsh`），
两者可同装、互不依赖；本表不把 Agent 的能力或版本混进 IUI。

| 项 | MiOpIIk IUI |
|---|---|
| 包名 | `miopiik-iui` |
| 当前版本 | `0.1.0-rc.4`（prerelease / 预发布，不是 stable） |
| 包类型 | 独立可安装的 DSH Web 插件包（零运行时依赖） |
| 依赖另一个包 | 否。可与 MiOpIIk Agent 同装，也可单装（单装时只有 IUI 表现层，没有 Mind/Ink/Operator） |
| Tarball 安装 | 支持（`npm run check` 会真实打包并校验 import 图） |
| 运行中 profile 安装 | 支持，但**需重启该 profile 的 DSH** 后生效；安装脚本默认 dry-run，拒绝未确认写 `web` |
| DSH 测试基线 | `0.2.1-rc.5` |
| Node | `>= 23.6` |
| 平台 | web（DSH Web GUI） |
| 宿主补丁依赖 | **聊天内联渲染需要实验性 chat 包补丁**（见下方“额外条件”）；未打补丁时仅设置页预览可用 |
| 数据写入 | 不写任何会话日志或图表目录；浏览器 `localStorage` 只保存一个渲染偏好 |
| 退场方式 | 卸载插件包；如打过 fork，按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 恢复 profile 的 `ui-chat` 解析并安全重启 |

## IUI 的“内联渲染”额外条件

IUI 的聊天内嵌能力依赖对 `@deepseek-ai/dsh-client-ui-chat` 的**实验性 chat 包补丁**
（见包内 `patches/chat-markdown-embeds.patch` 与 `tools/fork-chat-embeds.mjs`）。
这是**非官方支持的安装方式**，因此 IUI 保持 rc；未打补丁时：

- 设置页、示例、复制、诊断全部可用；
- 聊天里的 `iui` 围栏按普通 Markdown 代码块显示（不报错、不吞正文）；
- 设置页诊断会显式显示“未检测到补丁 · 仅设置页预览可用”。

生成 fork 需要真实 DSH 安装：`tools/fork-chat-embeds.mjs` 可用 `MIOPIIK_DSH_DIR` 覆盖宿主
位置；无宿主时 `--check` 按“无 fork 即无漂移”通过。**不要重建正在被服务加载的 fork**，
详见 [DEV-TOOLS.md](DEV-TOOLS.md)。

## 已知限制

- 行内标记跨 Markdown 语法（如跨越 `**加粗**`）时会在标记处断开，复制可能带出额外换行。
- 流式期间未闭合的 `iui` 围栏按原文显示，闭合后一次性物化。
- 旋转/缩放后的主题切换依赖 DSH 刷新；插件不主动改宿主主题。
- 历史 `ink-view` 内容只读回放；无法映射的类型保留原始文本显示（当前渲染路径不使用旧 spec 的 `fallback` 字段）；不承诺继续渲染旧 Widget。
