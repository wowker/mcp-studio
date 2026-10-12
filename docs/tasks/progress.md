# M0–M1 执行账本

2026-10-13。授权：T01–T09；不进入 M2。Git 分支 `codex/m0-m1`；设计参考基准提交 `7eac7d4`。

| 切片 | 状态 | 修改与实际验证 |
| --- | --- | --- |
| T01a | 完成 | 001基线文档：26页面、15交互、D01–D15来源映射；只读取参考快照 |
| T01b | 完成 | 001身份词表与目录/内容/私人能力，64向量中12权限反例在JS/Go通过 |
| T02a | 当前设备实验完成，完整矩阵待验 | 002；browser-green.json，Chrome155/macOS26.6.2：9/9。公网HTTPS LNA、另版Chrome/Edge/远程网络未验 |
| T02b | 当前设备实验完成，完整矩阵待验 | 回环Host/Origin/短期一次码/撤销＋本机stdin明确确认：node --test安全/本机确认4/4。Windows/Linux/原生人工UI未验 |
| T03a | 完成 | 003状态/事件/etag/游标/幂等合同、Agent security-v1、平台OpenAPI v1及Go/TS生成，生成一致性1/1通过 |
| T03b | 完成合同准备，后续产品联验保留 | JS/Go各64共同语义向量通过；锁定Go1.25.5/Node24.21.0/PG18与依赖；GoSDK1.4/TS SDK1.29 in-memory握手工具发现各1/1；TS生成文件严格类型检查与Go wire编译通过 |

M0验证：`node --test scripts/generate-contracts.test.mjs tests/fixtures/sdk/ts-sdk.test.mjs` 2/2；`node scripts/contract-semantics.mjs` 64；`GOCACHE=/private/tmp/mcp-studio-go-cache go test ./internal/contracts ./internal/wire ./tests/fixtures/sdk` 通过（wire无单测，仅编译）。回环检查需获批socket访问，沙箱EPERM不是功能失败或通过证据。

M0推进判断：完整T02与C01保持未勾选。未验证MCP通道不放行；M1身份、数据库和协作与这些通道无执行依赖，按plan“风险未解决，不批准依赖路径”和缺测试环境保留待验规则继续。没有把有限Schema oracle、内存SDK或原型209项计作产品验收。M2/M5补HTTP SDK/OAuth/stdio与目标浏览器OS矩阵。

M1共享接口检查：T04产生数据库、平台同站点入口，T06使用独立Cookie会话；T07验证真实邮件归属，T08/T09消费最新会话与数据库关系；UI消费生成Zod合同，不决定服务端权限。所有写请求Origin/CSRF复核。T08/T09共享团队行锁顺序，邀请/成员授权与项目关系在同事务重查，避免最后维护者与旧邀请覆盖竞态。

M1 T04a–T09b 已逐叶完成并验证，C02/C03 已签收；正式 A 项保留分期联验。

## M1 切片与证据

为保持单次切片可审阅，a/b 下按实现边界再拆；同一共享文件可在后续切片增量修改。以下登记准确文件，最终门禁结果见本节末尾；本阶段最终门禁通过后逐叶签收，T04a–T09b 对应完成登记。

| 叶子 / 子切片 | 准确文件（相对根） | 验证与边界 |
| --- | --- | --- |
| T04a.1 数据库与迁移 | internal/infrastructure/database.go、database_test.go；migrations/001_identity_collaboration.sql、migrate.go；tests/integration/foundation_test.go | 显式配置、拒绝超级用户业务身份；全新随机 schema 迁移、重复迁移、重开 pool |
| T04a.2 正式入口 | cmd/platform/main.go、main_test.go；internal/platform/server.go | 健康端点真实 Ping；精确 Origin、仅回环开发例外、静态与 API 同源；非法配置回归 |
| T04b.1 前端入口 | apps/web/index.html、src/main.tsx、tsconfig.json、vite.config.ts、tests/setup.ts | TS、Vitest、Vite 生产构建 |
| T04b.2 隔离门禁 | scripts/test-runtime.mjs、verify.mjs；tests/fixtures/mail/runtime.test.mjs、runtime.integration.test.mjs | 缺 DB 必失败；失败／并发 schema 清理，生产进程启动与关闭 |
| T04b.3 受控邮件 | tests/fixtures/mail/smtp.mjs、smtp.test.mjs；playwright.config.ts、tests/e2e/m1.spec.ts | 真实 SMTP 投递、回环捕获按收件人隔离；无测试用验证跳过端点 |
| T05a.1 Shell/primitives | apps/web/src/app/Shell.tsx；src/shared/tokens.css、ui.tsx | Phosphor、192/176/80 侧栏、右上账号、左下主题及最下语言；复用标签/反馈/表单 |
| T05a.2 双语 | apps/web/src/shared/i18n.ts、i18n.test.ts | i18next 单语言；浏览器只存语言主题偏好 |
| T05b | apps/web/src/app/App.tsx、App.test.tsx；src/shared/api.ts、api.test.ts | 路由、迟到响应栅栏、语言切换保留输入、401 卸载；403 写拒后复查项目能力，不把目录能力当内容授权 |
| T06a | internal/platform/identity.go、identity_test.go、testutil_test.go；apps/web/src/features/auth/IdentityPage.tsx、IdentityPage.test.tsx | 4 并发初始化仅 1 Owner；公开注册关闭；bcrypt/数据库摘要会话；Cookie/CSRF、错误密码与旧 Cookie 登录 |
| T06b | internal/platform/server.go、identity_test.go；apps/web/src/app/App.tsx、App.test.tsx；tests/e2e/m1.spec.ts | 可控时钟 idle8h / absolute24h；退出撤销；前端到期遮蔽并复核权威期限，活跃请求不误退出；退出后返回及深链接无内容上下文 |
| T07a | internal/infrastructure/mail.go、mail_test.go；internal/platform/identity.go、identity_test.go | 30 分钟一次码摘要；失败邮件不验证；重放/到期/未配置 SMTP 回归；STARTTLS 与邮件头注入防护 |
| T07b | internal/platform/identity.go、identity_test.go；apps/web/src/features/auth/IdentityPage.tsx、IdentityPage.test.tsx；tests/e2e/m1.spec.ts | 仅有效邀请且匹配邮箱注册；仍未验证且未入项目；登录/验证保留 ID 并显式接受。找回、重置、旧会话撤销、重置与旧 hash 登录事务竞态 |
| T08a | internal/platform/projects.go、projects_test.go；apps/web/src/features/projects/Projects.tsx、app/App.test.tsx | Trim/团队唯一名、并发重名、创建者维护者、跨团队；草稿与查询按项目/团队隔离 |
| T08b | 同 T08a 文件；tests/e2e/m1.spec.ts | Owner/Admin 目录 metadata 可用但 CanRead=false；普通无关系成员拒绝；Admin 自授拒绝；Owner 显式原因+确认只改目标关系并审计 |
| T09a | internal/platform/membership.go、membership_test.go；apps/web/src/features/team/Invitations.tsx、MembersPage.tsx、MembersPage.test.tsx | 1/7/30 天，撤销/重发使旧 ID 终结；当前邀请人授权、当前邮箱、一次原子接受、既有关系不覆盖；失败保持表单 |
| T09b.1 服务端保护 | internal/platform/membership.go、membership_test.go | 团队行锁；本人/Owner/最后维护者保护；团队移除检查所有项目；旧会话下一次写403 |
| T09b.2 前端保护 | apps/web/src/features/team/MemberEditor.tsx、protection.ts、protection.test.ts、MembersPage.tsx、MembersPage.test.tsx | 项目/团队范围确认、取消与失败保留；保护项禁用；403 后卸载失效上下文 |

