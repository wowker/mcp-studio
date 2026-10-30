# B2 · 连接与环境 · 只读审阅

日期：2026-10-29。基线：`bd01fc2`（B1 签收，含 E00–E10）。审阅对象：本批新增断言（`b2_connection_environment_assertions_test.go` 一条）、单机版回环脚本、前端既有 runtime 证据；审阅方式：只读（未修改任何被测代码，仅新增测试、脚本与证据留档）。结论：**无 Critical、无 Important**，Minor 3 条已登记。

## 1. 新增材料的自证风险检查

| 检查点 | 结论 |
| --- | --- |
| A50 断言是否恒真 | 6 个 GET + 3 个 POST 路径全部断言 404，覆盖直连 `/tools` 和带 `/projects/{id}` 前缀的变体；Go 路由表用显式路径注册，不存在通配符 `/api/v1/...` 覆盖风险。断言路径均在实际产品 API 注册体系之外，不依赖实现细节 |
| 单机版回环是否绕过权限边界 | 显式创建第二个项目验证变量隔离（A52）；PATCH/DELETE 全部走 `If-Match` header（与 Go 测试 `configurationRequest` helper 对齐），无直写库路径；authMode 统一 `none`（单机版无 OAuth/Agent 后端，范围校验由云版 Go 测试覆盖） |
| session-access 阻断是否真测引用链 | A51 endpoint 含 `{{HOST}}` 引用 → 无 HOST 变量时阻断；HOST 值为 `{{ABSENT}}` 时传递阻断；补齐 ABSENT 后通过。三层递进覆盖：直接引用缺失 → 传递引用缺失 → 完整解析链 |
| 前端证据是否被后端行为影响 | A04/A10 为前端层处理场景（浏览器 CORS、Environment 浏览/应用），Go 层无 handler 覆盖，不产生"Go 通过但前端不通过"的假阳性 |

## 2. 逐条证据与正式预期的对应

| 条目 | 云服务版证据 | 单机版证据（全部两版） |
| --- | --- | --- |
| A03 | `TestConnectionIndependentIdentityConditionalPersistence`（同 URL 独立 identity/version、etag 并发 409）；`TestConnectionConcurrentCreationOnlyOnePerProject` | 回环脚本：C1/C2 同 endpoint → 独立 id/etag → stale overwrite 409 |
| A04 | 前端 `browser-session.test.ts`：`sanitizes browser policy failures and refuses automatic Agent selection`（说明原因 + 需手动换 Agent） | 共享前端套件（单机版同前端代码） |
| A08 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（四层解析链、删除回退、去空白唯一）；`TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（缺值不冒充） | 回环脚本：四层 TOKEN + sensitive def 无 value；删 connection → env 回退 → project 回退 |
| A09 | `TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（cycle 检测 + 错误体含 `"cycle"`）；`TestEnvironmentVariableLayersScopeAndSafeDeletion`（敏感派生遮罩） | 共享前端套件 + Go 测试 `-tags local` |
| A10 | 前端 `EnvironmentPage.test.tsx`（浏览不应用、应用需前置）；`browser-session.test.ts`（浏览不触发连接） | 共享前端套件 |
| A43 | `TestResolvedPublicFragmentsCannotCreateRecognizableSecretURL`；`TestConnectionEndpointValidationRejectsKnownSecretKeys` | 回环脚本：secret query/fragment → 400；safe query → 200 |
| A49 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（去空白忽略大小写唯一 409）；`TestConcurrentConfigurationSavesOnlyOneVersionWins`（version_conflict 409） | 回环脚本：`Dev` trim 为 `Dev`；`dev` 重名 → 409 |
| A50 | **新增** `TestB2A50PlatformDoesNotExposeToolProxyEndpoint`（9 个路径全部 404） | 回环脚本：单机版同路径 → 404；Go 测试 `-tags local` 通过（路由注册一致） |
| A51 | `TestConnectionAccessChecksUsedDefinitionsWithoutReceivingPersonalValues`（引用缺失 400 → 补齐 200 → 不自动 connect）；`TestConfigurationPermissionsAndCurrentSessionAccess`（版本冲突、foreign environment 400） | 回环脚本：endpoint `{{HOST}}` 缺失 → 400 → HOST 引用 ABSENT → 400 → 补齐 ABSENT → 200 → 不自动 connect |
| A52 | `TestEnvironmentVariableLayersScopeAndSafeDeletion`（跨项目 variable 引用 400） | 回环脚本：Project B 建 TOKEN → Project A 变量列表不含 B 的 TOKEN（R3 项目归属过滤仍生效） |

## 3. 门禁状态（证据版本）

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| Go `./internal/platform` 云版（真实 PG 55432） | exit 0，94.5s | `go-cloud-platform.log` |
| Go `./internal/platform` `-tags local` | exit 0，1.3s | `go-local-platform.log` |
| 新增断言明细 | 1 条 PASS / 404 路径全覆盖 | `go-cloud-config-verbose.log` |
| 前端 runtime + feature（Node 24.21.0） | 13 文件 174 tests passed | `frontend-b2-runtime.log` |
| 单机版回环旅程（真 `apps/local` + 内嵌 PG） | 10 组断言通过 | `local-edition.json` |
| 全量两版基线 | 见 `tests/evidence/acceptance-baseline/`（fff4f9b） | `manifest.json` |

`go vet ./internal/platform` 与 `go vet -tags local ./internal/platform` 均通过；`gofmt -l internal/platform` 仅列出既有文件。

## 4. 限制与 Minor

- **Minor-1**：A50 断言仅覆盖 GET/PUT/POST 常见形态的 9 个路径变体；若后端未来新增其他"代调-like"命名（如 `/invoke`、`/delegate`），当前断言不会触发告警。不过设计承诺"平台默认不代调 Tool"是架构约束，而非路径枚举问题。
- **Minor-2**：A04/A10 云版无 Go handler 层断言，完全由前端 runtime 测试承担；方法论文档 D-B 明确两版共用同前端代码，jsdom 层覆盖在验收方法学上等价，但不构成独立后端证据。
- **Minor-3**：单机版回环脚本未纳入 `scripts/verify.mjs` 门禁，属批次专用证据脚本（同 B1）；长期保留或整合另行决策。

## 5. 审阅结论

10 条正式预期均有当前代码版本上的可执行证据；全部满足两版独立证据义务（方法论 D-B、R3/R4）。A50 新增断言填补了「平台默认不代调」在 Go handler 层的显式证据缺口。**建议逐条签收**，并在 B7 总签收时复核 Minor-2。
