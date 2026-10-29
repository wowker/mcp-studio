# B11 Coverage Map — Platform 131 Functions + Playwright E2E + Frontend Structure

## Platform Build Tag 分区终局确认（23 files / 131 functions）

| 分区 | 文件数 | Cloud | Local | 关键文件 |
|------|--------|-------|-------|---------|
| `!local` (cloud-only) | **13** | ✅ | ⏭️ SKIP | agent_auth(8), credentials(6), backup_rotation(1), records(20+), configuration(6), membership, projects, team removal, v01 assertions |
| `local` (单机版专属) | **3** | ⏭️ SKIP | ✅ | b1_local_edition_assertions, edition_local_auth, edition_local |
| 无 build tag (两版共用) | **5** | ✅ | ✅ | entry_test, entry_secrets_test, local_pg_test(PG shim), settings_test, record_fixtures_test |

**正确隔离验证**：Go cloud 22 包 + local 21 包两版门禁全绿，`!local` 测试在 local build 下编译阶段被跳过（不是运行时 failure，设计正确）。

## Platform 131 函数名按功能分类

### Auth / Session (cloud-only, !local) — ~18 functions
```
TestAgentExchangeRejectsBrowserFetchWithoutCookie
TestAgentGrantBoundedByParentAbsoluteDeadline
TestAgentGrantHistoryOwnershipReceiptAndCurrentRole
TestAgentGrantOriginParentLogoutDeadlineAndHashStorage
TestAgentPasswordResetRevokesProofsAndGrants
TestAgentProofConcurrentExchangeOneWinner
TestAgentProofCookieCSRFAndExchangeCookieOriginRejected
TestAgentProofExchangeBindingReplayExpiryAndRevocation
TestLoginCookieCsrfExpirationAndLogout
TestLoginWithOldCookieCreatesFreshSession
TestSessionAbsoluteExpiresDespiteActivity
TestSessionDurationValidation
TestResetSingleUseRevokesSessions
TestAdminGrantSelfAndTeamProjectRoleBoundaries
TestPublicRegistrationAndOriginRejected
TestInvitationEntryMaskedAndUnverifiedAcceptanceRejected
TestInvitesRequireIdentityAndExplicitAcceptance
TestInitializeConcurrentOnlyOneOwner
```

### Member/Project/Team (cloud-only, !local) — ~14 functions
```
TestConcurrentProjectCreationOnlyOne
TestMemberProtectionsConcurrentAndTeamScope
TestOwnerAdminSelfAndLastMaintainerRoleProtection
TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped
TestDirectoryManagersReceiveAccessMetadataWithoutContent
TestTeamRemovalArchivesAllProjectsAndInvitationRestoresOnlyJoinedProject
TestTeamRemovalRevokesAllProjectsAndPendingInvites
TestRemovedMaintainerOldSessionNoManagementAndViewerReadOnly
TestMailFailureAndInvalidInvitationDoNotCreateMembers
TestMissingMailCannotVerifyBootstrapOwner
TestProjectNamesAndCreatorRelationship
TestConcurrentInvitationCreationAndAcceptance
TestInviteExpiryRevokeResendAndSenderRevocation
TestInviteSenderCurrentAuthorityAndNoExistingRoleOverwrite
```

### Records (cloud-only, !local) — ~20 functions（**最大 group**）
覆盖 capacity admission/concurrent writers/private isolation/source proof/atomic replay/redaction schema/archive tombstone/sweep pin receipt 等全部核心边界。

### Configuration (cloud-only, !local) — 6 functions
并发保存 only-one-wins / public scalar preservation / secret rejection / environment variable layers / variable coverage / write-waiting-on-revocation。

### Credentials/Backup (cloud-only, !local) — 7 functions
加密所有权 reauth + 成员移除 cleanup + key loss metadata-only access + real removal purge + restore-wait-for-team-lock + offline rotation atomicity。

### Settings/Entry (shared, no tag) — ~5 functions
Settings defaults/precedence/reject-unknown-secrets + Entry secrets resolution。

### Local PG (shared, no tag) — 4 functions
bundled PG dir / env precedence / Darwin shim injection / shim path override → **B9 实机启动已证实**。

## Playwright E2E 14 Suites / 33 Specs / 32 Pass / 1 Fail

