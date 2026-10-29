# B5 · Agent 与授权 · 预期核对与覆盖映射

日期：2026-10-29。基线：`225d71e`（B4 签收）。预期来源：[06 验收清单](../../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) 行 74–76/110–111。

## 签收策略

批次计划（acceptance-batches.md）明确：**A41/A42 单机侧系统凭据库与真实 OS 确认缺环境，保持待验不签收**。本批次仅签收 A05/A06/A07（3 条）。

## A05（两版，已签收）

| 维度 | 证据 |
|---|---|
| 云版 Go | `internal/configuration/validate_test.go` 表驱动：stdio browser→invalid、stdio configured→ok、stdio+HTTP→invalid、shell command string→ok；`internal/agent/process/process_test.go` TestCommandDoesNotUseShellOrInheritSecrets（空命令、含 `$(touch)` 不执行、`PLATFORM_SECRET` 不继承、相对 cwd→error） |
| 单机版 Go | 同配置/进程测试 `-tags local` 通过（无 `!local` build tag） |
| 前端 | browser-session.test.ts（58 tests，含 stdio channel 状态） |

## A06（两版，已签收——共享前端 + 云版 Go !local）

| 维度 | 证据 |
|---|---|
| 云版 Go | `agent_auth_test.go` 8 tests：TestAgentProofExchangeBindingReplayExpiryAndRevocation（device 绑定、重放拒绝、61s 过期、grant 15min + 受父会话约束）、TestAgentProofConcurrentExchangeOneWinner（8 并发仅 1 赢家）、TestAgentProofCookieCSRFAndExchangeCookieOriginRejected（evil Origin→403、带 cookie→403）、TestAgentExchangeRejectsBrowserFetchWithoutCookie（Sec-Fetch-*→403）、TestAgentPasswordResetRevokesProofsAndGrants、TestAgentGrantOriginParentLogoutDeadlineAndHashStorage（grant 存 SHA-256 digest、evil Origin 403、父会话 idle→grant 401）、TestAgentGrantHistoryOwnershipReceiptAndCurrentRole（Agent 身份绑定、权限降级/移除成员→403）、TestAgentGrantBoundedByParentAbsoluteDeadline（grant 到期=父会话 absolute 剩余） |
| 单机版 | 共享前端套件（D-B jsdom 等价）；Go `agent_auth_test.go` 为 `//go:build !local`（云版专属），单机版 auth_local.go 跳过角色校验——Agent 配对/过期/撤销逻辑由平台后端 + Agent 进程层实现，单机版 Agent 进程层与云版共用（无 build tag） |
| 前端 | browser-session.test.ts（agent-session.test.ts 订阅 agent 状态变化、离线/未配对/拒绝路径） |

## A07（两版，已签收——共享前端 + 云版 Go !local）

| 维度 | 证据 |
|---|---|
| 云版 Go | `credentials_test.go` 6 tests：TestCredentialBackupEncryptionOwnershipReauthAndMembershipDeletion（备份 AES-GCM 加密、nonce 不复用、owner/project/connection 绑定、权限降级→403、移除成员→404）、TestCredentialBackupRestoreWaitsForRoleRevocation（restore 等团队锁、降权后 403 且不泄露 secret）、TestCredentialBackupReferenceValidationCipherBindingAndWriteFailure（变量引用必须敏感、版本乐观锁、触发器失败 503 且原备份不变）、TestCredentialBackupAgentRestoreFreshPasswordAndConcurrentVersion（Agent bearer restore、改密码后旧密码 403）、TestCredentialBackupKeyLossStillAllowsMetadataAndPrivacyDeletion（key 丢失仍可列元数据/DELETE）、TestCredentialBackupRealRemovalAPIsPurgeOnlineCopiesAndSafeAudit（成员移除清 credential_backups 行、audit 不含 secret/密码） |
| 三态独立分类 | `internal/agent/platformclient/client.go:72-89`：401→platform_identity_expired；403 + 备份路由 + reauthentication_failed→保留；其他 403→project_permission_revoked。精确路由匹配 `/api/v1/projects/{id}/connections/{id}/credential-backups`（8 段）或 `.../{backupId}/restore`（10 段） |
| 单机版 | 共享前端套件；Go credentials_test.go 为 `//go:build !local`（云版专属） |
| e2e | `tests/e2e/v01-backup-retry.spec.ts:34`（V01 A07 production: failed personal backup preserves saved OAuth authorization and retries only the backup） |

## A41（两版，保持待验）

单机侧系统凭据库与真实 OS 确认缺环境（批次计划 012 + editions-spec）。云版有充分 Go 证据（credentials_test.go 5 tests + agent_auth_test.go + vault/store_test.go），但两版要求下暂不签收。

## A42（两版，保持待验）

单机侧系统凭据库与真实 OS 确认缺环境。Go 云版有充分证据（agent_auth_test.go 伪造来源/Sec-Fetch/并发/指纹校验 + process_test.go 无 shell/不继承环境 + engine.go fingerprint 变更强制重新确认），但两版要求下暂不签收。

## 环境与命令

- 云版 Go：12 包 exit 0——internal/configuration(0.9s) + internal/agent/lifecycle(1.9) + localapi(1.2) + mcp(2.4) + oauth(2.8) + pairing(1.5) + platformclient(3.2) + process(1.9) + queue(0.6) + sessions(1.6) + vault(0.9) + internal/platform(97.8)。
- 单机版 Go：internal/configuration(0.6s) + internal/agent/process(1.0s) exit 0（A05 两版）。
- go vet：全量 clean。
- 前端：Node 24.21.0 下 browser-session.test.ts 58 tests passed（覆盖 A05/A06/A07 通道/会话/凭据）。
