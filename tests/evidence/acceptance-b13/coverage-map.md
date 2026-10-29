# B13 Coverage Map — Frontend Features 核心页面组件 8 Pages / 84 Tests

## 首次 features 逐函数名全清单（B1–B12 都只有模块级数字）

| # | 文件 | Tests | B11 提过？ | 核心覆盖边界 |
|---|------|-------|-----------|-------------|
| **1** | RecordEditors.test.tsx | **13** | ✅ 只说 13 | metadata revision freeze + ETag retry + Viewer read-only + redaction reason 脱敏 + source credential capture + Run cache invalidation |
| **2** | EnvironmentPage.test.tsx | **14** | ❌ 只提模块名 | personal values vs shared definitions + same-project route changes (5 files close) + reference repair + variable filter vs absent distinction |
| **3** | RecordsPage.test.tsx | **11** | ✅ 只说 11 | scoped API + filters + pagination + Viewer detail + foreign-owner reject + protected delete block + copy editor lifecycle |
| **4** | OperationsPage.test.tsx | **12** | ✅ 只说 11 | queue visibility (no read → no display) + Viewer frozen retry unavailable + discard recheck + retention 180 day cap + If-Match policy reload + competing window upload |
| **5** | SchemaArgumentEditor.test.tsx | **13** | ✅ 只说 13 | optional skip focus/blur safe + zero/false/null preservation + malformed Raw → Form blocked + oneOf branch edit + enum values distinct + local JSON draft error ignore |
| **6** | MembersPage.test.tsx | **9** | ✅ 只说 9 | invitation fact scope (same identity+project only) + delayed success different project → no record + member disappearance + scope confirmation delete |
| **7** | ToolExecution.test.tsx | **8** | ✅ 只说 8 | one call retry + malformed source block + redaction invalidates cache + Viewer revocation → this project still finish + failed validation → parameter editor (no Run) |
| **8** | v01-diagnostics.test.tsx | **4** | ❌ 没提 | A51 missing dependency + invalid typed reference → repair clears diagnosis (apply=false/true 各两测) |

**Features 总数**：8 pages / 84 tests（vs B11 只提模块级 ~70 tests）

### RecordEditors 13 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| freezes a failed metadata revision including its ETag and retries the exact operation | **revision ETag 绑定**——重试用原 ETag，不是新的 |
| fetches the current project policy and masks an opaque field before freezing a saved upload | **policy re-read + opaque field masking** |
| captures the current connection credential so edited metadata cannot leak it | **凭据在 redaction 后被 edit 也不能泄露** |
| preserves a save admission when another project is revoked during the fresh policy read | **另一个项目 revoke 不影响当前 save admission** |
| invalidates source Run caches when an additional revision completes after leaving its editor | **leave editor 后额外 revision → source Run cache 失效** |
| shows a read-only state for a Viewer | **Viewer 不能 submit standalone save editor** |

### RecordsPage 11 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| queries the real scoped API and preserves its connection+tool filters through pagination | **connection+tool filter 跨分页保持** |
| refuses a late or mismatched detail from another connection scope | **late detail 必须匹配当前 connection scope** |
| observes a scoped owner history once across equivalent scope object rerenders and rejects foreign-owner facts | **foreign-owner facts reject** |
| blocks confirming deletion when a protected operation appears after the panel is open | **protected operation → confirm delete block** |
| distinguishes a failed Run from mail delivery failure | **两种失败在 record locale + execution context 都区分** |

### OperationsPage 12 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| does not read or display queue contents when actual project read permission is absent | **无 read perm → 不读队列** |
| keeps frozen retry unavailable to Viewer even in presence of failed upload | **Viewer 永远不能 frozen retry** |
| rechecks captured discard set and refuses record that began uploading after confirmation | **discard 后才开始上传 → refuse** |
| preserves retention draft on policy conflict + If-Match only after explicit reload | **policy conflict → reload 拿新 If-Match** |
| allows retention up to deployment maximum 180 days | **上限 180 天** |

### EnvironmentPage 14 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| developer can prepare personal values but cannot edit shared definitions | **developer 只改 personal，不碰 shared** |
| never treats an unavailable explicit connection as project definitions | **connection draft ≠ project definitions** |
| 5 same-project route change tests | personal UI / env removal / definition removal / env conflict late=false / env conflict late=true — **全部在 route scope 切换时正确关闭** |

### SchemaArgumentEditor 13 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| keeps optional defaults skipped and focus or blur does not emit validation errors | **focus/blur safe——不会触发 validation error** |
| preserves zero false null empty arrays | **保留 falsy 值**（D08 核心）|
| malformed Raw text blocks Form until valid JSON | **JSON 不通过 → Form 被 block** |
| edits disjoint oneOf branch + validates only explicit canonical parameters | **oneOf 分支独立** |
| full validation rejects enabled empty optional numeric field without turning it into zero | **empty optional number → reject，不是 default 0** |

### ToolExecution 8 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| performs one call + retries frozen redacted upload despite later draft edits | **retries 用原 frozen body，不受 draft edit 影响** |
| malformed local source prevents calls + saving | **source 坏 → 不 call 不 save** |
| additional redaction invalidates cached result + save source without touching another project | **redaction 只影响当前 project** |
| finishes and uploads this project run after unrelated Viewer project revoked | **无关 project revoke 不影响当前 Run** |
| publishes failed execution validation into parameter editor **without creating a Run** | **execution 失败 → 不创建 Run** |
| retains redacted result after expiry / revocation + uploads only after admission resumes | **expiry/revocation 期间不 upload，等 admission 恢复** |

### MembersPage 9 Tests — 核心边界

| 测试 | 边界 |
|------|------|
| records invitation fact **only after successful creation in same identity and project** | **scope 严格：身份+项目必须一致** |
| does not record delayed invitation success for different current project | **delayed success 跨 project → 不记录** |
| does not record delayed invitation success after management permission revoked | **permission revoked 后 → 不记录** |
| requires scope confirmation before deleting another project member | **delete member 需要 scope confirm** |

### v01-diagnostics 4 Tests — A51

A51 "invalid dependency / invalid typed reference → repair clears diagnosis"，各两测（apply=false + apply=true），全部 pass。

## Verify Gates (2026-10-29) — 无漂移

| Gate | Result |
|------|--------|
| Go cloud `./internal/...` (22 pkgs) | ✅ EXIT 0 |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ EXIT 0 |
| go vet cloud + local | ✅ clean |
| vitest run（Node 24.21.0） | ✅ 61 files 603 tests |

## Deep-dive 批次累积

| 批次 | 深入到 | 累计可追溯边界 |
|------|--------|---------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 251+ tests + App Shell 27 | 278+ TS tests |
| **B13** | **Frontend features 核心 8 pages / 84 tests 逐函数名** | **+84 TS tests** |
| **总计** | | **Go 181+ / TS 362+ = 543+** |
