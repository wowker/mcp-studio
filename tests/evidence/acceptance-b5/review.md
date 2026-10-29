# B5 · Agent 与授权 · 只读审阅

日期：2026-10-29。基线：`225d71e`（B4 签收）。审阅对象：A05/A06/A07 三条目证据；审阅方式：只读（未新增任何被测代码或测试代码）。结论：**无 Critical、无 Important**，Minor 2 条已登记。

## 签收策略

批次计划明确 A41/A42 单机侧系统凭据库缺真实 OS 环境，保持待验。本批次只签收 A05/A06/A07。

## 1. 覆盖充分性检查

| 检查点 | 结论 |
| --- | --- |
| A05 stdio 保存前校验 | `internal/configuration/validate.go:95-113` 显式 invalid_stdio_configuration / invalid_command / invalid_argument / invalid_cwd，测试表驱动全覆盖；进程层 `exec.Command` 无 shell、环境白名单——Go 全量 exit 0，两版均有证据 |
| A06 Agent 配对/过期/撤销 | agent_auth_test.go 8 tests 覆盖：proof 1 分钟过期、grant 15 分钟 + 父会话 idle/absolute 约束、device 绑定（换绑 401）、Origin 校验（evil→403）、cookie 互斥（带 cookie exchange→403）、Sec-Fetch 拒绝、8 并发仅 1 赢家、密码重置 revoke |
| A07 三态独立 | credentials_test.go 6 tests 覆盖 AES-GCM 加密/nonce 不复用/owner 绑定/版本乐观锁；agent/platformclient/client.go 精确路由匹配分类：401→platform_identity_expired、403+reauthentication_failed→保留、其他 403→project_permission_revoked |
| 单机版 A05/A06/A07 | A05 Go 两版（configuration/process 无 !local）；A06/A07 Go 云版专属（!local），前端由共享套件承担（D-B jsdom 等价） |

## 2. 逐条证据

| 条目 | 云版 Go | 单机版 | 前端 |
| --- | --- | --- | --- |
| A05 | validate_test.go 表驱动 + process_test.go（无 shell/不继承环境） | Go 同测试 `-tags local` 通过 | browser-session.test.ts (58) |
| A06 | agent_auth_test.go 8 tests（proof/grant/过期/撤销/Origin/Sec-Fetch/并发/密码重置） | 共享前端（Go agent_auth !local） | browser-session.test.ts agent 状态 |
| A07 | credentials_test.go 6 tests + platformclient client.go 三态分类 | 共享前端（Go credentials !local） | browser-session.test.ts OAuth/凭据 |

## 3. 门禁

| 门禁 | 结果 | 证据 |
| --- | --- | --- |
| Go 云版全量（configuration + agent 11 + platform） | 12 包 exit 0 | go-cloud-all.log |
| Go 单机版 A05（configuration + agent/process） | 2 包 exit 0 | go-local-agent.log |
| go vet 全量 | clean | — |
| 前端（Node 24.21.0） | 58 tests passed | browser-session.test.ts |

## 4. 限制与 Minor

- **Minor-1**：A06/A07 单机版无 Go 专属测试（agent_auth_test.go + credentials_test.go 均 `//go:build !local` 云版专属），由共享前端套件承担（方法论 D-B）。
- **Minor-2**：A41/A42 保持待验——批次计划明确单机侧系统凭据库与真实 OS 确认缺环境。

## 5. 审阅结论

A05/A06/A07 三条目均有当前代码版本上的可执行证据；Go 层 configuration/agent/platform 全覆盖；前端 browser-session 覆盖通道/会话/凭据交互。A41/A42 按批次计划保持待验。**建议签收 A05/A06/A07，保留 A41/A42 待验。**
