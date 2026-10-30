# B1 · 身份与协作 · 预期核对与覆盖映射

日期：2026-10-29。基线：`fff4f9b`（含 E00–E10）。预期来源：[06 验收清单](../../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) 对应行；条目正式文本见 [expectations.json](./expectations.json)。本文件记录最终覆盖状态（缺口已在 B1 内补齐），审阅结论见 [review.md](./review.md)。

## 云服务版（14 条）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A01 | 已覆盖 | `TestB1A01RetryAfterFailureCreatesSingleProject`（新增：失败不落库、重试只新增一个 maintained 项目）、`TestProjectNamesAndCreatorRelationship`、`TestConcurrentProjectCreationOnlyOne`、`TestV01A01NewProjectHasNoContentAndCreatorIsMaintainer`；前端 `projects/Projects.test.tsx`（失败定位、保留输入、成功后仅一次 `onCreated`） |
| A02 | 已覆盖 | 前端 `app/App.test.tsx`：`does not display content capabilities from a stale project response`（旧请求晚返回不污染新项目）、`keeps another project tool document when switching through a Viewer project`（草稿各自保留）、`refreshes stale CSRF for the same user and keeps the failed project draft` |
| A22 | 已覆盖 | `TestB1A22ViewerCannotExecuteOrReadPrivateDetail`（新增：Viewer 列表为空、直取详情 404、猜 operation ID 404、Viewer 上传 403）；`TestRecordHistoryFiltersStableCursorAndPrivateIsolation` |
| A24 | 已覆盖 | `TestInvitesRequireIdentityAndExplicitAcceptance`、`TestInviteRegistrationRequiresValidCodeAndDoesNotJoinAutomatically`、`TestInvitationEntryMaskedAndUnverifiedAcceptanceRejected`、`TestInviteExpiryRevokeResendAndSenderRevocation`、`TestConcurrentInvitationCreationAndAcceptance` |
| A25 | 已覆盖 | `TestInviteExpiryRevokeResendAndSenderRevocation`（新 ID/新期限、旧 token 失效、已接受重发 409） |
| A26 | 已覆盖 | `TestAdminGrantSelfAndTeamProjectRoleBoundaries`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` |
| A27 | 已覆盖 | `TestMemberProtectionsConcurrentAndTeamScope`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` |
| A28 | 已覆盖 | `TestB1A28FailedRemovalRetriesToScopedSuccess`（新增：失败后重试、影响范围与审计计数）、`TestV01A28SharedHistoryAndPublishedSavedAttributionSurvivesRemoval`（署名保留）、`TestTeamRemovalRevokesAllProjectsAndPendingInvites`、`tests/e2e/v01-membership.spec.ts`（取消无副作用） |
| A36 | 已覆盖 | `TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore`（新增：8h 后上传 401 `session_expired`）、`TestPublicRegistrationAndOriginRejected`、`TestInitializeConcurrentOnlyOneOwner`、`TestMissingMailCannotVerifyBootstrapOwner`、`TestLoginCookieCsrfExpirationAndLogout`、`TestSessionAbsoluteExpiresDespiteActivity` |
| A37 | 已覆盖 | `TestB1A37TakeoverOwnerStillCannotReadOthersPrivateRecords`（新增）、`TestDirectoryManagersReceiveAccessMetadataWithoutContent`、`TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped` |
| A55 | 已覆盖 | `TestB1A55ProjectScopedUploadIgnoresCurrentScreenRole`（新增：A=Viewer 403、B=Developer 200、跨项目不可见）；前端切换保留草稿 |
| A56 | 已覆盖 | `TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped`（`Confirmed` + 原因必填、审计含目标、仅目标项目受影响） |
| A57 | 已覆盖 | `TestRemovedMaintainerOldSessionNoManagementAndViewerReadOnly`、`TestDirectoryManagersReceiveAccessMetadataWithoutContent`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` |
| A58 | 已覆盖 | `TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore`（新增：伪造 Cookie 401 且无内容）、`app/App.test.tsx`（会话过期卸载项目上下文、深链接不回内容） |

## 单机版（A01、A02）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A01 | 已覆盖 | `TestB1LocalA01ProjectCreationValidationAndRetry`（`-tags local`，真实 PG：`name_required` 400、重名 409、重试成功且创建者为维护者、列表无重复）；`scripts/acceptance-b1-local.mjs`（`apps/local` 真进程回环 HTTP，同断言） |
| A02 | 已覆盖 | `TestB1LocalA02ProjectScopedDataIsolation`（`-tags local`：跨项目连接/记录不可见、读 404、往返不合并，R3 项目归属过滤）；同脚本回环复验；草稿保留由共享前端套件承担 |

## 环境与命令

- 云版：`MCP_STUDIO_TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/mcp_studio_test` → `go test -count=1 ./internal/platform/`。
- 单机版：`go test -count=1 -tags local ./internal/platform/`；回环旅程 `node scripts/acceptance-b1-local.mjs`（需 `.runtime/local-platform`，缺省时脚本自行 `go build -tags local ./apps/local`）。
- 前端：Node 24.21.0 下 `npx vitest run --config apps/web/vite.config.ts apps/web/src/app/App.test.tsx apps/web/src/features/projects/Projects.test.tsx`。
- 日志与 JSON 见本目录（`go-*-platform.log`、`go-*-b1-verbose.log`、`frontend-b1.log`、`local-edition.json`）。
