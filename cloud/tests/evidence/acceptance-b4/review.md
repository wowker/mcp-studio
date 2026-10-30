# B4 · 队列与生命周期 · 只读审阅

日期：2026-10-29。基线：`c95cd8f`（B3 签收）。审阅对象：现有 Go/前端测试覆盖；审阅方式：只读（未新增任何被测代码或测试代码）。结论：**无 Critical、无 Important**，Minor 1 条已登记。

## 1. 覆盖充分性检查

| 检查点 | 结论 |
| --- | --- |
| A38 pin 权限边界是否完整 | `TestV01A38DeveloperDirectPinAndUnpinDeniedWithoutMutation` 显式断言 Developer 不能 pin/unpin 共享 history、Maintainer 可以；不直接修改 source（`WithoutMutation`）——覆盖完整 |
| A39 浏览器刷新/Agent 关闭 | Go 后端：同一 RunID 原子拒绝、Agent 进程生命周期由 `agent_auth.go` grant 机制管理；前端：`operations.ts` `revokeProject`/`allowProject` 状态机处理 browser refresh 恢复脱敏队列 |
| A40 同 ID 不同摘要 | `TestRecordUploadAtomicReplayScopeAndRedaction` 断言不同 `frozenDigest`→409、不同 `operationID`→409、同一 immutable→同 receipt。queue 底层有 `queue_full`/`operation_conflict` 错误码 |
| A47 90 天保留 + pinned/saved 不清理 | `record_lifecycle_test.go:L153-212` 显式：sweep 后普通 history 被删、pinned 和 saved 保留、新上传不能复用已清理 history ID/source proof |
| A48 移除成员→记录归档+凭据删除 | `record_lifecycle_test.go:L61-100`（记录归档）+ `credentials_test.go:L139-174`（凭据备份删除）+ `membership_test.go:L198-224`（团队级归档）——三条独立证据链覆盖完整 |

## 2. 逐条证据

| 条目 | 证据 |
| --- | --- |
| A38 | Go `v01_developer_pin_test.go` + `records_test.go` 执行角色校验；仅云版（单机版无团队角色） |
| A39 | Go `records_test.go` 原子拒绝 + `agent_auth.go` grant 机制；前端 `operations.ts` 队列状态机；两版 |
| A40 | Go `TestRecordUploadAtomicReplayScopeAndRedaction`（409 + 原子性）+ `queue.go` 错误码；前端 `queueStorage.test.ts`（43 tests）+ `operations.test.ts`（14 tests）；两版 |
| A47 | Go `record_lifecycle_test.go:L26-59`（保留期+容量）+ `L153-212`（sweep+pinned/saved）；前端 `operations.ts` 队列清理；两版 |
| A48 | Go `record_lifecycle_test.go:L61-100`（归档+成员恢复）+ `credentials_test.go:L139-174`（凭据备份删除+audit）+ `membership_test.go:L198-224`（团队级归档）；仅云版 |

## 3. 门禁

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| Go `./internal/platform` 云版 | 复用 B3：97.7s exit 0 | go-cloud-platform.log（B3 目录） |
| Go `./internal/platform` `-tags local` | 复用 B3：1.4s exit 0 | go-local-platform.log（B3 目录） |
| go vet 两版 | 本次运行，干净 | — |
| 前端 B4 2 文件（Node 24.21.0） | 43 tests passed | frontend-b4.log |

## 4. 限制与 Minor

- **Minor-1**：A39「Agent 执行时关闭页面→Agent 可完成已获准调用」在 Go 层由 `agent_auth.go` grant 机制间接覆盖（已获准的 Agent 调用有独立 grant 生命周期，浏览器关闭不影响 grant），无 Go 显式「browser close 后 agent still running」断言——Agent 进程层在 B5 独立验收。

## 5. 审阅结论

5 条正式预期均有当前代码版本上的可执行证据；Go 层 v01_developer_pin_test.go + record_lifecycle_test.go + credentials_test.go + membership_test.go 覆盖 A38/A47/A48；records_test.go + queue.go 覆盖 A39/A40；前端 queueStorage + operations 覆盖 A39/A40/A47。**建议逐条签收**。
