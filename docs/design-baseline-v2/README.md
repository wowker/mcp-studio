> **当前：Design baseline 2 最终设计交付。** 本轮修补已同步到页面、交互、状态与权限规则，后续新目录开发从 [最终交付清单](./design-handoff/11-final-delivery-checklist.md) 开始。正式验收 A01–A60 均待实施后验证；没有进入开发。

# MCP Inspector 服务版设计预览

更新日期：2026-10-12。当前仅做原型 UI 与设计评审，正式开发未来另放目录。此前误启动的工程草案不属于本轮设计交付，开发进程已停止。

## 完整设计交付入口 · Baseline 2（规则已确认）

**[设计交付文档：页面、流程、组件、状态、权限与验收](./design-handoff/README.md)** 汇总当前确定的版本，附剩余工程细化与历史方案边界，后续在其他目录开发请从这里开始。

- 便携交付包 `exports/mcp-inspector-design-handoff-2026-10-12-v2-final.zip`：原型、本地依赖、设计文档、截图与既有检查报告。解压后的目录不再嵌套存放压缩包。
- [开发交接与验收清单](./design-handoff/06-handoff-and-acceptance.md) · [来源与证据](./design-handoff/07-source-and-evidence.md)

[已确认 D01–D15 及调用方式](./design-handoff/08-decision-proposals.md) 已同步进入文档。原型同步见 09，连续流程复核见 10，最终清单见 11；旧 ZIP 保留对应阶段快照。下面保留逐轮设计记录，用于追溯，不替代完整交付文档。

- **[本轮：完整流程串联与页面一致性复核](./2026-10-12-complete-workflow.md)**
- [从项目管理开始](./workbench-preview.html?page=projects&project=commerce) · [现有项目流程](./workbench-preview.html?page=project-flow&project=commerce)
- [流程模型检查](./preview-assets/flow-model-verification.json) · [浏览器检查](./preview-assets/flow-browser-verification.json)
- **[上一轮：项目管理、成员权限与邀请完整交互](./2026-10-12-project-team-states.md)**
- [项目管理](./workbench-preview.html?page=projects&project=commerce) · [成员与邀请](./workbench-preview.html?page=members&project=commerce&section=projectMembers) · [邀请接受预览](./workbench-preview.html?page=invitation-detail&project=commerce&entry=team-invite-1&mode=accept)
- [项目团队模型检查](./preview-assets/team-model-verification.json) · [浏览器检查](./preview-assets/team-browser-verification.json)
- **[上一轮：调用历史、已保存记录与脱敏完整交互](./2026-10-12-history-saved-states.md)**
- [调用历史原型](./workbench-preview.html?page=history&project=commerce) · [上传失败及脱敏详情](./workbench-preview.html?page=history-detail&project=commerce&run=commerce-run-redaction)
- [历史模型检查](./preview-assets/history-model-verification.json) · [浏览器检查](./preview-assets/history-browser-verification.json)
- **[上一轮：环境变量完整交互与敏感值管理](./2026-10-12-environment-states.md)**
- [环境变量原型](./workbench-preview.html?page=environment&project=commerce) · [环境模型检查](./preview-assets/environments-model-verification.json) · [浏览器检查](./preview-assets/environments-browser-verification.json)
- **[上一轮：服务配置、授权与 Agent 完整交互](./2026-10-12-server-authorization-states.md)**
- [服务配置原型](./workbench-preview.html?page=servers&project=commerce&server=commerce-staging) · [授权原型](./workbench-preview.html?page=servers&project=commerce&config=authorization&server=commerce-personal)
- [连接模型检查](./preview-assets/connections-model-verification.json) · [浏览器检查](./preview-assets/connections-browser-verification.json)
- **[上一轮：Tools 完整状态与交互](./2026-10-12-tools-debugger-states.md)**
- [调试状态模型检查](./preview-assets/debugger-model-verification.json) · [浏览器交互检查](./preview-assets/debugger-browser-verification.json)
- **[上一轮：服务、环境、历史与团队页面统一设计](./2026-10-12-management-design.md)**
- [新版服务配置](./workbench-preview.html?page=servers&project=commerce) · [环境变量](./workbench-preview.html?page=environment&project=commerce) · [调用历史](./workbench-preview.html?page=history&project=commerce) · [团队成员](./workbench-preview.html?page=members&project=commerce)
- [页内团队邀请](./workbench-preview.html?page=invitation&project=commerce) · [管理页面模型检查](./preview-assets/management-model-verification.json)
- [上一轮：执行与存储页面、设计阶段边界与最新参数规则](./2026-10-12-design-review.md)
- [本机 Agent 预览](./workbench-preview.html?page=servers&project=commerce&config=execution&server=commerce-personal)
- [旧执行设置模型检查（历史参考）](./preview-assets/execution-model-verification.json)

