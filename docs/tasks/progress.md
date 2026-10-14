# M0–M5 执行账本

2026-10-13。当前 M5 T25–T30 实现与可执行门禁通过，代码98d5049；T25b/T28a/T29b人工实机或介质联验未签收。T02完整矩阵仍待验，未进入M6。Git 分支 `codex/m0-m1`；设计参考基准提交 `7eac7d4`。下列历史中间状态保留追溯，以末尾最终签收为当前状态。

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


## M2 T10–T14 执行开始 · 2026-10-13

用户已授权当前阶段；T15、M3 与 Agent 执行不在范围。共享配置合同升级 1.1.0，生成 Go / TS 边界（34 schemas / 31 paths）；生成器回归先因 drift 失败，生成后通过。生产 Go 环境解析器的 14 项 M0 环境向量和敏感派生私有值回归已通过；配置输入边界回归覆盖 URL/query/认证 Header/stdio/变量类型。其余平台、界面、真实浏览器集成正在分片实现，完成状态尚未勾选。工程细化见 docs/decisions/005-m2-configuration-session.md。

## M2 叶子与子切片登记

下表按真实模块继续细分 a/b；共享文件在后续切片增量修改。各行对应叶子已在实现 `fc5331f` 完成并验证；完整 verify 退出0后签收 T10a–T14b。新增 runtimeStore.test.ts 覆盖未显示面板的凭据TTL断开；ConnectionsPage.test.tsx 覆盖旧删除响应不影响新身份草稿。

| 叶子 / 子切片 | 准确文件（相对根） | 验证完成标准 |
| --- | --- | --- |
| T10a.1 配置合同 | contracts/platform/openapi.json、apps/web/src/generated/platform.ts、internal/wire/platform.gen.go、scripts/generate-contracts.test.mjs | v1.1.0 兼容新增，34 schema / 31 path；生成一致性 |
| T10a.2 公共输入 | internal/configuration/validate.go、validate_test.go、apps/web/src/runtime/connection.ts、configuration.test.ts、contracts/fixtures/configuration-v1.json | Go/TS 共同配置向量，URL秘密/fragment、Header、stdio非法参数与cwd阻止；派生敏感URL拒绝 |
| T10a.3 持久化 | migrations/002_configuration_environment.sql、migrate.go、migrate_test.go、tests/integration/foundation_test.go | 自有002迁移；001升级保留用户/校验和，重复启动与新库迁移 |
| T10b.1 条件写 | internal/platform/configuration.go、configuration_references.go、configuration_test.go、server.go | 强ETag与If-Match，428/409，真实角色与项目隔离，并发更新只有一人成功 |
| T10b.2 比较与草稿 | apps/web/src/features/connections/ConnectionEditor.tsx、ConnectionsPage.tsx、ConnectionsPage.test.tsx、session.ts、session.test.ts | 两真实浏览器会话保留本地并展示远端，手工合并；非法stdio原文跨导航保留 |
| T11a.1 环境与定义 API | internal/platform/environment.go、configuration_test.go、contracts/platform/openapi.json | 项目/环境/连接真实外键，敏感定义不携带个人值，同层唯一，条件保存与删除引用保护 |
| T11a.2 个人与公共分离 | apps/web/src/features/environment/VariableEditor.tsx、VariableEditor.test.tsx、apps/web/src/runtime/vault.ts、vault.test.ts | 公共秘密阻止，个人JSON类型校验但可含秘密；0/false/null保留 |
| T11b.1 编辑界面 | apps/web/src/features/environment/EnvironmentPage.tsx、EnvironmentPage.test.tsx、VariableEditor.tsx | 新增/覆盖/删除与来源链、缺失/覆盖/敏感筛选；浏览不应用，拒绝写与失败保留 |
| T12a.1 Go解析 | internal/environment/resolve.go、resolve_test.go、internal/platform/configuration_references.go | 独立生产解析器14项M0环境向量；四层覆盖、循环、嵌套、敏感派生、复杂度与JSON有限数 |
| T12a.2 TS解析 | apps/web/src/runtime/environment.ts、environment.test.ts、connection.ts、connection.test.ts | 相同14向量，最高层缺个人值不回退；实际定义ID敏感引用，安全预览与私有取值分离 |
| T12b.1 个人应用 | apps/web/src/features/connections/runtimeStore.ts、ConnectionEditor.tsx、apps/web/src/features/environment/EnvironmentPage.tsx | 应用只改个人会话选项，不改共享默认；已连接不可应用，修复往返保留草稿不自动连接 |
| T12b.2 准入核验 | internal/platform/connection_access.go、configuration_test.go、apps/web/src/shared/api.ts、api.test.ts | 真实项目/连接/版本/个人环境重查；移除/降级后拒绝，新旧账号迟到403隔离 |
| T13a.1 内存凭据 | apps/web/src/runtime/vault.ts、vault.test.ts、apps/web/src/features/connections/session.ts、runtimeStore.ts | 用户/项目/连接隔离与定义ID个人值；到期、退出、撤权/降级清除；无浏览器持久秘密 |
| T13a.2 授权页面 | apps/web/src/features/connections/AuthorizationPanel.tsx、ConnectionsPage.tsx、ConnectionsPage.test.tsx、apps/web/src/app/App.tsx、App.test.tsx | 同URL不同连接不共用，敏感引用不借用覆盖定义，异步保存代际保护与根级清理 |
| T13b.1 OAuth协议 | apps/web/src/runtime/oauth.ts、oauth.test.ts、tests/fixtures/m2/fixture.mjs、fixture.test.mjs | HTTPS发现、PKCE S256/resource/scope/issuer/state，拒绝/取消/超时/重放；凭据绑定资源URL |
| T13b.2 回调与限制 | apps/web/src/app/App.tsx、apps/web/src/features/connections/AuthorizationPanel.tsx、translations.ts、apps/web/src/runtime/README.md | 回调同步清理查询；受限明确诊断；授权端与平台同主机名禁止，避免弹窗发送平台Cookie |
| T14a.1 HTTP transport | apps/web/src/runtime/browser-session.ts、browser-session.test.ts、tests/fixtures/m2/fixture.mjs | 锁定SDK真实Streamable HTTP/旧SSE；握手/断开、权限先核验、超时/取消/断流、迟到栅栏 |
| T14a.2 生产路径 | tests/e2e/m2.spec.ts、scripts/test-runtime.mjs、tests/fixtures/m2/tls.mjs、playwright.config.ts、tests/e2e/m1.spec.ts | 真实Go+PG+HTTPS入口，M1回归、M2三连续旅程；平台无MCP代理、跨站omit Cookie |
| T14b.1 失败诊断 | apps/web/src/runtime/browser-session.ts、browser-session.test.ts、apps/web/src/features/connections/translations.ts | 401/403、legacyPOST、CORS/网络不可精确归因、HTTPS混合内容；不静默换transport/Agent |
| T14b.2 门禁与布局 | scripts/verify.mjs、apps/web/src/shared/tokens.css、i18n.ts、tests/e2e/m2.spec.ts | 统一token/图标，中英亮暗局部窗口与语义标签；T02完整跨浏览器/OS/LNA矩阵继续待验 |

## M2 T10–T14 最终签收 · 2026-10-13

实现版本 `fc5331f`。T10 配置版本、T11 环境编辑、T12 四层解析/个人应用、T13 会话授权、T14 浏览器 HTTP 已逐叶完成；C04 签收。T15 未授权、未开始，故 C05 不整体签署；本次不进入 M3。

- [完整 verify 日志](../../tests/evidence/m2-final/verify.log)：最终退出0，全部门禁通过。合同1.1.0生成一致；JS共同语义64，Go对应语义通过；Go/TS生产解析器分别14环境共同向量，28配置共同用例；Node16，前端类型/143测试/生产构建；Go `test -count=1 ./...`、vet、生产构建，真实非超级用户PG隔离集成，无静默跳过。wire无单测只编译，避免虚报。
- [浏览器结果](../../tests/evidence/m2-playwright/results.json)：6通过（M1三条回归＋M2三条连续旅程）、0失败/跳过/重试；实际Go/PG/受控SMTP/HTTPS生产静态入口。保存/应用/授权不自动连接，HTTP/SSE握手、取消、stdio只配置、两会话ETag冲突、同URL凭据隔离、刷新无秘密存储、OAuth授权/拒绝及PKCE/resource、混合内容/CORS诊断均有真实断言。
- [夹具网络统计](../../tests/evidence/m2-playwright/fixture-statistics.json)：HTTP initialize3、旧SSE initialize1、OAuth initialize1、PKCE/resource各1、拒绝1；两个上游均cookieRequests=0。纯数值、不记录Token/code/verifier。fixture自签证书仅隔离测试忽略，正式TLS未放宽；Agent与跨浏览器/公网LNA不是本次证据。
- [构建与证据摘要](../../tests/evidence/m2-final/manifest.json)：macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Playwright1.59.1/Chromium147.0.7727.15。M2七张中英局部截图，已目视390英文暗色/1440中文暗色，真实窗口横溢断言通过；不抵扣M6完整26页面布局/键盘矩阵。M1八张回归截图加m1前缀，不覆盖历史M1证据。
- 首次M2预检失败保留在 m2-preflight：独立Cookie容器导致401、select标签精确可访问名不符、第二浏览器导航早于登录完成；分别修复会话容器、显式可访问名、真实登录等待后，在最终生产入口重新验证通过。没有将失败或未执行测试标为通过。
- [独立审阅](./m2-review.md)：断流/权限降级/派生秘密URL/JSON有限数/深层秘密屏蔽/legacy认证失败/个人JSON/回调与迟到响应等回归已修复。最终四文件23项针对性测试通过，无剩余Critical/Important；凭据到期会断开非当前页面连接，迟到DELETE不影响新身份草稿。
- 包体采用页面与transport懒加载；最大JS chunk420.37kB/gzip128.41kB，CSS7.29/2.07kB，正式构建无chunk阈值告警。沿用token/Phosphor/既有primitives。
- runtime停止平台、邮件、MCP、OAuth与TLSfixture，证书临时文件和随机schema清理；另行只读检查 `test_` / `e2e_` schema计数0。回环tmpfs PG容器仅为复验保留。

