# B14 Coverage Map — Frontend Features 全量补齐 29 Files / 132 Tests

B13 深潜了 features 核心 8 pages（84 tests）。B14 分两部分补齐：先覆盖剩余 12 个模块（其中 2 个实属 `shared/`），再补齐此前遗漏的 17 个 features 测试文件（84 tests）。

**2026-10-29 复核修正**：原 B14 记录声称「12 modules / 52 tests」「features/ 全部完成」，经 vitest JSON 实测核对发现三处错误——`AgentBackupsPanel` 实为 4 而非 5；表格逐项相加仅 49；且 `features/` 实际有 35 个测试文件 / 211 tests，当时仅覆盖 18 个文件，**「全部完成」不成立**。本节数字均为实测值。

## Part 1 — 剩余 12 modules（实测 48 tests）

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | WorkflowPage.test.tsx | **13** | config optional skip + keyboard actions; **no current project access → no config requests + all context hidden**; seven-step page upload failure explicit → direct retry to owner queue; **missing personal applied env → incomplete（不使用 shared default）**; reload from observed history |
| **2** | ConnectionsPage.test.tsx | **11** | version conflict retains draft; **viewer sees config but cannot edit personal auth or connect**; **stale async query does not pollute next project**; deleted auth definition identity retained |
| **3** | AgentBackupsPanel.test.tsx | **4** | **does not create backup until confirmed**; reauth input retained after failure; password cleared after restore |
| **4** | AgentQueuePanel.test.tsx | 3 | **offline Agent records unknown（separate from empty browser queue）**; retries only Agent retained upload; ignores late queue list when permission revoked |
| **5** | DevicesPage.test.tsx | 3 | **requires local approval code + never approves natively from the web**（**安全边界**）; pairing code retained after network failure |
| **6** | IdentityPage.test.tsx | 3 | **keeps original invitation after registration + never accepts automatically**（**安全边界**）; wrong-password login retains typed identity; manual-code reset after password repair |
| **7** | IdentityStates.test.tsx | 2 | unavailable invitation state before sign-in; sign-in inputs retained during invitation retry |
| **8** | AgentOAuthPanel.test.tsx | 1 | authorization separate from saving + retries local without repeating OAuth |
| **9** | AgentCredentialsPanel.test.tsx | 1 | backup off by default + Agent token independent of browser vault |
| **10** | Projects.test.tsx | 2 | denied create-project explains + returns without write; evidence only after real scoped success |
| **11** | `shared/`QueryFeedback.states.test.tsx | 3 | forbidden/not_found → offer return instead of repeat; transient error → explicit retry + separate return |
| **12** | `shared/`ui.layout.test.tsx | 2 | shared button class preserved with caller styles; keyboard separator within bounds |

其中 #1–#10 属 `features/`（43 tests），#11–#12 属 `shared/`（5 tests）。

