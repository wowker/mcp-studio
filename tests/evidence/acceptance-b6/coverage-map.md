# B6 · 页面一致性与全链 · 预期核对与覆盖映射

日期：2026-10-29。基线：`5394c4a`（B5 签收）。B6 8 条，**策略性部分签收**——A29 + A35 由当前版本前端单元测试覆盖，其余 6 条需浏览器视觉渲染/键盘/全链，保持待验。

## 签收策略（B6 独特性）

B6 与 B1–B5 不同：多数条目需要**真实浏览器视觉渲染**（跨 viewport 布局、主题切换保留滚动位置、键盘导航、字号视觉确认、全链流程），单元测试（jsdom）无法替代。批次计划明确 A30 子项保持待验；A60 全链之前 e2e 有失败记录；A32 jsdom 无 localStorage 持久化无法验证切换保留；A33 键盘导航需真实浏览器。

## 已签收（2 条）

| 条目 | 覆盖 |
|---|---|
| A29 每页状态不误报 | 前端 App.test.tsx(19) + Shell.test.tsx(3) + RecordStates.test.tsx(3) + IdentityStates.test.tsx(2) + execution/index.test.ts(15)——多页面 empty/loading/error/forbidden 状态管理不误报、恢复动作一致。Go 后端 403/401/400 响应语义与前端状态映射一致 |
| A35 失败流程 | execution runtime forbidden/离线/业务失败不虚构成功、不创建 Run、保留诊断；m6-flow e2e 上传失败保持 incomplete、不调用 Tool |

## 保持待验（6 条）

| 条目 | 原因 |
|---|---|
| A30 多 viewport 布局 | 需浏览器截图/axe WCAG；批次计划明确子项待验；m6-layout 曾有 T32a axe 失败历史 |
| A31 小屏/长名 | 需浏览器多 viewport 渲染（390×844 手机、1024×640 短桌面） |
| A32 语言主题切换保留 | 需真实浏览器切换（jsdom 无 localStorage 持久化，无法模拟真实重启）；V01 e2e 有覆盖但需在当前版本重跑 |
| A33 键盘导航 | 需真实浏览器；keyboard-scope 部分覆盖 + manual pending |
| A45 字号 | 需视觉确认 token 体系当前值符合 D10（正文 14/辅助 12/页标题 24/工作区标题 16） |
| A60 全链 | 仅云版；m6-flow 之前 T33 有邀请注册/登录验证流程可见性断言失败记录；需真实浏览器跑全链 |

## 环境与命令

- 前端 B6 相关 7 文件 46 tests passed：App(19) + Shell(3) + RecordStates(3) + IdentityStates(2) + Projects(2) + execution/index(15) + v01-environment-blocking(2)。
- Go 全量复用 B5 结果（E 系列未触及）。
- go vet 复用 B5 结果。