T02a/b、C01仍待验：公网HTTPS本地网络授权、目标Chrome另一版/Edge、Windows/Linux及原生人工确认未补签，不宣称支持。浏览器OAuth仅当前预注册公共客户端严格HTTPS/issuer/resource协议范围，无DCR/自动刷新；平台同主机名弹窗受限并明确诊断。Agent、系统凭据库、Tool/Tab/Run/上传/历史/恢复仍未实现。A01–A60全保持“待验收”，只更新相关项的真实M2部分版本与证据，后续联验不抵扣。

## T15 / M3 执行开始 · 2026-10-13

用户追加授权：基于已完成 M2 T10–T14，先补 T15，再执行 T16–T21；不进入 M4。基准实现 fc5331f / 登记06870b4。T02 未验路径仍不放行，原证据与快照不覆盖。本次先实现真实SDK工具目录/Tab并验证，再推进参数/执行/脱敏记录；浏览器持久队列、容量/保留生命周期属于M4，当前上传失败只在本会话保留冻结脱敏操作，不提供刷新恢复承诺。

T15 计划切片：a.1 SDK分页工具发现与断开代际；a.2 真实目录/搜索/定义与断连状态；b.1 项目/连接Tab身份、草稿和命令模型；b.2 可访问Tab命令/根级身份清理；集成.1 生产入口与独立审阅。未验证叶子保持未勾选。准确文件与后续切片在验证时补登记。

## T15 签收 · adf6622

| 切片 | 实际文件 | 验证 |
| --- | --- | --- |
| T15a.1 | runtime/browser-session.ts、browser-session.test.ts、tests/fixtures/m2/fixture.mjs/test | 实际SDK HTTP/SSE分页echo/nested；100页/1024工具/1MiB界限，重复cursor/名称拒绝，断开代际 |
| T15a.2 | features/tools/ToolsPage.tsx/test、translations.ts、app/App.tsx、shared/i18n.ts | 真目录/搜索/定义/无匹配/断连/错误/删除来源；不调用Tool，不自动换连接 |
| T15b.1 | features/tools/workspace.ts/test、connections/runtimeStore.ts/test | 项目/连接独立Tab身份与草稿；复制不继承Run；固定/移动/批量关闭保护 |
| T15b.2 | features/tools/ToolDocumentTabs.tsx、ToolsPage.test.tsx、app/App.test.tsx、shared/tokens.css | Arrow/Home/End/menu/Esc，关闭后焦点邻Tab/目录；跨Viewer项目保留其他项目草稿 |
| T15集成 | tests/e2e/m3.spec.ts、production-helpers.ts、m1/m2.spec.ts、test-runtime、playwright.config、vite.config | 真实Go/PG/HTTPS七旅程；M1/M2历史证据不覆盖；文件worker4避免并行导入饿死异步断言，未修改断言/超时/阈值 |

完整 [verify](../../tests/evidence/m3-t15/verify.log) 退出0：Node17、前端187测试/type/build、Go非缓存全部测试/vet/build、真实生产入口7条E2E，0失败/跳过/重试。T15a/b逐叶签收，C05完成。已目视1440英文亮色工具截图；全窗口/浏览器矩阵仍待M6/M7。

独立审阅三项重要问题（凭据回显目录/默认复制，关闭焦点丢失，删除记忆连接伪空列表）红→绿修复；五文件68项复核通过。目录对敏感元数据/秘密URL或来源收集不完整整体安全拒绝，保留有效工具原身份与Schema。真实入口还发现SDK listTools隐式Ajv编译违反CSP，改为Client.request+ListToolsResultSchema；真实HTTP/SSE阻断编译回归与浏览器均通过，CSP未放宽。允许夹具origin上GET /mcp的405，仅代表规范允许不提供可选SSE监听；其他未预期HTTP状态仍失败。

预检失败保留于m3-t15/browser-*.log与verify-preflight.log。最终最大JS425.92kB/gzip130.12kB、工具chunk17.99/5.65kB、CSS9.94/2.57kB，无chunk阈值告警。T02状态不变；尚未实现T16参数编辑或真实执行，后续M3继续授权范围。所有A项仍待验收。

## M3 实施中 · 2026-10-13（尚未签收）

T16 正式使用 Hyperjump 1.18.0 独立 Worker AST 校验和 Go jsonschema/v6 6.0.3，生产 CSP 未放宽。46 条新增共同 Schema 向量涵盖组合、递归引用、注释及跨端数值/正则边界；保留 M0 原向量。跨端 `multipleOf` 已用精确十进制运算消除 epsilon 分歧；不一致的通配点、空白类与 POSIX pattern 明确不支持，不自动远程取回引用。独立审阅发现的分支切换丢失其他非法原文、修改一字段清除其他错误均有红→绿回归。

当前实际验证：T16 生产浏览器两旅程通过（[browser-3.log](../../tests/evidence/m3-t16/browser-3.log)）；随后一致性修复的前端范围测试 155/155（[focused-final.log](../../tests/evidence/m3-t16/focused-final.log)）、Go Schema/脱敏共同向量非缓存通过（[go-vectors-final.log](../../tests/evidence/m3-t16/go-vectors-final.log)）。尚需本轮最终生产构建与完整 verify，T16 叶子暂不提前勾选。

T17 冻结记录合同升级1.2.0；任意正文以 JSON 字符串保存，外层共同规范摘要，独立 history/saved/operation/Run 身份。前端新增 `runtime/records/{canonical,redaction,snapshot,operations}.ts`：共同7条摘要/16条脱敏向量；来源、默认、项目、追加规则；二进制/超限明确省略；Schema 属性名与注释分别处理。上传只在会话内保留脱敏冻结内容，相同操作并发合并、失败原摘要重试、清除身份与撤项目阻断迟到回执及摘要计算竞态。操作/快照9项回归实际通过；不提供 M4 持久恢复。

T17/T19/T20/T21 Go 接收、真实权限/幂等、稳定游标、保存/修订/追加脱敏事务与前端记录页面仍在逐项联调；T18 执行运行时正在接通，未签署任何未验证出口。T02 和所有 A 项状态不变，本次不进入 M4。

2026-10-13 后续验证：T16共同Schema已扩至49条，脱敏19条。初次完整verify已实际通过Node18、前端419、Go非缓存/PG/vet/build与11条生产浏览器旅程；日志保留为 `tests/evidence/m3-preflight/verify-before-view-fix.log`。目视发现元数据修订成功后旧编辑状态未清，新增浏览器断言实测失败于 `metadata-view-red.log`；正在修复并最终复验，暂不签收M3叶子。

## M3 叶子 / 子切片登记

下列为实际文件与逐项验证映射。前端路径均相对 `apps/web/src/`；共享文件随后续切片增量修改。签收以本节后的最终门禁版本为准。

