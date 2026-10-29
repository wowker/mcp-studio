# B2 · 连接与环境 · 预期核对与覆盖映射

日期：2026-10-29。基线：`bd01fc2`（B1 签收，含 E00–E10）。预期来源：[06 验收清单](../../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) 行 72/73/77–79/112/118–119/125–126；条目正式文本见 [expectations.json](./expectations.json)。本批次 E03 配置层属触及领域，全部重验（方法论 D-C）。

## 云服务版（10 条）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A03 | 已覆盖 | `TestConnectionIndependentIdentityConditionalPersistence`（同 URL 独立 identity/version、etag 并发 409）、`TestConnectionConcurrentCreationOnlyOnePerProject`；单机版回环脚本独立断言 stale overwrite 409 |
| A04 | 已覆盖 | 前端 `browser-session.test.ts`：`sanitizes browser policy failures and refuses automatic Agent selection`（明确说明 CORS 原因、需手动换 Agent，不静默换通道或借凭据）；Go 层无对应 handler（前端层处理浏览器策略） |
| A08 | 已覆盖 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（四层 env/connection/project 解析链、去空白忽略大小写唯一、删除 connection 层后 env→project 回退）、`TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（缺个人值不冒充可用）；前端 `environment.test.ts` 四层解析链 vectors |
| A09 | 已覆盖 | `TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（cycle 检测、错误体含 `"cycle"`）、`TestEnvironmentVariableLayersScopeAndSafeDeletion`（敏感派生遮罩）；前端 `execution/v01-environment-blocking.test.ts`：`A09 Browser connect and Run block`；`browser-session.test.ts` 敏感派生遮罩 |
| A10 | 已覆盖 | 前端 `EnvironmentPage.test.tsx`：`previews a different environment without applying and applies only after explicit action`（浏览不影响会话、应用需前置条件不自动连接）、`browser-session.test.ts` 浏览环境不触发连接 |
| A43 | 已覆盖 | `TestResolvedPublicFragmentsCannotCreateRecognizableSecretURL`（URL fragment 阻止、非敏感 query 可存）、`TestConnectionEndpointValidationRejectsKnownSecretKeys`（敏感 query key 阻止）；前端 `connection.test.ts`：`accepts public query while rejecting embedded credentials, fragments and known secret query keys` |
| A49 | 已覆盖 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（去空白忽略大小写唯一 409）、`TestConcurrentConfigurationSavesOnlyOneVersionWins`（两人同时改同一配置 version_conflict 409，不静默覆盖）、`TestConnectionConcurrentCreationOnlyOnePerProject`；单机版回环脚本复验 environment 名称 trim + 大小写重复 409 |
| A50 | 已覆盖 | **新增** `TestB2A50PlatformDoesNotExposeToolProxyEndpoint`（`/api/v1/tools`、`/api/v1/proxy`、`/api/v1/mcp`、`/api/v1/execute` 及 POST 变体全部 404）；前端 runtime 天然不调 Tool HTTP（设计约束）；Go 层无平台代调入口；单机版回环脚本复验同路径 404 |
| A51 | 已覆盖 | `TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（引用缺失 → session-access 400；补齐后 → 200；不会自动建 MCP 会话）、`TestConfigurationPermissionsAndCurrentSessionAccess`（版本冲突、foreign environment_id 400）；前端 `ConnectionsPage.test.tsx`：`shows an unavailable explicit service link even when no services remain and returns to the same project`；单机版回环脚本完整走通 endpoint 引用缺失 → 传递缺失 → 补齐 → 返回 200 全链路 |
| A52 | 已覆盖 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（跨项目 env/variable 引用 400）；前端 `ConnectionsPage.test.tsx`：`retains a deleted auth definition identity instead of borrowing a new same-name definition`；单机版回环脚本：Project B 的 TOKEN 不出现在 Project A 的变量列表中 |

## 单机版（10 条，全部两版）

| 条目 | 状态 | 证据 |
| --- | --- | --- |
| A03 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：同 URL 建 C1/C2 → 独立 identity/version → stale overwrite 409 |
| A04 | 已覆盖 | 共享前端套件 `browser-session.test.ts`（单机版使用同前端代码，方法论 D-B） |
| A08 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：四层 TOKEN（project/env/connection）+ sensitive def 无 value；删 connection 层 → session-access 200；删 env 层 → session-access 200 |
| A09 | 已覆盖 | 共享前端套件 `execution/v01-environment-blocking.test.ts`；Go 测试 `-tags local` 同文件覆盖 |
| A10 | 已覆盖 | 共享前端套件 `EnvironmentPage.test.tsx` |
| A43 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：secret query → 400；fragment → 400；safe query → 200 |
| A49 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：environment 名称 trim 后；大小写+空白重复 → 409 |
| A50 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：单机版同样 `/tools /proxy /mcp` → 404；Go 测试 `-tags local` 全量通过（含 configuration_routes 注册一致） |
| A51 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：endpoint `{{HOST}}` 缺失 → 400；HOST 引用 ABSENT 缺失 → 400；补齐 → 200；不自动 connect |
| A52 | 已覆盖 | `scripts/acceptance-b2-local.mjs`：Project B 建 TOKEN；Project A 变量列表不含 B 的 TOKEN（R3 项目归属过滤仍生效） |

## 环境与命令

- 云版：`MCP_STUDIO_TEST_DATABASE_URL=postgres://…@127.0.0.1:55432/mcp_studio_test` → `go test -count=1 ./internal/platform/`（94.5s，exit 0）；`go vet ./internal/platform/`（干净）。
- 单机版：`go test -count=1 -tags local ./internal/platform/`（1.3s，exit 0）；`go vet -tags local ./internal/platform/`（干净）；回环旅程 `node scripts/acceptance-b2-local.mjs`（真 `apps/local` 二进制 + 内嵌 PG，10 组断言全过）。
- 前端：Node 24.21.0 下 `vitest run --config apps/web/vite.config.ts` 前端 runtime + feature 测试 174 通过（`frontend-b2-runtime.log`）。
- 日志与 JSON 见本目录（`go-*-platform.log`、`frontend-b2-runtime.log`、`local-edition.json`、`go-cloud-config-*.log`）。
