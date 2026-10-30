# B3 · 调试与记录 · 预期核对与覆盖映射

日期：2026-10-29。基线：`97ba2e7`（B2 签收）。预期来源：[06 验收清单](../../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) 行 80–90/92/103/113/115/127–128/133；条目正式文本见 [expectations.json](./expectations.json)。B3 业务逻辑 E 系列未触及，现有 Go/前端测试在当前代码版本上全绿即有效。

## 云服务版（18 条）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A11 | 已覆盖 | 前端 `SchemaArgumentEditor.test.tsx`（13 tests）+ `argumentDraft.test.ts`（8 tests）：嵌套可选项默认 skip、focus/blur 不误报、取消 skip 保留；Go 层无对应 handler（前端层处理 UI 行为） |
| A12 | 已覆盖 | 前端 `argumentDraft.test.ts`：`0`/`false`/`null`/空串/空数组保留各自语义，不自动省略或变 0；Go `TestRecordDecoderEscapedWireBudgetAndAmbiguousJSON`（JSON 边界处理） |
| A13 | 已覆盖 | 前端 `SchemaArgumentEditor.test.tsx`：Raw 语法错→原文保留不能回结构/执行；Schema 错→可回结构纠正；Go `TestRecordSchemaShapeAndJointMetadataSecretPropagation`、`TestRecordSchemaAnnotationTraversalKeepsNamedValidationNodes` |
| A14 | 已覆盖 | 前端 `SchemaArgumentEditor.test.tsx`：点击嵌套数组错误路径→展开祖先、聚焦正确字段、草稿不丢；Go 层无（前端导航） |
| A15 | 已覆盖 | 前端 `runtime/execution/index.test.ts`（15 tests）：执行后 Tab 锁定、参数冻结、双击执行阻止、取消等待不产生重复回调；Go `TestRecordAtomicFailureRetryAndConcurrentReplay`（并发 replay 返回同一 receipt，cancel 后晚返回不被改成成功——原子性保证） |
| A16 | 已覆盖 | 前端 `runtime/execution/index.test.ts`：RPC rejection 分类为 known protocol result、oversized response 保留策略、401 与权限拒绝分类；Go `agent_auth.go` handler 对 401 agent_session_expired / invalid_agent_proof 显式分类；无虚构 HTTP 成功（Go upload handler 拒绝伪造 success） |
| A17 | 已覆盖 | Go `TestRecordHistoryFiltersStableCursorAndPrivateIsolation`：history cursor 稳定、过滤条件生效、viewer 不可见私有记录；前端 `RecordsPage.test.tsx`（11 tests）工具内历史 vs 总历史筛选切换 |
| A18 | 已覆盖 | 前端 `RecordStates.test.tsx`（3 tests）+ `RecordsPage.test.tsx`：恢复历史→新未执行 Tab、0/false/null 保留、脱敏字段移除并提示；Go `TestRecordSavedMetadataConditionalPinDeletionAndIndependence`（saved 与来源生命周期独立） |
| A19 | 已覆盖 | Go `TestRecordSavedMetadataConditionalPinDeletionAndIndependence`（保存后来源 history 删除不影响 saved 可读性）、`TestRecordAtomicFailureRetryAndConcurrentReplay`（upload receipt 写入失败时不产生 partial commit，重试幂等）；前端 `ToolExecution.test.tsx`（调用成功上传失败→改草稿后重试无新 Run） |
| A20 | 已覆盖 | Go `TestRecordSavedMetadataConditionalPinDeletionAndIndependence`：metadata revision 更新名称/备注/脱敏 note，request/response 快照不变；保存与来源生命周期独立（删除来源 history 后 saved 仍可读）；`TestRecordBrowserSavedCopyPreservesAgentAttributionAndRequestOnlySchema`（saved 和来源各自独立身份） |
| A21 | 已覆盖 | Go `deleteRecord` handler：pinned 记录保护不能删除；`TestRecordAtomicFailureRetryAndConcurrentReplay`（并发 replay→同一 receipt，无并行修改）；前端 `RecordsPage.test.tsx`（清理跳过 pinned/待上传/上传失败） |
| A23 | 已覆盖 | Go `TestRecordUploadAtomicReplayScopeAndRedaction`（上传时自动脱敏嵌套秘密、response 回显脱敏）、`TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies`（私有副本同步脱敏）；前端 `ToolExecution.test.tsx` + `RecordEditors.test.tsx`（13 tests，脱敏修订/保存/复制一致脱敏、审计不存秘密原文） |
| A34 | 已覆盖 | 前端 `ToolDocumentTabs.test.tsx`（2 tests）+ runtime tab store：复制无运行结果、固定保护、批量关闭只作用非固定非运行项；Go 层无（Tab 由前端管理） |
| A44 | 已覆盖 | 前端 `SchemaArgumentEditor.test.tsx`（合法 JSON Schema 错存私有未完成草稿、不可发布执行）、`ToolExecution.test.tsx`（unsupported remote schema 标记与草稿保留）；Go `TestRecordIncompleteSavedCannotPublishByMetadataRevision`（incomplete saved 通过 metadata revision 改 visibility 被 400 拒绝） |
| A46 | 已覆盖 | Go `TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies`（additional-redaction 修订：权限 403、关联 saved 副本同步脱敏、审计 reason 不泄露秘密、DB 无残留）、`TestAdditionalRedactionUpdatesArchivedCopiesWithoutRevealingIdentity`（归档副本同步脱敏）、`TestAdditionalRedactionAcceptsClientSafeMetadataProjectionOnly`（只接受安全 metadata 投影）；前端 `RecordEditors.test.tsx`（脱敏修订表单隔离） |
| A53 | 已覆盖 | Go `TestRecordBrowserSavedCopyPreservesAgentAttributionAndRequestOnlySchema`（浏览器保存来自 agent 的历史→receipt ResponsibleEndpoint=browser 但 snapshot Executor=agent，新 ID/时间/上传快照独立）、`TestRecordSavedMetadataConditionalPinDeletionAndIndependence`（saved 与来源生命周期独立）、`TestRecordSourceProofOwnUnuploadedRunAndRedactedAuditHistory`（source proof 校验不继承来源上传缓存状态） |
| A54 | 已覆盖 | Go `TestRecordSavedMetadataConditionalPinDeletionAndIndependence`（metadata revision→版本+1、名称变「Renamed」、note 被脱敏为「[REDACTED]」、stale revision 428）、`TestAcceptedOwnProjectSaveAndRevisionReplayAfterDeveloperDowngrade`（revision replay→返回同 receipt、重试保持同操作身份/摘要、权限降级后新操作 403 但已接受 replay 返回 accepted） |
| A59 | 已覆盖 | Go `TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies`（additional-redaction 修订 reason 隔离、RedactionPointers JSON Pointer 校验、只接受安全 metadata 投影、关联副本同步脱敏、审计 reason 脱敏）、`TestAdditionalRedactionPrivacyCleanupAllowedAboveReducedCapacity`（容量降低时仍允许安全清理）；前端 `RecordEditors.test.tsx`（脱敏原因表单隔离、修订失败保留输入） |