| 叶子 / 子切片 | 实际文件 | 完成标准与验证入口 |
| --- | --- | --- |
| T16a.1 状态模型 | features/tools/argumentDraft.ts、argumentDraft.test.ts | skip/touched/原文/last parseable/null独立；嵌套默认skip，0/false/null/空值保留，数组删除路径重排 |
| T16a.2 结构编辑 | features/tools/SchemaArgumentEditor.tsx、SchemaArgumentEditor.test.tsx | 嵌套对象/数组/enum/nullable、无歧义oneOf；focus/blur不误报，错误路径焦点；分支不丢其他非法原文 |
| T16b.1 校验隔离 | runtime/schema/index.ts、index.test.ts、worker.ts、interpreter.ts、interpreter.test.ts | 每job独立Worker/超时；严格CSP、禁止网络取ref；组合/递归/unevaluated/dynamicRef正式解释 |
| T16b.2 跨端范围 | runtime/schema/profile.ts、types.ts；features/tools/argumentDraft.ts；contracts/fixtures/schema-v1.json | dialect/keywords/pattern/节点/深度/数值边界；新增49共同向量+M0 17条Schema语义 |
| T16b.3 Go对应 | internal/schema/check.go、check_test.go；internal/jsonnumber/number.go；go.mod/go.sum | 正式校验器、数值先限词法再binary64，multipleOf精确；jsonnumber无独立测试，边界由schema/recording/平台测试覆盖 |
| T17a.1 共同规范 | runtime/records/canonical.ts、canonical.test.ts、redaction.ts、redaction.test.ts；contracts/fixtures/recording-v1.json | 7摘要/19脱敏共同用例；来源/默认/项目/追加/嵌套回显，二进制/超限/未知来源明确省略 |
| T17a.2 冻结快照 | runtime/records/snapshot.ts、operations.ts、operations.test.ts | request/response/protocol/metadata/context联合来源；Schema注释单独遍历；同摘要/ID原操作重试，不持久化 |
| T17b.1 合同与迁移 | contracts/platform/openapi.json、generated/platform.ts、internal/wire/platform.gen.go；migrations/003_records.sql、migrate_test.go | v1.2.0 47schemas/39paths生成一致；001→003升级保留已有数据，新schema重复迁移 |
| T17b.2 平台规范 | internal/recording/canonical.go、canonical_test.go、redaction.go、redaction_test.go、fixtures_test.go | 相同共同规范向量；JSON歧义、正文转义预算、数值/布尔传播和冻结摘要 |
| T17b.3 接收事务 | internal/platform/records.go、records_test.go、server.go；tests/integration/foundation_test.go | 当前真实角色先于回执、团队锁后重读；原ID原摘要幂等，异摘要冲突，失败回滚/并发仅一次；Agent责任Cookie拒绝 |
| T18a.1 运行状态 | runtime/execution/index.ts、index.test.ts、types.ts、environment.ts | 同Tab同步锁定，当前Tool/环境/权限准入；无效不建Run；独立Run/record/operation与冻结上下文 |
| T18a.2 工具接入 | features/tools/ToolExecution.tsx、ToolExecution.test.tsx、ToolsPage.tsx、ToolsPage.test.tsx、workspace.ts | 草稿与Run分离，执行后编辑不变快照；失效不丢旧结果事实，运行项保护，参数/执行组件key隔离 |
| T18b.1 实际SDK | runtime/browser-session.ts、browser-session.test.ts、execution/fixture.test.ts、protocol.ts、protocol.test.ts | HTTP/SSE真实callTool，取消不破坏同连接下次调用；RPC/401/403/isError/output/网络/超时区分，摘要安全界限 |
| T18b.2 连续流程 | tests/fixtures/m2/fixture.mjs、fixture.test.mjs；tests/e2e/m3.spec.ts、production-helpers.ts | 实际延迟屏障/迟到、双击一次、TabB可编辑、平台不可达不发新调用，上传503后编辑草稿再原body重试 |
| T19a.1 查询 | internal/platform/records_list.go、records_test.go | 项目/工具含连接范围；私有SQL过滤/猜ID拒绝；签名游标绑定身份/筛选/highWater，插入不重排已有页 |
| T19a.2 范围记忆 | features/records/RecordsPage.tsx、RecordsPage.test.tsx、viewStore.ts、viewStore.test.ts | 总历史/工具历史独立筛选与分页；返回记录所属范围重查，项目+记录表单隔离 |
| T19b.1 详情动作 | features/records/RecordDetail.tsx、SessionUploads.tsx、records.css、translations.ts | 脱敏正文/SDK协议摘要/身份和省略原因；维护者固定，固定删除保护；本人会话待/失败项只冻结重试，无伪造详情/删除 |
| T20a.1 保存 | features/records/RecordEditors.tsx、RecordEditors.test.tsx；runtime/records/snapshot.ts、operations.test.ts | 请求/请求响应新ID/时间，原执行者身份与上传责任分开；合法Schema错仅私有未完成，非法JSON拒绝 |
| T20a.2 来源独立 | internal/platform/records.go、records_revision.go、records_test.go | 已上传/未上传本人Run、合成Agent来源另存；来源历史/配置删除不删saved；当前规则安全投影才通过来源证明 |
| T20b.1 修订 | 同上平台文件；features/records/RecordEditors.tsx、RecordEditors.test.tsx | 新operation+If-Match/baseVersion；参数/响应不变，范围权限再查；失败再编辑仍原body/etag重试，冲突显式放弃后保留草稿 |
| T20b.2 凭据/卸载 | features/connections/runtimeStore.ts；features/records/RecordEditors.tsx、RecordEditors.test.tsx | 捕获私有来源闭包保护已掩码请求后的新备注；异项目撤权不误失效；离开页成功后清旧编辑态，失败保留 |
| T21a.1 恢复 | features/records/restore.ts、restore.test.ts；features/tools/workspace.ts、workspace.test.ts | 当前实际session-access/配置/应用环境/目录，new未执行Tab；脱敏身份拒绝，marked顶层参数移除，0/false/null及旧草稿保留 |
| T21b.1 平台修订 | internal/platform/records_revision.go、records_test.go | 追加路径+原因新操作；关联他人private副本也同步脱敏/版本，但不向修订者泄漏其内容；旧审计原因不留秘密 |
| T21b.2 缓存隔离 | features/connections/runtimeStore.ts；features/records/RecordEditors.tsx、RecordEditors.test.tsx、viewStore.ts | 原因A→B→A保留，失败原操作重试；离开页后成功仍失效对应Run/副本/保存来源，其他新Run/项目不受影响 |
| M3 入口/双语 | app/App.tsx、shared/i18n.ts、shared/tokens.css、features/tools/executionTranslations.ts；package.json/package-lock.json | 历史路由、中文英文、沿用token/Phosphor/primitives；页面/transport懒加载，正式生产入口完整verify |

## M3 最终签收 · cf9b6cf · 2026-10-13

T16参数编辑、T17脱敏/平台接收、T18真实执行、T19历史查询详情、T20保存与元数据修订、T21恢复/追加脱敏均按上表逐叶完成，C06/C07签收；T15已在adf6622签收。本轮止于M3。

- [完整verify](../../tests/evidence/m3-final/verify.log)实际退出0：合同1.2.0（47schemas/39paths）生成一致、JS共同语义64、Node18；前端类型/34文件424项测试/生产构建；Go `test -count=1 ./...`，含真实非超级用户隔离PG、vet及生产构建。wire/jsonnumber无独立单测只编译，jsonnumber边界由Schema/recording/平台回归覆盖，不虚报独立测试。
- 正式Go/TS校验新增49共同Schema向量，继续运行M0的17条Schema语义；记录7摘要/19脱敏共同用例。Hyperjump解释器在独立Worker和严格生产CSP下验证；未放宽unsafe-eval、远程引用、正则兼容范围或数字边界。
- [生产浏览器结果](../../tests/evidence/m3-final/results.json)：11通过（M1三条、M2三条、T15/M3五条），0失败/跳过/重试，45.4秒。真实Go/PG/受控SMTP/HTTPS静态入口与实际SDKHTTP；冻结执行、双击一次、503后原body重试不重调、保存/元数据/关联脱敏/删除来源/新未执行Tab恢复、嵌套错误焦点/组合/递归/remote零请求、RPC实际码/401/isError/output错误/取消迟到/超时/离线准入、Token回显/默认复制/保存备注/私有未完成草稿、详情另存关闭/再次打开取消均有实际断言。
- [数值网络统计](../../tests/evidence/m3-final/fixture-statistics.json)：MCP HTTP initialize9、SSE initialize1、toolsCall9，延迟2/释放2；OAuth PKCE/resource各1，两个上游cookieRequests=0。SSE tools/call另由实际SDK HTTP/SSE fixture回归证明；统计不记录Token/code/verifier。
- [审阅](./m3-review.md)所列问题均有回归并修复，无剩余阻塞项。目视英文1440亮色/中文390暗色记录详情、英文390参数页；记录截图发现元数据旧表单后真实浏览器RED→GREEN，详情另存同根因经RecordsPage集成RED→GREEN，来源失效仅关闭匹配copy；最终Records32项通过。初次419项门禁与后续421项门禁不作为最终签收，失败与中间日志保留m3-preflight/m3-t16。
- [环境、构建与证据摘要](../../tests/evidence/m3-final/manifest.json)：macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Playwright1.59.1/Chromium147.0.7727.15。最大JS466.34kB/gzip141.99kB，工具40.61/12.23kB、记录33.62/10.23kB、browser-session22.26/7.52kB，主CSS12.32/2.99kB；无chunk阈值或静态/动态导入告警。提交检查只移除一处末尾空行，随后对提交重建前端/Go发行产物，不改变行为。
- 本次平台、邮件、MCP、OAuth、临时TLS均停止，随机测试schema已清；最终只读PG查询遗留test_/e2e_schema计数0。回环tmpfs测试DB容器仅供复验保留。

T02a/b、C01完整Chrome/Edge/OS/公网HTTPS LNA/原生人工确认路径继续待验，不宣称支持。当前Chromium证据不抵扣目标Chrome155/Edge或Windows/Linux。A01–A60全部仍为待验收，只登记相关M3部分版本/证据，等待正式分期联验。

协议记录仅SDK摘要，没有原始传输帧trace或虚构HTTP成功码；取消/超时不承诺回滚。平台摘要保证操作一致性，不是上游执行签名。当前浏览器失败操作只有会话内冻结重试，刷新/退出后无可靠恢复。M4 T22–T24的持久队列、容量、可靠重认证、保留与封存未开始；M5 Agent/系统凭据库/上传认证未实现，Agent来源另存仅用合成存档证明归属，不宣称Agent已支持。

## M4 执行开始 · 2026-10-13

用户授权基于M3执行T22–T24，不进入M5。按T22持久队列→T23身份/权限门控→T24容量/保留逐叶验证。工程细化见007-m4-queue-lifecycle.md；运行时、平台生命周期和队列界面独立文件分工，Root负责会话接入/真实浏览器/完整门禁。当前叶子尚未验证，暂不勾选；T02与全部A项正式待验状态不变。

## M4 叶子 / 子切片登记 · c3fbf2e

前端路径相对apps/web/src；平台/迁移/合同路径相对仓库。每叶完成标准由以下实际实现及验证对应，不以原型证据抵扣。