独立审查发现并修复：目录管理入口被 CanRead 错误阻止；旧成员页写403后能力缓存不刷新；活跃会话到旧期限提前退出；密码重置后旧 hash 登录可能创建新会话。目录／403／活跃期限／旧 hash 保护均有回归。旧 hash 回归移除 hash 重查时实测失败，恢复保护后通过；不是只镜像实现的测试。

T08/T09 内容与成员查询均使用数据库真实关系。Owner 接管不改变他人私有数据；本阶段没有记录 API，私人记录隔离仍需 M3/M4 验，移除后的30天封存与凭据清除需 M4/M5。M2 功能导航只呈现“暂未开放”，不把原型内存模拟包装成能力。

实际运行证据如下；外部真实邮件供应商、第二浏览器、Windows/Linux 与全页面可访问性矩阵仍保留待验。


## 最终签收（2026-10-13）

- 实现提交：平台 `00324d1`、运行门禁 `20fc714`、前端与浏览器 `865fcde`；M0 `1b9ad48`。本阶段止于 M1。
- [完整 verify 日志](../../tests/evidence/m1-final/verify.log)：最终退出0，全部门禁通过。JS/Go共同语义各64；Node12项；前端类型、26回归与生产构建；Go `./...`测试、vet及生产构建；真实PG/SMTP/静态入口Chromium3条E2E。Go平台独立25项及基础设施3项、入口2项名称状态见 [JSONL](../../tests/evidence/m1-platform/go-tests.jsonl)；无单测的wire/migrations包仅编译，不伪称测试数。
- [浏览器结果](../../tests/evidence/m1-playwright/results.json) 3通过、0失败/跳过/重试；[环境与发行产物摘要](../../tests/evidence/m1-playwright/environment.json)。macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PostgreSQL18.6、Playwright1.59.1/Chromium147.0.7727.15。该Chromium不抵扣Chrome155或Edge目标矩阵。
- 中文正常身份/协作、英文亮暗四宽/键盘、重发/撤销/找回密码异常链均走真实生产入口。8张受控截图只含合成非秘密草稿；已目视检查中文1440亮色和英文390暗色。字号计算与四宽横溢检查有浏览器断言，完整26页面/两浏览器可访问性仍属于M6/M7。
- 包体首个正式基线：JS366.81kB/minified、112.14kB/gzip；CSS5.64/1.74kB。相对无正式前端入口新增；没有引入第二套reset或图标库，原生primitives沿用语义token。
- 独立审查问题已修复并复核，无剩余阻塞项。补充账号栅栏：401注销立即使旧查询identity失配；旧账号迟到401/403不注销或改变新账号；同账号CSRF更新保留失败草稿，权限拒绝刷新项目能力与团队角色。
- 最终runtime停止本次Go/SMTP进程，随机schema已清理；实测遗留 `test_` / `e2e_` schema计数0。仅保留本次回环tmpfs测试DB容器供复验，启动说明见 [本机运行](../operations/development.md)。

T02a/b与C01整组仍未签收：公网HTTPS LNA、Chrome第二版/Edge、Windows/Linux和原生人工确认环境待验。当前邮件证据为受控SMTP，不声称真实外部邮件供应商已验。A01–A60没有批量通过，分期表只补实现版本/部分证据；私人记录、封存、凭据、执行、上传、全程恢复均须相应后续阶段联验。M2 T10–T14未开始，尚未实现MCP生产通道。
