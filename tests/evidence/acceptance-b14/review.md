# B14 Review — Frontend Features 全量深潜（29 files / 132 tests）

## 复核修正（2026-10-29）

原 B14 记录声称「剩余 12 modules / 52 tests」且「features/ 全部完成」。用 `npx vitest run --reporter=json` 实测核对后确认三处错误：

| 问题 | 原记录 | 实测 |
|---|---|---|
| AgentBackupsPanel 测试数 | 5 | **4**（3 个 `it()`，含一个 `it.each(['backup','restore'])` 展开 2 个） |
| Part 1 合计 | 52 | **48**（原表格逐项相加也仅 49，本身就不自洽） |
| features/ 覆盖率 | 「全部完成」 | **35 files / 211 tests，当时仅覆盖 18 files**，遗漏 17 文件 / 84 tests |

另外原记录把 `QueryFeedback.states`、`ui.layout` 计入 features 的「12 modules」，实际二者属 `shared/`。

本次已补做遗漏的 17 个 features 测试文件深潜，并修正全部数字。**features/ 现真正达成 35 files / 211 tests 逐文件全覆盖。**

## 门禁复验（本机实际执行）

| 门 | 实测 |
|---|---|
| `go test ./internal/...`（云版，22 包） | 全 ok，platform 101.49s |
| `go test -tags local ./internal/...`（单机版，21 包） | 全 ok |
| `go vet` 云版 + 单机版 | clean |
| `npx vitest run`（Node 24.21.0） | 61 files / **603 tests / 0 failed** |

## 审阅分级

### Critical — 安全边界

**DevicesPage (3)** — `requires local approval code + never approves natively from the web`。Agent pairing 必须由本地设备批准，Web 端无法直接批准，防止远程绕过设备确认。

**IdentityPage (3)** — `keeps original invitation after registration + never accepts automatically`。注册完成后不自动接受邀请，必须用户显式确认，防链接自动加入。

**records/restore (8)** — 三处安全边界：
- `redacted tool identity /context / /context/toolName` 在 connection/catalog 请求**之前**即阻断，即使存在字面 masked tool 也不放行
- stale Developer restore 被实际 `session-access` 端点的 Viewer downgrade 拒绝 → 阻断
- Agent history 恢复使用**当前 Agent session**，绝不使用 browser runtime

**connections/runtimeStore (7)** — `suspend uploads without cancelling an issued tool result or deleting its frozen queue`。暂停上传、取消 tool result、删除 frozen queue 是三个独立动作，不可混淆。

**tools/AgentToolExecution (4)** — Agent 拥有 execution 与 upload 所有权，仅在显式点击时取消；late results 不能写入 revoked project；shared context redaction 在缓存/复制前应用且不改变 identity。

### Important — 正确性核心

**workflow/model (15)** — 本次补漏中体量最大。upload 失败后即使已查看详情且存在 saved copy，history/saved 仍为 incomplete；facts 不跨 user/project/connection/Run 合并；无 permission 或 identity suspended 时隐藏全部 progress fact。

**tools/workspace (8)** — duplicate 不继承 result / run identity / pending upload；project revocation 只丢弃目标文档并保留另一 project draft。

**tools/argumentDraft (8)** — 显式 `0/false/null/空数组` 与 skip 独立保留（D08）；remote/advanced ref 用 local JSON 不发起 fetch。

**tools/ToolsPage (9)** — Viewer 或 disconnected runtime 不 fetch upstream tools；root memory revocation 后不 publish late catalog；forbidden connection query 不渲染旧 tool context 且不重试。

**connections/ConnectionsPage (11)** — stale async query 不污染下一 project（与 App Shell 的 stale identity rejection 同一模式）。

**WorkflowPage (13)** — missing personal applied env → incomplete，**不使用 shared default**；无当前 project access 时不发 config 请求。

**RecordsPage (11)** / **OperationsPage (12)** / **RecordEditors (13)** / **SchemaArgumentEditor (13)** / **EnvironmentPage (14)** / **ToolExecution (8)** / **MembersPage (9)** — 见 B13 记录，本次复核数字全部吻合。

**records/viewStore (4)** — root Run invalidation 精准清除匹配 cached copies 与 Tab results，保留其他 Run / project。

**environment/VariableEditor (4)** — personal 允许 credential-shaped 值而 shared definitions 拒绝；拒绝 personal JSON 内嵌 nonfinite，不静默存 null。

### Minor

AgentQueuePanel (3)、IdentityStates (2)、AgentOAuthPanel (1)、AgentCredentialsPanel (1)、Projects (2)、QueryFeedback (3, shared)、ui.layout (2, shared)、RecordStates (3)、session (3)、uploads (3)、protection (3)、ToolDocumentTabs (2)、AgentEnvironmentPanel (1)、SessionUploads (1)、v01-backup-retry (1)、AgentBackupsPanel (4)。

## Critical Issues

**None** — 所有发现的安全边界均有对应测试覆盖。

唯一属于文档层面的问题是本轮已修正的统计错误，不涉及实现。

## 累积口径（实测）

```
Go 侧   agent 11 包 ~50 + platform 131            = 181+ functions
TS 侧   B12 274+ (runtime 251+ + app 23)
      + B13 84 + B14 132                          = 490+ tests
E2E     Playwright 14 suites / 33 specs
量化     Layout Metrics 37 / pageOverflow 0 / bodySize 14
──────────────────────────────────────────────
总计    704+ 可追溯边界
```

## 全量目录分布（实测 61 files / 603 tests）

```
runtime/   19 files / 352 tests
features/  35 files / 211 tests   ← B13+B14 全覆盖
app/        3 files /  23 tests
shared/     4 files /  17 tests
```