| 叶子 / 子切片 | 实际文件 | 实现和实际验证 |
| --- | --- | --- |
| T22a.1 脱敏持久队列 | runtime/records/queueStorage.ts/test、operations.ts；features/connections/runtimeStore.ts/test | 原生IDB只保存冻结脱敏input/etag/状态/时间/字节和最小回执；本人项目分区；schema+digest损坏隔离；生产浏览器刷新仍为原操作/原快照，无Token回显 |
| T22a.2 保留方式 | operations.ts、features/operations/OperationsPage.tsx/test、shared/i18n.ts | 本人显式memory/persistent，公开模式偏好按账号保存；原生IDB不可用先阻止调用，手动选内存才继续，刷新恢复模式；旧缓存删除失败明确保留未确认警告 |
| T22b.1 幂等协调 | operations.ts、queueStorage.ts/test；internal/platform/records.go、records_revision.go | 同窗口合并/跨窗口30秒租约+10秒续租/过期可恢复；原ID/摘要/etag；回执与payload删除同IDB事务；真实接收但回执丢失后两次相同body仅建一次记录、Tool只调用一次 |
| T22b.2 本人操作 | features/operations/{OperationsPage.tsx/test,operations.css,translations.ts}；features/records/SessionUploads.tsx/test；app/{Shell,App}.tsx | 上传/失败/滞留状态与冻结详情、选择和失败项审阅/明确丢弃；上传中禁止清理；退出取消/返回处理/明确丢弃含隐藏/损坏待办；无自动删除失败项 |
| T23a.1 执行和到期 | features/tools/ToolExecution.tsx/test；runtime/execution/index.ts；runtimeStore.ts/test；app/App.tsx | 已发出Run可完成并保留脱敏操作，上传暂停；未准入/平台离线不发新Tool；到期隐藏上下文，旧hydration不能解除到期；两种真实执行延迟组件回归验证上传只在恢复后发生 |
| T23a.2 账号恢复 | runtimeStore.ts/test、operations.ts/test；tests/e2e/m4.spec.ts | 同账号恢复本人队列；同一页面实际受邀Developer登录看不到Owner队列，退出不清Owner条目，Owner回登录可恢复；真实Cookie/邮件/PG，不用模拟角色授权 |
| T23b.1 当前真实能力 | runtimeStore.ts、shared/api.ts/test；internal/platform/records.go、records_revision.go、connection_access.go | 每发送重查Cookie身份及操作所属项目；403回调附具体path，不误撤B；平台团队锁后复核权限；Viewer/移除/他人回执拒绝，Developer只能确认已接受本人原操作，新公共编辑仍拒绝 |
| T23b.2 异步围栏 | operations.ts/queueStorage.test.ts；runtimeStore.ts/test | 到期使resumeTicket失效；模式恢复不能覆盖跨账号或同账号等待期间的新撤权；回归先失败后通过，旧项目和新增撤权项目都保持暂停 |
| T24a.1 本机准入 | queueStorage.ts/test、operations.ts；ToolExecution.tsx | 1000条/100MiB按本人项目原子计数/UTF8字节；满时禁止新调用，已完成超预算结果留内存并告知风险；原生1k队列不重调，损坏条目不泄漏/不重试 |
| T24a.2 平台容量 | internal/platform/record_lifecycle.go/test、records*.go；contracts/platform/openapi.json/generated；cmd/platform/main.go/test | 请求1MiB/响应10MiB正式边界继续通过；项目默认5GiB逻辑字节，归档/回执/记录审计/标记计容量；一字节与并发最后空间、GET聚合/权限、purpose=execute阻断及普通connect保留；真实PG事务/race定向 |
| T24b.1 保留作业 | record_lifecycle.go/test、cmd/platform/main.go/test；migrations/004_record_lifecycle.sql、migrate_test.go；OperationsPage.tsx/test | 普通历史默认90d、维护者If-Match修改/实际部署上限；固定/saved不自动清理；启动/定时/停止Sweep，重复重启幂等；7d本机队列只提示；001–004编号迁移升级保留数据 |
| T24b.2 封存与隐私 | internal/platform/membership.go、record_lifecycle.go/test、records_list.go、records_revision.go | 移出项目/团队事务封存本人private30d；期限内本人同项目重加恢复，期限后立即拒绝且清理/原回执不复活；共享保留署名/独立saved保护；追加脱敏覆盖归档关联副本，不泄漏归档身份，满容量也允许安全隐私清理 |

## M4 最终签收 · c3fbf2e · 2026-10-13

T22a/b、T23a/b、T24a/b逐叶完成，C08签收，本轮止于M4。迁移总数4，平台API1.3.0（49schemas/40paths）；冻结上传/修订仍为1.2.0，不改已冻结摘要。详见[审阅记录](./m4-review.md)及[工程细化](../decisions/007-m4-queue-lifecycle.md)。

- [完整verify](../../tests/evidence/m4-final/verify.log)退出0：共同JS语义64、Node18；前端类型/37文件473项测试/生产构建；Go `test -count=1 ./...`、真实非超级用户隔离PG、vet和生产构建均通过。wire/jsonnumber仍无独立单测，只编译及被Schema/recording/平台回归覆盖，不虚报独立测试。
- [浏览器结果](../../tests/evidence/m4-final/results.json)：15通过（M1三条、M2三条、T15/M3五条、M4四条），0失败/跳过/重试。生产HTTPS静态入口/Go/PG/受控SMTP与实际SDK，原生IDB刷新、回执丢失不重调、真实不同账号隔离、到期本人恢复、正常退出三动作、1000条准入、7d只提醒、损坏隔离、存储故障/显式内存模式/刷新均有实际断言。
- 前端队列43项、操作页12项及执行后到期/同项目撤权回归全部纳入最终门禁。独立审阅所列容量合同/隐私例外/显式内存模式、跨账号/同账号/到期hydration竞态已修复。中间RED/首次通过/定位失败保留m4-preflight与m4-platform，最终签收只用m4-final；没有削弱CSP、断言、超时、测试数量或构建阈值。
- [环境/构建摘要](../../tests/evidence/m4-final/manifest.json)：macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Playwright1.59.1/Chromium147.0.7727.15。最大JS499.73kB/gzip151.27kB、操作页9.52/3.11kB、工具40.95/12.37kB、记录33.85/10.30kB、主CSS12.32/2.99kB，无chunk阈值告警。英文1440亮色/中文390暗色操作页已目视，无整页横溢出；完整布局矩阵待M6/M7。
- [定向Go race](../../tests/evidence/m4-platform/focused-race.txt)真实PG容量并发/撤成员上传路径通过。额外全量race尝试在8分钟超时，日志[go-race.txt](../../tests/evidence/m4-platform/go-race.txt)保留，不报告通过；其单个孤立schema经角色与固定夹具/空项目/空记录/无会话核验后清理。最终随机test_/e2e_ schema计数0，平台/邮件/MCP/OAuth/临时TLS均停止；仅隔离回环tmpfs测试DB供复验保留。

T02a/b、C01完整Chrome/Edge/OS/公网HTTPS LNA/原生人工确认矩阵继续待验，不宣称支持。A01–A60正式状态全部仍待验收，本轮只补M4部分实现版本与证据。浏览器持久性仍受OS/浏览器存储清理影响，不能保证断电绝不丢失；beforeunload仅辅助提醒，秘密与原始请求响应不进持久队列。平台容量是定义明确的逻辑预算，不是PG物理磁盘或备份大小。M5 Agent、系统凭据库、加密Agent队列、个人备份/删除联动及M7备份介质淘汰未实现，不以合成存档冒充支持。下一阶段仅在新授权后进入M5 T25–T30。

## M5 T25–T30 执行开始 · 2026-10-13

用户明确授权本阶段，不进入 M6。平台独立切片 1ae449c：005 迁移、1.4 平台合同、一次性 Agent proof / 私有委托 grant、本人显式加密备份、密码重认证、修订冲突和成员移除清除在线备份。真实 PostgreSQL 14 项 focused 测试通过，含父会话期限、密码重置、授权事务竞态、密钥故障、AAD 和并发覆写；仍须统一门禁和跨端联验。

Agent 本机 1.0 合同（30 schemas / 26 paths）与严格 Go / TS 生成已实现；本机确认、原生进程、HTTP SDK、OAuth、加密 vault / queue 与前端正在逐片联验。独立复审问题已逐项修复或正在验证；此中间状态不勾选叶子任务，不签收 A 项。工程依据见 [008](../decisions/008-m5-agent-credentials-queue.md)。T02 完整矩阵、人工确认及真实 OS 凭据库等实机验收继续待验。

## M5 工作包与子切片证据

实现版本：平台 `1ae449c`、本机合同与加密存储 `91a81ca`、原生 Agent `9e104a7`、前端与生产集成 `0322293`。统一门禁最终签收记录在下节。每个叶子继续按职责拆分，未验证的实机 / 介质检查不由受控测试抵扣。

