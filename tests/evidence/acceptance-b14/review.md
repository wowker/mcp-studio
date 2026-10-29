# B14 Review — Frontend Features 剩余模块 12 Files / 52 Tests

## Summary

B13 完成 features 核心 8 pages 84 tests，B14 补齐剩余 12 modules 52 tests → **features/ 全部页面组件逐函数名深潜完成**。

**关键安全边界新发现**：
1. **DevicesPage: "never approves natively from the web"** — Agent pairing 必须 local approval code，**web 不能直接批准**（核心安全边界）
2. **IdentityPage: "never accepts automatically"** — registration 后 invitation 必须用户显式接受（防自动 join）
3. **WorkflowPage: missing personal env → incomplete** — **不使用 shared default**（D07 scope 严格）
4. **ConnectionsPage: stale async query does not pollute next project** — stale async request rejection（**和 App Shell 的 stale identity rejection 同一模式**）
5. **WorkflowPage: no current project access → no config requests** — no access → 不发 config API call（不是 UI 空数据）

## 审阅分级

### DevicesPage (3 tests) — ✅ Critical
- **requires local approval code + never approves natively from the web** — Agent pairing 安全边界（web 不能绕过 local device approval）

### IdentityPage (3 tests) — ✅ Critical
- **keeps original invitation after registration + never accepts automatically** — invitation 自动接受防护（防 link 自动 join）

### ConnectionsPage (11 tests) — ✅ Critical
- stale async query does not populate next project service list — **跨 project stale async rejection**
- viewer sees config but cannot edit personal auth or connect — 权限边界
- deleted auth definition identity retained — identity 不被同 name 新 definition 借用

### AgentBackupsPanel (5 tests) — ✅ Important
- **does not create backup until confirmed** — backup 创建两阶段（confirm → create）
- metadata deletion independent of local credentials — 凭据隔离

### WorkflowPage (13 tests) — ✅ Important
- **missing personal applied env → incomplete (不使用 shared default)** — scope 严格性（D07）
- no current project access → no config requests + all context hidden — **无 access 不发 API**
- seven-step upload failure explicit → direct retry to owner queue — workflow 七步完整链

### AgentQueuePanel (3 tests) — ✅ Important
- offline Agent records unknown (separate from empty browser queue) — offline / empty 是独立状态

### 其他 — ✅ Minor
IdentityStates / AgentOAuthPanel / AgentCredentialsPanel / Projects / QueryFeedback / ui.layout

## Critical Issues

**None.** 所有发现的安全边界都有对应测试。

## Features 全景完成（B13+B14）

```
features/ 总计 20 files / 136 tests 逐函数名深潜覆盖
runtime/   12 files / 251+ tests 逐函数名深潜覆盖
app/        3 files / 27 tests 逐函数名深潜覆盖
shared/     4 files （QueryFeedback + ui.layout 已覆盖）
──────────────────────────────
TS 侧全部页面 + runtime 逐函数名深潜完成
```
