# 迁移溯源：MiOpIIk IUI 独立仓库

本文记录 `miopiik-iui` 从 MiOpIIk monorepo 拆分到独立仓库的真实来源与边界。

## 1. 来源

- 来源仓库：<https://github.com/Chillizu/miopiik>（旧 monorepo，**原样保留作回滚**）。
- 来源提交：公开 main `adb12bc`；拆分前本地工作 tip `332fd84`（IUI 围栏容错修复，当时尚未 push）。
- 提取方式：`git subtree split -P miopiik-iui`，保留 **13 个 IUI 相关提交的真实历史**。
  split 会重写提交哈希，原始哈希请回来源仓库查看；split 后新仓库首个提交为 `7fc72ca`。
- 目录上移：原 `miopiik-iui/` 的内容上移到仓库根，`package.json` 与 `index.js` 同级；
  包内 import 一律相对根，不再出现 `miopiik-iui/`、`miopiik-dsh/` 这类 monorepo 前缀路径。
- 拆分后补到根的内容：仓库级 `test/`、`tools/`、`docs/`、CI 与发布元数据
  （`repository` / `homepage` / `bugs` 指向新仓库）。
- 不随仓库分发：`upstream/dsh-client-ui-chat-embeds/`（fork，`.gitignore` 生成物）、
  `node_modules/`、`.dsh/` 临时产物、用户设计原稿。

## 2. 版本与发布

- 独立仓库当前版本 `0.1.0-rc.4`，**prerelease**；stable blocker 见
  [RELEASE-NOTES.md](RELEASE-NOTES.md)。
- 旧仓库的同名 Release `miopiik-iui-v0.1.0-rc.4` 及其资产、下载链接**继续有效**，不删除、不改写。
- 新仓库将另行发布 tag `v0.1.0-rc.4` 的 prerelease；历史 tag/Release 不重写、不 force-push。
- 包名不变（`miopiik-iui`），已安装用户的升级路径不受影响。

## 3. 历史数据兼容

- 旧会话与 `ink-view` JSONL/账本**不迁移、不删除**；IUI 的只读 legacy adapter
  (`shared/legacy-widgets.js`) 在渲染层把历史七 Widget spec 映射成 `iui/1` AST 后回放，
  映射不了的类型按原始文本保留显示（当前渲染路径不使用旧 spec 的 `fallback` 字段）。
- 可用 `tools/dev/legacy-replay-offline.mjs` 对真实 DSH 会话日志做只读回放校验
  （参数为 `~/.dsh/sessions/<workspace-dir>`）；它**不属于 npm test**（需要真实会话数据）。
  本机样本（**非永久承诺**）：53 个 session 文件、5 个含旧围栏、15 个独立 `ink-view` spec；
  12 个映射后通过 `validateAst` 零降级，2 个 mermaid 按原始文本降级（预期），
  1 个占位 `{...}` 非法 JSON 按文本降级（预期），0 个非法 AST。

## 4. 与旧 monorepo 的关系

- 旧 monorepo 保持不动，可随时回滚；其历史提交、tag、Release 与下载链接保持有效。
- 两个独立仓库（Agent / IUI）互不依赖，可分别 clone / build / test / pack / 安装；
  IUI 可与 MiOpIIk Agent 同装，但不读取 Agent 的日志、不注册 Agent 的工具。
- 旧 monorepo 的 `miopiik-iui/` 目录不再作为开发主线；后续修复在独立仓库进行。

## 5. 回滚

- 代码回滚：切回旧 monorepo 对应的历史提交即可。
- 运行环境回滚：若打过 fork，按 [UPSTREAM-MARKDOWN-EMBED.md](UPSTREAM-MARKDOWN-EMBED.md)
  恢复 profile 里 `@deepseek-ai/dsh-client-ui-chat` 的原依赖解析，并在确认无运行中任务后
  安全重启该 profile 的 DSH；不改全局 DSH 安装或其他 profile 的共享依赖链接。