- **当前选择：[工具历史、Tab 操作与亮暗工作台](./2026-10-10-workbench-interactions.md)**
- [参数输入区布局、空值与跳过契约](./2026-10-10-schema-argument-editor.md)
- [标准组件与复用契约](./COMPONENTS.md)
- **当前执行架构：[本地优先执行与配置同步](./2026-10-10-local-first-mcp-architecture.md)**
- **新增流程：[平台调用历史与已保存请求、响应](./2026-10-10-platform-history-and-saved-records.md)**
- [此前集中执行方案与认证文案记录（已取代）](./2026-10-10-mcp-execution-decision.md)
- **[当前主预览：workbench-preview.html](./workbench-preview.html)**
- [第二轮：三种 Tools 设计方案与重点规划](./2026-10-10-tools-workspace-design.md)
- [第二轮参考：可切换的 Tools UI 比较](./tools-designs.html)（`?variant=A` / `B` / `C`）
- [功能分析与服务架构草案](./2026-10-09-service-workbench-design.md)
- [四模块与团队流程（原布局已美化）](./workbench-preview.html)
- [浏览器验证结果](./preview-assets/verification.json)
- [语言切换验证结果](./preview-assets/locale-verification.json)
- [工具历史、Tab 与外观验证结果](./preview-assets/controls-verification.json)
- [已保存请求、响应与平台历史状态验证](./preview-assets/records-verification.json)
- [参数输入区专项验证](./preview-assets/parameters-verification.json)
- [当前工作区整体验证结果](./preview-assets/repository-verification.json)

## 打开预览

可直接用浏览器打开 `workbench-preview.html`，也可在项目根目录运行：

```sh
python3 -m http.server 8861 --bind 127.0.0.1 --directory docs/redesign
```

当前主预览访问 <http://127.0.0.1:8861/workbench-preview.html?page=tools&project=commerce>；第二轮参考访问 <http://127.0.0.1:8861/tools-designs.html?variant=A>。

页面与图标全部来自本地文件，不加载远程 CDN。业务示例状态只在内存中保存，刷新恢复初始状态。语言偏好保存在 `mcp-inspector.locale`，仅允许 `zh-CN` / `en-US`；外观偏好保存在 `mcp-inspector.theme`，仅允许 `light` / `dark`。不保存草稿、身份或 Secret。

## 当前版：Tools 完整状态与统一工作台

工具区增加“状态预览”，可切换成功、持续执行、业务错误、协议错误、授权、网络、超时及成功但上传失败；取消、重试上传和历史恢复均可点击体验。`preview_order` 演示结构化对象、数组增删、nullable 与嵌套校验。可选项默认跳过，取消跳过或只聚焦不误报；历史恢复保留显式值。详情见[完整调试交互设计](./2026-10-12-tools-debugger-states.md)。

服务、环境、历史与团队管理使用统一的页面标题、局部导航、表格、表单分区和底部操作。变量编辑和团队邀请为完整页内表单；邀请带角色权限预览。项目总历史使用整页列表与独立详情，工具内历史继续限定当前工具。两种语言与主题沿用现有工作台。详情与新版截图见[管理页面统一设计](./2026-10-12-management-design.md)。本轮仅做设计原型。

项目入口移至侧边栏；顶部合并为一个连接栏。工具目录与白色工作区分别呈现，文档页签和局部页面导航各自独占一行。保留上方参数 / 下方结果、页面式定义及历史详情。视觉采用中性灰白与低饱和青绿色，清理重复状态和多层标签。

右上角提供用户入口；左下角依次提供团队成员、亮暗主题和简体中文 / English 切换，语言位于最下方，默认中文和亮色。侧栏支持收起。标题、操作、说明与状态按所选语言显示；Tool 名称、参数名、用户配置名称及服务原始描述 / 响应保持原值。使用仓库现有 i18next 的本地浏览器构建，无新增 npm 依赖。

工具工作区的调用历史只查看当前项目、连接和工具的记录，不跳转到总历史。详情和参数恢复留在工具流程中。每个工具 Tab 的右侧增加复制名称、复制 Tab、固定、左移、右移、关闭其他和关闭右侧；固定与运行中的 Tab 受到关闭保护。组件已经拆入独立预览模块，正式组件划分见 [COMPONENTS.md](./COMPONENTS.md)。

新增“已保存”页面：工具内按连接 / 工具查看，总调用历史中作为第二分类。参数区“保存请求”保存当前草稿；结果与历史详情“保存记录”保存同一次执行的请求与响应。支持名称、备注、仅本人 / 项目成员范围、搜索、只读详情与载入新的未执行 Tab。所有保存操作使用页内表单，原型仍为内存模拟。平台历史支持已记录、等待上传、上传失败及仅重传记录的重试预览。

