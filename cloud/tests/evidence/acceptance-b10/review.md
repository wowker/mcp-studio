# B10 Review — Agent Deep Dive + Backup Boundaries

## Summary

B10 是 **B9 单端 OS 深挖批次的后续**，聚焦两个方向的深度审阅：

1. **Agent 包 cloud 11 / local 10 逐包专项** — 之前只验证"go test exit 0"，本次深入到每个测试函数名 + 断言
2. **Backup rotation + credentials 边界条件** — 原子性、密钥轮换、成员移除清副本、权限降级等待、版本乐观锁

**结果**：所有测试覆盖充分，边界条件完整，无 Critical / Important 问题。agent_auth_test.go 的 8 条 cloud-only 测试（proof exchange + grant + nonce + cookie/origin + expiry + concurrent + password reset）在单机版 `-tags local` 下被 build tag 正确跳过（不是缺失覆盖，是设计正确）。

## Agent 包审阅分级

| Package | 分级 | 说明 |
|---------|------|------|
| lifecycle | Important | Agent 进程 start/stop/restart 生命周期；cloud + local 两版共用 |
| localapi | Important | 单机版本地 API 端点（本地 edition 独有，验证 local edition 行为正确）|
| mcp | Important | MCP 协议 JSON-RPC handshake + stdio/SSE transport + error response 格式 |
| oauth | Important | OAuth callback / token swap — 单机版 authMode=none 但 Go handler 全绿 |
| pairing | Critical | Agent 配对并发仅 1 赢家 — **核心安全**，cloud + local 两版共用 |
| platformclient | Important | Agent 调 Platform 端点时的 credential scope 隔离 |
| process | Important | Agent 子进程隔离（无 shell、不继承 env）— **安全边界** |
| queue | Critical | 上传冻结 + 重试不重调 Tool + 过期隔离 — **正确性核心** |
| sessions | Critical | A38 foreign-owner/wrong-project/not-held/browser-responsibility 全拒 — **权限边界** |
| vault | Critical | 6 tests: 加密重启/不可用不删/symlink 拒绝/凭据不可复活/nonce + cleanup/master 串行 |
| agent_auth | Critical | **cloud-only 8 tests**: proof concurrent/exchange/cookie/grant parent/密码重置 |

## Backup Rotation 边界分级

| 边界 | 分级 | 说明 |
|------|------|------|
| 原子性（损坏密文拒绝部分提交） | Critical | 轮换中途某条密文坏掉 → 整个轮换拒绝，之前完好记录密文也不变 |
| 密钥正确性 | Important | 错误 old key → 拒绝，密文不变 |
| 用户版本不丢失 | Important | 轮换后每条 Version 保持原值 |
| 用户内容不变 | Important | ValueJSON 保持原值（加密层透明）|
| same key 拒绝 | Minor | RotateBackupKey(..., next, next) → err != nil |
| 完整轮换 | Important | RotateBackupKey(..., old, next) → count=2 |

## Credentials Backup 边界分级

| 边界 | 分级 | 说明 |
|------|------|------|
| 加密 + nonce=12 字节 + 密文不含明文 | Critical | 加密层正确性 |
| list 不暴露 valueJSON | Critical | API 响应不泄露凭据 |
| restore JSON 不变 | Important | 解密正确性 |
| 版本乐观锁 | Critical | 并发写入冲突保护 |
| nonce 不复用 | Critical | 安全：每条备份独立 nonce |
| BackupKey 更换后 restore 503 | Important | 密钥轮换期间拒绝 restore |
| 非 owner developer 不可 restore | Critical | 权限边界 |
| viewer 不可 restore | Critical | 权限边界 |
| 成员移除 → cleanup 清副本 → 不可 restore | Critical | 成员移除清理链 |
| restore 等 team 锁（权限降级等待） | Critical | **撤销确认完整性** |
| DELETE 后 restore 404 | Important | 删除确认 |

## Critical Issues

**None.** 所有边界条件覆盖充分，cloud-only 测试在 local build tag 下正确跳过。

## Important Notes

1. **agent_auth_test.go 8 条 cloud-only**：build tag `!local` 正确隔离。单机版不走 agent OAuth/Proof 流程（authMode=none），但 agent process/sessions/queue/vault/lifecycle 等两版共用包全部通过。

2. **`RotateBackupKey` 原子性实现**（推断）：在事务里遍历所有 credential_backups → 解密 + old key 校验 → 用 new key 重加密 → UPDATE；任一条解密失败 → Rollback（已验证损坏密文拒绝部分提交）。

3. **restore 等 team 锁实现**（推断）：`lockTeamTx(ctx, tx, p.TeamID)` 对 teams `SELECT ... FOR UPDATE`；restore handler 先拿 team 锁再做权限检查 + cleanup 逻辑；权限降级（developer→viewer）在另一个事务里 commit 后，restore 事务才拿到 team 锁发现权限不够 → 拒绝。

4. **B10 不写 CSV**：因为全部条目不在 A01–A60 范围（B1 已签收 A01–A60 全部），B10 是 environment-limited deep-dive。

## B10 vs B9 差异

| 维度 | B9 | B10 |
|------|----|-----|
| 类型 | signed-macos 升级 + 9 pending | 深度审阅，不新增状态变更 |
| 价值 | 首次 macOS 26 内嵌 PG 实机启动 | Agent 包逐包断言 + Backup/Credentials 原子性审阅 |
| 产出 | expectations/coverage/review/manifest/logs | 同四份，但更细粒度 |
| 签收 | 4 signed-macos | 无新增 signed（都是已有条目的深看）|