| 叶子 / 子切片 | 准确文件（相对根） | 实际行为与回归 |
| --- | --- | --- |
| T25a.1 平台委托 | internal/platform/agent_auth.go、agent_auth_test.go；migrations/005_agent_credentials.sql；contracts/platform/openapi.json | Cookie+CSRF proof / 非浏览器一次性兑换 / digest-only grant；父期限、重放、并发单胜者、Cookie/Sec-Fetch拒绝、重置/退出/设备撤销与事务授权 |
| T25a.2 本机边界 | contracts/agent/openapi.json；scripts/generate-agent-contracts.mjs、generate-agent-contracts.test.mjs；internal/agent/localapi、pairing；apps/web/src/runtime/agent-client.ts、agent-session.ts 及对应测试 | 字面回环、精确 Host/Origin、token身份/期限；30 schema / 26 path严格合同，与平台/MCP凭证独立 |
| T25b.1 原生确认与状态 | cmd/agent/confirmation.go、confirmation_test.go、main.go、main_test.go、options.go；apps/web/src/features/devices/DevicesPage.tsx、DevicesPage.test.tsx | /dev/tty / CONIN$ 原生输入；用户/Origin/能力与一次码，安全引用控制字符；离线为未知，恢复不连接。受控配对旅程通过，人工本机确认/解除仍待验 |
| T26a.1 进程与锁 | internal/agent/process/process.go、process_test.go、lock_unix.go、lock_windows.go、lock_test.go | 直接程序+数组、合法cwd、最小父环境、同数据目录单进程锁，特殊参数与敏感父环境回归 |
| T26a.2 核对与确认 | internal/agent/sessions/engine.go、stdio_test.go、environment.go、environment_test.go | 当前真实配置/变量定义/用户/项目权限，首次及变更确认；无浏览器凭据借用 |
| T26b.1 stdio生命周期 | internal/agent/mcp/client.go、client_test.go；internal/agent/sessions/engine_test.go、stdio_test.go | 锁定GoSDK实际子进程、独立连接、退出/超时/取消/迟到结果；stdio HTTP状态为0，取消不承诺回滚 |
| T27a.1 HTTP适配 | internal/agent/mcp、platformclient；internal/agent/sessions/catalog.go、catalog_test.go | 实际Streamable HTTP/旧SSE，状态来自tools/call而非握手；私有会话按用户/项目/连接；敏感URL编码与Schema结构键拒绝 |
| T27b.1 显式入口 | apps/web/src/features/connections/AgentConnectionPanel.tsx、runtimeStore.ts；features/tools/AgentToolExecution.tsx、AgentToolExecution.test.tsx、ToolsPage.tsx；features/records/restore.ts、restore.test.ts | 本人选择Agent，独立工具目录/Run和冻结结果；历史恢复新未执行Tab，无自动fallback；browser保存Agent结果为新browser操作 |
| T28a.1 原生key与密文 | internal/agent/vault/storage.go、store.go、store_test.go、system_darwin.go、system_keychain_darwin.m/.h、system_windows.go、system_linux.go、system_unavailable.go | AES-GCM nonce/AAD、主密钥与密文分离、私有原子文件；跨Disk初始化不覆写key；丢key不重建、密文篡改/错误AAD/保存失败/session替换与重启回归；真实OS库仍待验 |
| T28a.2 凭据接口与界面 | internal/agent/sessions/credentials.go、credentials_test.go、status_contract_test.go；apps/web/src/features/connections/AgentCredentialsPanel.tsx、AgentCredentialsPanel.test.tsx；features/environment/AgentEnvironmentPanel.tsx、AgentEnvironmentPanel.test.tsx、AgentPersonalValueEditor.tsx | 当前本人范围与实际定义ID、session/local分开；已授权与保存失败独立；refresh/status严格枚举，个人值不进入公共预览 |
| T28b.1 原生OAuth | internal/agent/oauth/oauth.go、oauth_test.go、scopes_test.go；sessions/oauth_contract_test.go；apps/web/src/features/connections/AgentOAuthPanel.tsx、AgentOAuthPanel.test.tsx | HTTPS PKCE/issuer/resource/state/loopback回调，实际返回scope；缺必要scope拒绝，授权成功但落盘失败可单独重试，授权交换次数不增加 |
| T29a.1 备份与条件修订 | internal/platform/credentials.go、credentials_test.go；cmd/platform配置；internal/agent/sessions/backups_test.go | 默认OFF，密码重认证，本人最新真实权限；平台外key、AAD含version；metadata/delete在key丢失时仍可用；并发expectedVersion防覆盖 |
| T29a.2 Agent备份界面 | apps/web/src/features/connections/AgentBackupsPanel.tsx、AgentBackupsPanel.test.tsx；sessions/credentials.go | 显式确认，读取本人metadata确定修订，实际backup/restore DTO一致；备份失败不否定本机保存 |
| T29b.1 删除与成员事务 | platform/credentials_test.go、membership/005外键；Agent凭据delete；AgentBackupsPanel | 本机/平台/上游分离，项目/团队移除即时删在线备份，重加无自动恢复；实际备份介质生命周期仍待验 |
| T30a.1 加密冻结与配额 | internal/agent/queue/queue.go、queue_test.go；sessions/queue.go、queue_test.go、cache.go、cache_test.go | 预留计入1000项/100MiB、本人memory选择、同digest重试、7天仅提醒；OS临时锁定恢复；并发保留切换不重写旧cipher；receipt擦正文，terminal缓存有界 |
| T30a.2 进程恢复与上传 | tests/fixtures/m5-agent/main.go、fixture.mjs、fixture.test.mjs；tests/e2e/m5.spec.ts | 页面关闭已授权调用继续；进程重启只读冻结操作、重配对后重试同op/digest，HTTP/stdio Tool调用次数不增加；受控加密队列不是物理断电验收 |
| T30b.1 跨端与项目权限 | apps/web/src/features/devices/AgentQueuePanel.tsx、AgentQueuePanel.test.tsx；features/operations/OperationsPage.tsx；平台agent_auth_test；sessions/queueRoutes | 本人/所属项目及当前角色门控，队列与browser队列独立，失效不报空；保存Agent来源新建browser操作 |
| 共同完整门禁 | scripts/verify.mjs、test-runtime.mjs；tests/integration/foundation_test.go；tests/fixtures/m2/tls.mjs、fixture.mjs；tests/e2e/m5.spec.ts | Node/前端/真实PG/Go/vet/平台+Agent生产构建与M1–M5旅程；005新表及重开连接不清proof/grant回归 |

独立复审与实际联验发现的错误没有通过放宽校验解决。Schema结构键秘密、备份修订与DTO、OAuth范围、凭据session替换、terminal缓存、queue保留竞态、OS锁定、主密钥初始化及TTY显示均有确定性回归。受控M5三旅程通过；最终全量门禁须以下节实际退出值为准。

## M5 最终可执行验证与待验登记 · 2026-10-13

- 最终实现与回归版本 `98d5049`：M5 平台 `1ae449c`、合同/加密存储 `91a81ca`、Agent `9e104a7`、前端/真实集成 `0322293`。未进入 M6。
- [完整 verify](../../tests/evidence/m5-final/verify.log) 实际退出0：平台1.4 / Agent1.0生成一致性、JS/Go64共同向量、Node20回归、前端46文件/497测试、TypeScript与生产构建、真实隔离PostgreSQL的Go `./... -count=1`、vet、生产平台/Agent及独立helper构建、M1–M5生产入口18条浏览器旅程全部通过。wire / jsonnumber / helper等无单测包只编译，不冒称测试数量。
- [浏览器结果](../../tests/evidence/m5-final/results.json)：18通过，0失败、跳过或重试。真实Agent HTTP、stdio、页面关闭继续已发出调用、平台中断和Agent进程重启、同op/digest上传重试且Tool调用次数不增加、browser保存Agent来源、session替换旧local凭据不复活、备份创建/覆写/恢复、OAuth授权/落盘失败分离均有实际接口证据。
- [Agent全包race](../../tests/evidence/m5-final/agent-race.log) 实际退出0；macOS Go race链接器出现LC_DYSYMTAB警告，保留原日志，未抹去或计为OS验收。Windows/Linux amd64交叉构建退出0，只算编译，不算实机运行或系统库通过。目标OS/人工确认仍待验。
- 首轮全量门禁捕获005迁移数量断言过时：[原始失败](../../tests/evidence/m5-final/verify-first-red.log)，补新表与重开连接保留proof/grant回归后 [真实PG通过](../../tests/evidence/m5-final/migration-restart-green.log)。浏览器中旧“Agent未开放”与主题模糊定位失败见 [完整失败](../../tests/evidence/m5-final/verify-e2e-red.log)；更新为真实未配对保护并强化无配对/子进程/MCP调用断言后最终18条通过，未降低检查标准。
- 构建主入口434.39kB/minified，133.71kB/gzip；共享schema-vendor70.35/18.89kB，Agent各视图按真实模块惰性加载。保持500kB门槛、CSP、同一tokens/Phosphor/primitives；没有提高阈值或关闭检查。3张M5合成非秘密截图已目视检查，M6全页面/可访问性矩阵未开展。
- 实际测试runtime停止Agent/平台/SMTP/MCP/OAuth/TLS并清临时目录；[清理检查](../../tests/evidence/m5-final/cleanup.json) 的 test_/e2e_ schema为0。保留本机隔离tmpfs PG用于复验，未部署、推送或打包安装器。

T25a、T26a/b、T27a/b、T28b、T29a、T30a/b共9叶子完成可执行验证。T25b已实现原生TTY确认与设备状态，但人工配对/解除/恢复未验；T28a已实现原生系统key与密文、故障回归，但macOS/Windows/Linux真实系统库验收未验；T29b已验证在线备份即时删除及移除事务，但实际备份介质生命周期未验。三叶子与C09/C10整组完成项保持未勾选；门禁/登记条目独立签收。A01–A60正式状态仍待验收，相关29行只补M5部分版本和证据。

T02a/b、C01继续待验：公网HTTPS LNA、目标Chrome/Edge两稳定主版本、远程网络、跨OS和人工确认未放行。受控fixture仅在测试helper注入明确确认、分离测试主密钥与临时CA，不使用生产自动批准或TLS跳过。DCR、自动OAuth refresh、主密钥轮换、物理断电、真实邮件供应商与介质生命周期未宣称支持/通过。下一阶段M6需要新的用户授权。

## M6 T31–T33 执行开始 · 2026-10-13

用户授权本阶段，基线cadb8b5，不进入M7。T02及既有人工/实机/介质验收待验。T31现有领域查询/旧链接/失败恢复与26页状态矩阵、T32共享布局/keyboard与真实axe扫描、T33真实七步模型与事件接线独立切片，工程约定见 [009](../decisions/009-m6-workflow-state-accessibility.md)。尚未签收叶子或A项；最终以完整门禁和真实生产旅程证据为准。

## M6 · 分切片实现与验证记录（最终门禁进行中）

实现提交 `5a07743`，仅 T31–T33；M7 未授权且未进入。下列是实际已完成的切片检查，叶子最终状态与完整门禁结果在后续签收中登记。

