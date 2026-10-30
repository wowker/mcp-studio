# B15 Coverage Map — Internal 零测试包深潜

**日期**: 2026-10-30
**批次类型**: deep-dive（B10 同型，但目标为 Go 侧剩余零测试包）
**前置**: B14（A01–A60 已于 B8 全签 60/60）

---

## 1. 为什么选这三个包

B10–B14 已完成 agent 11 包、platform 131 函数与前端 runtime/features 全量深潜（704+ 可追溯边界）。盘点 `internal/` 后剩余唯一确认的真实缺口是三个零测试包：

| 包 | 类型 | 行数 | 此前测试 | 是否真实缺口 |
|---|---|---|---|---|
| `internal/jsonnumber` | **手写** | 79 | 0 | ✅ 是 |
| `internal/wire` | 生成（platform openapi） | 404 | 0 | 间接覆盖有，合同未锁 |
| `internal/agent/wire` | 生成（agent openapi） | 199 | 0 | 间接覆盖有，合同未锁 |

`internal/jsonnumber` 是手写安全代码，被 5 处调用：

- `internal/recording/redaction.go:336-342` — 脱敏时归一化数字
- `internal/recording/canonical.go:106` — 内容哈希规范化
- `internal/platform/records.go:702` — 记录数值校验
- `internal/schema/check.go:229,246,259` — Schema 数值约束（multipleOf / minimum / maximum）

这些调用方都有测试，但 **jsonnumber 自身的词法上界从未被直接断言**——属于 D09（非法 JSON / Schema 错误）的共享安全边界，必须锁住。

两个 `wire` 包是生成代码，字段名被 Go 与 TypeScript 两端共用。生成器漂移会让一侧静默改名，因此用合同往返断言锁字段名。

---

## 2. 逐条覆盖表

### 2.1 `internal/jsonnumber/number_test.go` — 7 tests

| 测试函数 | 锁定的边界 | 对应代码 |
|---|---|---|
| `TestNormalizeShortestDecimalSpelling` | `2.0→2` / `-0→0` / `1e3→1000` / `1e0003→1000` / `0.1` 保留 | `Normalize` + `String` 组合 |
| `TestNormalizeRejectsMantissaOver128Digits` | 128 位通过、**129 位拒绝** | `number.go:22-30` |
| `TestNormalizeRejectsExponentOutOfRange` | `1e400` / `1e-400` / `1e1234` / `1e325` / `1e-325` 全拒 | `number.go:39-49` |
| `TestNormalizeBoundedUnderflowBecomesZero` | `1e-324 → 0`（有界下溢归零） | `number.go:55-57` |
| `TestNormalizeRejectsNonfinite` | `1e324`(+Inf) / `abc` / `1e` / 空串 / `NaN` / `Infinity` | `number.go:51-54` |
| `TestStringUsesECMAScriptThresholds` | `1e-6` 含边界定点、`1e-7` 指数、`1e20` 定点、`1e21` 指数、真实负零 | `number.go:63-78` |
| `TestStringExponentialCarriesExplicitPositiveSign` | 非负指数必须带 `+`，否则文本回显匹配失败 | `number.go:74-78` |

### 2.2 `internal/wire/wire_contract_test.go` — 6 tests

| 测试函数 | 锁定字段 |
|---|---|
| `TestHealthContractJSONTags` | `status` / `version` |
| `TestBootstrapContractJSONTags` | `initialized` / `mailConfigured` |
| `TestErrorEnvelopeShape` | `error.code` |
| `TestProjectContractJSONTags` | `id` / `teamId` / `name` / `description` / `role` / `canManage` / `canTakeover` / `canRead` |
| `TestSessionNestedContractJSONTags` | `user` / `teams` / `csrf` / `expiresAt` + `TeamRole` |
| `TestInvitationContractJSONTags` | `teamRole` / `projectRole` / `status` / `expiresAt` / `delivery` |

### 2.3 `internal/agent/wire/agent_contract_test.go` — 5 tests

| 测试函数 | 锁定字段 |
|---|---|
| `TestAgentStatusContractJSONTags` | `contractVersion` / `deviceId` / `state` / `capabilities` / `vaultAvailable` / `queueRetention` |
| `TestAgentPairContractJSONTags` | `pairingId` / `channelToken` / `userId` / `deviceId` / `origin` / `expiresAt` |
| `TestAgentConnectInputContractJSONTags` | `projectId` / `connectionId` / `version` / `environmentId` |
| `TestAgentErrorEnvelopeShape` | `error.code` |
| `TestAgentChallengeContractJSONTags` | `challengeId` / `expiresAt` / `origin` / `state` / `capabilities` |

---

## 3. 门禁

| 门 | 命令 | 结果 |
|---|---|---|
| 1 云版 | `go test -count=1 ./internal/...` | ✅ 22 包全 ok（platform 117.673s） |
| 2 单机版 | `go test -count=1 -tags local ./internal/...` | ✅ 21 包全 ok（platform 6.745s） |
| 3 vet | `go vet ./internal/... && go vet -tags local ./internal/...` | ✅ 两版 clean |
| 4 前端 | `npx vitest run`（Node 24.21.0） | ✅ 61 files / 603 tests / 0 failed |

新增包在三道 Go 门中均实际执行：
```
ok  mcp-studio/internal/jsonnumber   1.653s (cloud) / 3.300s (local)
ok  mcp-studio/internal/agent/wire   1.224s (cloud) / 2.383s (local)
ok  mcp-studio/internal/wire         4.540s (cloud) / 4.805s (local)
```

---

## 4. 与 D09 的关系

`jsonnumber` 上界（mantissa 128 / exponent ±324 / 非有限拒绝）是 D09「非法 JSON 与 Schema 错误」在数值层面的第一道闸。此前该闸只在被调用方间接执行，本次直接断言后，任何放宽（例如把 128 改成 256 或允许 ±400 指数）都会立即红。

---

## 5. 覆盖增量

| 维度 | B14 累计 | B15 增量 | 累计 |
|---|---|---|---|
| Go 函数/测试边界 | 181+ | +18 | **199+** |
| TS tests | 490+ | — | 490+ |
| E2E specs | 33 | — | 33 |
| **总计** | 704+ | **+18** | **722+** |