## 单机版（18 条，全部两版）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A11–A14 | 已覆盖 | 共享前端套件（单机版使用同前端代码，方法论 D-B）；Go 层前端 UI 行为无对应 handler（两版共用同一前端） |
| A15–A16 | 已覆盖 | 共享前端套件；Go `-tags local` 全量通过（含 record upload/revision handler） |
| A17–A21 | 已覆盖 | 共享前端套件 `RecordsPage` 等；Go `-tags local` 同 records/record_lifecycle 测试通过 |
| A23 | 已覆盖 | Go `-tags local` `TestRecordAdditionalRedactionPolicyAndLinkedPrivateCopies` 通过；共享前端 |
| A34 | 已覆盖 | 共享前端套件（Tab 前端管理） |
| A44 | 已覆盖 | Go `-tags local` `TestRecordIncompleteSavedCannotPublishByMetadataRevision` 通过；共享前端 |
| A46 | 已覆盖 | Go `-tags local` records_revision handler 全量测试通过；共享前端 |
| A53–A54 | 已覆盖 | Go `-tags local` records revision handler + replay 测试通过；共享前端 |
| A59 | 已覆盖 | Go `-tags local` additional-redaction 测试通过；共享前端 |

## 环境与命令

- 云版：`MCP_STUDIO_TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/mcp_studio_test` → `go test -count=1 ./internal/platform/`（97.7s，exit 0）；`go vet ./internal/platform/`（干净）。
- 单机版：`go test -count=1 -tags local ./internal/platform/`（1.4s，exit 0）；`go vet -tags local ./internal/platform/`（干净）。
- 前端：Node 24.21.0 下 `vitest run` 8 文件 73 tests passed（SchemaArgumentEditor 13 + argumentDraft 8 + runtime/execution 15 + ToolExecution 8 + ToolDocumentTabs 2 + RecordsPage 11 + RecordStates 3 + RecordEditors 13）。
- 日志见本目录（`go-*-platform.log`、`frontend-b3.log`）。

## 新增 Go 断言说明

B3 业务逻辑 E 系列未触及，现有 Go/前端测试在当前代码版本上全覆盖 18 条验收子句，**本批次不新增 Go 专属断言**。records_test.go（20 函数）+ record_lifecycle_test.go（8 函数）覆盖 A17–A21/A23/A44/A46/A53/A54/A59；前端 SchemaArgumentEditor/argumentDraft/execution 覆盖 A11–A16/A34。V01 旧证据 `tests/evidence/v01-*` 作为辅助参考不抵扣当前版本全绿结果。