参数输入区现按 Schema 展示所有字段，普通字段两列、数组整行，统一 36px 输入高度，数值和枚举使用较短控件。可选项支持“跳过”，从实际参数中删除键；必填项不能跳过。复用项目共享 Schema 校验器，字段下显示错误，合法的 0 / false 不被当作空值。详见[参数输入区契约](./2026-10-10-schema-argument-editor.md)。

新增数组参数演示，支持保留非法草稿、JSON / Form 往返和页内扩大输入区域。打开 `get_store_product_mapping`，点击参数标题栏的扩大图标即可查看复杂参数区域。

## 第二轮：Tools 设计比较

本轮针对“布局和旧版过于相似”的反馈，重新设计三个结构不同的方向：A 调试 Studio，B 工具目录，C 请求笔记本。点击底部比较条或使用左右方向键切换；输入框中的方向键保持编辑行为。A / B / C 均可编辑参数、模拟调用、查看结果及恢复历史。

最新选择为用户截图中的三列及上下调试布局，以下 A / B / C 仅保留用于参考。复杂参数、执行快照和结果排查等专项规划仍有效。

| 方向 | 截图 |
| --- | --- |
| A · 调试 Studio | [studio.png](./tools-design-assets/studio.png) |
| B · 工具目录 | [catalog.png](./tools-design-assets/catalog.png) |
| C · 请求笔记本 | [notebook.png](./tools-design-assets/notebook.png) |
| 执行时修改草稿，结果仍关联原快照 | [snapshot.png](./tools-design-assets/snapshot.png) |
| Tool 返回错误 | [tool-error.png](./tools-design-assets/tool-error.png) |

本轮为 Tools 设计专项；Server / 环境 / 团队入口展示上下文弹层，完整四模块流程仍见第一轮。原型不连接真实 Server，配置仅展示；邀请不发送。验证与截图命令：

```sh
node docs/redesign/verify-tools-designs.mjs
```

浏览器验证通过 21 项检查，生成 11 张截图；覆盖 1440 / 1024 / 820 / 390px，未出现运行时错误、远程请求或浏览器存储。报告：[tools-design-assets/verification.json](./tools-design-assets/verification.json)。详细功能规划、Schema 编辑、执行状态、响应类型和首版边界见第二轮设计文档。

## 可评审的流程

1. **Tools 调试**：搜索 Tool、多个个人草稿、Tab 操作菜单、Form / JSON 同步、输入校验、模拟执行与取消、结果表格 / 原始 JSON / HTTP / RPC / 时间线、键盘调整分栏、工作区内定义与当前工具历史页面。
2. **Server 配置**：同 URL 的独立连接、个人 / 项目认证归属、配置编辑、断开后选择环境、固定保存操作。
3. **环境变量**：Profile、项目 / Server 作用域、生效预览、普通变量编辑、Secret 替换输入。
4. **调用历史**：搜索与筛选、页面式只读详情、固定、载入新个人 Tab、返回保留筛选、直接链接和浏览器前进 / 后退、清理非固定示例历史。
5. **团队与项目**：侧栏团队 / 项目入口；两个预置项目的草稿与历史独立；创建空项目并配置首个 Server。
6. **用户与成员**：成员角色表、权限说明、邀请创建 / 撤销、邀请接受与企业登录页面预览。
7. **角色预览**：点击右上角用户，切换 Maintainer / Developer / Viewer，查看对应操作禁用状态。

邀请与登录页面只演示界面，不发送邮件、不创建真实账号、不进行 OAuth。模拟执行不连接示例 URL。正式架构调整为浏览器发起、兼容 HTTP 直连或本机 Go Agent 执行，平台负责配置同步；Agent、授权存储和同步尚未实现，详见当前执行架构。

## 页面截图

