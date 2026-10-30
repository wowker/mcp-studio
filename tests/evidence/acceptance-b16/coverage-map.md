# B16 Coverage Map — 入口层深潜

**日期**: 2026-10-30
**批次类型**: deep-dive
**前置**: B15（internal 零测试包已覆盖）

---

## 1. 盘点结果

| 文件 | 行数 | 已有测试 | 判定 |
|---|---|---|---|
| `cmd/agent/main.go` | 147 | `run`/`execute` 经 diagnostics_test 覆盖 | `deviceIdentity` **零测试** ← 缺口 |
| `cmd/agent/options.go` | 75 | origin / loopback / secret-echo 已测 | 模式互斥 + 目录约束 **未测** ← 缺口 |
| `cmd/agent/confirmation.go` | 60 | `writeConfirmationPrompt` 已测 | 充分 |
| `cmd/agent/diagnostics.go` | 67 | `execute` 已测 | 充分 |
| `cmd/studio-admin/main.go` | 79 | `key`（32 字节 + 缺失报错）、`run` 已测 | 充分 |
| `apps/local/main.go` | 17 | `!local` 守卫 | 编译验证 |
| `apps/local/main_local.go` | 23 | `local` 真实入口 | 编译验证 |
| `apps/cloud/main.go` | 21 | 组装入口 | 编译验证 |

---

## 2. 逐条覆盖表

### 2.1 `cmd/agent/device_identity_test.go` — 7 tests

设备身份是 Agent 的持久身份，被 symlink 劫持或静默替换等同于设备冒充。`deviceIdentity`（[main.go:111-147](file:///Users/wuwei/code/github/mcp-studio/cmd/agent/main.go#L111-L147)）有以下安全属性，此前全部无断言：

| 测试函数 | 锁定的安全属性 | 代码行 |
|---|---|---|
| `TestDeviceIdentityCreatesStablePrivateIdentity` | 生成随机身份；文件权限 **0600**；二次调用返回同一身份 | 134-146 |
| `TestDeviceIdentityAcceptsMatchingExplicitRequest` | 显式 requested 匹配已存身份 → 复用 | 119-122 |
| `TestDeviceIdentityRejectsMismatchedExplicitRequest` | 请求与已存不符 → `device_identity_mismatch` | 119-120 |
| `TestDeviceIdentityRejectsInvalidStoredIdentity` | 已存含空格（`vault.ValidID` 拒绝）→ 拒绝 | 119 |
| `TestDeviceIdentityRejectsInvalidExplicitRequest` | 非法 requested（含 `/`）→ `invalid_device_identity` 且**不落盘** | 131-133 |
| `TestDeviceIdentityRejectsSymlinkSubstitution` | symlink → `unsafe_device_identity`（**防劫持**） | 113-115 |
| `TestDeviceIdentityRejectsUnreadableEntry` | 条目为目录 → `device_identity_unavailable` | 124-126 |

### 2.2 `cmd/agent/options_modes_test.go` — 6 tests

| 测试函数 | 锁定的分支 | 代码行 |
|---|---|---|
| `TestAgentModesAreMutuallyExclusive` | version/diagnose/install/upgrade/uninstall 只能选一个 | options.go:38-46 |
| `TestInstallModesRequireAbsoluteStateDirectory` | install/upgrade/uninstall 必须有绝对 state-dir | options.go:50-55 |
| `TestListenMustBeLiteralLoopbackWithRealPort` | 必须字面 `127.0.0.1` + 非零端口 | options.go:60-63 |
| `TestOriginRequiresHTTPSUnlessExplicitLoopback` | https 强制；AllowInsecureLoopback **只放行 loopback 主机** | options.go:56-59 |
| `TestDefaultStateDirectoryIsAbsolute` | 默认目录为绝对路径 | options.go:64-73 |
| `TestMemoryOnlyIsRecorded` | `--memory-only` 正确记录 | options.go:29 |

> 注: `TestListenMustBeLiteralLoopbackWithRealPort` 覆盖 `localhost` 被拒——loopback 必须是字面 IPv4，不接受名称解析。

---

## 3. 门禁

### 3.1 标准 4 道门

| 门 | 命令 | 结果 |
|---|---|---|
| 1 云版 | `go test -count=1 ./internal/...` | ✅ 22 包 ok（platform 209.490s） |
| 2 单机版 | `go test -count=1 -tags local ./internal/...` | ✅ 21 包 ok（platform 5.845s） |
| 3 vet | 两版 `go vet ./internal/...` | ✅ clean |
| 4 前端 | `npx vitest run`（Node 24.21.0） | ✅ 61 files / 603 tests / 0 failed |

### 3.2 入口层专项（B16 新增）

| 项 | 结果 |
|---|---|
| `go test ./cmd/... ./apps/...`（云版） | ✅ cmd/agent 0.881s、studio-admin 1.276s、apps 无测试文件 |
| `go test -tags local ./cmd/... ./apps/...` | ✅ cmd/agent 0.639s、studio-admin 1.030s |
| `go vet ./cmd/... ./apps/...` 两版 | ✅ clean |
| 编译可达性（云版） | ✅ cmd/agent + cmd/studio-admin + apps/cloud + apps/local |
| 编译可达性（单机版） | ✅ apps/local + internal/platform |

---

## 4. apps 入口为何不写测试

`apps/local/main.go`（`!local`）与 `apps/local/main_local.go`（`local`）都只做一件事：调用 `platform.RunLocal` 或打印拒绝信息后 `os.Exit(1)`。`apps/cloud/main.go` 同理。它们没有可独立断言的逻辑分支，且 `main()` 直接 `os.Exit` 无法在进程内测试。

按 B9 的既有做法，用**两版编译可达性**作为证据：

- `go build -tags local ./apps/local ./internal/platform` 通过 → 单机版入口可构建
- `go build ./apps/local ./apps/cloud` 通过 → `!local` 守卫入口可构建

这证明两条构建路径都存在且类型正确，不伪造进程内测试。

---

## 5. 覆盖增量

| 维度 | B15 累计 | B16 增量 | 累计 |
|---|---|---|---|
| Go 边界 | 199+ | +13 | **212+** |
| TS tests | 490+ | — | 490+ |
| E2E specs | 33 | — | 33 |
| **总计** | 722+ | **+13** | **735+** |
