# 07 · 来源、实现载体与评审证据

[交付首页](./README.md)

## 当前设计依据

**baseline 2 已确认规则优先**：[08 决策记录](./08-decision-proposals.md)。下列领域文件、截图和原型为此前评审载体，涉及已确认变更时按 01–06 / 08 执行。首次同步见 09、连续流程复核见 10、最终设计索引见 11；各轮证据按实际执行时间和范围使用。

| 领域 | 当前来源 | 原型载体 |
| --- | --- | --- |
| 主入口与最终布局 | [预览说明](../README.md)、[响应式复核](../2026-10-12-responsive-polish.md) | [workbench-preview.html](../workbench-preview.html)、workbench-preview.js、workbench-layout.css |
| 组件边界 | [COMPONENTS](../COMPONENTS.md)、[管理页风格](../2026-10-12-management-design.md) | workbench-components / management 的 JS 与 CSS |
| 执行架构 | [本地优先执行](../2026-10-10-local-first-mcp-architecture.md) | 当前主页面加载 workbench-connections，不加载旧 workbench-execution.js |
| 服务授权 | [服务与授权完整交互](../2026-10-12-server-authorization-states.md) | workbench-connections.js / .css、connection-locales.js |
| 环境 | [环境变量完整交互](../2026-10-12-environment-states.md) | workbench-environments.js / .css、environment-locales.js |
| 调试 | [调试完整状态](../2026-10-12-tools-debugger-states.md)、[参数契约](../2026-10-10-schema-argument-editor.md) | workbench-debugger、workbench-parameters、vendor/preview-schema.js |
| 历史与保存 | [历史保存完整交互](../2026-10-12-history-saved-states.md)、[平台记录设计](../2026-10-10-platform-history-and-saved-records.md) | workbench-history、workbench-records、workbench-redaction |
| 项目团队 | [项目团队完整交互](../2026-10-12-project-team-states.md) | workbench-team.js / .css、team-locales.js |
| 流程串联 | [全流程设计](../2026-10-12-complete-workflow.md) | workbench-flow.js / .css、flow-locales.js |
| 页面状态 | [共享状态设计](../2026-10-12-shared-states.md) | workbench-states.js / .css、state-locales.js |

主 HTML 中的 script / stylesheet 顺序是当前可运行依赖清单。`workbench-layout.css` 保留布局契约，最后加载的 `workbench-baseline.css` 补充 v2 页面样式。各 `*-locales.js` 提供中英文本；`preview-icons.js` 与 `vendor/` 是本地运行资产。

## 历史参考，不作为当前开发方案

| 文件 | 用途与边界 |
| --- | --- |
| [最早服务化分析](../2026-10-09-service-workbench-design.md) | 早期功能和服务化探索，不能覆盖用户后来确认的范围与本地优先架构 |
| [早期后端集中执行建议](../2026-10-10-mcp-execution-decision.md) | 已被本地优先方案取代 |
| [Tools 三方案](../2026-10-10-tools-workspace-design.md)、[对比原型](../tools-designs.html) | A / B / C 仅作历史比较，最终选择主工作台布局 |
| [早期实现计划](../2026-10-10-implementation-plan.md) | 不属于本轮开发授权；不能据此启动旧工程草案 |
| workbench-execution.js / 旧执行模型报告 | 保留演变记录；主页面使用新的 connections 模型 |
| [原仓库 2.0 规划](../../UPGRADE-2.0.0.md) | 继承规范的上下文，不将旧产品测试 / 脚本范围引入本次重做 |

如旧文与当前领域说明有差异，使用本交付登记的差异及当前领域设计进行评审，不叠加成更大的功能范围。

## 当前原型模型证据

前轮连续流程修补后通过 **209 项**模型检查；本次文档整理没有重新运行。下表与现有 JSON 报告一致，不将各阶段累计数相加为额外覆盖。正式 A01–A60 全部仍待新工程验收。

| 模型 | 检查数 | 报告 |
| --- | --- | --- |
| 共享页面状态 | 12 | [states](../preview-assets/states-model-verification.json) |
| 完整流程 | 18 | [flow](../preview-assets/flow-model-verification.json) |
| 项目团队 | 30 | [team](../preview-assets/team-model-verification.json) |
| 历史保存 | 27 | [history](../preview-assets/history-model-verification.json) |
| 调试 | 18 | [debugger](../preview-assets/debugger-model-verification.json) |
| 服务与授权 | 27 | [connections](../preview-assets/connections-model-verification.json) |
| 环境 | 28 | [environments](../preview-assets/environments-model-verification.json) |
| 管理表单 | 10 | [management](../preview-assets/management-model-verification.json) |
| Baseline 2 状态 | 25 | [baseline](../preview-assets/baseline-v2-model-verification.json) |
| 连续流程修补 | 14 | [journey-v2](../preview-assets/journey-v2-model-verification.json) |
| 合计 | 209 | 仅静态原型模型，不是正式系统覆盖率 |

