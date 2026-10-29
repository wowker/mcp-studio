# B3 · 调试与记录 · 只读审阅

日期：2026-10-29。基线：`97ba2e7`（B2 签收）。审阅对象：现有 Go/前端测试在当前代码版本上的全绿覆盖；审阅方式：只读（未新增任何被测代码或测试代码——B3 业务逻辑 E 系列未触及，现有测试即当前版本有效证据）。结论：**无 Critical、无 Important**，Minor 2 条已登记。

## 1. 覆盖充分性检查

| 检查点 | 结论 |
| --- | --- |
| A11–A14 Go 层是否应有断言 | 否——Schema 可选参数默认 skip、focus/blur 不误报、Raw/Schema 错误处理、嵌套数组错误路径导航均为前端 UI 行为，Go handler 层无对应入口。前端 `SchemaArgumentEditor`（13 tests）+ `argumentDraft`（8 tests）已覆盖全部子句 |
| A15 取消竞态如何覆盖 | `TestRecordAtomicFailureRetryAndConcurrentReplay` 验证并发 replay 只生成一条 record/receipt（原子性）；`uploadValidation` handler 拒绝同一 RunID 的后续上传（identity_conflict）。Agent cancel 后晚返回不被改成成功由 Agent 进程层保证；平台后端只接受唯一 RunID 上传，不改变 cancel 状态——间接但有效覆盖 |
| A17 历史范围隔离 | `TestRecordHistoryFiltersStableCursorAndPrivateIsolation` 显式验证 viewer 不可见他人私有记录、cursor 稳定。前端 `RecordsPage` 工具内历史 vs 总历史筛选由前端实现，Go 层 handler 返回完整列表、前端做范围筛选 |
| A21 清理跳过 | Go `deleteRecord` handler 拒绝删除 pinned 记录、并发 replay 原子不产生并行修改；前端清理跳过逻辑在 `RecordsPage.test.tsx` 有覆盖 |
| A54 revision retry 幂等 | `TestRecordSavedMetadataConditionalPinDeletionAndIndependence` 验证 revision 后 metadata 更新 + note 脱敏 + stale 428；`TestAcceptedOwnProjectSaveAndRevisionReplayAfterDeveloperDowngrade` 验证降级后新操作 403 但 replay 返回同 receipt |

## 2. 逐条证据与正式预期的对应

| 条目 | 云服务版证据 | 单机版证据（全部两版） |
| --- | --- | --- |
| A11 | 前端 SchemaArgumentEditor（13 tests）+ argumentDraft（8 tests）：默认 skip、focus/blur 不误报、取消保留 | 共享前端套件 |
| A12 | 前端 argumentDraft：0/false/null/空数组保留语义；Go TestRecordDecoderEscapedWireBudgetAndAmbiguousJSON | 共享前端 + Go `-tags local` |
| A13 | 前端 SchemaArgumentEditor：Raw→原文保留、Schema 错→可回结构；Go TestRecordSchemaShapeAndJointMetadataSecretPropagation | 共享前端 + Go |
| A14 | 前端 SchemaArgumentEditor：嵌套错误路径→展开祖先聚焦；草稿不丢 | 共享前端 |
| A15 | 前端 runtime/execution（15 tests）：Tab 锁定/冻结/阻止双击/取消等待；Go TestRecordAtomicFailureRetryAndConcurrentReplay | 共享前端 + Go |
| A16 | 前端 runtime/execution：RPC rejection/401/权限拒绝分类；Go agent_auth.go handler 显式分类 401 agent_session_expired/invalid_agent_proof | 共享前端 + Go |
| A17 | Go TestRecordHistoryFiltersStableCursorAndPrivateIsolation；前端 RecordsPage | 共享前端 + Go |
| A18 | 前端 RecordStates + RecordsPage：恢复→新 Tab、0/false/null 保留、脱敏移除；Go TestRecordSavedMetadataConditionalPinDeletionAndIndependence | 共享前端 + Go |
| A19 | Go TestRecordSavedMetadataConditionalPinDeletionAndIndependence + TestRecordAtomicFailureRetryAndConcurrentReplay；前端 ToolExecution | 共享前端 + Go |
| A20 | Go TestRecordSavedMetadataConditionalPinDeletionAndIndependence（metadata revision 更新名/备注/脱敏，request/response 不变） | Go `-tags local` 同测试通过 |
| A21 | Go deleteRecord pinned 保护 + TestRecordAtomicFailureRetryAndConcurrentReplay；前端 RecordsPage | 共享前端 + Go |
| A23 | Go TestRecordUploadAtomicReplayScopeAndRedaction + TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies；前端 ToolExecution + RecordEditors | Go + 共享前端 |
| A34 | 前端 ToolDocumentTabs（2 tests）+ runtime tab store | 共享前端（Tab 前端管理） |
| A44 | 前端 SchemaArgumentEditor + ToolExecution；Go TestRecordIncompleteSavedCannotPublishByMetadataRevision | Go + 共享前端 |
| A46 | Go TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies + TestAdditionalRedactionUpdatesArchivedCopiesWithoutRevealingIdentity + TestAdditionalRedactionAcceptsClientSafeMetadataProjectionOnly | Go `-tags local` 同测试通过 |
| A53 | Go TestRecordBrowserSavedCopyPreservesAgentAttributionAndRequestOnlySchema + TestRecordSavedMetadataConditionalPinDeletionAndIndependence | Go + 共享前端 |
| A54 | Go TestRecordSavedMetadataConditionalPinDeletionAndIndependence + TestAcceptedOwnProjectSaveAndRevisionReplayAfterDeveloperDowngrade | Go + 共享前端 |
| A59 | Go TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies + TestAdditionalRedactionAcceptsClientSafeMetadataProjectionOnly；前端 RecordEditors | Go + 共享前端 |

## 3. 门禁状态（证据版本）

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| Go `./internal/platform` 云版（真实 PG 55432） | exit 0，97.7s | `go-cloud-platform.log` |
| Go `./internal/platform` `-tags local` | exit 0，1.4s | `go-local-platform.log` |
| 新增断言 | 本批不新增 | — |
| 前端 8 文件 B3 相关（Node 24.21.0） | 73 tests passed | `frontend-b3.log` |
| 全量两版基线 | 见 `tests/evidence/acceptance-baseline/`（fff4f9b） | manifest.json |

`go vet ./internal/platform` 与 `go vet -tags local ./internal/platform` 均通过；`gofmt -l internal/platform` 仅列出既有文件。

## 4. 限制与 Minor

- **Minor-1**：B3 业务逻辑 E 系列未触及，理论上现有测试在当前版本全绿即可签收；但"取消后晚返回不被改成成功"完全依赖平台后端拒绝同一 RunID 重复上传（Go TestRecordAtomicFailureRetryAndConcurrentReplay 的原子性保障）和 Agent 进程层实现——无 Go 显式「cancel race」断言。Agent 进程层在 B5 批次（Agent 与授权）做独立验收。
- **Minor-2**：单机版 A11–A14 前端 UI 行为由共享前端套件承担，未在单机回环旅程中重跑浏览器 UI（同 B2 A04/A10）。方法论 D-B 认可两版共用同一前端代码的 jsdom 等价性。

## 5. 审阅结论

18 条正式预期均有当前代码版本上的可执行证据；Go 层 records_test.go（20 函数）+ record_lifecycle_test.go（8 函数）覆盖 A17–A21/A23/A44/A46/A53/A54/A59；前端 SchemaArgumentEditor/argumentDraft/execution 覆盖 A11–A16/A34；共享前端套件覆盖单机版 UI 行为。**建议逐条签收**。