| 切片 | 实际实现与验证 | 限制 |
| --- | --- | --- |
| T31a | `m6-state-matrix.md`逐P01–P26及适用/N/A；正式状态组件13文件69focused、环境14项、App19项；真实404/403返回动作 | 原型不抵扣；状态构造与实际服务端检查分开 |
| T31b | bootstrap/会话freshness、deadline恢复、路径式邀请离开、环境同项目Back实际scope及迟到冲突；Runfailed双语标签10项RED/GREEN，真实失败Tool列表/上下文检查 | 原输入仅允许的内存范围；不宣称失败已回滚 |
| T32a | 原37领域视图及一次性初始化20组合/视图；参数草稿/滚动、服务草稿、表格横滚在语言主题切换后保留；640px局部表宽与可聚焦region | 最终版本矩阵正在统一复跑；目标浏览器及实机前置待验 |
| T32b | 真实axe，不禁用规则；导航Enter、Tab箭头、菜单Esc/Tab、分栏30–65及reset、嵌套错误定位、skip-link实际通过 | 人工仅键盘/读屏未做，不勾叶子，不把axe incomplete当通过 |
| T33a | WorkflowProgress/Uploads真实同UID/PID/CID/Run、receipt与成功详情GET事实；不捏造未知operationId；退出/撤权清除 | 会话事实只ID/状态，不授权，不持久化原始内容 |
| T33b | 真实SMTP邀请新账号修复后显式接受；调用→history→sameRun保存→刷新继续→显式重连→新未执行Tab；上传503重试与实际Tool业务失败 | 最后修补浏览器5/5通过；正式A60/跨OS/公网LNA/人工仍待验 |

最初浏览器异常与修补证据分别保留于m6-layout、m6-flow、m6-browser、m6-browser-retry、m6-flow-final、m6-continuous、m6-verify-first、m6-verify-second；各目录results.json中实际failed明确记录，不当作最终通过。中间重复PNG仅保留代表图，最终全矩阵PNG保存于m6-final。最终完整verify包含所有M1–M5回归，结果随后追加；T02/T25b/T28a/T29b等既有待验完全保留。

## M6 · 脱敏一致性回归修补

完整门禁第三次发现 M5 Agent 来源的 browser 独立保存400；明确请求状态和回执后15次复跑有2次 `invalid_source`，只有 environmentVersion/redactions 不同。`fc0b161` 保留平台严格来源证明，TS/Go采用既有保护规则保守并集，实际生产recording-v1新增11条固定向量共30条，旧19预期与M0 64 oracle均不改。Agent UI验证原身份后缓存sanitizeSnapshot，原对象与Run/上传责任不改。平台固定哈希回归验证拒绝不一致来源、接受实际安全快照、继续拒绝篡改Run状态。根因与设计边界见 [010](../decisions/010-default-redaction-parity.md)。

实际focused：生产records5文件89测试通过，root Snapshot/Agent/workflow4文件56测试通过，Go recording及真实隔离PG平台来源证明回归通过，TypeScript通过。Agent缓存回归在旧实现RED再GREEN；Go overlay旧默认规则在新增向量RED。连续生产复跑及最终全量门禁尚待最终结果，不以focused抵扣整组验收。

## M6 最终可执行验证与待验登记 · 2026-10-13

- 最终实现 `fc0b161`：M6状态/布局/真实工作流 `5a07743`，跨端脱敏一致性修补 `fc0b161`；基线cadb8b5。不进入M7。准确文件及原因见本阶段分切片表、[状态矩阵](./m6-state-matrix.md)、[审阅](./m6-review.md) 和 ADR009/010。
- [完整verify](../../tests/evidence/m6-final/verify.log) 实际退出0：平台1.4/Agent1.0生成一致性、JS/Go64语义oracle、Node20回归、前端57文件/591测试、TypeScript与生产构建、真实隔离PostgreSQL Go `./... -count=1`、vet、平台/Agent/受控helper构建；[M1–M6浏览器](../../tests/evidence/m6-final/results.json) 26条全部通过，0失败/跳过/重试。实际生产脱敏共同向量30条，不与M0 oracle64混计。无单测包只编译，不冒称测试数。
- 状态矩阵覆盖正式P01–P26路由/合并视图；真实浏览器37个领域子视图×20组合，另一次性初始化20组合，共760个核心几何检查；额外布局37项检查，824张PNG。真实axe 159次，0已确认violation，2份存在color-contrast incomplete，明确仍需人工确认。原子任务T32b的人工仅键盘/读屏不以自动扫描抵扣。截图遇填入密码/code/token不采集，axe只存rule摘要而非HTML/值/原URL。
- 正常旅程实际SMTP邀请新账号身份修复后显式接受、HTTP调用→history→同Run独立saved→刷新读取继续→显式重连→新未执行Tab；上传503只重传，Tool业务失败不完成进度；实际failed中英文上下文保持调用失败语义。独立Agent来源保存重建后15/15连续复跑通过，严格POST200/receipt/同Run及调用次数断言未降低。
- 完整门禁first/second/third失败及默认脱敏2/15拒绝、修补后首轮11通过/4超时均保留，不能当作通过。首轮超时没有invalid_source诊断文件，根因未据此冒称已证明；清理后原门槛重跑15条与最终完整26条实际通过。平台来源证明没有放宽。固定哈希/Agent安全缓存/保留并集的生产共同向量有RED/GREEN，详见ADR010与m6-root/m6-source-redaction。
- 主包453.47kB/minified、139.19kB/gzip，schema-vendor70.35/18.89kB，未提高500kB门槛或禁用axe规则。产物/锁文件hash、实际macOS/Go/Node/PG/Chromium/axe版本与支持限制见[manifest](../../tests/evidence/m6-final/manifest.json)。runtime已停止Agent/平台/SMTP/MCP/OAuth/TLS，并删除本次schema/临时目录；[清理检查](../../tests/evidence/m6-final/cleanup.json) test_/e2e_ schema为0。M5 race/交叉编译仅历史证据，没有冒称本次重做实机。

T31a/b、T32a、T33a/b共5叶子完成；T32b人工键盘/读屏保持未勾选，C11整组完成项也保持未勾选，门禁和登记条目独立签收。T02a/b、T25b、T28a、T29b及C01/C09/C10原待验不变；目标Chrome/Edge两稳定主版本、公网HTTPS LNA、远程网络、跨OS、真实邮件供应商、原生库/人工配对/介质和物理断电未宣称支持。A01–A60仍全部待验收，仅直接相关10行补M6部分版本和证据。后续M7需另行授权。

## M7 T34–T36 执行开始 · 2026-10-13

用户授权M7，基线acf7197；本次不发布、推送、合并或签收缺环境验收。T02/T32b及既有OS/人工/介质待验保持原状态。沿用当前干净codex/m0-m1工作分支与既有验证依赖；持久登记使用docs/tasks，参考设计快照不改。执行切片和完成条件见m7-execution.md；阶段最终状态必须依据实际门禁与交付物，不把交叉编译或未签名候选当实机通过。

### M7 实现与局部验证（最终门禁前）

| 叶子 | 实际实现与验证 | 未满足的完整完成条件 |
| --- | --- | --- |
| T34a | Secret/_FILE冲突与私有文件读取；同站点非root HTTPS/PG/STARTTLS Compose。部署第八轮实际exit0：新独立库、一次Owner、Secure/HttpOnly/CSRF、业务非SUPER/BYPASSRLS。证据m7-root/secrets-behavior-red.log、secrets-green-final.log、deployment-eighth.log及m7-deployment/deployment-report.json | 真实DNS/可信证书/SMTP供应商及目标网络环境 |
| T34b | 离线全事务cipher轮换，错key/损坏回滚；custom pg_dump、空app schema恢复、未来迁移拒绝；managed目录1–30d淘汰。实际PG轮换rotation-green-corrected.log、TOC/retention RED→GREEN、Docker合成恢复成功 | 真实旧版库/异地与物理介质/掉电/key custody演练 |
| T35a | 四目标生产binary、unsigned Mac pkg/Windows zip/Linux CLI及安全离线诊断；实际4目标build、6hash、3Node、7包Go及vet局部门禁。tests/evidence/m7-agent | 三OS清洁安装/权限/凭据库、Windows MSI、签名/公证与支持版本 |
| T35b | install+state锁、受管binary/state/本人校验、升级保留queue/vault、解除后旧channel/grant新Run401与Tool次数保持；Important marker故障真实RED→可恢复journal回归GREEN | 真实旧发行版迁移/回退、跨OS人工配对解除、真实掉电 |
| T36a | verify增加admin/候选/ops/容器烟测；60项逐项相关源和剩余验收条件索引已整理，下一步执行冻结候选全门禁 | 全部A项正式预期逐断言复核、实机和人工签收 |
| T36b | 平台镜像/Agent/合同/5条SQL/恢复说明/证据的白名单交付工具；逃逸/链接/覆盖/篡改摘要回归2/2；实际整包在全门禁之后生成 | 最终设计人工签收；本次不发布 |

最终审阅：gpt-6-astra只读审阅，两项Important均接受并在ONE fix pass加故障回归修复。Minor无单独递延；完整verify缺运维检查作为本阶段未完工作补入。全部13项未判断/范围裁定及判断错误代价见m7-review.md的Rulings I made，逐项保留实机/人工/媒体待验，不降低门槛。根任务T36交付工具自检，不冒称已有独立审阅。

失败与环境记录保留：默认Go module-cache EPERM不是通过；初次轮换owner_id列错误、部署tag/脚本执行权/TLS最小NET_BIND_SERVICE、测试客户端漏CSRF、CREATE app TOC恢复冲突分别定位后修补。m7-deployment-first至seventh均失败，eighth为真实成功；不删失败证据或把初次编译缺能力等同运行行为RED。

### T36 最终交付内容回归 · 初轮之后

初轮449c1f6完整verify exit0：591前端、20基础Node、11运维、26浏览器；其结果移至m7-final-first保留。归档后独立实际成员检查发现AppleDouble元数据超出白名单；普通BSD tar列表隐藏条目，初始测试虽GREEN却不足，明确保留package-metadata-initial-test-insufficient.log，不充作RED。物理TAR头检查真实RED→禁用copyfile/ACL/xattrs后GREEN，提交b4516f9。进一步实际检查同问题影响三份Agent tar，已中止尚未完成的第二轮verify（exit130，m7-final-interrupted），加物理候选归档断言RED→新目录四目标重建/5测试GREEN，提交3056a6b冻结最终源，再跑完整门禁。旧归档保留但不是交付。