旧执行模型不在当前入口使用，检查数不计入本合计。可使用对应 `verify-*-model.mjs` 复查；CLI 浏览器脚本可能依赖原仓库环境，不作为便携包一键验收承诺。

## 最近一次浏览器流程证据

[连续旅程报告](../preview-assets/journey-v2-browser-verification.json) 记录两轮从登录 / 项目到保存的连续操作，均达到 7 / 7，并检查角色、会话、邀请过期、失败重试和恢复未执行状态；控制台未捕获错误。最终权限及引用过滤细化有独立浏览器复验，不声称每次小修后都重跑全链。报告明确业务状态仅内存、无真实外部调用。

[首次 v2 同步报告](../preview-assets/baseline-v2-browser-verification.json) 包含该阶段 120 组布局；它与下述更早 240 组各自独立，均未在本次文档整理重新执行。

## 更早的浏览器与布局证据

[先前布局专项报告](../preview-assets/layout-browser-verification.json)：15 个页面 / 视图 × 4 个窗口 × 2 种语言 × 2 种主题 = **240 组布局检查**。窗口为 390×900、820×900、1024×640、1440×900；另用 390×844 检查移动结果操作与键盘滚动。

报告记录无页面横向溢出、无不可滚动父容器裁切主操作、内容滚动区非零高度、页底在容器内。允许的表格 / 目录 / Tab 局部横滚不算页面溢出。表格滚动位置 `(80, 883)` 与移动调试纵向 `629` 在语言切换后保持；控制台错误为空。

这不是所有页面所有状态的笛卡尔积覆盖，也不证明真实身份系统、数据存储或 MCP 可用。

领域交互报告：[状态](../preview-assets/states-browser-verification.json)、[流程](../preview-assets/flow-browser-verification.json)、[团队](../preview-assets/team-browser-verification.json)、[历史](../preview-assets/history-browser-verification.json)、[连接](../preview-assets/connections-browser-verification.json)、[环境](../preview-assets/environments-browser-verification.json)、[调试](../preview-assets/debugger-browser-verification.json)。其中剪贴板的浏览器桥接曾无法返回文本，脱敏内容由模型验证、浏览器只验证反馈，不能宣称真实剪贴板端到端已验证。

## 截图索引

| 评审用途 | 图像 |
| --- | --- |
| v2 连续流程修补 | [7 / 7 完成](../preview-assets/v2-journey-complete.png)、[英文暗色授权](../preview-assets/v2-journey-authorization-dark.png) |
| 先前整体布局 | [浅色工作台](../preview-assets/layout-workbench-light.png)、[窄屏暗色结果](../preview-assets/layout-tools-mobile-dark.png) |
| 复杂参数与执行 | [校验](../preview-assets/debugger-complex-validation.jpg)、[执行中](../preview-assets/debugger-running.jpg)、[恢复](../preview-assets/debugger-history-restored.jpg) |
| 连接与授权异常 | [OAuth 等待](../preview-assets/server-oauth-waiting.jpg)、[HTTP 失败](../preview-assets/server-http-failure.jpg)、[stdio 失败](../preview-assets/server-stdio-failure.jpg)、[备份失败](../preview-assets/server-backup-failure.jpg) |
| 环境 | [覆盖链](../preview-assets/environment-overrides.jpg)、[缺失校验](../preview-assets/environment-missing.jpg)、[备份失败](../preview-assets/environment-backup-failure.jpg) |
| 历史与保存 | [历史详情](../preview-assets/history-detail-light.jpg)、[已保存](../preview-assets/history-saved-light.jpg)、[英文暗色](../preview-assets/history-saved-dark-en.jpg) |
| 团队 | [项目列表](../preview-assets/team-projects-light.jpg)、[移除确认](../preview-assets/team-member-removal.jpg)、[接受成功](../preview-assets/team-invite-accepted.jpg)、[过期](../preview-assets/team-invite-expired.jpg) |
| 共享状态与流程 | [权限不足](../preview-assets/states-permission-light.png)、[流程完成](../preview-assets/flow-complete-light.jpg) |

截图分别记录各轮评审状态；流程完成截图中的临时项目刷新后会消失。界面尺寸、换行和对齐以当前 HTML / CSS 为准。

## 最终文档整理与打包检查

本轮只检查本地文档链接、原型依赖、P / I / A 编号与 CSV 一致性、既有证据计数，以及便携包文件哈希 / 解压完整性。不重跑业务模型或浏览器测试，不修改原型行为或生产工程。

结果见 [最终交付检查](./delivery-check-v2-final.json)。包名为 `mcp-inspector-design-handoff-2026-10-12-v2-final.zip`，打包报告位于 `exports/packaging-check-v2-final.json`。既有 `delivery-check*.json` 与旧 ZIP 保留为历史快照，不作为最终包的校验结果。
