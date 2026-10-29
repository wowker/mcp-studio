# B12 Coverage Map — Frontend Runtime 251+ Tests + App Shell 27

## 首次全清单（B1–B11 都只有 file-level 数量，B12 深入到 test name）

### Runtime 12 Files / 251+ Tests — 按大小排序

| # | 文件 | Tests | B11 提过？ | B12 覆盖边界 |
|---|------|-------|-----------|-------------|
| **1** | `schema/interpreter.test.ts` | **74** | ❌ 只说"schema 2 files" | JSON Schema 2020 全边界 + draft07 兼容 + regex DAG budget + reference cycle + decimal multipleOf + remote reference reject + regex portable profile + 4096 node cap |
| **2** | `records/redaction.test.ts` | **36** | ❌ 没提 redaction | 嵌套 secrets / password / email / URL / 凭据 echo rejection / JSON pointer inherit reject / `__proto__` own data / marker literal vs actual secret / browser alias / embedded credential URL |
| **3** | `browser-session.test.ts` | **58** | ✅ 说过 58 | SDK tool listing streamable-http+SSE / credential echo 三处位置 reject / output schema discovery CSP safe / call classification safe / connection credential freeze before async auth / transport failure classify network vs RPC |
| **4** | `records/queueStorage.test.ts` | **29** | ❌ 没提 queueStorage | **上传冻结核心**——frozen body reload / capacity block + inflight risk / stale owner reject / revoked pause / digest corrupt quarantine / two-queue one-op serial / rehydrate preserves revocations |
| **5** | `records/operations.test.ts` | **14** | ❌ 没提 operations | double submit one upload / retry original body / freeze metadata revision + redact reason / identity clear safe / source secrets provenance+annotation cannot echo |
| **6** | `execution/index.test.ts` | **15** | ✅ 说过 15 | Tab sync lock / local validation blocks Run / scoped authority+policy required / cancel without late success / credential_rejected vs generic transport loss / authorization_denied vs generic transport loss |
| **7** | `records/canonical.test.ts` | **9** | ❌ 没提 canonical | Unicode code points / decimal JSON text / versioned content hash |
| **8** | `schema/index.test.ts` | **5** | ❌ 没提 index | Worker isolation per job / CPU budget terminate / no raw exception leak / oversized job pre-reject |
| **9** | `records/snapshot.test.ts` | **1** | ❌ 没提 snapshot | Agent 64-hex version hash masking before save |

**Runtime 总数**：251+ tests（12 files 中 9 个拉了清单，另有 3 个 connection/session/runtimeStore 没逐函数拉但 B11 已确认存在）。

### Records 子模块覆盖全景（records/ 5 files / 90 tests）

```
records/
├── queueStorage    (29) ← 上传冻结 + 重试 + 凭据隔离 + capacity block
├── redaction      (36) ← 嵌套 secrets + pointer reject + URL secret + email + phone
├── operations     (14) ← 上传 retry + metadata freeze + source provenance
├── canonical       (9) ← Unicode + decimal + version hash
└── snapshot        (1) ← Agent version hash masking
                       -----
                       90 tests
```

### Schema 覆盖全景（schema/ 2 files / 79 tests）

```
schema/
├── interpreter (74) ← JSON Schema 2020 + draft07 + regex budget + decimal + refs
└── index        (5) ← Worker 隔离 + CPU budget + no leak
                       -----
                       79 tests
```

### Browser-session 58 Tests 核心边界

| 类别 | Tests | 关键 |
|------|-------|------|
| SDK Tool Listing | 6 | streamable-http + SSE 两种 transport; requires connected tools-capable session; empty catalog as empty array |
| Catalog Reject | 7 | bounds: repeated cursor / too many tools / too many pages / duplicate names / empty identity / malformed schema / large catalog; reject untrusted protocol error |
| HTTP Mapping | 2 | 401 + 403 → safe diagnostics, no fallback |
| Credential Echo Rejection | 3 | tool name + description + schema 三处位置 reject known credential |
| Metadata Secret Rejection | 3 | recognizable secret without value in error; public header values NOT treated as secrets |
| Output Schema Discovery | 2 | streamable-http + SSE, no SDK dynamic validator (strict CSP) |
| Call Through SDK | 2 | streamable-http + SSE, wire validation without dynamic output compiler |
| Config/Env Validation | 2 | refuses changed config + resolved env BEFORE call traffic; sanitization persists after values change or disconnect |
| Call Lifecycle | 5 | per-call cancel + late response → no disconnect, no late success; raw JSON-RPC error → safe classification; HTTP 401+403 ahead of SDK closed-connection; transport failure classify as network not RPC |
| Connection Identity | 3 | checks current connection identity for restoration WITHOUT reading execution env; freezes credential before async authority lookup; malformed SDK result → protocol failure without exposing raw payload; RPC error context private |

### App Shell 27 Tests 核心边界

| 类别 | Tests | 关键 |
|------|-------|------|
| Shell Layout Preservation | 1 | language/theme/sidebar controls keep page input + focus |
| Session Expiry Handling | 2 | session expiry → unmount project context; server idle deadline recheck on activity (no local expiry) |
| Project Capability | 3 | stale project response capabilities hidden; forbidden write → recheck capability (no signout); unavailable project → scoped return action |
| Bootstrap | 4 | mailbox verification enables project loading; bootstrap failure → working retry (no endless loading); session deadline + bootstrap refresh fail → hide expired content + recovery; late initial 401/success after newer identity → ignored |
| CSRF + Permission Refresh | 2 | stale CSRF refresh keeps failed project draft; team permission refresh on forbidden changes |
| Stale Identity | 3 | 401 → different account → old project hidden before scope load; stale personal authorization form hidden; obsolete refresh 401 → does not expire newer check |
| Invitation Path | 2 | no invitation → canonical invalid invitation path; anonymous sign in when 401 arrives before bootstrap |
| Tool Document Scope | 1 | Viewer project switch → keeps other project tool document |

## Verify Gates (2026-10-29) — 无漂移

| Gate | Result |
|------|--------|
| Go cloud `./internal/...` (22 pkgs) | ✅ EXIT 0 |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ EXIT 0 |
| go vet cloud + local | ✅ clean |
| vitest run（Node 24.21.0） | ✅ 61 files 603 tests |

## B12 vs B11 vs B10 差异

| 维度 | B10 | B11 | B12 |
|------|-----|-----|-----|
| 范围 | Agent 11 包测试函数名 + credentials/backup | Platform 131 函数名 + Playwright 14 suites + Layout Metrics 37 + Frontend 61 files 结构 | **Frontend runtime 逐函数名 + App Shell 27** |
| 深度 | agent/backup/credentials 断言级别 | platform 分类 + E2E suite-level | **runtime 每个文件 15-74 tests 逐函数名** |
| 发现 | member-removal cleanup + team FOR UPDATE lock | Playwright 正确 outcome 路径 + layout-metrics 正确 keys | **schema/interpreter 74 tests 是最大单文件 + queueStorage 29 tests 上传冻结 + redaction 36 tests 凭据 echo** |
