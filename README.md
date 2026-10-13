# MCP Studio

交接日期：2026-10-13。目标目录：`/Users/wuwei/code/github/mcp-studio`。

**M5 T25–T30 的实现与可执行门禁已通过（98d5049），包含受保护本机 Agent、stdio / 显式 Agent HTTP、个人凭据 / OAuth、可选个人平台加密备份与加密上传队列。** [执行账本](docs/tasks/progress.md) 与 [任务登记](docs/tasks/todo.md) 逐叶记录结果。T25b / T28a / T29b 的人工实机、真实 OS 凭据库和备份介质联验仍待验；T02 完整矩阵不宣称支持，正式 A 项没有批量签收；本次未进入 M6。

正式入口为 `apps/web`、`cmd/platform` 与 `cmd/agent`。Agent 重启只恢复冻结上传，不重放 Tool；浏览器保存 Agent 结果是新的 browser operation。原型 HTML / JS / CSS 仍是设计参考，其示例状态不代表生产能力。启动方式见 [本机运行](docs/operations/development.md)。

## 从这里开始

1. 在 Codex 中打开本目录，阅读 [交接说明](docs/handoff/REFERENCE-NOTES.md)。
2. 正式工程按 [启动与验证](docs/operations/development.md) 配置。换会话时先读取执行账本，再按用户授权阶段继续；交接启动提示词保留为历史入口。
3. 阅读 [设计入口](docs/design-baseline-v2/design-handoff/README.md)、[已确认规则](docs/design-baseline-v2/design-handoff/08-decision-proposals.md) 和 [最终页面与验收](docs/design-baseline-v2/design-handoff/11-final-delivery-checklist.md)。
4. 按 [实施计划](docs/tasks/plan.md)、[工作任务](docs/tasks/todo.md) 和 [验收分期](docs/tasks/acceptance-schedule.csv) 推进。叶子任务逐项登记；60 条正式 A 项仍按后续联验阶段验收。

## 预览原型

在本目录运行下面命令，仅启动静态设计预览，无需安装前端工程依赖：

```sh
python3 -m http.server 8862 --bind 127.0.0.1 --directory docs/design-baseline-v2
```

然后访问 [工具工作台](http://127.0.0.1:8862/workbench-preview.html?page=tools&project=commerce&tab=tab-11)。端口占用时换一个空闲端口。也可直接打开 [原型 HTML](docs/design-baseline-v2/workbench-preview.html)，推荐使用静态服务预览。

业务示例只在内存中，刷新重置；主题和语言偏好可能写入浏览器存储。不要向原型输入真实凭据或业务数据。原型不连接 MCP、不发邮件、不运行 stdio。

## 包含的资料

| 位置 | 用途 |
| --- | --- |
| `AGENTS.md` | 新目录工作规则、基线优先级与授权范围 |
| `START-DEVELOPMENT.md` | M0 启动、单阶段继续、换会话接手三种提示词 |
| `docs/design-baseline-v2/` | 原型、完整设计、截图和既有检查报告，保留相对目录 |
| `docs/tasks/` | 新工程唯一可更新的实施进度与验收分期 |
| `docs/FRONTEND-DEVELOPMENT-STANDARDS.md` | 继承的前端质量规范，差异按 D10 / D11 / D15 对齐 |
| `docs/UPGRADE-2.0.0.md` / `docs/AUTOMATED-TESTING-1.5.0.md` | 仅为规范链接完整性保留的旧产品历史上下文 |
| `docs/handoff/` | 来源与范围说明、文件哈希清单、打包验证 |

## 开发边界

正式技术基线为 React / TypeScript / Vite、Go 平台、Go 本机 Agent、PostgreSQL。浏览器直连可访问 HTTP；受限 HTTP 显式切换 Agent；stdio 固定 Agent；平台管理身份、权限、配置、脱敏记录及可选个人加密备份，默认不代发 MCP 请求。

交接包未复制旧业务源码、数据库、真实配置、凭据、node_modules 或 Git 历史。新工程独立建立 go.mod、package.json、版本化合同、编号迁移及质量门禁。旧原型比较稿和历史实现计划不构成当前开发方案。当前工作计划以 `docs/tasks/` 为准。
