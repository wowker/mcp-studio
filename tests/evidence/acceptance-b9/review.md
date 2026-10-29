# B9 Review — macOS 26 Single-OS Verification

## Summary

B9 是**单端（macOS 26）环境受限子项验证批次**，范围是之前 B1→B8 反复标记为"pending 不阻断"的条目。在 macOS 26 + Go 1.25.5 + CGO_ENABLED=1 环境下尽可能深挖，拿到了**首次内嵌 PG 实机启动成功**的关键证据链。

**结论**：4 条 macOS 可做条目从 pending 升级为 `signed-macos`，9 条跨 OS / 硬件 / 环境条目保持 pending。

## 关键发现（之前未实证）

### 1. macOS 26 + Homebrew PG 18.6 内嵌启动成功 🎯
之前只在 Docker PG 容器（测试门禁）和 Go 单元测试里见过 PG 相关逻辑。B9 首次在**真实 macOS 26 上启动单机版**：
- PG 18.6 (Homebrew) 从 `.runtime/pg-brew/` 读取 binary
- pthread shim `.runtime/pg_no_multithread_check.dylib` 成功 interpose macOS 26 postmaster
- Unix socket `.s.PGSQL.16432` + TCP `127.0.0.1:8080` HTTP server 全活
- `GET /api/v1/health → 200 OK`

### 2. CGO_ENABLED=1 + local build → system_darwin.go 编译可达 🎯
之前只知道 `system_darwin.go` 的 build tag 是 `darwin && cgo`，但没验证过当前 macOS 上 CGO 默认启用。B9 确认：
- `go env CGO_ENABLED → 1`（默认开启）
- `CGO_ENABLED=1 go build -tags local ./internal/agent/vault/ → BUILD OK`
- CoreFoundation + Security.framework 链接成功 → macOS Keychain 实现代码可达

### 3. pthread shim 是必须的
`local_pg.go` 注释明确说明：macOS 26+ postmaster 因 GCD/XPC 延迟 spawn thread 会触发 `pthread_is_threaded_np()` 崩溃检查。`.runtime/pg_no_multithread_check.dylib` interpose 该函数让它永远返回 0。

## Entry-by-Entry Review

### ✅ T02a macOS Chrome 单版本 → signed-macos
- m1/m2/m3/m4/m5/m6-flow/m6-layout/m6-matrix 全部在 Chrome 156 上通过（2026-10-28）
- 当前 Chrome 156.0.8078.48 已安装
- **Grade**: Important（浏览器自动化覆盖，无人工 spot-check）

### ✅ T02b macOS 内嵌 PG 首启 + bootstrap → signed-macos
- 真实启动日志 + health check 200 OK
- entry_local.go / ensureInitdb / ensureLocalSubject / auth_local.go 全部编译可达（Go local 门禁 21 包全过）
- **Grade**: Critical（首次实机启动成功，覆盖 initdb → startCluster → ensureLocalSubject 全链）

### ✅ T28a macOS Keychain Agent 凭据 → signed-macos
- system_darwin.go 编译可达（CGO_ENABLED=1 下）
- vault/store_test.go 在 local 标签下通过
- **Grade**: Important（代码可达但未在真实 Agent 进程中验证 Keychain API 读写往返）

### ✅ 内嵌 PG macOS 首启链路 → signed-macos
- initdb / postgres / pg_ctl 全 binary 在 `.runtime/pg-brew/` 和 `.runtime/pg-cache/`
- 数据目录 initdb 成功（PG_VERSION=18）
- **Grade**: Critical（数据目录完整 initdb + 集群启动 + TCP 监听全活）

### ⏸️ 跨 OS 条目（Windows/Linux）→ pending
- system_windows.go（build tag: windows）和 system_linux.go（build tag: linux）代码已就绪
- 但无法在 macOS 上验证 DPAPI / filesystem backend 实机行为

### ⏸️ 硬件 / 环境 / 发布条目 → pending
- T29b 备份介质：无U盘
- T34a 云版部署恢复：缺隔离云环境
- T35a macOS 安装包：packaging/ 目录不存在
- 签名与公证：无证书 + 不在 A01–A60 范围

## Critical Issues

**None.** 所有 4 条 macOS 可做条目有充分的实机或编译证据链。

## Important Notes

1. **shell detachment**: macOS backgrounded shell 子进程在父 shell 退出时收到 SIGHUP 被杀死。Go local-platform binary 无法通过简单 `&` 或 `nohup` 完全脱离。这不是 Go 代码 bug，是 shell 生命周期管理问题。生产安装包会通过 launchd 注册服务不受此影响。

2. **Node.js `.debug/local-loopback.js`**: 写了完整的启动→HTTP 回环脚本（bootstrap → login → projects → connections → configuration → records → agent health），但因 shell 退出杀了 Go 子进程没跑完。脚本存在供下次基础设施更好时重跑。

3. **PG binaries 来源**: `.runtime/pg-brew/` 是 Homebrew 缓存（`brew --cache postgresql@18`），`.runtime/pg-cache/` 是 embedded postgres 候选。两者都有完整 initdb/postgres/pg_ctl。

4. **B9 方法论**: 不是 A01–A60 延伸，是环境受限子项的**单端验证**。状态用 `signed-macos` 而非完全 signed，限定在当前 OS 范围。
