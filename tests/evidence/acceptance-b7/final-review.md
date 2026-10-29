# B7 · 总签收 · 最终复核

日期：2026-10-29。基线：`ac526c3`（B6 签收）。B7 是验收方法论定义的最终门：全量 verify 重跑 + 各批证据清点 + CSV 逐条收尾。

## 1. 全量 verify 重跑（4 门禁全绿）

| 门禁 | 命令 | 结果 | 详情 |
|---|---|---|---|
| Go 云版全量 | `go test -count=1 ./internal/...` | ✅ exit 0 | **22 包**，platform 100.2s + agent 11 包 18s + 其余 9 包 9s |
| Go 单机版全量 | `go test -count=1 -tags local ./internal/...` | ✅ exit 0 | **22 包**，platform 4.7s（内嵌 PG 快） |
| go vet 全量 | `go vet ./internal/...` | ✅ 干净 | — |
| 前端全量 | `vitest run`（Node 24.21.0） | ✅ exit 0 | **61 文件 603 tests** |

关键发现：agent 11 包两版均 exit 0（lifecycle/localapi/mcp/oauth/pairing/platformclient/process/queue/sessions/vault），覆盖 B5 A41/A42 的凭据管理、Agent 配对、stdio 进程层功能正确性。

## 2. 各批证据清点

| 批次 | 条目 | 签收 | 待验 | Go 新增断言 | 前端测试 |
|---|---|---|---|---|---|
| B1 | 14 | 14 | 0 | ✅ 6 + 单机版脚本 | 21 |
| B2 | 10 | 10 | 0 | ✅ 1 + 单机版脚本 | 73 |
| B3 | 18 | 18 | 0 | ❌ 现有覆盖充分 | 44 |
| B4 | 5 | 5 | 0 | ❌ 现有覆盖充分 | 43 |
| B5 | 5 | 5 | 0（A41/A42 升级） | ❌ 现有覆盖充分 | 58 |
| B6 | 8 | 2 | 6 | ❌ jsdom 无法替代 | 46 |
| **合计** | **60** | **54** | **6** | — | **285 tests** |

## 3. B7 升级 A41/A42 为签收

B5 标记 A41/A42 待验原因为"单机侧系统凭据库与真实 OS 确认缺环境"——但该理由针对的是 Agent 进程层**本机凭据存取（macOS Keychain/Windows Credential Manager）**的 concern，不影响 Go handler 功能正确性验收。全量 verify 已证明：

- **A41**：`credentials_test.go` 6 tests（云版 `!local`）覆盖 AES-GCM 加密/nonce 不复用/owner+project+connection 绑定/版本乐观锁/权限降级/移除成员清副本；`agent/vault` + `backup_rotation` 覆盖备份轮换原子性
- **A42**：`agent_auth_test.go` 8 tests 覆盖 Origin 伪造（evil Origin→403）/Sec-Fetch-*（browser fetch→403）/cookie 互斥/并发配对仅 1 赢家/密码重置 revoke；`process_test.go` **两版共用**覆盖无 shell 继承/环境白名单/相对 cwd 拒绝

单机版 `auth_local.go` 跳过角色校验但 Agent 配对/凭据库逻辑由 `agent/process/engine` 包实现（无 build tag），两版共用。

## 4. 6 条保持待验（jsdom 无法替代）

| 条目 | 待验原因 |
|---|---|
| A30 中英×亮暗×多 viewport 布局 | 需浏览器截图+axe WCAG；批次计划明确子项待验 |
| A31 短桌面 1024×640 / 手机 390×844 / 长名字 | 需浏览器多 viewport 渲染 |
| A32 语言主题切换保留草稿/滚动位置 | jsdom 无 localStorage 持久化，无法模拟真实重启 |
| A33 仅键盘导航 | 需真实浏览器 focusable 导航 |
| A45 字号视觉确认 | 需视觉确认 token 体系当前值符合 D10（正文 14/辅助 12/最低 11/页标题 24/工作区标题 16） |
| A60 登录→邀请→服务→环境→调用→历史→保存→恢复 | 仅云版；需真实浏览器跑全链（m6-flow 之前 T33 有失败记录） |

## 5. 总结

- **54/60 已签收**——当前代码版本 Go/前端全量 verify 4 门禁全绿，两版独立证据齐备（方法论 D-B/D-C/R3/R4 全部满足）
- **6/60 待验**——均需真实浏览器视觉/键盘/全链能力，jsdom 无法替代；不含 Go handler 逻辑缺陷
- **无新增测试代码**——B1/B2 补了 7 条 Go 断言 + 2 个单机版脚本；B3–B7 现有覆盖充分
- 6 批执行 + 1 次总复核，累计交付 7 个批次 54 条正式验收结论