Final: minor (deferred): 中止Go测试可留下内部test schema，外层e2e已清。实际仅1个本次合成schema，已核对app owner、按具体ID删除，未做前缀批量清理；证据m7-final-interrupted/recovery-cleanup.json。暂不扩展开发信号/子进程清理实现；代价为中止时需逐ID核对清理，正常最终门禁仍必须清理为0，非生产数据问题。

### M7 最终可执行验证与候选交付 · 2026-10-13

- 冻结源3056a6b（实现449c1f6、归档修补b4516f9/3056a6b）。最终扩展npm run verify实际exit0：JS/Go oracle各64、基础Node20、运维/分发12、前端57文件/591测试及类型/构建、真实隔离PG全量Go/vet、platform/agent/studio-admin与受控helper构建、4目标生产Agent/5归档、平台镜像构建、真实新容器HTTPS/STARTTLS/权限/备份恢复/未来迁移拒绝、浏览器26/26。零失败/跳过/重试，Go无单测包只编译，未把历史race或依赖审计称本次重做。
- 真实环境：macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Docker29.7.2/Compose5.4.0、Chromium147.0.7727.15、Playwright1.59.1、axe4.13.0。824 PNG/159 axe，0确认violation，2份color-contrast incomplete仍需人工；T32b不勾选。
- 源摘要21306836fe20aae846c0249fa7632bc891c4a762dce2d3bee3d2608c6781ff28（341个tracked非docs/evidence输入）；Agent输入摘要2264d17731e3f8514a6f12c0255d13efa0e0ed57e531a26d80f16aeb35094b23；候选revision/dirty如实登记，不把Git HEAD单独当生产源码证明。平台镜像linux/arm64、ID a148cb7255239efcd801c60e65bf68bcfa78d4117bb5668f7b1ec6bd67d1ebc0；未宣称其他架构运行。
- 最终本地归档见tests/evidence/m7-final/delivery.json：.runtime/m7-handoff-0abe66a449df5c4b/mcp-studio-m7-candidate.tar.gz，71591053 bytes，SHA-256 fb6c61b10f504cb71a9f6b4d0d8ad61c39117398d6e9ae04387a5b273d4000c2。实际解压检查41个文件的白名单/大小/hash、全部CHECKSUMS、物理TAR成员/权限、镜像导出ID/USER/entrypoint/无秘密Env、Agent及60项索引revision与验证源一致。无秘密/运行state/测试helper；合同规范fixtures/共同向量是明确白名单。临时解压删除。3个Agent tar各恰好4个物理普通文件；全部6hash OK，Mac pkg明确no signature，非签名通过。
- 交付登记助手的临时脚本语法错误导致一次归档仍带旧索引，实际revision一致性断言拦截；保留m7-delivery-registration-stale后修正登记重打，最终检查passed。不因此改产品源码/重跑无关测试，最终包来自同一3056a6b验证源。
- 成功结束实际清理：test_/e2e_ schema0，自有M7容器/网络/卷0，Agent/平台/邮件/MCP/OAuth/临时TLS进程和文件结束；原mcp-studio-m1-pg保留。证据m7-final/cleanup.json。首轮完整通过但归档失败、中止130、全部RED/失败资料独立保留，不能作最终交付。

T34–T36的6叶子和C12整组完成项保持未勾选：目标部署/旧版/三OS原生/签名/人工/介质及最终设计正式签收未结束；C12门禁与登记两项已勾选。A01–A60逐项追加3056a6b与相关实际证据，正式状态60/60仍待验；T02/T32b/T25b/T28a/T29b及既有未验不变。详细裁定13项及代价、一个开发夹具回收递延Minor见m7-review.md；无未修复审阅Important。保持本地codex/m0-m1分支和候选，不推送、合并、tag、签名或发布。后续只有补齐待验环境、逐项联验/签收；发布须新授权。

## 2026-10-14 · V01 / V02 已授权执行

用户范围：基于M7候选逐项核对A01–A60正式预期/真实证据，修补verify中止后的测试夹具回收；不进入其他验收批次或发布。沿用M7源3056a6b和计划登记2432956，初始实现/审计提交d8ca1ea，独立审阅修补冻结9ed9292473b4902e6b4ba7bd424f7915f6ff4a02。交接快照、旧M7证据和原交付归档不修改。

### V01a/b · 正式断言审计和逐项登记

- 正式CSV、06正文与D01–D15逐项对应，按187条款拆解：105受控断言支持、73部分、6缺直接断言、3环境待验。每个A保留原文、具体测试名/行号、历史报告、适用版本及缺口，见[审计JSON](v01-assertion-audit.json)和[60项表](v01-assertion-audit.md)。
- [完整性证据](../../tests/evidence/v01-v02-root/v01-integrity.json)：60有序唯一编号、正式预期逐字吻合，347源引用文件摘要与M7 inputs一致、行号范围和历史报告存在。347不是独立运行数；Go历史日志只包级，浏览器具名旅程级。源审阅不新造执行证明。
- 直接断言缺口：A01新项目全部内容空、A09Browser/Agent连接执行一致阻断、A28移除后署名和取消无副作用、A32活动Run切语言/主题保留、A51修复后旧诊断清除。部分证据包括A04 CORS→同连接显式Agent连续旅程、A07独立备份失败、A30过滤零尺寸pane前的必要pane非零高/底栏裁切、A38 Developer固定API直拒、A45指定字号、A47精确容量边界/直接贡献、A53/A55完整组合。A21确认框状态转换仅静态风险未复现，不报告确定产品故障，不在本次越界修补。
- acceptance-schedule.csv逐行追加计数/路径，m7-acceptance-index逐项加入assertionAudit；正式状态全为待验收，0签收。原T02/T32b/M7六叶子及既有OS/人工/介质不动。

### V02a · 租期、准确所有权和事务回收

平台testutil和migration两处真实Go schema创建改用internal/testsupport.CreateSchema；CREATE+COMMENT在同事务，父advisory lock串行租期创建/关闭，子schema含不可预测运行nonce，准确comment限定本次所有权。关闭后迟到创建拒绝，CREATE/COMMENT之间取消回滚。Node保存父OID，父/子名字、owner、OID及完整comment核对后逐对象DROP；无test_前缀批量删除，替换对象和同前缀未拥有对象保留。

专用URI及实际Go池库/user/host/fallback均需回环mcp_studio_test/mcp_studio_app，并拒绝SUPER/BYPASSRLS。SQL秘密通过环境传输，不入argv/日志；错误稳定脱敏。真实RED中止/exit7两个内部schema均残留1→GREEN4项；错库实际配置及fallback guard移除各有RED，最后具名Go2测试/four identity subcases GREEN，详见[聚焦证据](../../tests/evidence/v01-v02-root/README.md)。独立t.Cleanup无父租期的异常自动回收不冒称已覆盖。

### V02b · 取消收尾与审阅修补

runChecked不使用spawn AbortSignal提前错误，而是独立POSIX进程组；TERM后5s KILL，父先退出继续有界等同组后代消失，不能确认则失败。主退出130/7在schema清理拒绝时保留，追加固定脱敏说明；readiness有界并观察提前退出，不残留持久watcher。verify先构建真实Go中止夹具，新增回归并入原基础门禁，无跳过、降阈值或绕过。

独立审阅第一轮2 Important/1 Minor：TERM后父先退出/后代仍在、清理覆盖主退出码、marker前失败导致watcher等待；三条Important真实RED全失败→GREEN15，再补readiness后最终16项GREEN。限定源复核关闭原问题，审阅者未执行测试。默认sandbox的两份abort-process red/green命名日志实际均EMFILE，仅作环境失败；授权环境的behavior RED/GREEN才是真实行为验证。旧失效父组回归及原提前返回也保留失败日志，不隐藏失败。

### V02c/d · 冻结源完整verify与实际CLI中止

- 9ed9292 [完整门禁](../../tests/evidence/v01-v02-final/verify.log)真实exit0：32基础Node、57文件/591前端及类型/生产构建、真实隔离PG全量Go24个具测试包、vet、platform/Agent/admin/受控helper构建、四目标生产Agent/未签名候选、12运维/分发、平台镜像、隔离HTTPS/STARTTLS/权限/备份恢复/未来迁移拒绝、26浏览器。零失败/跳过/重试；无测试包只编译，race和安全依赖审计未重跑。
- 实际环境macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Docker29.7.2/Compose5.4.0、Playwright1.59.1/Chromium147.0.7727.15、axe4.13.0。824 PNG/159 axe、0确认违规、2份tools英文亮/暗color-contrast incomplete保持人工待验。没有据自动证据勾T32b。
- [manifest](../../tests/evidence/v01-v02-final/manifest.json)记录实现输入SHA 5ec310a6c3fe44ddb94e46e19b44b7d25428ae9bcad5fd8ee079069ca74731ac、锁文件/实际产物摘要和本地新候选地址。源码输入在verify期间未变；dirty是登记/证据，不把HEAD替代源证明。旧M7归档未重新打包或替换。
- 完整门禁后另[实际verify CLI](../../tests/evidence/v01-v02-interrupted/result.json)观察Go阶段一个已提交内部schema并发SIGINT；真实exit130，父与孩子都自动回收0，manualDeletion=false；未到部署阶段，这次有意中止不计完整通过。
- [最终清理](../../tests/evidence/v01-v02-final/cleanup.json)：test_/e2e_ schema0，本次准确Compose项目的容器/网络/卷0，原mcp-studio-m1-pg保留；runtime finally结束Agent/平台/SMTP/MCP/OAuth/临时TLS。只读计数不意味着做前缀批量删除。

V01/V02切片已逐项登记；A01–A60正式60/60仍待验，T02/T32b及既有实机/人工/介质不签收。Windows原生进程树、脱离组外部程序、验证器直接SIGKILL/掉电、Docker全阶段强制中止未验。当前只留本地提交和未签名候选，不推送、合并、tag、签名、公证或发布。下一软件切片可从V01明确证据缺口选A编号补证；V03/V04需要验收人员，V05/V06需要隔离Mac账号，均等待后续范围授权。