| Suite | Specs | Pass | Fail | 备注 |
|-------|-------|------|------|------|
| m1 | 3 | 3 | 0 | 生产入口邮箱生命周期 + 深链接拒绝 |
| m2 | 3 | 3 | 0 | HTTP/SSE handshake + CORS + stdio boundary |
| m3 | 5 | 5 | 0 | Agent 协议边界 |
| m4 | 4 | 4 | 0 | Tool schema 边界 |
| m5 | 3 | 3 | 0 | 会话过期 |
| m6-flow | 3 | 3 | 0 | A60 全链邀请/历史/保存复制 → **B8 签收** |
| m6-layout | 2 | 2 | 0 | A32b 键盘导航 → **B8 签收** |
| m6-matrix | 3 | 3 | 0 | 多语言亮暗四宽矩阵 → **A30/A31/A45 定量** |
| v01-agent-retry | 1 | 0 | 1 | ⚠️ 已知环境版本差异（非逻辑 bug）|
| v01-backup-retry | 1 | 1 | 0 | 备份重试 |
| v01-cors-agent | 1 | 1 | 0 | CORS + Agent |
| v01-membership | 2 | 2 | 0 | 成员身份 |
| v01-required-layout | 1 | 1 | 0 | 必须布局 |
| v01-run-preferences | 1 | 1 | 0 | Run 偏好 |

**唯一失败**：`v01-agent-retry.spec.ts` — A38 环境版本差异（B8 已注明，非逻辑错误）。
**整体 pass rate**：32/33 = 97.0%
**Playwright 版本**：与 results.json 匹配（dates: Oct 28 12:48-12:50）。

## Layout Metrics 37 Entries — macOS 生产入口定量

| 维度 | 值 |
|------|-----|
| 总 entries | 37 |
| pageOverflow=true | 0 |
| consoleErrors | 0 |
| bodySize | 14 (所有 entries 一致) |
| minimumTextSize | 12-14 |
| languages | en, zh |
| themes | light, dark |
| widths | 390 (mobile), 820, 1024, 1440 |

**结论**：A30 无横溢出 ✅, A45 bodySize=14 ✅, 中英亮暗四宽全过。

## Frontend 61 Files Runtime Structure

### Runtime 核心（12 files）
| 文件 | Tests | 覆盖 |
|------|-------|------|
| `runtime/browser-session.test.ts` | **58** | 最大单文件——会话续期/CSRF/权限降级/boot retry |
| `runtime/execution/index.test.ts` | 15 | MCP execution + 状态转换 |
| `runtime/execution/protocol.test.ts` | — | JSON-RPC |
| `runtime/execution/v01-environment-blocking.test.ts` | — | 环境阻塞 |
| `runtime/execution/fixture.test.ts` | — | fixture 生成 |
| `runtime/records/redaction.test.ts` | — | 脱敏 |
| `runtime/records/snapshot.test.ts` | — | 快照 |
| `runtime/records/queueStorage.test.ts` | — | 队列存储 |
| `runtime/records/operations.test.ts` | — | 操作 |
| `runtime/records/canonical.test.ts` | — | canonical 验证 |
| `runtime/schema/interpreter.test.ts` + `index.test.ts` | — | Schema 解释器 |
| `runtime/{agent-client,agent-session,vault,oauth,environment,connection,configuration}.test.ts` | — | Runtime 端点 |

### Features 主要（49 files）
| 模块 | Files | 代表文件 |
|------|-------|---------|
| tools | 7 | SchemaArgumentEditor(13), argumentDraft(8), ToolExecution(8), ToolDocumentTabs(2) |
| records | 4 | RecordEditors(13), RecordsPage(11), RecordStates(3), SessionUploads |
| operations | 1 | OperationsPage(11) |
| connections | 7 | ConnectionsPage, credentials/backups/oauth panels, runtimeStore, session |
| environment | 4 | EnvironmentPage, v01-diagnostics, AgentEnvironmentPanel, VariableEditor |
| team | 2 | MembersPage(9), protection |
| workflow | 3 | WorkflowPage, uploads, model |
| devices | 2 | DevicesPage, AgentQueuePanel |
| auth | 2 | IdentityStates, IdentityPage |
| projects | 1 | Projects |
| app | 3 | App(27), Shell, v01-shell-footer |
| shared | 4 | QueryFeedback, ui.layout, api, i18n |

## Verify Gates (2026-10-29) — 无漂移

| Gate | Result |
|------|--------|
| Go cloud `./internal/...` (22 pkgs) | ✅ EXIT 0 |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ EXIT 0 |
| go vet cloud + local | ✅ clean |
| vitest run Node 24.21.0 | ✅ 61 files 603 tests |

## B11 Deep-dive Value

| 维度 | 之前知道的 | B11 具体到的 |
|------|-----------|-------------|
| Platform 包 | "Go platform exit 0" | 131 函数名 + build tag 三区 + 每类具体测试清单 |
| Playwright | "32/33 通过"（口头） | 14 suite name/specs/pass/fail 逐行 + 唯一失败原因（已知环境版本差异）|
| Layout Metrics | "A30/A45 过了" | 37 entries 全 pageOverflow=false + bodySize=14 + consoleErrors=0 |
| Frontend 结构 | "61 files 603 tests" | runtime 12 files (browser-session 58 tests) + features 49 files 分模块清单 |
