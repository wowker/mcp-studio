# B9 Coverage Map — macOS 26 Single-OS Verification

| Entry | Verdict | Evidence Source |
|-------|---------|-----------------|
| T02a macOS Chrome 单版本 | ✅ signed-macos | m1.spec.ts 3/3 passed (2026-10-28) + m2.spec.ts 3/3 + Go 两版全过 + vitest 603 |
| T02b macOS 内嵌 PG 首启+bootstrap | ✅ signed-macos | **真实启动日志**：PG 18.6 ready → local edition 127.0.0.1:8080 → health 200 OK + Go local build 21 包全过 |
| T28a macOS Keychain Agent 凭据 | ✅ signed-macos | CGO_ENABLED=1 + local build → system_darwin.go 编译可达 + vault/store_test.go PASS |
| 内嵌 PG macOS 首启链路 | ✅ signed-macos | 真实 initdb + pg-binary + pthread shim + ensureInitdb/startCluster/stopPG 代码路径 |
| T02b-W Windows 配对 | ⏸️ pending-os | 缺 Windows；system_windows.go 代码就绪 |
| T02b-L Linux 配对 | ⏸️ pending-os | 缺 Linux；system_linux.go 代码就绪 |
| T25b Windows DPAPI | ⏸️ pending-os | 缺 Windows；system_windows.go ready |
| T25b-L Linux filesystem | ⏸️ pending-os | 缺 Linux；system_linux.go ready |
| T29b 备份介质 | ⏸️ pending-hardware | 无U盘/移动硬盘 |
| T32b-manual 人工键盘走查 | ⏸️ pending-manual | 纯人工 spot-check |
| T34a 云版部署恢复 | ⏸️ pending-env | 缺隔离云环境 |
| T35a macOS 安装包 | ⏸️ pending-packaging | packaging/ 不存在 |
| 签名与公证 | ⏸️ pending-infra | 无证书，不在 A01–A60 范围 |

## Verify Gates (2026-10-29, re-run for B9)

| Gate | Result | Duration |
|------|--------|----------|
| Go cloud `./internal/...` (22 pkgs) | ✅ PASS | platform ~100s + agent 11 ~30s |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ PASS | platform 3.5s |
| go vet cloud | ✅ clean | — |
| go vet local | ✅ clean | — |
| vitest run (Node 24.21.0) | ✅ 603/603 | 49.43s |

## Unique B9 Evidence (not present in B1-B8)

1. **真实启动日志** (tests/evidence/acceptance-b9/local-startup4.log):
   ```
   PostgreSQL 18.6 (Homebrew) on aarch64-apple-darwin25.6.0
   database system is ready to accept connections
   mcp-studio local edition listening on 127.0.0.1:8080
   ```
2. **真实 HTTP health check**: `GET http://127.0.0.1:8080/api/v1/health → 200 {"data":{"status":"ok","version":"0.1.0"}}`
3. **PG binaries** (Homebrew cache): `.runtime/pg-brew/postgresql@18/18.6_1/bin/{initdb,postgres,pg_ctl,...}`
4. **PG binaries** (embedded candidate): `.runtime/pg-cache/darwin/arm64/pgsql/bin/initdb`
5. **pthread shim**: `.runtime/pg_no_multithread_check.dylib` — macOS 26 postmaster interpose
6. **CGO build verification**: `CGO_ENABLED=1 go build -tags local ./internal/agent/vault/ → OK` (system_darwin.go compiled)

## B9 方法论说明

B9 不是 A01–A60 主批次的延续，而是**环境受限子项的单端（macOS）验证**。这些条目在 A01–A60 验收期间反复被标记"pending 不阻断"，因为它们需要跨 OS 或硬件环境。B9 在 macOS 26 上尽可能深挖，将能做的条目从 pending 升级为 `signed-macos`（注意不是完全 signed，限定在 macOS）。

跨 OS 条目（Windows/Linux）保留 pending，因为代码已就绪但缺实机验证。这符合 acceptance-methodology.md 的"环境受限不阻断"原则。
