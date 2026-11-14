# 迁移溯源：MiOpIIk IUI 独立仓库

本文记录 `miopiik-iui` 从 MiOpIIk monorepo 拆分至独立仓库的来源、布局变化与兼容边界。

## 1. 来源

- 来源仓库：<https://github.com/Chillizu/miopiik>（原 monorepo 保留作回滚备份）。
- 来源提交：公开 main `adb12bc`；拆分前本地工作 tip `332fd84`（IUI 围栏容错修复）。
- 提取方式：`git subtree split -P miopiik-iui`，保留 **13 个 IUI 相关提交的历史**（subtree split 会重写提交哈希，原始哈希见来源仓库；split 后新仓库首个提交为 `7fc72ca`）。
- 目录上移：原 `miopiik-iui/` 下的文件上移至仓库根目录，`package.json` 与 `index.js` 同级；包内全部采用相对根路径导入。
- 拆分后补齐至根目录的内容：仓库级 `test/`、`tools/`、`docs/`、CI 工作流与发布元数据（`repository`、`homepage`、`bugs` 指向独立仓库）。
- 不纳入版本控制的生成物与环境目录：`upstream/dsh-client-ui-chat-embeds/`（本地 fork）、`node_modules/`、`.dsh/` 临时目录、设计原稿文件。

## 2. 版本与发布

- 独立仓库当前版本为 `0.1.0-rc.5`（**prerelease**）；stable blocker 清单见 [RELEASE-NOTES.md](RELEASE-NOTES.md)。
- 旧仓库的同名 Release `miopiik-iui-v0.1.0-rc.4` 及其资产、下载链接保持有效。
- 新仓库已发布 `v0.1.0-rc.4` 与 `v0.1.0-rc.5` 两个 prerelease tag，各自附带独立 tarball 与 `SHA256SUMS.txt`。
- 包名保持 `miopiik-iui` 不变。

## 3. 历史数据兼容

- 旧 `ink-view` 协议已退役；历史会话与账本数据零迁移、不删除。IUI 的只读 legacy adapter（`shared/legacy-widgets.js`）在渲染时将历史七 Widget spec 映射为 `iui/1` AST 回放；无法映射的类型保留原始文本（不使用旧 spec 的 `fallback` 字段），且不写回账本。
- 可使用 `tools/dev/legacy-replay-offline.mjs` 对本机真实 DSH 会话日志执行只读回放校验（传入 `~/.dsh/sessions/<workspace-dir>`；该脚本依赖本机会话数据，不纳入 `npm test`）。本机 53 个会话文件的实测统计：5 个会话含旧围栏、共 15 个独立 `ink-view` spec；其中 12 个映射后通过 `validateAst` 零降级，2 个 mermaid 与 1 个占位 `{...}` 非法 JSON 按原始文本保留，0 个生成非法 AST。

## 4. 与原 monorepo 的关系

- 原 monorepo 保持原状，其历史提交、tag、Release 与下载链接均可直接用于回滚。
- MiOpIIk Agent 与 MiOpIIk IUI 两个独立仓库互不依赖，可分别 clone、构建、测试、打包与安装；同装时 IUI 不读取 Agent 账本，也不注册 Agent 工具。
- 后续 IUI 的维护与发布均在本独立仓库进行。

## 5. 自托管：把已有 profile 从 monorepo 布局切到本仓库

若此前通过 `link:` 将 monorepo 的 `miopiik-iui/` 子目录接入 DSH profile，切至本仓库的步骤如下：

1. 备份 profile：`cp -a ~/.dsh/profiles/<profile> ~/.dsh/profiles/<profile>.bak`
2. 修改该 profile 的 `package.json`：`"miopiik-iui": "link:/path/to/miopiik-iui"`，并同步更新 `pnpm-lock.yaml`（或执行 `pnpm install`）。
3. 在本仓库生成并校验 fork：

   ```sh
   MIOPIIK_DSH_DIR=<DSH 安装目录> node tools/fork-chat-embeds.mjs
   node tools/fork-chat-embeds.mjs --check
   ```

4. 仅将该 profile 下的 `@deepseek-ai/dsh-client-ui-chat` 软链指向 `<repo>/upstream/dsh-client-ui-chat-embeds`，保持全局 DSH 安装目录与其他 profile 不变。
5. 确认无运行中任务后重启该 profile 的 DSH，验证插件页、设置页预览、聊天内嵌与历史会话回放。
6. 如需回滚，将软链指回原 fork 与原仓库路径并重启，或按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md) 恢复原 `ui-chat` 软链。

## 6. 回滚

- 代码回滚：切回原 monorepo 对应提交，或使用 Release tarball 重新安装。
- 运行环境回滚：恢复 profile 的 `link:` 与软链后重启 DSH，或在设置页将 IUI 渲染开关关闭（`localStorage["miopiik.markdownEmbeds"] = "0"`）。
