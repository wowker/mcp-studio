# B10 Coverage Map — Agent Deep Dive + Backup Boundaries

## Agent Packages (逐包专项)

| Package | Build Tag | Cloud | Local | Key Tests | Notes |
|---------|-----------|-------|-------|-----------|-------|
| lifecycle | 无 | ✅ PASS | ✅ PASS | agent_lifecycle_test.go | Agent 进程生命周期管理 |
| localapi | 无 | ✅ PASS | ✅ PASS | localapi_test.go | 单机版本地 API 端点 |
| mcp | 无 | ✅ PASS | ✅ PASS | mcp_test.go | MCP 协议握手 + 错误处理 |
| oauth | 无 | ✅ PASS | ✅ PASS | oauth_test.go | OAuth flow (单机版 authMode=none 但 Go 层可达) |
| pairing | 无 | ✅ PASS | ✅ PASS | pairing_test.go | Agent 配对并发仅 1 赢家 |
| platformclient | 无 | ✅ PASS | ✅ PASS | platformclient_test.go | Agent 对 Platform 端点调用 |
| process | 无 | ✅ PASS | ✅ PASS | process_test.go | Agent 子进程隔离 (无 shell, 不继承 env) |
| queue | 无 | ✅ PASS | ✅ PASS | queue_test.go | 上传冻结 + 重试不重调 Tool + 过期隔离 |
| sessions | 无 | ✅ PASS | ✅ PASS | sessions_test.go | A38 authenticated retry foreign-owner/wrong-project/not-held/browser-responsibility 4 子断言 |
| vault | 无 | ✅ PASS | ✅ PASS | store_test.go | 6 tests: encrypted scope restart+delete, vault unavailable 不删 session, foreign root/symlink 拒绝, session replacement 不复活本地凭据, ciphertext nonce + scoped cleanup failure, independent disks serialize master init |
| wire | 无 | — (no test files) | — | — | wire/ 是 generated code，无独立测试 |
| agent_auth | !local | ✅ PASS | ⏭️ SKIP | agent_auth_test.go 8 tests | cloud-only: proof exchange+concurrent, grant history+ownership, grant origin+deadline+hash, proof cookie+CSRF+origin, grant bounded by parent, exchange without cookie, password reset proofs+grants, concurrent exchange one winner |

**Agent 包关键设计验证**：
- `!local` build tag 正确隔离 cloud-only 认证逻辑（agent_auth_test.go 8 条 + credentials_test.go 6 条）
- 两版共用（无 build tag）的 lifecycle/process/sessions/vault/queue/localapi/mcp/pairing/platformclient/oauth 全部在 cloud + local 两版门禁下通过

## Backup Rotation (cloud-only, !local)

`internal/platform/backup_rotation_test.go` — **7 断言原子性验证**：

1. **原子性**：密钥轮换遇到损坏密文 → 拒绝部分提交（count=0 不变）
2. **密钥正确性**：用错误的 old key 轮换 → 拒绝，密文不变
3. **用户版本不丢失**：轮换后每条 `saved[i].Version` 保持原值
4. **用户内容不变**：轮换后 `ValueJSON` 保持原值（`{"token":"rotation-fixture","n":0}`）
5. **same key 拒绝**：`RotateBackupKey(..., next, next)` → err != nil
6. **完整轮换**：`RotateBackupKey(..., old, next)` → count=2（所有记录更新）
7. **损坏密文拒绝部分提交**：`UPDATE credential_backups SET ciphertext='bad'` → err != nil，之前完好记录的密文也不变

## Credentials Backup (cloud-only, !local)

`internal/platform/credentials_test.go` — **14 断言跨 6 函数**：

### TestCredentialBackupEncryptionOwnershipReauthAndMembershipDeletion
1. 未设 BackupKey → 503
2. 错误密码 → 403
3. 未确认 → 400
4. 密文不含明文 + nonce=12 字节
5. list 不暴露 valueJSON
6. restore 后 JSON 不变
7. 版本乐观锁：ExpectedVersion=1 → Version=2
8. nonce 不复用
9. BackupKey 更换后 restore → 503
10. 非 owner 不可 restore (developer → 404)
11. viewer 不可 restore → 403
12. 成员移除后 restore → 404（cleanup 清副本）
13. DELETE 后 restore → 404

### TestCredentialBackupRestoreWaitsForRoleRevocation
14. restore 等 team 锁 → pg_stat_activity Lock wait 确认，等待权限降级完成后才继续

### 其他 4 函数（已在前序批次验证）
- TestCredentialBackupRealRemovalAPIsPurgeOnlineCopiesAndSafeAudit (project/team scope)
- TestCredentialBackupReferenceValidationCipherBindingAndWriteFailure
- TestCredentialBackupAgentRestoreFreshPasswordAndConcurrentVersion
- TestCredentialBackupKeyLossStillAllowsMetadataAndPrivacyDeletion

## Verify Gates (2026-10-29) — 无漂移

| Gate | Result |
|------|--------|
| Go cloud ./internal/... (22 pkgs) | ✅ EXIT 0 (platform 103.8s) |
| Go local -tags local (21 pkgs) | ✅ EXIT 0 (platform 4.3s) |
| go vet cloud + local | ✅ clean |
| vitest run Node 24.21.0 | ✅ 61 files 603 tests (59.86s) |
| agent packages cloud | ✅ 11/11 |
| agent packages local (-tags local) | ✅ 10/10 |

## Deep Dive Value (vs B9)

B9 说"agent 包过了"，B10 具体到：
- 每个包的 build tag 分区状态（cloud-only vs 两版共用）
- vault 6 条具体断言（加密作用域重启删除/不可用不删 session/foreign root symlink 拒绝/nonce 不可预测/cleanup failure 不删磁盘/独立磁盘 master init 串行）
- sessions 4 条子断言（A38 foreign-owner/wrong-project/not-held/browser-responsibility 全拒）
- backup rotation 7 断言原子性 + credentials 14 断言边界
- 确认跨 OS build tag 条件：system_darwin.go `darwin && cgo` / system_windows.go `windows` / system_linux.go `linux` / system_unavailable.go 回退 `(!darwin && !windows && !linux) || (darwin && !cgo)`
