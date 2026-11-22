# MiOpIIk IUI — 支持矩阵

本文描述独立包 **MiOpIIk IUI**（`miopiik-iui`）的兼容范围与运行要求。MiOpIIk Agent（`miopiik-dsh`）位于另一独立仓库，两者互不依赖。

| 项 | MiOpIIk IUI |
|---|---|
| 包名 | `miopiik-iui` |
| 当前版本 | `0.1.0-rc.13`（prerelease / 预发布） |
| 包类型 | 独立可安装的 DSH Web 插件包（零第三方运行时依赖） |
| 依赖另一个包 | 否：可单装（仅提供 IUI 表现层），也可与 MiOpIIk Agent 同装 |
| Tarball 安装 | 支持（由 `npm run check` 执行真实打包并校验 import 图） |
| 运行中 profile 安装 | 安装后需重启该 profile 的 DSH 进程生效；安装脚本默认 dry-run，拒绝在未确认时写入 `web` profile |
| DSH 测试基线 | `0.2.2-rc.1` |
| Node | `>= 23.6` |
| 平台 | web（DSH Web GUI）；仅 web profile |
| 宿主补丁依赖 | **聊天内联渲染需要实验性 chat 包补丁**（见下方说明）；未加载补丁时仅插件页与设置页预览可用 |
| 数据写入 | 不写会话日志或工作区文件；仅在浏览器 `localStorage` 保存一个渲染开关偏好 |
| 退场方式 | 从 profile 移除插件；若挂载过本地 fork，按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 恢复 profile 的 `ui-chat` 软链并重启 DSH |

## 聊天内联渲染的宿主补丁条件

IUI 的聊天内嵌渲染依赖对 `@deepseek-ai/dsh-client-ui-chat` 的**非官方、版本耦合的实验性 chat 包补丁**（见 `patches/chat-markdown-embeds.patch` 与 `tools/fork-chat-embeds.mjs`）。这也是当前版本保持 `0.1.0-rc.13`（prerelease）的首要 blocker。未加载该补丁时：

- 插件页、设置页、示例复制与状态诊断均可正常使用；
- 聊天中的 `iui` 围栏按普通 Markdown 代码块显示，行内 token 按字面文本显示；
- 设置页诊断显式报告「未检测到补丁 · 仅设置页预览可用」。

生成本地 fork 需读取已安装的 DSH 目录（可通过 `MIOPIIK_DSH_DIR` 指定）；在无 DSH 安装或未生成 fork 的环境中，`node tools/fork-chat-embeds.mjs --check` 会跳过比对并以状态码 `0` 退出。请仅在目标服务未加载该目录时生成或更新 fork，详见 [DEV-TOOLS.md](DEV-TOOLS.md)。

## 已知限制（含 stable blocker）

1. **非官方、版本耦合的 `@deepseek-ai/dsh-client-ui-chat` patch**：DSH 升级后若 `AssistantMarkdown` 结构变化，需重新运行 `tools/fork-chat-embeds.mjs` 生成 fork。
2. **无多版本矩阵**：当前仅在 DSH `0.2.2-rc.1` 基线上验证，尚未覆盖跨多个 DSH 版本的兼容测试矩阵。
3. **旧 `ink-view` 只读回放**：旧协议已退役；历史数据零迁移，由 IUI 只读 adapter 回放，无法映射的 spec 保留原始文本（不使用旧 spec 的 `fallback` 字段），且不写回账本。

### 已在 `0.1.0-rc.12` 解除（保留记录与残余边界）

- **跨 token Markdown 有损** → DOM 级嫁接：原生 Markdown 先把整段渲染完成，再在叶子文本节点里原位替换行内 token（`splitTrustedBlocks` + `graftTrustedInline`）。加粗/斜体、选中复制与朗读顺序跨 token 保留；残余：嫁接只在流式定稿态执行，消息中的表格内 token 不嫁接，极端长段落性能未压测。
- **流式非增量** → 围栏级增量：未闭合的 `iui` 围栏由 `splitStreamingFence` 切成"已定稿文本 + 活动块"，活动块随分片逐段成形，闭合后定稿且不加入场动画。残余：`html` 沙箱围栏按设计不参与流式（闭合才成块）。