## Part 2 — 补漏的 17 个 features 文件（84 tests）

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | `workflow/model.test.ts` | **15** | explicit skips + zero-variable env **不自动完成**; failed/cancelled run 不算 complete; **upload 失败后即使看过详情且有 saved copy 仍 incomplete**; 需同一 Run history view + recorded saved copy 才 complete; **facts 不跨 user/project/connection/Run 合并**; **permission 缺失或 identity suspended → 隐藏全部 progress fact**; newer failed run 替换 successful; restore Tab 不创建 run; **不凭 prior view marker / saved DTO 创建 execution**; upload receipt 丢失时用 server record confirmation 保留 live operation identity |
| **2** | `tools/ToolsPage.test.tsx` | 9 | real session catalog + 搜索 + 独立文档 + 键盘导航; tab menu 定位自身文档 + Escape 返焦; list error 重试**不创建/调用 Tool**; **Viewer 或 disconnected runtime → 不 fetch upstream tools**; **root memory revocation 后不 publish late catalog**; **forbidden connection query → 不渲染旧 tool context 且不重试被拒请求** |
| **3** | `tools/workspace.test.ts` | 8 | **duplicate 不继承 result / run identity / pending upload**; tab identity/selection/ordering/drafts 按 project+connection 隔离; 仅在 pinned group 内移动 + 保护 pinned/running 不被批量关闭; **project revocation 只丢弃目标文档、保留另一 project draft**; duplicate 嵌套 argument 元数据但**不共享可变状态**; 每文档保留有界 pane/scroll |
| **4** | `tools/argumentDraft.test.ts` | 8 | 每层 optional skip（含 defaults）不设 touched; **显式 0/false/null/空数组与 skip 独立保留**; malformed Raw 保留最后可解析语义值; **remote/advanced ref 用 local JSON 不 fetch**; 删数组项重索引 input text/skip/touched/expansion; overlapping number/integer 用 JSON 而 disjoint discriminator 显示; execution local issues 独立阻挡 |
| **5** | `records/restore.test.ts` | 8 | 用当前 tool schema 建**独立未执行文档**; **deleted service 可读但不可 restore / 建文档**; **redacted tool identity `/context` `/context/toolName` 在 connection/catalog 请求前阻断**（即使存在字面 masked tool）; **stale Developer restore 被实际 session-access 的 Viewer downgrade 拒绝 → 阻断**; **unrelated project revoked 不取消本 project restore**; **Agent history 用当前 Agent session 恢复，绝不用 browser runtime** |
| **6** | `connections/runtimeStore.test.ts` | 7 | **expired credential session 在 panel 未挂载时也断开**; revoke 单 project 后另一 project session/draft 存活; 已签发 result 的 identity 跨 revocation 保留但 **account change 会 fence**; **suspend uploads 但不取消已签发 result、不删 frozen queue**; **memory-only 选择按 account 记住且不串账号**; **stale hydration 完成时保持 expiry paused**; 同 account 过期保留 workflow evidence，logout 全清 |
| **7** | `records/viewStore.test.ts` | 4 | history filters + cursor 按 project 和 connection+tool **独立**保留; additional redaction/metadata forms 按 project+record 隔离且只 revoke 目标; 只关闭 cached source 被失效的 copy forms; **root Run invalidation 清匹配 copies 与 Tab results，保留其他 Run / project** |
| **8** | `environment/VariableEditor.test.tsx` | 4 | shared number reference expression 保留给 typed runtime resolution; 跨导航保留 conditional version + definition draft; **personal 允许 credential-shaped 值而 shared definitions 拒绝**; **拒绝 personal JSON 内嵌套 nonfinite，不静默存 null** |
| **9** | `tools/AgentToolExecution.test.tsx` | 4 | **Agent 拥有 execution 与 upload，仅显式点击才取消**，保留 safe snapshot 供独立 save; 完成的 Agent Run 可用新 identity 再执行且 **browser 无 upload ownership**; **late results 不能写入 revoked project**; **shared context redaction 在缓存/复制前应用且不改变 identity** |
| **10** | `connections/session.test.ts` | 3 | drafts 按 project + connection identity 保留（含 same endpoint）; saved disconnected/unblocked 时只应用到目标 session; identity end 清除全部 transient data |
| **11** | `records/RecordStates.test.tsx` | 3 | empty history / empty saved list → 提供相同 tool scope 作为下一步; no-match → 提供清 filter，**不给 create-call 动作** |
| **12** | `workflow/uploads.test.ts` | 3 | upload progress **只从匹配的 frozen user/project/connection/Run + target identity 合并**; Agent-owned history 与 saved copies 独立; server-observed Run 缺 upload identity 时**不发明 original history operation** |
| **13** | `team/protection.test.ts` | 3 | self 与 Owner 无论管理角色都受保护; 保护**最后 maintainer** 不被 demote/remove; **Admin 不能修改另一个 Admin** |
| **14** | `tools/ToolDocumentTabs.test.tsx` | 2 | tablist 仅暴露 document tabs，命名动作置于其外; 非当前动作附着自身文档且返焦**不改变选中** |
| **15** | `environment/AgentEnvironmentPanel.test.tsx` | 1 | 预览 Agent personal values，**apply 前重新校验且不连接 MCP** |
| **16** | `records/SessionUploads.test.tsx` | 1 | 解释 paused stale records 与 retention failure，**不给 Viewer retry** |
| **17** | `connections/v01-backup-retry.test.tsx` | 1 | 用保留 scope + 显式 consent 重试被拒 backup，只显示 accepted backup |

## Features 全量达成（B13 84 + B14 127 = 35 files / 211 tests）