## 2026-10-14 · V01 六条直接断言补证

用户授权只补A01/A09/A28/A32/A51六条直接缺口，若实际复现行为缺陷同步修补，完整verify和逐项登记；不发布。基于3219b1e，按领域分文件并行补证，分切片验证/本地提交1df5fca（项目成员）、c78fb00（诊断）、d36331f（跨端阻断）、c3a1dc0（运行偏好）。冻结实现c3a1dc0678765e1720bc90e64f20663a898dd8d0。没有复现产品行为缺陷、没有生产源修改；七个测试文件新增567行/删1行，不制造产品RED，不改设计/合同/迁移或安全阈值。

### 六条逐项结果

- A01「成功空项目」：TestV01A01NewProjectHasNoContentAndCreatorIsMaintainer实际PG/API验证，与已有连接/环境/历史/保存的兄弟项目对照；新项目所有连接/环境/变量/记录/record operations空、唯一创建者维护者。
- A09「连接和执行被一致阻断」：真实BrowserSession/ExecutionRunner在Node中用实际MCP fixture/SDK验证循环与嵌套缺失依赖，连接零initialize/Tool，执行无Run/完成回调、Tool0；Go TestV01AgentDependencyErrorsBlockConnectAndRun用真实Engine/临时vault/SDK HTTP，连接前零HTTP，已连通但同版本个人值变非法时Run拒绝且零新HTTP/Tool/入队；有效值对照和修复后显式实际调用成功。平台授权边界供应作用域响应，不称新授权验收；系统凭据库及目标浏览器待验。
- A28「署名保留」：真实PG/API TestV01A28SharedHistoryAndPublishedSavedAttributionSurvivesRemoval，两种正常移除后共享历史与由私有保存实际发布的记录详情全等，列表原ownerId/ownerName未改、移除者读取拒绝。
- A28「取消无副作用」：两组件case和两生产浏览器旅程确认取消，零API mutation；真实成员关系/邀请/审计严格相等且重载保持、另一项目访问角色未变。组件9项及浏览器2项分别具名保存。
- A32「运行保留」：生产browser新旅程用显式MCP release barrier，在途4个语言/主题组合保持项目/连接/Tab/草稿/运行状态，一次调用且零提前上传；释放后唯一历史/一次上传，4组合完整快照（含Run UUID）/状态/结果一致。在途UUID没有UI出口，用barrier/同Tab/一次调用证明持续，不添加测试专用生产出口。
- A51「失效诊断清除」：4个真实组件旅程，补缺失依赖/修复原类型值×显式apply/直接return。精确旧诊断/alert消失、新预览有效，返回服务断开、Connect可用且零自动session-access/MCP；平台HTTP边界受控，不声称实浏览器/Agent环境签收。

具体新行号/测试名/源SHA/正式原文见[增量JSON](v01-direct-assertions.json)及[审阅](v01-direct-assertions-review.md)。原V01审计JSON不动，347条历史引用按3056a6b还原（新增成员测试使旧文件部分行号后移）；本次8处源引用绑定c3a1dc0，不冒称8份独立运行。

### 实际验证与登记

- 聚焦真实PG两个Go顶层测试、Agent一个顶层测试及两子case通过；整合前端3文件15项、前端与两个新E2E strict类型通过；生产入口新browser3/3，0失败/跳过/重试。子代理初轮A28两旅程与根整合三旅程分别保留，不相加凑场景数量。
- 独立限定源审阅批准，无Required/Important/Critical，审阅者未跑测试。测试编写错误（Node-only teardown缺localStorage、Testing Library exact选项、期望文案）修正并保留说明/失败日志，均非产品RED。证据[focused](../../tests/evidence/v01-direct-assertions-focused/README.md)。
- [完整verify](../../tests/evidence/v01-direct-assertions-final/verify.log)真实exit0：599前端/59文件、32基础Node、真实隔离PG全量Go24个具测试包、vet、production/helper构建、四目标Agent候选/未签名Mac pkg、12运维、平台镜像和隔离HTTPS/STARTTLS/权限/备份恢复/未来迁移拒绝、29浏览器（原26＋本轮3），0失败/跳过/重试。Go无测试包只编译，race与依赖审计未重跑。
- [manifest](../../tests/evidence/v01-direct-assertions-final/manifest.json)：实际macOS26.6.2 arm64、Go1.25.5、Node24.21.0、PG18.6、Docker29.7.2/Compose5.4.0、Chromium147.0.7727.15/Playwright1.59.1、axe4.13.0；352冻结输入SHA322be8003c8785462b3219417ca4a9e46a8092de9914b972b51da5300a5a3a00、锁文件和产物摘要。826 PNG/159axe/0确认违规，原tools英文亮/暗两份color-contrast incomplete仍人工待验。
- [清理](../../tests/evidence/v01-direct-assertions-final/cleanup.json)：test_/e2e_ schema0、本次准确Compose项目容器/网络/卷0，预存PG保留，runtime finally结束自己的平台/Agent/SMTP/MCP/OAuth/TLS；只读计数不作前缀批量删除。本轮没有重做历史verify CLI中止，原V02中止回归仍在基础32 Node中执行。
- CSV只追加五个目标A行，另55行完全不变。仅将6条not-found改为受控断言支持，有效111支持/73部分/0未找到/3环境；六条之外未批量重评。[登记完整性](../../tests/evidence/v01-direct-assertions-final/registration-check.json)核对原T叶子/审计/设计快照/M7归档不变，新8引用与352源输入/产物SHA吻合。

A01–A60正式仍60/60待验；T02/T32b及既有原生/人工/介质、M7完整叶子状态不动。未扩大到A21风险、剩余73部分条款或V03之后，本地候选与登记提交不推送/合并/tag/签名/公证/发布。后续从明确A编号的部分证据或具备环境的V批次授权继续。

## 2026-10-14 · A04 / A07 连续补证与重认证缺陷修补

基于aab7330，只执行用户授权的两项连续补证；A04提交ab2042e、A07提交3ad6445，冻结3ad64452210d9f916b6bf530ecf1416ecf9ae487。A04同连接真实CORS拒绝→用户显式Agent切换，不借Browser/其他连接凭据；明确本连接凭据后成功。A07同OAuth授权/保存与真实备份403失败独立，纠正密码仅重试backup，授权attempt/密文文件/历史/Tool均保持。

实际Go创建/恢复及生产浏览器RED复现备份重认证403误报项目权限撤销；最小修补精确POST路由的固定错误码，Validate与其他403/401边界不变，Go拒绝回归和两生产旅程GREEN。夹具能力RED、测试编写/导航时序错误及sandbox限制另行分类，不伪造产品故障。独立限定只读审查无阻断，未代替根验证。

完整verify exit0：600前端/60文件、33基础Node、12运维、真实隔离PG全量Go/24个具测试包、vet/build、四目标未签名候选/隔离部署、31浏览器零失败/跳过/重试。冻结356输入SHA 049b051a87e6c6ce166e4dc91b2c55e2ac0f8df60c7c6e4aba1ee68df5705332；827PNG/159axe，0确认违规，color-contrast incomplete仍人工待验。自有schema/准确Compose资源清理0，预存PG保留；本轮无新CLI中止/race/依赖审计声明。

CSV仅A04/A07追加，原审计/六条补证历史不动，四个目标partial变为受控支持，当前115支持/69部分/0未找到/3环境。正式60项仍待验收，原72叶子/T02/T32b/实机/人工/介质不变。旧M7归档保持；仅本地提交，不推送/合并/tag/签名/公证/发布。精确断言和正式原文见[增量JSON](v01-a04-a07-supplement.json)，逐项修改、真实RED和验证/限制见[审阅](v01-a04-a07-review.md)。

## 2026-10-14 · A30 / A38 布局与固定API补证

基于d9b3609，仅执行用户授权两项补证；A38切片8e8aa66，A30冻结f2fd29bdffb40e49673fe9e6669bc8669505876b。必要pane直接检查存在/非零，不先过滤；20语言主题窗口格验证底栏完整与参数/结果/侧栏操作可达。实际组件/生产browser复现遗漏设计03底栏RED，最小24px网格底栏及可读上下文修补后GREEN；零高/越界CSS为oracle探针，不冒称产品故障。A38 Developer对本人/他人真实上传共享历史pin/unpin403且API/原PG/audit无变化，非Owner Maintainer200对照；无权限源修补。

聚焦Shell两文件4项、类型/构建及1browser20格通过，完整platform Go通过含新1顶层两子case；测试编译类型/NodeNext命令错误分别保留为harness失败。独立限定审查无Critical/Important/Minor，未替代根验证。冻结源完整verifyexit0：601前端/61文件、33Node、12运维、真实PG全量Go/24个具测试包/vet/build、四目标未签名候选/隔离部署、32browser零失败/跳过/重试。360输入SHA a83115b856ce86852885f7f2063787fa2305d977b311c01d95eb013da94b39bd；835PNG/159axe，0确认违规，原color-contrast incomplete仍人工待验。准确自有schema/Compose资源清理0，预存PG保留；无新CLI中止/race/依赖审计声明。

CSV只A30/A38追加，原审计/两补证JSON/原72叶子/设计快照/M7归档不动。A30两自动缺口闭合但总体partial/environment-pending保留，仅A38固定partial补为受控支持，有效116支持/68部分/0未找到/3环境；其余不重评。全部A正式待验、T02/T32b及实机/人工/介质不变，只本地提交不推送/合并/tag/签名/公证/发布。详见[逐项审阅](v01-a30-a38-review.md)、[精确增量](v01-a30-a38-supplement.json)及[登记核对](../../tests/evidence/v01-a30-a38-final/registration-check.json)。
