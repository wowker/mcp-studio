# B11 Review — Platform 131 Functions + Playwright + Frontend Structure

## Summary

B11 是 **B10 deep-dive 的延续**，把四个维度的"exit 0"深入到可追溯的名称/结构/边界：

1. **Platform 131 函数名** + build tag 三区（13 cloud-only / 3 local-only / 5 shared）— 之前只知道 platform 包 103s exit 0
2. **Playwright 14 suites / 33 specs** — 32/33 passed，唯一失败 `v01-agent-retry` 是已知 A38 环境版本差异
3. **Layout Metrics 37 entries** — 全部 pageOverflow=false + bodySize=14 + consoleErrors=0
4. **Frontend 61 files 结构** — runtime 12 + features 49，browser-session 58 tests 是最大单文件

**结论**：全边界覆盖充分，无 Critical 问题。

## Platform 包审阅分级

| 维度 | 分级 | 说明 |
|------|------|------|
| Build tag 分区 | ✅ Pass | 13 cloud-only (`!local`) + 3 local-only (`local`) + 5 shared (无 tag) 正确隔离，Go 两版门禁按设计跳过/编译 |
| Agent Auth (8 functions) | ✅ Critical | proof concurrent exchange one winner, grant bounded by parent absolute deadline, cookie CSRF, grant origin+deadline+hash, password reset |
| Credentials Backup (6 functions) | ✅ Critical | encryption ownership reauth membership deletion + restore waits for team lock + key loss still allows metadata + real removal purge + reference validation cipher binding |
| Backup Rotation (1 function) | ✅ Critical | offline atomic + preserves user version — B10 已深挖过 |
| Records (20+ functions) | ✅ Critical | capacity admission + one byte boundary + concurrent writers + source proof ownership + atomic replay + redaction schema + archive tombstone + sweep pin receipt |
| Configuration (6 functions) | ✅ Important | concurrent one wins + public scalar preservation + secret rejection + env variable layers + write-waiting-on-revocation |
| Session/Auth (18+ functions) | ✅ Critical | absolute expires despite activity + login cookie csrf + old cookie creates fresh session + reset single use revokes sessions |
| Entry/LocalPG (5 functions, shared) | ✅ Important | bundled PG dir + env precedence + Darwin shim injection — **B9 实机启动已证实** |
| Settings (shared) | ✅ Minor | defaults legal + precedence + reject unknown/secret keys |

## Playwright E2E 审阅分级

| 维度 | 分级 | 说明 |
|------|------|------|
| m1-m6-flow/m6-layout/m6-matrix (19 specs) | ✅ Critical | 生产入口初始化 + HTTP/SSE + Tool Schema + 会话过期 + **A60 全链连续旅程** + **A32b 键盘导航** + **A30/A31/A45 定量矩阵** |
| v01-agent-retry (1 spec, FAILED) | ⚠️ Minor | A38 环境版本差异，已知非逻辑 bug；B7 接收时已注明 |
| v01-backup-retry/cors-agent/membership/required-layout/run-preferences (5 specs) | ✅ Important | 备份重试 + Agent CORS + 成员身份 + 必须布局 + Run 偏好 |

## Layout Metrics 审阅分级

| 维度 | 分级 | 说明 |
|------|------|------|
| pageOverflow=false (37/37) | ✅ Critical | A30 四宽无溢出 |
| bodySize=14 (37/37) | ✅ Important | A45 字号层级正确 |
| consoleErrors=0 | ✅ Important | 无前端运行时错误 |
| 中英亮暗四宽全覆盖 | ✅ Important | 390/820/1024/1440 × en/zh × light/dark = 16 组合全过 |

## Frontend 结构审阅分级

| 维度 | 分级 | 说明 |
|------|------|------|
| runtime 核心 (12 files) | ✅ Critical | browser-session 58 tests（最大单文件）+ execution 15 tests + records 5 files + schema 2 files |
| features 主页面 (49 files) | ✅ Important | RecordEditors 13 + RecordsPage 11 + MembersPage 9 + OperationsPage 11 + ToolExecution 8 + SchemaArgumentEditor 13 — 全页面有对应测试 |
| App Shell (3 files, App.test.tsx 27) | ✅ Important | focus/theme/sidebar 保持 + session 过期 + project capability recheck |

## Critical Issues

**None.**

## Important Notes

1. **Platform `!local` 测试在 local build 下被跳过是设计正确**：`go test -tags local ./internal/platform/` 不会运行 agent_auth_test.go 等 cloud-only 测试——这是 build tag 预期行为，不是缺失覆盖。Agent process/sessions/vault/queue 等无 build tag 的两版共用包全部在 local build 下运行并通过。

2. **Playwright results.json 的正确 outcome 判断**：不是 `test['outcome']` 而是 `test['results'][0]['status'] === 'passed'`（Playwright 版本格式差异）。B8/B9 用 `status === 'expected'` + `results[0].status` 组合正确。

3. **Browser-session 是前端最大测试文件**（58 tests）——覆盖会话续期/CSRF/权限降级/boot retry 全链。App.test.tsx 27 tests 覆盖 Shell 层全局行为。

4. **Platform records_test.go 是 Go 最大测试文件**（20+ functions）——覆盖 capacity/schema/upload/sweep/archive/source proof 全部核心边界。

## B11 vs B10 差异

| 维度 | B10 | B11 |
|------|-----|-----|
| 类型 | Agent 包专项 + Backup/Credentials 边界 | Platform 131 函数名 + Playwright + Frontend 结构 |
| 价值 | agent/backup/credentials 测试函数 + 断言清单 | platform records/configuration/session/auth 完整 + Playwright E2E 复盘 + frontend 61 files 结构 |
| 产出 | expectations/coverage/review/manifest | 同四份，但 scope 从 agent → full stack cross-cut |
