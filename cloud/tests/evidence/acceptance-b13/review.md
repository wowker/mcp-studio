# B13 Review — Frontend Features 核心页面组件 8 Pages / 84 Tests

## Summary

B13 完成了 B10→B12 之外**前端 features 核心页面组件**的逐函数名深潜。B11 只提模块级数字，B13 深入到**每个测试的具体覆盖边界**。

**核心发现**：
- Features 8 pages / 84 tests 覆盖**所有核心安全/正确性边界**
- **OperationsPage 的 "does not read or display queue contents when actual project read permission is absent"** — 权限边界关键
- **SchemaArgumentEditor 的 "keeps optional defaults skipped and focus or blur does not emit validation errors"** — D08 核心规则（optional 默认 skip + focus/blur 不误报）
- **RecordEditors 的 revision ETag 绑定 + Viewer read-only** — 上传冻结 + 权限
- **ToolExecution 的 "finishes this project run after unrelated Viewer project revoked"** — project isolation
- **MembersPage 的 invitation fact scope 严格** — 身份+项目必须一致

## 审阅分级

### RecordEditors (13 tests) — ✅ Critical
Metadata revision 冻结 + redaction reason 脱敏——上传冻结的前端核心。
- revision ETag retry 不跟随 draft edit
- policy re-read + opaque field masking
- source credential capture（credential redaction 后 edit 也不能泄露）
- **Viewer read-only standalone save editor**（权限边界）
- source Run cache invalidation after additional revision

### OperationsPage (12 tests) — ✅ Critical
队列/上传/留存的正确性核心。
- **无 read permission → 不读队列**（`does not read or display queue contents`）——**权限边界关键**
- Viewer 永远不能 frozen retry
- discard 确认后才开始上传 → refuse（race condition 防护）
- retention If-Match policy reload（不乐观锁）
- **competing window upload 解释不暴露任意细节**

### SchemaArgumentEditor (13 tests) — ✅ Critical
Tool Argument 校验的**核心安全边界**。
- **optional defaults skipped + focus/blur does not emit validation errors**（D08 硬规则）
- **falsy 值保留**（zero/false/null/empty arrays）——D08 核心
- malformed Raw text → Form blocked（不把错误 JSON 传给后端）
- oneOf 分支独立编辑
- local JSON draft error 保留 text for later correction

### RecordsPage (11 tests) — ✅ Important
Record 展示/详情/删除。
- connection+tool filter 跨分页保持
- **foreign-owner facts reject**
- protected operation → confirm delete block
- copy editor 成功上传后关闭

### ToolExecution (8 tests) — ✅ Important
执行 + 上传 + redaction 缓存失效。
- **one call retry frozen body 不受 draft edit 影响**
- **redaction invalidates cache 只影响当前 project**
- **unrelated Viewer project revoked → this project still finish**（project isolation）
- execution 失败 → 不创建 Run（publish validation into parameter editor）

### EnvironmentPage (14 tests) — ✅ Important
环境变量 + connection draft + reference repair。
- developer 只改 personal，不碰 shared
- connection draft ≠ project definitions
- 5 个 same-project route change 测试（所有 UI 正确关闭）

### MembersPage (9 tests) — ✅ Important
成员邀请 scope 严格。
- **invitation fact 只在 same identity + project 成功创建后记录**
- delayed success 跨 project / permission revoked → 不记录
- delete member 需要 scope confirmation

### v01-diagnostics (4 tests) — ✅ Minor
A51 诊断修复——missing dependency / invalid typed reference → repair 清除 diagnosis。

## Critical Issues

**None.**

## Deep-dive 批次价值（B10→B13 累积）

| 维度 | B10 | B11 | B12 | B13 |
|------|-----|-----|-----|-----|
| 范围 | Agent 11 包 | Platform 131 + Playwright + Layout Metrics | Runtime 251+ tests | Features 8 pages 84 tests |
| 深度 | Go agent 测试函数名 | Go platform 分类 + E2E suite-level | TS runtime 逐函数名 | **TS features 逐函数名 + 每测试覆盖边界** |
| 新增关键 | member-removal cleanup + team FOR UPDATE lock | Playwright 正确 outcome + layout-metrics 正确 keys | schema/interpreter 74 最大 + queueStorage 29 上传冻结 | **OperationsPage queue visibility + SchemaEditor falsy 保留 + ToolExecution project isolation** |