实测 `apps/web/src/features/` 共 **35 个测试文件 / 211 tests**，B13（8 files / 84）+ B14 features 部分（27 files / 127）= 35 files / 211 tests，**逐文件全覆盖**：

```
features/                                         files  tests
├── records/    RecordEditors 13, RecordsPage 11, restore 8,
│               viewStore 4, RecordStates 3, SessionUploads 1     6    40
├── tools/      SchemaArgumentEditor 13, ToolsPage 9, ToolExecution 8,
│               workspace 8, argumentDraft 8, AgentToolExecution 4,
│               ToolDocumentTabs 2                               7    52
├── workflow/   model 15, WorkflowPage 13, uploads 3              3    31
├── environment/EnvironmentPage 14, VariableEditor 4,
│               v01-diagnostics 4, AgentEnvironmentPanel 1        4    23
├── connections/ConnectionsPage 11, runtimeStore 7, AgentBackupsPanel 4,
│               session 3, AgentOAuthPanel 1,
│               AgentCredentialsPanel 1, v01-backup-retry 1      7    28
├── operations/ OperationsPage 12                                 1    12
├── team/       MembersPage 9, protection 3                       2    12
├── devices/    AgentQueuePanel 3, DevicesPage 3                  2     6
├── auth/       IdentityPage 3, IdentityStates 2                  2     5
└── projects/   Projects 2                                        1     2
                                                                ───   ───
                                                                 35   211
```

## Deep-dive 批次累积（B10→B14，实测口径）

| 批次 | 深入到 | 文件 / 测试（实测） |
|------|--------|-------------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 suites + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 12 files + app 3 files | 15 files / 274+ TS |
| B13 | Features 核心 8 pages | 8 files / 84 TS |
| **B14** | **Features 剩余 + 补漏 17 文件 + shared 2 文件** | **29 files / 132 TS** |
| **总计** | | **Go 181+ / TS 490+ / E2E 33 = 704+** |

> B12 原记录写「App Shell 27」，实测 `app/` 为 3 files / **23 tests**，已按实测修正为 274+（251+ runtime + 23 app）。

## Verify Gates (2026-10-29 复核) — 无漂移

| Gate | 结果 |
|------|------|
| Go cloud `./internal/...` (22 pkgs) | ✅ 全 ok，platform 101.49s |
| Go local `-tags local ./internal/...` (21 pkgs) | ✅ 全 ok |
| go vet cloud + local | ✅ clean |
| vitest run（Node 24.21.0） | ✅ 61 files **603 tests，0 失败** |

## 全量目录分布（实测）

| 目录 | files | tests |
|------|-------|-------|
| runtime/ | 19 | 352 |
| features/ | 35 | 211 |
| app/ | 3 | 23 |
| shared/ | 4 | 17 |
| **合计** | **61** | **603** |

## B14 独有发现

| 发现 | 详情 |
|------|------|
| **DevicesPage: "never approves natively from the web"** | 安全边界——Agent pairing 必须 local approval code，web 不能直接批准 |
| **IdentityPage: "never accepts automatically"** | 安全边界——registration 后 invitation 不自动接受，用户必须显式选择 |
| **restore: redacted tool identity 请求前阻断** | `/context` `/context/toolName` 在 connection/catalog 请求前即阻断，字面 masked tool 存在也不放行 |
| **runtimeStore: suspend upload 不取消已签发 result** | 暂停上传 ≠ 取消 tool result ≠ 删 frozen queue，三者独立 |
| **workflow/model: 无 permission → 隐藏全部 progress fact** | 进度事实按权限与 identity 状态整体隐藏 |
| **viewStore: root Run invalidation 精准清除** | 只清匹配 cached copies 与 Tab results，保留其他 Run / project |
| **tools/workspace: duplicate 不继承运行态** | 复制文档不继承 result / run identity / pending upload |
| **ConnectionsPage: stale async request rejection** | 跨 project 导航旧 request 不污染新状态 |
| **WorkflowPage: missing personal env → incomplete** | 不 fallback 到 shared default |
| **AgentQueuePanel: offline Agent ≠ empty browser queue** | 独立概念 |
| **AgentBackupsPanel: two-phase confirm** | confirm 之前不创建 backup |
