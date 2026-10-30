# B12 Review — Frontend Runtime 251+ Tests + App Shell 23

## Summary

B12 是 **B10/B11 deep-dive 的前端全景补齐**。B11 只知道 "frontend 61 files 603 tests" + 模块级结构，B12 深入到每个 runtime 文件的**逐函数名 + 覆盖边界**：

1. **schema/interpreter 74 tests = 前端最大单文件**（JSON Schema 2020 全边界 + draft07 + regex + refs + decimal）
2. **records/redaction 36 tests** = 嵌套 secrets / 凭据 echo / pointer 拒绝 / URL secret / email / phone
3. **browser-session 58 tests** = SDK tool listing + credential echo rejection + CSP safe output + call classification + connection credential freeze
4. **records/queueStorage 29 tests** = 上传冻结核心——frozen body reload + capacity block + stale owner reject + quarantine corrupt
5. **execution/index 15 tests** = Tab sync lock + local validation blocks Run + credential_rejected vs transport loss
6. **App Shell 23 tests**（实测修正原 27）= language/theme/sidebar 保持 + session expiry + bootstrap retry + stale identity 忽略

**结论**：所有前端 runtime 核心边界覆盖充分，无 Critical 问题。

## 审阅分级

### schema/interpreter (74 tests) — ✅ Critical
JSON Schema 是 MCP Studio Tool Argument 校验的**核心安全边界**。覆盖：
- JSON Schema 2020 unevaluated-properties / prefix-items / contains-count
- dependent-required / dependent-schema / conditional-branch
- embedded-relative-ref / recursive-local-ref / dynamic-recursive-ref / anchor-local-ref
- draft07-tuple / draft07-dependencies
- regex-lookaround / regex-backreference / regex-portable
- reference DAG budget / same-instance ref cycle reject / structural-recursion-supported
- regex-pattern-budget / regex cross-engine semantics unsupported
- multipleof-small / decimal-exact / negative-exact / epsilon-below / epsilon-above
- **没有远程 schema fetching**（安全边界——不走网络拉 schema）
- 4096 node cap for request JSON

### records/queueStorage (29 tests) — ✅ Critical
上传冻结 + 重试 + 凭据隔离的**核心正确性边界**：
- frozen body reload + revision etag retry
- **capacity blocks new admissions, preserves completed inflight as explicit loss risk**（不是 silent delete）
- **stale owner submission rejected**（凭据 scope 变化后原上传不能继续）
- **two queue instances one operation serial**（并发安全）
- quarantines schema-valid digest-corrupt persisted content（损坏数据隔离）

### records/redaction (36 tests) — ✅ Critical
凭据脱敏的**核心安全边界**：
- **nested source echoes protected**（嵌套对象里的凭据 echo 也能抓到）
- **rejects inherited JSON pointer paths**（prototype pollution 防护）
- **`__proto__` preserved as own data**（不被 prototype pollution 影响）
- **browser alias source protection** + **embedded credential URL**（真实凭据场景）
- **source-tainted false / phone number echo / short SK text**（各类敏感数据形态）

### browser-session (58 tests) — ✅ Critical
浏览器直连的**核心安全边界**：
- **credential echo rejected in tool name + description + schema**（三处位置都能抓到）
- **output schema discovery without SDK dynamic validator**（strict CSP 下安全）
- **connection credential frozen before async authority lookup**（凭据不能在 auth 过程中被替换）
- **HTTP 401/403 preserved ahead of SDK closed-connection**（真实错误不被 SDK 噪声覆盖）
- **transport failure classified as network error vs RPC closed-connection**（错误分类正确）

### execution/index (15 tests) — ✅ Critical
执行生命周期的**正确性核心**：
- **Tab sync lock before async schema validation**（schema worker 完成前 Tab 锁定）
- **local validation blocks Run creation**（本地 schema 不通过 → 不调用上游 → 不创建 Run）
- **credential_rejected vs generic transport loss**（已知凭据拒绝 vs 未知网络错误区分）
- **authorization_denied vs generic transport loss**（已知授权拒绝 vs 未知网络错误区分）
- **request size recheck after environment expansion**（env 变量展开后大小可能变）

### records/operations (14 tests) — ✅ Important
上传操作 + metadata revision：
- **double submit joins one upload**（防抖：同一个 operation 两次提交 → 一次上传）
- **retry same operation original body**（UI 后续编辑不影响 retry body）
- **freeze metadata revision + redact reason**（metadata revision 不可变 + reason 脱敏）

### App Shell 23 tests（实测修正原 27）— ✅ Important
Shell 全局行为 + session lifecycle + bootstrap：
- **language/theme/sidebar controls keep page input + focus**（D10 字号/语言切换不丢输入）
- **session expiry → unmount project context**（不是 signout）
- **late initial session 401/success after newer identity → ignored**（**stale identity 防护核心**——bootstrap retry 建立新身份后，旧 session 响应不能覆盖新状态）
- **bootstrap failure → working retry (no endless loading)**（D9 可恢复启动）

### schema/index (5 tests) — ✅ Important
Worker 隔离边界：
- **每 job 独立 Worker**（隔离性）
- **CPU budget terminate + no raw exception leak**（DoS 防护——不把 Worker 内部异常暴露到 UI）
- **oversized job pre-reject**（在 Worker 创建前就拒绝，避免 OOM）

### records/canonical + snapshot — ✅ Minor
canonical Unicode/decimal 边界 + snapshot Agent version hash masking。

## Critical Issues

**None.**

## Important Notes

1. **B12 是 B11 Frontend 61 files 结构的下沉**——从模块级 `browser-session(58)` 深入到每个测试的覆盖边界描述。这意味着 A01–A60 的前端测试覆盖现在**函数名级别**可追溯。

2. **schema/interpreter 74 tests 是前端最大单测试文件**（之前只知道 browser-session 58 最大），说明 JSON Schema 校验被极其重视——符合 MCP Studio Tool Argument 校验是核心能力。

3. **records/queueStorage 29 tests 的 "two queue instances one operation serial"** 是上传冻结的**并发安全核心**——多个 browser tab 不能同时上传同一个 Run。

4. **browser-session 的 "credential echo rejected in tool name + description + schema"** 三个位置都测试了——这意味着即使 MCP server 把凭据泄露到工具元数据里，前端也能在三个位置独立拦截。

## Deep-dive 批次的累积价值

| 批次 | 深入到 | 累计函数名 |
|------|--------|-----------|
| B10 | Agent 11 包测试函数名 + backup/credentials 断言 | ~50 Go 函数 |
| B11 | Platform 131 函数名 + Playwright 14 suite + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 251+ tests 逐函数名 + App Shell 23（实测修正原 27） | **274+ TS tests**（全部 runtime 核心）|
