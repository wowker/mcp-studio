# B4 · 队列与生命周期 · 预期核对与覆盖映射

日期：2026-10-29。基线：`c95cd8f`（B3 签收）。预期来源：[06 验收清单](../../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) 行 107–109/116–117；条目正式文本见 [expectations.json](./expectations.json)。B4 业务逻辑 E 系列未触及，现有 Go/前端测试在当前代码版本上全绿即有效。

## 云服务版（5 条）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A38（仅云） | 已覆盖 | Go `v01_developer_pin_test.go`（`TestV01A38DeveloperDirectPinAndUnpinDeniedWithoutMutation`：Developer 不能 pin/unpin 共享 history、Maintainer 可以）、`records_test.go:L698-770`（本人执行角色仅重试本人责任端队列）；前端 runtime 权限守卫 |
| A39（两版） | 已覆盖 | 前端 `runtime/records/operations.ts`（`revokeProject`/`allowProject`：revoked 项目 pause 条目、恢复 pending）、`queueStorage.test.ts`（29 tests，队列恢复/持久化）；Go `records_test.go`（同一 RunID 原子拒绝、取消后晚返回不被改成成功）、agent_auth.go（Agent 执行时浏览器关闭→Agent 继续完成已获准调用） |
| A40（两版） | 已覆盖 | Go `TestRecordUploadAtomicReplayScopeAndRedaction`（同 ID 不同 frozenDigest→409 不覆盖、队列满→阻止新调用、operation conflict 原子拒绝）、`queue/queue.go`（`queue_full`、`operation_conflict` 错误码）；前端 `queueStorage.test.ts`（43 tests 中 conflict/digest 覆盖）、`operations.test.ts`（14 tests，frozenDigest 验证） |
| A47（两版） | 已覆盖 | Go `record_lifecycle_test.go:L26-59`（默认 90 天保留期、容量 admission、超容量上传 409、rejected 不持久化）、`record_lifecycle_test.go:L153-212`（90 天 sweep 后普通 history 删除、pinned/saved 保留、新上传不能复用已清理 history ID）；前端 `operations.ts`（队列清理 discardUser/clear/hydrate、retention/storage 状态） |
| A48（仅云） | 已覆盖 | Go `record_lifecycle_test.go:L61-100`（成员删除→saved/private 归档、权限 404/403、成员恢复为 viewer 后可读、重新上传 403）、`credentials_test.go:L139-174`（成员移除→online credential backup 删除、restore 返回 404、audit 不泄露凭据）、`membership_test.go:L198-224`（团队移除归档所有项目邀请） |

## 单机版（A39/A40/A47 两版，A38/A48 仅云版）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A39 | 已覆盖 | Go `-tags local` 同 records_test.go 通过（同一 RunID 原子拒绝）；共享前端套件 queueStorage/operations |
| A40 | 已覆盖 | Go `-tags local` 同 TestRecordUploadAtomicReplayScopeAndRedaction 通过（同 ID 不同 digest 409）；共享前端 |
| A47 | 已覆盖 | Go `-tags local` 同 record_lifecycle_test.go 通过（90 天 sweep、pinned/saved 保留）；共享前端 |

注：A38（pin 权限边界）和 A48（成员移除归档记录+凭据清理）是仅云版——单机版无团队成员资格校验（R4 跳过角色）、凭据备份系统在单机侧不启用（本地主体直接运行）。

## 环境与命令

- 云版 Go：B3 门禁基线（97.7s exit 0）→ 直接复用 B3 结果（同一份代码，E 系列未触及）。
- 单机版 Go：B3 门禁基线（1.4s exit 0）→ 直接复用。
- go vet：本次运行，两版干净。
- 前端：Node 24.21.0 下 `vitest run` 2 文件 43 tests passed（operations.test.ts 14 + queueStorage.test.ts 29）。
