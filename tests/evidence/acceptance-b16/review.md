# B16 Review — 入口层深潜

**日期**: 2026-10-30
**批次类型**: deep-dive
**结论**: 无阻断项，可签收

---

## Critical（阻断签收）

无。

---

## Important（批次内修复）

无。

---

## Minor（记录不阻断）

| # | 观察 | 说明 |
|---|---|---|
| M1 | `deviceIdentity` 的 symlink 测试在 symlink 不可用的平台会 `t.Skip` | macOS/Linux 可正常执行；Windows 无权限时跳过。当前门禁在 macOS 上实际执行并通过。 |
| M2 | 未测 `deviceIdentity` 的 `f.Sync()` 失败路径 | 需要注入文件系统错误，成本高。该路径返回 `device_identity_unavailable`，与已测的"目录条目"路径同属兜底错误。 |
| M3 | `parseOptions` 未测 `os.UserConfigDir()` 失败分支 | Go 标准库在正常环境下不失败；测试该分支需要 mock 环境变量，价值低于成本。默认目录绝对性已由 `TestDefaultStateDirectoryIsAbsolute` 覆盖。 |
| M4 | `cmd/agent/run`（main.go:33）未被直接单元测试 | 它启动 HTTP server 并阻塞在信号处理上；`diagnostics_test` 通过 `execute` 覆盖了同一代码路径的决策分支。真正的 `run` 行为由 `unpair_test`（166 行）端到端覆盖。 |
| M5 | `apps/*` 三个 `main()` 无测试 | 见 coverage-map 第 4 节说明：纯组装 + `os.Exit`，采用两版编译可达性验证，不伪造进程内测试。 |

---

## 审阅确认

- ✅ 新增 2 个测试文件全部为真实断言，无占位、无 `t.Skip` 滥用（symlink 跳过有平台理由）
- ✅ `deviceIdentity` 七个分支与 `main.go:111-147` 逐行对应
- ✅ `parseOptions` 六个分支与 `options.go:20-75` 逐行对应
- ✅ 断言了"拒绝时不落盘"（`TestDeviceIdentityRejectsInvalidExplicitRequest`），避免只测错误码不测副作用
- ✅ 断言了文件权限 0600（`TestDeviceIdentityCreatesStablePrivateIdentity`）
- ✅ 未修改任何生产代码
- ✅ 标准 4 道门 + 入口层专项门禁全部绿
- ✅ 两版编译可达性验证通过（非跳过）

---

## 安全价值排序

1. **`TestDeviceIdentityRejectsSymlinkSubstitution`** — 最高。若 symlink 被接受，本地攻击者可把 `device-id` 指向任意文件，Agent 会以攻击者控制的身份运行，进而影响配对与凭据作用域。
2. **`TestDeviceIdentityRejectsMismatchedExplicitRequest`** — 防止显式参数覆盖已存身份。
3. **`TestOriginRequiresHTTPSUnlessExplicitLoopback`** — 防止 `--allow-insecure-loopback` 被误用于任意 HTTP 主机。
4. **`TestListenMustBeLiteralLoopbackWithRealPort`** — 防止 Agent 监听非 loopback 地址。

---

## 未做（明确排除）

| 项 | 原因 |
|---|---|
| 为 `apps/*` 写进程内测试 | `main()` 直接 `os.Exit`，不可测；编译可达性已足够 |
| 为 `cmd/agent/run` 写信号处理测试 | 需真实 HTTP server + 信号注入，属集成测试范畴，由 unpair_test 端到端覆盖 |
| 为 `confirmation.go` 补充测试 | 现有 `TestNativeConfirmationQuotesEveryUntrustedTerminalValue` 已覆盖终端值引用安全 |
| 为 `studio-admin` 补充测试 | 现有 `TestOfflineConfirmationAndKeyFilesFailClosed` 已覆盖离线确认与密钥文件 fail-closed |