| 页面 | 截图 |
| --- | --- |
| 参数输入区 | [parameters-refined.png](./preview-assets/parameters-refined.png) |
| 跳过可选字段 | [parameters-skipped.png](./preview-assets/parameters-skipped.png) |
| 参数就近校验 | [parameters-errors.png](./preview-assets/parameters-errors.png) |
| Tools 调试 | [tools.png](./preview-assets/tools.png) |
| 暗色工作台 | [tools-dark.png](./preview-assets/tools-dark.png) |
| Tab 右侧操作菜单 | [tool-tab-menu.png](./preview-assets/tool-tab-menu.png) |
| 当前工具历史页 | [tool-history.png](./preview-assets/tool-history.png) |
| 当前工具调用详情 | [tool-history-detail.png](./preview-assets/tool-history-detail.png) |
| 已保存记录集合 | [saved-records.png](./preview-assets/saved-records.png) |
| 页内保存请求 | [save-request.png](./preview-assets/save-request.png) |
| 已保存请求与响应详情 | [saved-record-detail.png](./preview-assets/saved-record-detail.png) |
| 英文暗色已保存页面 | [saved-records-dark-en.png](./preview-assets/saved-records-dark-en.png) |
| 收起左侧导航 | [sidebar-collapsed.png](./preview-assets/sidebar-collapsed.png) |
| 工作区内 Tool 定义 | [tool-definition.png](./preview-assets/tool-definition.png) |
| 复杂数组参数与页内扩大编辑区 | [complex-parameters.png](./preview-assets/complex-parameters.png) |
| Server 配置 | [servers.png](./preview-assets/servers.png) |
| 环境变量 | [environment.png](./preview-assets/environment.png) |
| 调用历史 | [history.png](./preview-assets/history.png) |
| 完整调用详情页 | [history-detail.png](./preview-assets/history-detail.png) |
| 团队成员 | [members.png](./preview-assets/members.png) |
| 邀请成员 | [invite.png](./preview-assets/invite.png) |
| 项目列表 | [projects.png](./preview-assets/projects.png) |
| 企业登录 | [login.png](./preview-assets/login.png) |
| 接受邀请 | [accept-invite.png](./preview-assets/accept-invite.png) |
| 1024px 工作台 | [tools-1024.png](./preview-assets/tools-1024.png) |
| 英文工作台 | [tools-en.png](./preview-assets/tools-en.png) |
| 英文工具定义 | [tool-definition-en.png](./preview-assets/tool-definition-en.png) |
| 390px 布局 | [tools-390.png](./preview-assets/tools-390.png) |

## 验证与范围

原型沿用项目的语义 tokens、系统字体与 Phosphor 图标，统一提供亮暗主题。验证脚本覆盖原流程与新增页面交互，包含两种语言、两种主题、1440 / 1024 / 820 / 390px、无运行时错误、无远程请求，浏览器仅保存语言和主题偏好；以报告记录的检查结果为准。

2026-10-10 的历史验证曾通过 77 项原型检查以及正式项目 `npm run verify`（196 个测试文件 / 1328 项单测及 11 项端到端测试）。随后默认跳过的参数专项增加到 13 组并通过。这些是当时的结果，不代表本轮已经重跑完整门禁。本轮验证以 2026-10-12 的设计评审记录及专项报告为准。

启动预览服务后可复现：

```sh
node docs/redesign/verify-preview.mjs
node docs/redesign/verify-preview-locales.mjs
node docs/redesign/verify-workbench-controls.mjs
node docs/redesign/verify-workbench-records.mjs
node docs/redesign/verify-workbench-parameters.mjs
```

默认使用 macOS 的本地 Chrome。其他环境通过 `PREVIEW_BROWSER` 指定可执行文件；`PREVIEW_URL` 可以覆盖预览地址。脚本依赖仓库现有 Playwright，生成报告和截图。图标可通过 `node docs/redesign/build-preview-icons.mjs` 从现有 Phosphor 依赖重新生成。

此预览只验证设计交互，不验证真实登录、租户授权、Secret 存储、MCP / OAuth 兼容或 Go 实现。正式实现仍需接入共享双语资源与主题偏好、完整 Schema 编辑、生产端到端验证及服务端权限检查。角色禁用只是 UI 演示，不能代替后端授权。

## 评审重点

- 四个业务入口与团队 / 项目管理入口的位置是否符合日常使用。
- Tools 参数与结果分栏的密度、目录宽度与常用动作是否合适。
- 共享 Server / 历史与私有 Tab / OAuth 的边界是否符合团队协作方式。
- 邀请时指定初始项目与角色是否满足内部部署需求。
- 内部部署首版使用企业 OIDC、后续扩展 SaaS 与本地 Agent 的顺序是否合适。

评审结论确认后，再将设计转为正式实现计划；本目录中的演示状态代码不直接作为生产实现复用。

共享校验器更新后重新生成预览资源：`node docs/redesign/build-preview-schema.mjs`。参数专项报告：[parameters-verification.json](./preview-assets/parameters-verification.json)。

## 全局状态评审（2026-10-12）

页面顶部“状态演示”可检查空、加载、错误、权限不足与内容失效。正常视图保留既有专项业务状态。详见 [统一状态设计](./2026-10-12-shared-states.md)，检查命令：`node docs/redesign/verify-states-model.mjs`。

[双语与响应式布局复核](./2026-10-12-responsive-polish.md)：240 组页面/语言/主题/窗口检查；修复网格溢出、底边裁切、窄屏操作栏与滚动位置丢失。
