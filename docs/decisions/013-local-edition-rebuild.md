# 013 · 单机版改用独立 Node 工程，仓库按发行拆为 local / cloud

取代 [012](012-edition-split-and-local-startup.md) 中的单机版承载形态（Q6）与目录布局；012 的其余结论（两版拆分、单机版无角色校验、凭据进系统凭据库）继续有效。

日期：2026-10-30。状态：已由用户确认并由本次重构执行；云版门禁待重新执行。

## 背景

- 012 的单机版为 Go 单二进制 + 内嵌 PostgreSQL + 内嵌前端，已实现但 UI 仅 4.5k 行、样式近乎为零，实际不可用。
- 既有单机版工具 `mcp-inspector`（Node 24 + Hono + better-sqlite3 + React 19，约 78k 行）已在日常使用，交互与信息架构经过验证。
- 2026-10-30 用户决定：单机版改为以 mcp-inspector 代码为基础，原 Go 单机版整体废弃。

## 决策

| 项 | 结论 |
| --- | --- |
| 单机版运行时 | Node ≥24 单进程：Hono 服务 + better-sqlite3（按项目一库）+ React 前端静态包 |
| 工程来源 | 复制 mcp-inspector 源码到 `local/`，排除 `node_modules`、构建产物、`service-workbench` 与旧文档 |
| 仓库结构 | 根下 `local/`（单机版）与 `cloud/`（Go 平台 + Agent + 云前端 + 合同 + 迁移 + 部署），根只保留薄编排 |
| 废弃内容 | `apps/local`、`internal/platform` 全部 `local` 实现与测试、单机启动/打包脚本、`zonky-pg` 内嵌 PG 缓存 |
| 功能范围 | 保留连接管理、工具浏览与调用、Tab 调试工作区、历史记录、保存快照、环境变量、项目；移除 Tool 测试单元、自动化测试、测试套件、压力测试、测试报告、AI 生成测试（authoring）、AI 工具测试、技能资产 |
| 数据与凭据 | 沿用 `mcp-inspector` 的项目目录与本地存储；系统凭据库规则不变 |
| 云版前端 | `cloud/apps/web` 冻结，不再投入 UI 迭代；单机版 UI 升级只发生在 `local/src/client` |

## 被否方案

- **Go 平台 + SQLite**：需重写 records / variables / audit 数据层，UI 重构排不上队。
- **就地全量替换**：根目录出现两份 `package.json` 与 `src`，23k 行 Go 与既有验收证据全部变成死资产。
- **保留双线并行**：两套 UI 债立即产生，且没有第二个维护者。

## 后果

- 单机版不再依赖 Go 工具链、不再内嵌 PostgreSQL；安装体积与启动路径由 npm 生态决定。
- `cloud/` 的 Go 与前端门禁需在 `cloud/` 内单独执行；根 `npm run verify` 现在只跑单机版。
- 012 的"业务代码只有一份"前提失效：两版前端与存储各自独立，跨版共享只剩文档与设计规范。
- 原 A01–A60 中针对 Go 单机版的验收断言作废，单机版按新工程重新建立验收清单。
