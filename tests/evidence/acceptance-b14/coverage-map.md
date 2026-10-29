# B14 Coverage Map — Frontend Features 剩余模块 12 Files / 52 Tests

B13 挖了 features 核心 8 pages 84 tests，B14 补齐剩余 12 files 52 tests = features/ **全部**页面组件逐函数名深潜完成。

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | WorkflowPage.test.tsx | **13** | config optional skip + keyboard actions; **no current project access → no config requests + all context hidden**; seven-step page upload failure explicit → direct retry to owner queue; **missing personal applied env → incomplete (不使用 shared default)**; reload from observed history |
| **2** | ConnectionsPage.test.tsx | **11** | version conflict retains draft; **viewer sees config but cannot edit personal auth or connect**; stale async query does not pollute next project; deleted auth definition identity retained |
| **3** | AgentBackupsPanel.test.tsx | 5 | **does not create backup until confirmed**; reauth input retained after failure; password cleared after restore |
| **4** | AgentQueuePanel.test.tsx | 3 | **offline Agent records unknown (separate from empty browser queue)**; retries only Agent retained upload; ignores late queue list when permission revoked |
| **5** | DevicesPage.test.tsx | 3 | **requires local approval code + never approves natively from the web**（安全边界）; pairing code retained after network failure |
| **6** | IdentityPage.test.tsx | 3 | **keeps original invitation after registration + never accepts automatically**（安全边界）; wrong-password login retains typed identity; manual-code reset after password repair |
| **7** | IdentityStates.test.tsx | 2 | unavailable invitation state before sign-in; sign-in inputs retained during invitation retry |
| **8** | AgentOAuthPanel.test.tsx | 1 | authorization separate from saving + retries local without repeating OAuth |
| **9** | AgentCredentialsPanel.test.tsx | 1 | backup off by default + Agent token independent of browser vault |
| **10** | Projects.test.tsx | 2 | denied create-project explains + returns without write; evidence only after real scoped success |
| **11** | QueryFeedback.states.test.tsx | 3 | forbidden/not_found → offer return instead of repeat; transient error → explicit retry + separate return |
| **12** | ui.layout.test.tsx | 2 | shared button class preserved with caller styles; keyboard separator within bounds |

## Features 完整全景（B13 84 + B14 52 = 136 tests / 20 files）

```
features/                          B13  B14
├── records/     (RecordEditors 13, RecordsPage 11)   24
├── tools/       (SchemaArgumentEditor 13, ToolExecution 8)  21
├── environment/ (EnvironmentPage 14, v01-diagnostics 4)  18
├── connections/ (ConnectionsPage 11 + Backups 5 + OAuth 1 + Credentials 1 + runtimeStore + session)  18
├── operations/  (OperationsPage 12)                 12
├── team/        (MembersPage 9 + protection)          9
├── workflow/    (WorkflowPage 13 + uploads + model)   13
├── devices/     (AgentQueuePanel 3 + DevicesPage 3)    6
├── auth/        (IdentityPage 3 + IdentityStates 2)   5
├── projects/    (Projects 2)                          2
├── shared/      (QueryFeedback 3 + ui.layout 2)       5
                                                  ─────
                                                  136
```

## Deep-dive 批次累积（B10→B14）

| 批次 | 深入到 | 可追溯边界增量 |
|------|--------|--------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 251+ tests + App Shell 27 | 278+ TS tests |
| B13 | Frontend features 核心 8 pages / 84 tests | +84 TS tests |
| **B14** | **Frontend features 剩余 12 modules / 52 tests** | **+52 TS tests** |
| **总计** | | **Go 181+ / TS 414+ / E2E 33 = 628+** |

## Verify Gates (2026-10-29) — 无漂移

| Gate | Result |
|------|--------|
| Go cloud `./internal/...` (22 pkgs) | ✅ EXIT 0 |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ EXIT 0 |
| go vet cloud + local | ✅ clean |
| vitest run（Node 24.21.0） | ✅ 61 files 603 tests |

## B14 独有发现（B13 没有）

| 发现 | 详情 |
|------|------|
| **DevicesPage: "never approves natively from the web"** | 安全边界——Agent pairing 必须 local approval code，web 不能直接批准 |
| **IdentityPage: "keeps original invitation after registration + never accepts automatically"** | 安全边界——注册后不自动接受邀请，用户必须显式选择 |
| **ConnectionsPage: "stale async query does not populate next project service list"** | **stale async request rejection**——跨 project 导航时旧 request 不能污染新状态 |
| **ConnectionsPage: "deleted auth definition identity retained"** | auth definition 删除后 identity 不被新同 name definition 借用 |
| **WorkflowPage: "missing personal applied env → incomplete"** | **不使用 shared default**——personal env 缺失时 workflow incomplete，不 fallback 到 shared |
| **AgentQueuePanel: "offline Agent records unknown (separate from empty browser queue)"** | offline Agent 记录和 empty browser queue 是**独立概念** |
| **AgentBackupsPanel: "does not create backup until confirmed"** | backup confirm → 创建的两阶段设计 |
