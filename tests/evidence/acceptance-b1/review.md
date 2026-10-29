# B1 · 身份与协作 · 只读审阅

日期：2026-10-29。基线：`fff4f9b`（E00–E10）。审阅对象：本批新增断言与证据文件；审阅方式：只读（未修改任何被测代码，仅新增测试与夹具搬移）。结论：**无 Critical、无 Important**，Minor 4 条已登记。

## 1. 新增材料的自证风险检查

| 检查点 | 结论 |
| --- | --- |
| 断言是否恒真 | A36/A58 的泄漏检查改为针对 `records` 表中真实存在的 `RecordID`（先查库确认存在再断言越权响应不含该 ID），排除「ID 不会出现在任何响应里」导致断言空转 |
| 是否只测自己的夹具 | 云版全部经 HTTP handler 与真实 PG；单机版额外项目一律走 `POST /teams/{id}/projects` 等产品接口，仅复用既有 `prepareLocalFixture` 的本地主体/团队/项目种子 |
| 直接写库的例外 | 仅两处，且理由写在代码里：A37 的「被弃项目」在产品中不可经接口构造（A27 保护自身移除）；A01/A55 的计数断言配以接口返回值与列表双重校验 |
| 状态码是否与语义一致 | A22 Viewer 上传按实现为 403（团队内可见但无执行权）；A24/A25/A26/A27/A28/A56/A57 均直接复用既有回归，未新造期望 |

## 2. 逐条证据与正式预期的对应

| 条目 | 云服务版证据 | 单机版证据（仅 A01/A02 要求） |
| --- | --- | --- |
| A01 | `TestB1A01RetryAfterFailureCreatesSingleProject`（400/409 失败不落库、重试只新增一个 maintained 项目）、`TestProjectNamesAndCreatorRelationship`、`TestConcurrentProjectCreationOnlyOne`、`TestV01A01NewProjectHasNoContentAndCreatorIsMaintainer`；前端 `Projects.test.tsx`（失败保留输入、成功后仅一次 onCreated） | `TestB1LocalA01ProjectCreationValidationAndRetry`；`scripts/acceptance-b1-local.mjs` 回环旅程 |
| A02 | 前端 `App.test.tsx`：`does not display content capabilities from a stale project response`（旧请求晚返回不落屏）、`keeps another project tool document when switching through a Viewer project`（草稿保留）、`refreshes stale CSRF for the same user and keeps the failed project draft` | `TestB1LocalA02ProjectScopedDataIsolation`（项目归属过滤仍生效，跨项目读 404、往返不合并）；同脚本 |
| A22 | `TestB1A22ViewerCannotExecuteOrReadPrivateDetail`（列表空、直取详情 404、猜 operation 404、Viewer 上传 403）、`TestRecordHistoryFiltersStableCursorAndPrivateIsolation`、`records_test.go` 详情/操作 404 段 | — |
| A24 | `TestInvitesRequireIdentityAndExplicitAcceptance`、`TestInviteRegistrationRequiresValidCodeAndDoesNotJoinAutomatically`、`TestInvitationEntryMaskedAndUnverifiedAcceptanceRejected`、`TestInviteExpiryRevokeResendAndSenderRevocation`、`TestConcurrentInvitationCreationAndAcceptance` | — |
| A25 | `TestInviteExpiryRevokeResendAndSenderRevocation`（新 ID/新期限、旧 token 失效、已接受重发 409） | — |
| A26 | `TestAdminGrantSelfAndTeamProjectRoleBoundaries`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` | — |
| A27 | `TestMemberProtectionsConcurrentAndTeamScope`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` | — |
| A28 | `TestB1A28FailedRemovalRetriesToScopedSuccess`（失败后重试、影响范围与审计计数）、`TestV01A28SharedHistoryAndPublishedSavedAttributionSurvivesRemoval`（署名保留）、`TestTeamRemovalRevokesAllProjectsAndPendingInvites`、`tests/e2e/v01-membership.spec.ts`（取消无写请求） | — |
| A36 | `TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore`（8h 后上传 401 `session_expired` 且响应不含记录内容）、`TestPublicRegistrationAndOriginRejected`、`TestInitializeConcurrentOnlyOneOwner`、`TestMissingMailCannotVerifyBootstrapOwner`、`TestLoginCookieCsrfExpirationAndLogout`、`TestSessionAbsoluteExpiresDespiteActivity` | — |
| A37 | `TestB1A37TakeoverOwnerStillCannotReadOthersPrivateRecords`、`TestDirectoryManagersReceiveAccessMetadataWithoutContent`、`TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped` | — |
| A55 | `TestB1A55ProjectScopedUploadIgnoresCurrentScreenRole`（A=Viewer 403、B=Developer 200、B 记录在 A 不可见）；前端切换保留草稿 | — |
| A56 | `TestDirectoryDoesNotGrantProjectContentAndOwnerTakeoverScoped`（`Confirmed` + 原因必填、审计含目标、仅目标项目受影响） | — |
| A57 | `TestRemovedMaintainerOldSessionNoManagementAndViewerReadOnly`、`TestDirectoryManagersReceiveAccessMetadataWithoutContent`、`TestOwnerAdminSelfAndLastMaintainerRoleProtection` | — |
| A58 | `TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore`（伪造 Cookie 401、无内容）、`apps/web/src/app/App.test.tsx`（会话过期卸载项目上下文、深链接不回内容） | — |

## 3. 门禁状态（证据版本）

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| Go `./internal/platform` 云版（真实 PG 55432） | exit 0，94.6s | `go-cloud-platform.log` |
| Go `./internal/platform` `-tags local` | exit 0，1.6s | `go-local-platform.log` |
| 新增断言明细 | 6 条全 PASS / 2 条全 PASS | `go-cloud-b1-verbose.log`、`go-local-b1-verbose.log` |
| 前端 `App.test.tsx` + `Projects.test.tsx`（Node 24.21.0） | 21 tests passed | `frontend-b1.log` |
| 单机版回环旅程（真进程 + 内嵌 PG + `apps/local`） | 5 组断言通过 | `local-edition.json` |
| 全量两版基线 | 见 `tests/evidence/acceptance-baseline/`（fff4f9b） | `manifest.json` |

`go vet ./internal/platform` 与 `go vet -tags local ./internal/platform` 均通过；`gofmt -l internal/platform` 仅列出既有的 `entry_local.go`、`local_pg.go`（非本批改动）。

## 4. 限制与 Minor

- **Minor-1**：`scripts/acceptance-b1-local.mjs` 未纳入 `scripts/verify.mjs` 门禁，属批次专用证据脚本；是否长期保留由后续决定。
- **Minor-2**：单机版 A02 的「切换不丢草稿」由共享前端套件（`App.test.tsx`）承担，未在单机回环旅程中重跑浏览器 UI；方法论文档明确两版共用同一前端代码，D-B 的同套旅程在 jsdom 层满足。
- **Minor-3**：A01 前端断言依赖 `Projects.test.tsx` 的既有用例（失败→重试→仅一次 `onCreated`），未新增；如需更强的「最终只有一个项目」前端断言，可在 B7 复核时补。
- **Minor-4**：A28 的「移除失败」以目标不在项目内（404）建模，未覆盖网络中断类失败；产品无对应可注入故障点，登记为限制。

## 5. 审阅结论

14 条正式预期均有当前代码版本上的可执行证据；A01/A02 满足两版独立证据义务（方法论 D-B、R3/R4）。**建议逐条签收**，并在 B7 总签收时复核 Minor-3。
