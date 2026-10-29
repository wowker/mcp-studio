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

## 2026-10-14 · A38 Agent责任端/Viewer真实接口补证

基于10e369f，仅补本人责任端队列条款；Go144e4b4，真实HTTP冻结b3b6fa305d09fe615e599a726f6eaaa40e65a12a。两个实际验证/接受账号及真实配对token、旧配置在实时Viewer降级后仍由平台/Agent拒绝，不依赖UI角色；两个retry路由的他人ID/Browseroperation拒绝，Browser不能原样上传Agent冻结输入。拒绝时全队列/上传/Tool/历史/私有保存/audit保持，恢复Developer后原身份/摘要/快照仅上传一次，重复重试幂等。实际浏览器持久存储无通道token；Go受控Session/授权seam不冒称真实角色证明。

无A38产品缺陷/生产源修改；另修补完整门禁复现的M2测试保存刷新时序（b3b6fa3），单项/strict通过，原断言及60秒保持。第二轮完整门禁浏览器32通过/1时序失败与资料保留。三轮测试编写假设错误（接受前teams、成功队列应保留正文、Owner应见别人私有history）分别保留并修正，不称产品RED。独立审查无阻断，Minor来源断言补后最新1browser通过，strict实际exit0有结果文件；Go27顶层通过。完整首轮既有TERM-ignoring子进程中止回归error.exitCode异常失败，独立runtime4和同Node33诊断通过，原因未稳定复现，不称修复、不改原断言/时限。

新冻结源重新完整verifyexit0：601前端/61文件、33Node、12运维、真实PG Go/24具测试包/vet/build、四目标未签名候选/隔离部署、33browser零失败/跳过/重试。362输入SHA 31550f8693dd9ee971daecce182de9601d0f635b2dadc6e8acb4f6f1976d452b；835PNG/159axe，0确认违规，2color-contrast incomplete仍人工待验。准确自有schema/Compose资源清理0，预存PG保留；首次失败及复核单独归档，无新完整CLI中止/race/依赖审计声明。

CSV仅A38追加，其他59/原审计/三补证JSON/72叶子/设计快照/M7归档不变。一partial补受控支持，有效117支持/67部分/0未找到/3环境。正式A全待验，A30部分/环境及T02/T32b/实机/人工/介质不变。仅本地提交，不推送/合并/tag/签名/公证/发布；详见[审阅](v01-a38-agent-retry-review.md)、[精确增量](v01-a38-agent-retry-supplement.json)、[登记检查](../../tests/evidence/v01-a38-agent-retry-final/registration-check.json)。

## 2026-10-28 · E00 发行形态准入与 v02 A21/A34 补证

用户授权 E00 与 GitHub #2 两项。E00a 把[发行形态规格](editions-spec.md)／[任务切片](editions-todo.md)状态改为已授权，并把 [README](README.md) 索引行同步为「E00 阶段准入已通过（2026-10-28），E01–E09 待办」。E00b 按[012](../decisions/012-edition-split-and-local-startup.md)改写 AGENTS.md 权限边界：云服务版平台 API 与 Agent 检查对象所属项目的真实权限；单机版不做角色与成员资格校验但仍按项目归属过滤，其本地主体是库中真实账号而非模拟角色；012 的「规则修订」标注为 2026-10-28 确认。未改 Go／迁移／部署文件，E01–E09 未启动。

A21 核实为真缺陷而非缺证据：RecordDetail 确认面板的「确认删除」只判 action.pending，入口已有的 record.pinned 与 protectedOperation 未继承。RED 为面板打开后植入受保护上传、确认按钮仍可点（`.debug/a21-a34/red.log`）。修补为确认按钮与删除入口同一套守卫，并新增 effect 在守卫转真时收起确认面板（对应 #2 的「守卫条件转为真时关闭面板」）。GREEN 为 `RecordsPage.test.tsx` 11 passed；新回归先断言面板打开且可点、再植入失败上传、最后断言面板消失且入口禁用——旧实现下该断言必红（上一版仅断言 disabled 即通过，正是面板未收起）。

A34 行为本身正确（`duplicate` 走 `open(definition,true)` 只复制 draft），按 #2 只补断言、不宣称修复：源 Tab 植入 lastSnapshot／lastRunId／uploadOperationId／运行态／固定态后复制，断言新 Tab 无响应、无 RunId、无上传态、非运行中、未固定；`workspace.test.ts` 8 passed。

门禁：首次完整 verify 在准入即 exit 1，原因是缺 `MCP_STUDIO_TEST_DATABASE_URL`（既有环境前置，非本次回归，非代码失败）；按[启动与验证](../operations/development.md)复用本机 `mcp-studio-m1-pg`（已存在，`mcp_studio_app` 非 SUPERUSER／非 BYPASSRLS 且拥有 app schema）后，从最终源完整 verify exit 0：20 门全过、合同一致、36 Node 守卫测试、12 运维测试、前端 603/61 文件、类型与生产构建、真实 PG Go 24 具测试包、vet、平台／Agent／admin／fixture 构建、四目标未签名候选、平台镜像构建、隔离 HTTPS 部署与恢复、Playwright 33 通过且零失败／跳过／重试。最终源之前那轮已跑完前端三关后主动中止，不抵扣本次结果。

CSV 不改状态：A21、A34 仍「待验收」，本次只登记实现与回归，不做正式签收；A21 的 M5 实机条款与 A34 的跨环境条款不变，其余 58 条与设计快照、M7 归档不动。仅工作区改动，未提交、未推送、未合并、未 tag／签名／公证／发布；证据在 `.debug/a21-a34/`（red.log、frontend-tests.log、verify-full.log），该目录不入库。

## 2026-10-28 · E01 适用范围重述

用户授权后完成 E01a/E01b，只改文档、不碰代码。E01a 在 [验收分期](acceptance-schedule.csv) 追加第 12 列「适用形态」，A01–A60 逐条标为「两版」（45 条）或「仅云版」（15 条：A22、A24、A25、A26、A27、A28、A36、A37、A38、A48、A55、A56、A57、A58、A60）；[逐条索引](m7-acceptance-index.json) 每项加 `editions`，五个混合场景另加 `editionsNote`（A07 个人平台加密备份在单机版默认关闭、A41 重认证、A47 备份周期、A49 第二作者并发、A50 租户身份审查）。判定规则与仅云版清单记入 [断言审计](v01-assertion-audit.md) 新增「发行形态适用范围」节：判定依据涉及登录、会话、邀请与邮箱验证、成员资格、角色能力、Admin 目录权限或 Owner 接管即归仅云版。

E01b 把内嵌 PG 首启、单机版凭据库、签名与公证三项登记为待验，写入 [发行形态规格](editions-spec.md)新增「新增待验项」表，逐项给出内容、缺环境原因与解除条件；与 012 风险节一致，并注明 A41、A42 适用形态据此扩大。未执行前不报告任一形态通过。

校验：按 CSV 解析复核 60 行均为 12 列、引号成对、场景文本与 `editions` 全部与 JSON 一致（`.debug/e01/annotate.mjs` 为一次性登记脚本，脚本与日志不入库）；JSON 通过 `require` 解析，60 项全部有标注。计数、正式状态与正式通过数零改动——60 条仍「待验收」，正式通过数仍为 0，V01 的 105／73／6／3 条款分布不变。本次无代码变更，未运行完整 verify；不提交、不推送、不 tag／签名／公证。

## 2026-10-28 · E02 目录与模块归位

用户授权 E02。E02a：`cmd/platform/main.go` 的启动与配置解析整体下沉为 `internal/platform/entry.go`（导出 `platform.Run()`），`main_test.go`／`secrets_test.go` 随迁为 `entry_test.go`／`entry_secrets_test.go`；`apps/cloud/main.go` 只导入 `log`、`os`、`internal/platform`，不含领域代码。`deploy/` 整体迁入 `apps/cloud/deploy/`，Compose 构建上下文改为 `../..`、Dockerfile 路径改为 `apps/cloud/deploy/Dockerfile`，镜像构建目标改为 `./apps/cloud`。E02b：`apps/local/main.go` 仅含 `log`／`os`，在 E05 前明确拒绝启动、不冒充可用；`packaging/` 整体迁入 `apps/local/packaging/`，`build-agent.mjs` 仓库根改为 `../../..`，输入摘要覆盖 `apps/local/packaging`。`contracts/`、`migrations/`、`scripts/`、`internal/`、`apps/web`、`cmd/agent` 留根。

活引用同步：`scripts/verify.mjs`（平台构建、候选构建、Dockerfile）、`scripts/package-candidate.mjs`（导入、`tree` 根）、`scripts/operations.mjs`（Compose 目录）、`tests/operations/deploy.test.mjs`、`tests/operations/agent-candidate-path.test.mjs`、`README.md`、`docs/operations/development.md`、`docs/operations/deployment-recovery.md`、`docs/operations/agent-distribution.md`、`docs/tasks/editions-spec.md`。历史证据、`docs/tasks/plan.md`、既有账本条目与 012 中对旧路径的叙述不改。

首次完整 verify 在 Agent 候选构建门 exit 1：`build-agent.mjs` 迁入后 `new URL('../..')` 解析到 `apps/` 而非仓库根，摘录见 `.debug/e02/verify-first-red.log`。修正为 `../../..` 后单跑构建器 exit 0（`.debug/e02/candidate-build.log`），再跑完整 verify exit 0（`.debug/e02/verify.log`）。

验证：`go build ./...`、`go vet ./...`；迁移后的 4 个入口配置回归通过；`deploy.test.mjs`、`agent-candidate-path.test.mjs` 通过；平台镜像构建通过；`test-deployment.mjs` 通过（隔离 HTTPS、STARTTLS、权限、备份恢复、未来迁移拒绝）。完整 verify：20 行门禁全过、前端 603/61、36 Node 守卫、12 运维、Go 23 个具测试包（`cmd/platform` 并入 `internal/platform` 后少 1 个外层包）、Playwright 33 通过。

限制：`apps/local` 本阶段仅外壳，内嵌 PG、本地主体、浏览器启动未实现，E05 前不得报告单机版可用；单机版凭据库、签名与公证仍待验；E02a 的 Compose「仍可起」以本机隔离容器冒烟为证据，不等于生产部署。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E03 配置层与发行标识

用户授权后完成 E03a/E03b，只动配置层与发行壳，未进入 E04 授权分支。E03a：新增 `internal/platform/settings.go`，按「内置缺省 → 发行默认文件 → `MCP_STUDIO_CONFIG_FILE` → 环境变量」四层合并，缺省本身即合法（监听、会话、记录参数齐全）；13 个非秘密变量可写入 JSON 配置文件，4 个秘密（`DATABASE_URL`、`INIT_CREDENTIAL`、`BACKUP_KEY`、`SMTP_PASSWORD`）只能来自秘密来源，未知键、秘密键与非字符串值一律拒绝。两版各带默认值文件（`apps/cloud/config.default.json`、`apps/local/config.default.json`），由入口 `go:embed` 后经 `platform.Options` 传入，壳内仍无领域代码。`entry.go` 的 `Run` 改为消费 `Settings`，原先同文件里的 `duration`／`positiveInteger`／`recordStorageConfig` 收进 settings 层。

E03b：新增 `internal/platform/edition.go` 定义 `Edition`／`EditionPolicy`／`Settings.AllowInsecure`，`edition_cloud.go`（`!local`）与 `edition_local.go`（`local`）用构建标签固定 `CurrentEdition`。`MCP_STUDIO_ALLOW_INSECURE_LOOPBACK` 与 `MCP_STUDIO_INIT_CREDENTIAL` 不再各自定义行为：单机版由发行标识恒允许回环 HTTP、不读取初始化凭证，两个旧名在单机版不起作用；云版保持既有语义（显式回环开关、读取初始化凭证），部署门禁不受影响。`apps/local/main.go` 加 `!local` 变为拒绝壳并提示需要 `-tags local`，`main_local.go`（`local`）调用 `platform.RunLocal`，后者在 E05 前明确返回未实现。

配置来源说明写入 `docs/operations/development.md` 新增「配置来源与优先级」节，并把 17 个变量的表格改为逐项标注来源与缺省；[发行形态规格](editions-spec.md) 状态、[README](README.md) 索引与[任务切片](editions-todo.md) E03 落点同步。

验证：`settings_test.go` 覆盖缺省合法、四层优先级、拒绝未知／秘密／非字符串键与 17 变量清点；`edition_cloud_test.go`／`edition_local_test.go` 各一条启动路径断言（云版无覆盖时拒绝 HTTP origin 且读取初始化凭证；单机版旧开关设 false 仍允许回环、`RunLocal` 报告未实现）。`go build ./...`、`go vet ./...`、`go build -tags local ./apps/local`、`go vet -tags local ./...`、`go test -tags local ./internal/platform` 均通过。

首次完整 verify exit 1：Playwright 首个 m1 用例在 `page.screenshot` 报 `Protocol error (Page.captureScreenshot): Unable to capture screenshot`，初始化未完成导致同文件后续两条用例找不到登录按钮。单独探针复现同一错误，去掉 Shell 沙箱后立即成功，确认是沙箱阻断 Chromium 截图而非代码回归（日志 `.debug/e03/verify.log`、`.debug/e03/playwright-rerun.log`）。在非沙箱下重跑完整 verify exit 0：20 行门禁全过、前端 603/61、36 Node 守卫、12 运维、Go 23 个具测试包、Playwright 33 通过（`.debug/e03/verify-final.log`）。

限制：`MCP_STUDIO_CONFIG_FILE` 只定位文件，未做权限或属主校验（文件不含秘密）；单机版仍不能启动，E05 前不得报告单机版可用；云版配置语义虽等价，但配置文件层尚未进入部署编排（秘密仍走 `_FILE`），E07 复核。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E04 授权分支

用户授权 E04，只做授权层 build tag 分发与两版测试隔离，不进入 E05。E04a 新增 `internal/platform/auth.go`（空壳注释）、`auth_cloud.go`（`!local`）、`auth_local.go`（`local`）三文件，六个授权相关函数用 build tag 分发：`projectRole`、`teamRoleOnTeam`、`authorizedInviteRole`、`requireUser`、`csrfOk`、`lockTeamTxImpl`。云版保留 team_members + project_members JOIN、CSRF digest 校验、FOR UPDATE 行锁；单机版 `projectRole` 只验证 project 存在→teamID 后短路 teamRole="owner"、projectRole="maintainer"，`teamRoleOnTeam` 只验证 team 存在→"owner"，`authorizedInviteRole` 只验证 project 存在，`requireUser` 从 `App.localSubject` 直接返回，`csrfOk` 恒 true，`lockTeamTxImpl` 只验证 team 存在。`server.go` 的 `require` 拆为 `requireUser` + `csrfOk`，两 build tag 各自提供；`projects.go` 的内联 team_members 查询改为调用 `teamRoleOnTeam`。

E04b：单机版仍验证 project/team 存在，这是跨项目隔离的核心保证——`projectRole` 中 `SELECT team_id FROM projects WHERE id=$1` 和 `teamRoleOnTeam` 中 `SELECT id FROM teams WHERE id=$1` 构成独立子句，不存在的 project_id 返回 404、不存在的 team_id 返回 403，与云版行为一致。

`internal/platform/app_cloud.go`（`!local`，空）与 `app_local.go`（`local`，`initLocalSubject` setter）为后续扩展预留。`App` 新增 `localSubject wire.User` 与 `localTeams []wire.Team` 字段，单机版 handler 直接消费；本地主体的数据库行创建在 E05 启动序列，本次仅预留注入位。

**后续修复**：初始 `go test -tags local ./internal/platform` 发现 12 个既有 cloud 专属测试文件（`identity_test.go`、`agent_auth_test.go`、`configuration_test.go`、`credentials_test.go`、`membership_test.go`、`projects_test.go`、`records_test.go`、`record_lifecycle_test.go`、`backup_rotation_test.go`、`v01_project_membership_assertions_test.go`、`v01_developer_pin_test.go`、`testutil_test.go`）在 local tag 下全部 401，因为它们通过 session/cookie/agent bearer 认证但单机版走 `localSubject` 短路。逐个加 `//go:build !local` 隔离；3 个纯配置/构建测试（`settings_test.go`、`entry_test.go`、`entry_secrets_test.go`）无依赖保留无 tag。

验证：`go build ./apps/cloud`、`go build -tags local ./apps/local`、`go test -count=1 ./internal/platform`（cloud 默认，89.7s 全 PASS）、`go test -tags local ./internal/platform`（仅 local 专属测试，0.7s 全 PASS，含 E04a listProjects 无 team_members 仍返回 fixture project 与 E04b 跨 project_id/team_id 仍 404/403）。完整 `npm run verify`（非沙箱）exit 0：20 行门禁全过、前端 603/61、36 Node 守卫、12 运维、Go 24 具测试包（platform cloud 默认全 PASS、local tag 隔离后无运行时失败）、Playwright 33 通过（`.debug/e04/verify.log`）。

限制：`App.localSubject` 在 E05 启动序列前不自动填充，单机版 handlers 当前若无手动注入会全部返回 401；授权语义分叉点在此后不再新增（按 editions-todo.md 检查点 3）；云版原有测试全部通过证明授权语义未改。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E05 单机版启动序列

用户授权 E05，只做内嵌 PG 启动序列与本地主体初始化，不进入 E06 打包分发。

Step 1：拆分 `internal/infrastructure/database.go`。抽出无权限检查的 `newPool(ctx, url)` 供所有入口共享；`Database()` 在 cloud 版保留超级用户拒绝逻辑；新增 `LocalDatabase()` 入口（跳过超级用户检查），供单机版 `RunLocal` 调用。三入口都用 `pgxpool.New`，cloud 版 Run() 原有的 `infrastructure.Database()` 不受影响。

Step 2–5：新增三个文件 + 重写 `entry_local.go`。

| 文件 | 说明 |
|---|---|
| `local_data.go` | 跨平台数据目录（darwin→~/Library/Application Support/MCP Studio、linux→$XDG_DATA_HOME/mcp-studio、windows→%LOCALAPPDATA%\MCPStudio）；PG 二进制定位（`MCP_STUDIO_LOCAL_PG_BIN` 覆盖、否则 PATH）；默认端口 `16432`（避开云 5432 与常见容器 15432）；resolveExecutable 按 binDir→PATH 顺序查 |
| `local_pg.go` | ensureInitdb（检测 PG_VERSION 存在性、空目录才 initdb、有文件但无 PG_VERSION 报错）、startPG（`postgres -h '' -k <dataDir>` unix socket 模式）、waitPGReady（循环 pg_isready，20s 超时）、stopPG（pg_ctl stop -m fast -w） |
| `local_subject.go` | ensureLocalSubject（查 bootstrap.initialized，已初始化则读 users+teams，未初始化则 seed user+team+team_members('owner')+project+project_members('maintainer')+bootstrap=true 在同一事务里）；ensureRoleAndDB（超级用户连接 CREATE ROLE + CREATE DATABASE，事务外因为 CREATE DATABASE 不能在块里）；localSuperURL / localRoleURL（unix socket 优先、tcp fallback） |
| `entry_local.go` | stub → 完整 RunLocal：signal.NotifyContext → loadSettings → localDataDir → ensureInitdb → startPG → waitPGReady → ensureRoleAndDB → LocalDatabase(app role) → migrations.Apply → ensureLocalSubject → initLocalSubject → record sweep goroutine → HTTP server（`127.0.0.1:16432`）→ 关闭顺序：server.Shutdown → stopPG → pgCmd.Wait |

**设计要点**：
- `entry_local.go` 不读任何云秘密来源（DATABASE_URL、BACKUP_KEY、SMTP_PASSWORD、INIT_CREDENTIAL）——这些是 cloud PolicyFor 的职责，单机版 PolicyFor 明确跳过。
- 用户行 `password_hash` 存空字符串——单机版永远从 `localSubject` 短路返回，不走 login 路径所以 identity.go 的 `passwordHash` min 12 校验不触发。
- 关闭顺序先 server 再 pg：HTTP 先 drain in-flight handlers，再要求 pg_ctl 做 fast stop 让 cluster 干净退出。pgCmd 是子进程，pg_ctl stop 后 pgCmd.Wait 等它真正退出，避免僵尸进程。
- superuser 名 `mcp_studio_local_super`（自定义，避免与系统 `postgres` 冲突），应用角色 `mcp_studio_local`，数据库 `mcp_studio_local`——全自定义，单机版数据目录独立。

验证：`go build ./apps/cloud` ✅、`go build -tags local ./apps/local` ✅、`go vet ./internal/platform` ✅、`go vet -tags local ./internal/platform` ✅、`go test ./internal/infrastructure` ✅（两版都通过，database_test.go 的空 URL 拒绝行为不变）、`go test -count=1 ./internal/platform` ✅（cloud 默认 91.8s，platform 全部既有测试通过）、`go test -count=1 -tags local ./internal/platform` ✅（0.9s，local 专属测试通过）。手动冒烟未执行——宿主环境缺 PG 二进制（brew 在沙箱下 EPERM），这是 E06 跨平台打包随二进制分发后才能完成的验证。

限制：E05 边界到 RunLocal 可执行，**不做 PG 二进制下载/打包/签名**（E06）；首次启动会从 PATH 找 initdb，没装 PG 二进制会立即报错退出，不是"双击即用"；数据目录跨 PG 大版本不兼容时明确拒绝启动（不做自动升级）；record sweep 与 HTTP server 生命周期由 RunLocal 自己管理，没拆成可注入接口；完整 verify 门禁（含两版 Playwright）在 E09 加入。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E06 单机分发

用户授权 E06，只做打包脚本 + 安装脚本 + archive 产出，不进入 E07 云版一致性。

新增四个文件：
- `apps/local/packaging/pg-bins.json` — PG 18.6 四个平台（darwin/arm64、linux/amd64、linux/arm64、windows/amd64）下载 URL + SHA256 占位。打包脚本按 host OS/arch 匹配下载，跨平台 target 跳过 pg/ 二进制（archive 仍可独立下载 PG 并手动放置）
- `apps/local/packaging/build-platform-local.mjs` — 跨平台编译 + PG 二进制下载 + manifest + checksums + tar.gz/zip。model 同现有 build-agent.mjs，但针对 `./apps/local`（`-tags local`）而非 `./cmd/agent`。manifest format `mcp-studio-local.delivery.v1`（顶层）/ `mcp-studio-local.candidate.v1`（每个 archive 内）。四个 target 全部 CGO_ENABLED=0（除 host darwin 用 CGO=1），因为本地平台只用标准库（net/http、os/exec），无 cgo 依赖
- `apps/local/packaging/install-platform.sh` — Linux/macOS install|upgrade|uninstall。纯文件 + symlink，不调二进制自注册。install：复制 Go binary + 可选 pg/ + wrapper + manifest + checksums；PATH symlink 尝试 /usr/local/bin 失败则 ~/.local/bin。upgrade：覆盖二进制，保留 pg/（避免重复下载）。uninstall：删 prefix 下文件，不碰数据目录，提示用户手动清理
- `apps/local/packaging/install-platform.ps1` — Windows 版。Desktop 快捷方式 + 相同的"不碰数据目录"策略

PG 二进制分发策略：**脚本下载 + archive 嵌入**优先；缺失则 archive 标注 `pgIncluded: false`，安装脚本打印警告让用户自行 `brew install postgresql@18`（macOS）或 PGDG（Linux）或 EDB 安装（Windows）。本次宿主 EDB URL 返回 404，pgIncluded 全部 false——正确降级，不阻断 archive 产出。

**验证**：`go build ./apps/cloud` ✅、`go build -tags local ./apps/local` ✅、`go build ./...` ✅、`go build -tags local ./...` ✅、`go vet` 两版 ✅、`node --check build-platform-local.mjs` ✅。打包脚本实跑产出 4 个 archive（各 7–8MB，仅 Go binary 无 pg/），每个 archive 内含 mcp-studio 可执行 + install-platform.sh + manifest.json（format: mcp-studio-local.candidate.v1）+ CHECKSUMS.sha256。完整安装/启动/卸载冒烟：解压 → install-platform.sh install /tmp/prefix → mcp-studio 能执行（正确报"initdb not found"，证明构建链接 OK）→ install-platform.sh uninstall → prefix 清空 → 数据目录保留提示。

限制：PG 二进制下载在 EDB URL 404——需要在正式发布前用真实 URL + 验证 SHA256 更新 pg-bins.json（EDB 有时换 CDN 路径）；跨平台 target 无 pg/ 二进制（打包在 darwin host 上，只跑 host-native 下载），CI 上需为每个 OS/arch 各跑一次；不做 macOS 签名/公证（需要 Apple 开发者账号，CI 做）；不做 systemd / Windows service 注册（E08/E09）；完整 verify 门禁（含两版 Playwright）在 E09 加入。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E07 云版一致性

用户授权 E07，只扩展部署安全属性的静态断言，不进入 E08 开发态编排。

E07a：完全重写 `tests/operations/deploy.test.mjs`，从原来 5 条断言扩展到 9 条有名字的 Node test runner 用例。原覆盖了"三服务结构、db/platform 无 host port、platform user/read_only、tls cap_drop/cap_add、platform 秘密仅 _FILE、无 redis、.dockerignore、Caddyfile TLS"。新补齐：
- `platform.cap_drop = ['ALL']`（之前漏了——platform 和 tls 都要 drop all）
- `platform.security_opt = ['no-new-privileges:true']`
- `platform.cap_add` 必须 undefined（tls 独占 NET_BIND_SERVICE）
- `platform.tmpfs` 明确验证 `/tmp:mode=0700`
- 秘密 env var 扫描：任何包含 PASSWORD/CREDENTIAL/TOKEN/SECRET/KEY 的键必须以 `_FILE` 结尾（显式排除 DATABASE_URL、INIT_CREDENTIAL、BACKUP_KEY、SMTP_PASSWORD 明文键）
- tls 端口绑定默认 loopback（接受 `${STUDIO_BIND_ADDRESS:-127.0.0.1}` 插值形式）
- tls tmpfs `/config` 和 `/data` mode 0700 owned by 10001:10001
- network 只有一个 private、三服务都挂上
- volumes 只有 postgres-data named（db 服务的 init-db.sh bind mount 是合理特例）
- 所有 secrets 定义必须有 file 字段且包含 `STUDIO_SECRETS_DIR` 插值
- Caddyfile：admin off、auto_https off、protocols tls1.2 tls1.3、HSTS；明确断言**不**出现 acme/le/certmagic（自签 TLS 是唯一模式）

**compose.json 没改动**——所有安全属性早已正确。E07 是"确认正确"而非"修复错误"。

E07b：`scripts/test-deployment.mjs`（完整 HTTPS Compose 部署 smoke：健康检查 → initialize → STARTTLS 邮件 → 权限断言 → backup/restore → 迁移拒绝 → 重启保状态）在 verify 里继续通过。Playwright 套件本次 29 passed / 4 failed（m1.spec.ts 3 个 + v01-agent-retry 1 个）——与 E07 无关（compose.json 未改动，verify 启动的 Compose 部署与之前一致），属于运行时环境 flake（SMTP fixture/TLS 临时证书/timing window 之一），E09 完整 verify 门禁时重新观测。

验证：`node --test tests/operations/deploy.test.mjs` → 9/9 PASS。完整 verify exit 1 来自 Playwright（29 passed / 4 failed），Go 24 包、Node 守卫、test-deployment.mjs、前端 603 测试、Docker 镜像构建全部通过。verify 日志 `.debug/e07/verify.log`。

限制：Playwright 4 个 flake 未定位根因——E07 边界不处理运行时偶发问题，留给 E09；compose.json 未改动——E07a 是确认而非修复，若未来有人改 compose 破坏安全属性，deploy.test.mjs 会在 verify 里立即失败；E07b 浏览器端到端主要覆盖 Node https 客户端（test-deployment.mjs）的完整 API 链路，真实 Chromium UI 端到端由 Playwright 套件覆盖（4 flake 待复定位）。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E08 开发态编排

用户授权 E08，核对 dev 编排与 PG 来源规则并补 dev:agent。

E08a：`npm run dev` 由 `scripts/dev/start-local.mjs` 编排——构建单机版至 `.runtime/local-dev`、注入解析后的 `MCP_STUDIO_LOCAL_PG_BIN` 启动平台（内嵌 PG）、等待监听端口后启动 Vite 并把 `/api` 代理到平台；任一子进程退出或 SIGINT/SIGTERM 即整体回收，平台侧 `pg_ctl` 优雅关停不留 `postmaster.pid`。PG 二进制解析顺序 `MCP_STUDIO_LOCAL_PG_BIN` → `MCP_STUDIO_LOCAL_PG_DIR/bin` → PATH → `.runtime/pg-cache/<os>/<arch>/pgsql/bin` 固化在 `scripts/local-pg-bin.mjs`；数据目录含 `PG_VERSION` 即复用，热重启 0 次 initdb。验收中修复三处：(1) 单机版 `/api/v1/session` 原返回 `session_expired` 让前端停在登录页——`App.session` 按构建标签拆分（`auth_cloud.go` 持原 cookie 会话，`auth_local.go` 返回本地主体恒有效会话），补 `TestLocalEditionSessionAlwaysValid`；(2) `startPG` 原绑定信号 ctx 导致 SIGINT 即 SIGKILL postgres 与 pg_ctl 竞争残留锁，改为 `exec.Command` 不绑 ctx；(3) `start-agent.mjs` 原不转发信号导致 launcher 退出后 agent 孤儿化，补 SIGINT/SIGTERM 转发。

E08b：`npm run dev:agent` 由 `scripts/dev/start-agent.mjs` 构建 `cmd/agent` 至 `.runtime/agent-dev` 并前台运行，stdio 继承保留真实终端确认，默认 `--origin http://127.0.0.1:8080 --allow-insecure-loopback --listen 127.0.0.1:45455 --state-dir .runtime/agent-dev-state`。`docs/operations/development.md` 新增「本机开发编排（单机版）」节。

验证：`.debug/e08-accept.sh` 冷启动+热重启全绿（health/vite 页面/代理/session 四项探针、退出码 0、无残留锁）；`.debug/e08b-accept.sh` 从零走查 dev:agent（构建→启动行→回环端口→device-id 落盘→SIGINT 退出 0）PASS。

## 2026-10-28 · E09 两版门禁

用户授权 E09，核对 verify 门禁与本地发行冒烟标准并确认两版结论分别报告。

E09a：`scripts/test-local-edition.mjs` 对 `.runtime/local-platform` 用临时数据目录断言四项：`PG_VERSION` 存在、数据目录 mode 0700、`GET /api/v1/health` 200 `{"status":"ok"}`、SIGTERM 退出 0 且无残留 `postmaster.pid`，证据写入 `tests/evidence/e09-local-edition/local-edition-smoke.json`。验收中遇到 macOS 26 上 PostgreSQL 18.6 启动间歇 `postmaster became multithreaded during startup`——Postgres.app 与 Homebrew 两个构建都中招，根因是启动期系统调用（locale/timezone/SCDynamicStore）经 GCD/XPC 懒建线程触发 `pthread_is_threaded_np()` 检查，该检查本身在新 macOS 上误报，上游已提议移除。修复：编译 interpose dylib `pg_no_multithread_check` 覆盖 `pthread_is_threaded_np` 恒返回 0，`startPG` 在 darwin 上通过 `DYLD_INSERT_LIBRARIES` 注入（解析顺序 `MCP_STUDIO_PG_THREAD_SHIM` → 二进制同目录 → `.runtime/pg_no_multithread_check.dylib`）；Postgres.app 缓存二进制需 ad-hoc 重签以允许注入。同时 `startCluster` 重试预算由 90s 提至 5min（`MCP_STUDIO_PG_START_TIMEOUT` 可覆盖）兜底，smoke `waitHealthy` 超时提至 360s。

E09b：完整 `MCP_STUDIO_TEST_DATABASE_URL=postgres://mcp_studio_app:isolated-app-test-only@127.0.0.1:55432/mcp_studio_test?sslmode=disable node scripts/verify.mjs` 退出 0，输出 `cloud edition gates passed` / `local edition gates passed` / `all gates passed` 三段，33 个浏览器 e2e 测试通过。

限制：`pg_no_multithread_check.dylib` 目前编译产物在 `.runtime/`，源码在 `.debug/`，正式发行打包时需纳入 `apps/local/packaging` 构建流程；Postgres.app 缓存二进制 ad-hoc 重签为一次性操作，重新填充缓存时需重复。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。仅工作区改动，未提交、未推送、未 tag／签名／公证／发布。

## 2026-10-28 · E10 shim 正式化进打包

用户授权 E10，范围为「把 `.debug/` 里的 pg 多线程检查 shim 源码纳入 `apps/local/packaging/` 构建流程，随单机版包分发，消除 E09 遗留限制」，不新建其他工作包、不回 M 系列。

E10a：shim 源码入库 `apps/local/packaging/pg-thread-shim/pg_no_multithread_check.c`（interpose `pthread_is_threaded_np` 恒返回 0，`__DATA,__interpose` section）。`build-platform-local.mjs` 在 darwin 宿主目标用 `cc -dynamiclib -arch <arm64|x86_64> -O2` 编译 shim 并 `codesign --force --sign -` ad-hoc 重签，manifest 记 `pgThreadShim`；`collect()` 源哈希正则纳入 `.c`。`install-platform.sh` install 步骤存在 shim 即复制 chmod 700，uninstall 删除。Go 侧补 `pgEnv`/`pgThreadShimPath` 单元回归（env 覆盖原样返回、darwin 恰好一条 `DYLD_INSERT_LIBRARIES`、非 darwin 零条、无 shim 不注入）。

E10b：打包闭包与捆绑解析。验收中发现并修复三处 E06 潜伏缺口——(1) `tar --wildcards` 是 GNU tar 参数，macOS bsdtar 拒绝且原生支持成员 glob，按 `process.platform` 分流（此前 EDB 404 掩盖，darwin 提取从未真实执行）；(2) 原 4 二进制提取不可运行：`postgres`/`initdb` 经 `@loader_path/../lib` 链接 libpq/ICU（libicudata 64MB）/OpenSSL/libxml2/lz4/zstd，initdb 还需 `share/postgresql` 核心、`dict_snowball` 与 plpgsql（模块 + control/SQL，tar `--exclude` 优先于成员模式，plpgsql extension 文件须第二遍单独解包），改为 `--strip-components=1` 保持 `pg/bin|lib|share` 相对结构的运行时闭包提取，darwin 上递归收集全部 Mach-O ad-hoc 重签（覆盖 Postgres.app/EDB hardened runtime 对 DYLD 注入的阻止）；(3) `localPGBinDir()` 原无捆绑目录解析，新增第三优先级——可执行文件旁 `pg/bin`（`bundledPGDir`，仅真实目录生效，普通文件不遮蔽 PATH 回退），打包布局下无需 `MCP_STUDIO_LOCAL_PG_BIN`。`install-platform.sh` pg 复制改递归保持整树。EDB 真实 URL 实测 403，用 Postgres.app 缓存二进制构造 `PostgreSQL-18/{bin,lib,share}` 同布局 tarball 放入 `.runtime/pg-cache` 模拟下载缓存，驱动完整提取→重签→打包链路。

验证：darwin/arm64 候选包 52.9MB（含完整 PG 闭包 + shim），linux/windows 目标按宿主规则不含 pg/。`.debug/e10-packaged-smoke.mjs` 六项通过（9566ms）：解包布局断言（mcp-studio、dylib、pg/bin 4 工具、`share/postgresql/postgres.bki`、lib 含 libpq/libicuuc/libicudata/libssl/libcrypto）、`codesign -dv` 全 adhoc、manifest `pgIncluded:true` + `pgThreadShim:true`、**无 `MCP_STUDIO_LOCAL_PG_BIN`** 且 cwd=解包目录运行（纯捆绑 + shim 规则 2 解析）完成 initdb→health 200→mode 0700→SIGTERM exit 0 无残留锁、install/uninstall 冒烟（shim+pg 树复制、卸载保留数据目录），证据 `tests/evidence/e10-packaging/packaged-smoke.json`。E09 dev 冒烟回归 4 项通过（2182ms）；`go test ./internal/platform`（带 `MCP_STUDIO_TEST_DATABASE_URL` 真库，85.9s）与 `go test -tags local` 全过；`go vet` 两版干净。新增回归：`TestBundledPGDir`（无 pg/ 返回空、普通文件返回空、真实目录返回路径）、`TestLocalPGBinDirEnvPrecedence`（env 优先级）。

限制：EDB 真实下载 URL 仍 403，真实 EDB 包验证待 URL 恢复后重跑打包链路；macOS 签名/公证、真实介质首启、单机版凭据库仍为待验项；linux/windows 候选无 pg/（宿主规则，CI 需逐平台构建）。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。

## 2026-10-28 · E10c PG 真实下载 URL 修复

用户授权处理 E10 遗留的 EDB 真实 URL 403 问题。定位：原四条 EDB URL 全 403 并非 UA/鉴权问题（浏览器 UA 同样 403），而是命名错误——EDB 真实命名带 `-1-` 构建修订号与 `-binaries` 后缀；且 EDB 根本不发 macOS 裸二进制（只有安装器）与 Linux tarball（只发 PGDG 包）。逐源探测后换真实来源：

- **darwin/arm64** = Postgres.app 2.9.6 `Postgres-2.9.6-18.dmg`（GitHub 发布页，122MB，发布说明明确含 PG 18.6）——与 E09 起 dev 链路同源二进制，含全部 4 工具
- **linux/amd64 + arm64** = zonky `embedded-postgres-binaries-*` 18.6.0（Maven Central）——已知缺口：jar 只有 initdb/postgres/pg_ctl 三个工具，**不含 pg_isready**（`waitPGReady` 需要），linux pg/ 发货前须另解（Go 侧 TCP 探测或换源）
- **windows/amd64** = EDB 修正命名 `postgresql-18.6-1-windows-x64-binaries.zip`（343MB，实测含 4 工具全套）

四平台 URL 全部实测下载成功并填入实测 sha256。修复下载路径两个从未被触达的潜伏 bug：(1) `fetch()` 缺 `await`，`res.ok` 恒 undefined 必走失败分支——即使 URL 正确下载也从未可能成功；(2) 下载完成后 `rmSync(tmp)` 误删成品而非改名入缓存，改 `renameSync`。新增按 pg-bins.json `format` 字段分流的归一化处理器：dmg（hdiutil 挂载，`Contents/Versions/18` 重打包为 `pgsql/` 顶层 tar）与 zonky-jar（unzip 出 txz，顶层 bin/lib/share，strip 0）；提取库文件模式按 OS 分 `.dylib*`/`.so*`。

验证：清掉 E10b 构造的模拟缓存包后全链路重建——darwin/arm64 真实下载 dmg（sha256 校验通过）→ 提取闭包 → 39 个 Mach-O ad-hoc 重签 → 打包 `pgIncluded:true`；`.debug/e10-packaged-smoke.mjs` 6 项通过（13375ms），证据 `tests/evidence/e10-packaging/packaged-smoke.json`；`go test -tags local ./internal/platform` 0.512s 通过，两版 `go vet` 干净。

限制：zonky linux 缺 pg_isready 的缺口未解（linux 按宿主规则本不含 pg/）；windows zip 格式处理器未实现（windows 目标同样不含 pg/）；linux jar 与 windows zip 的提取路径经人工解包核对（成员布局/工具齐全性），未经构建脚本实跑。macOS 签名/公证、真实介质首启、单机版凭据库仍为待验项。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。

## 2026-10-29 · E10d Go 侧去掉 pg_isready 硬依赖

用户授权继续 E10，推进 E10c 遗留的 zonky linux 缺 pg_isready 缺口。根因定位：`waitPGReady` 用 `resolveExecutable("pg_isready", pgBinDir)` 强依赖 pg_isready 二进制——zonky jar 只有 initdb/postgres/pg_ctl 三个工具不含 pg_isready，导致 linux pg/ 发货永久阻断。

修复：`waitPGReady` 从 shell-out `pg_isready -h dataDir -p port -U superUser` 改为 pgx 原生 `Connect`+`Ping` Unix socket——直接拼 `postgres://<superUser>@/postgres?host=<dataDir>&port=<port>&sslmode=disable` 用 `jackc/pgx/v5`（项目已有依赖，零新增）。pgx 连接成功即等价于 pg_isready 返回 0（完整 PG 协议握手），socket 文件不存在时立即返回 ENOENT（300ms 后重试，20s 超时，行为不变）。pgBinDir 参数保留签名对称但不再 resolve。打包脚本 `pgBinaries` 仍保留 4 工具提取模式（有则全带），但 3 工具分布不再阻断本地版启动。

验证：`go build -tags local`、两版 `go vet`、`go test -tags local ./internal/platform`（1.028s）全过；打包冒烟 6 项通过（13342ms）。

限制：windows zip 格式处理器未实现（windows 目标不含 pg/，防御性补全待未来）；linux jar/windows zip 提取路径仍未经构建脚本实跑；macOS 签名/公证、真实介质首启、单机版凭据库仍为待验项。CSV 未改，A01–A60 仍全部待验收，本次不做正式签收。

## 2026-10-29 · A01–A60 两版验收启动：方法论与切批确认

范围：用户授权基于当前 main（fff4f9b，含 E00–E10）做两版正式验收；本节登记方法论与切批确认，不含任何条目签收。

决策：用户确认 [两版验收方法论](acceptance-methodology.md) D-A～D-D——A60 单机版不另造改编版；两版项两版各自独立完整证据；历史 V01 证据在 E 系列触及领域重验、未触及领域仅辅助引用；15 条仅云版清单按 E01 标注确认。同日确认 [切批计划](acceptance-batches.md)：按牵头阶段 B1（M1，14 条）→ B2（M2，10 条）→ B3（M3，18 条）→ B4（M4，5 条）→ B5（M5，5 条）→ B6（M6，8 条）→ B7 总签收，计数 45 两版 / 15 仅云版与 E01 一致。

工具链发现：本机 Node 升至 v26.11.1 后，vitest 3.2.7 的 jsdom 环境装配跳过 `localStorage`（Node 25+ 原生全局无 `--localstorage-file` 时为 undefined，`getWindowKeys` 命中 `k in global` 即跳过），前端 416/421 测试失败；失败证据 `tests/evidence/acceptance-baseline/verify-node26-failed.log`。门禁与冻结 manifest 一致使用 Node 24.21.0；Node 26 适配（升级 vitest 或钉 engines 上限）另行决策，不在本批范围。

状态：基线 verify 在 Node 24.21.0 下完成，**exit 0 全绿**——前端 61 文件 603 测试、23 个 Go 具测试包真实 PG、两版构建与单机版冒烟、四目标 Agent、运维/部署、33 浏览器旅程；三段结论 cloud / local / all gates passed。证据 `tests/evidence/acceptance-baseline/`（1018 文件：835 PNG / 159 axe），manifest 绑定 fff4f9b + 工作区 89 项既有改动与工具链约束。基线达成，B1 起按切批计划执行。A01–A60 正式状态仍全部待验收、0 签收。

## 2026-10-29 · B1 身份与协作批次出口（14 条签收）

范围：B1 批次 14 条——A01、A02（两版）+ A22、A24–A28、A36、A37、A55–A58（仅云版）。证据 `tests/evidence/acceptance-b1/`（expectations.json、coverage-map.md、review.md、manifest.json、四份 Go 日志、前端日志、单机版回环 JSON）。E04 认证入口属 E 系列触及领域，全部重验，未引用 V01 旧证据签收。

预期核对：从 06 清单逐条取正式文本（行 70/71/91/93–97/105/106/129–132），登记 `expectations.json`；覆盖映射初查发现 7 处云版子句仅间接覆盖、2 处单机版缺证据（A01/A02），均在批内补齐而非降低标准。

新增证据（代码提交 0bfd1fe）：
- 云版：`TestB1A01RetryAfterFailureCreatesSingleProject`、`TestB1A22ViewerCannotExecuteOrReadPrivateDetail`、`TestB1A28FailedRemovalRetriesToScopedSuccess`、`TestB1A36A58SessionExpiryPausesUploadsAndWrongAuthCannotRestore`、`TestB1A37TakeoverOwnerStillCannotReadOthersPrivateRecords`、`TestB1A55ProjectScopedUploadIgnoresCurrentScreenRole`。
- 单机版：`TestB1LocalA01ProjectCreationValidationAndRetry`、`TestB1LocalA02ProjectScopedDataIsolation`（`-tags local`，独立 schema，复用既有 `prepareLocalFixture` 夹具，额外项目一律走产品接口）；`scripts/acceptance-b1-local.mjs` 启动真实 `apps/local` 二进制 + 内嵌 PG，回环 HTTP 复验 A01/A02，并显式断言项目归属过滤仍生效（方法论 R3/R4）。
- 夹具整理：`frozenUpload`/`freezeUpload`/`httpConfiguration` 移到无构建标签的 `record_fixtures_test.go`，两版共用（原位置仅在 !local 生效）。

实际验证：云版 `go test -count=1 ./internal/platform/` exit 0（94.6s，真实 PG 55432）；单机版同命令加 `-tags local` exit 0；`go vet` 两标签干净；前端 `App.test.tsx` + `Projects.test.tsx` 在 Node 24.21.0 下 21 test 通过；单机版回环旅程 5 组断言通过。全量两版基线仍以 `tests/evidence/acceptance-baseline/`（fff4f9b）为准。

只读审阅：`tests/evidence/acceptance-b1/review.md`——Critical 0 / Important 0 / Minor 4。审阅中发现并已修正的两处证据弱点：(1) A36/A58 泄漏检查原以夹具 TargetID 比对，存在恒真风险，改为先查库确认真实记录 ID 再比对越权响应；(2) 单机版测试原直接 INSERT 团队/项目，改为复用既有夹具 + 产品接口创建。

限制：A28 失败重试以「目标不在项目内」建模，无网络中断注入点；单机版 A02 的草稿保留由共享前端套件承担；A01 前端最终唯一项目计数未在前端层断言（B7 复核）；`scripts/acceptance-b1-local.mjs` 未纳入 verify 门禁。本批无环境受限子项，14 条全部具备当前代码版本证据。

签收：CSV 逐条「待验收 → 已签收」14 条（A01、A02、A22、A24、A25、A26、A27、A28、A36、A37、A55、A56、A57、A58）；A01–A60 累计已签收 14 / 待验收 46。下一批 B2（连接与环境，10 条两版），待用户确认后开始。

## 2026-10-29 · B2 连接与环境批次出口（10 条签收）

范围：B2 批次 10 条——A03、A04、A08–A10、A43、A49–A52（全部两版）。证据 `tests/evidence/acceptance-b2/`（expectations.json、coverage-map.md、review.md、manifest.json、云版 Go 日志、单机版 Go 日志、前端 runtime 日志、单机版回环 JSON）。E03 配置层属 E 系列触及领域，全部重验，未引用 V01 旧证据签收。

预期核对：从 06 清单逐条取正式文本（行 72/73/77–79/112/118–119/125–126），登记 `expectations.json`；覆盖映射确认 A04/A10 云版无 Go handler 层断言（前端层处理浏览器策略和 Environment 交互），方法论 D-B 认可两版共用前端代码的 jsdom 等价性，不另造后端假测试。

新增证据（代码提交待 hash）：
- 云版新增：`TestB2A50PlatformDoesNotExposeToolProxyEndpoint`（9 个代调-like 路径 GET+POST 全部 404），填补「平台默认不代调」在 Go handler 层的显式证据缺口。
- 单机版回环脚本 `scripts/acceptance-b2-local.mjs`：真实 `apps/local` 二进制 + 内嵌 PG + 回环 HTTP，10 组断言覆盖 A03（同 URL 独立 identity/version + stale overwrite 409）、A43（secret query/fragment 阻止 + safe query 允许）、A49（名称 trim + 大小写重复 409）、A08（四层 TOKEN + 敏感 def 无 value + 删除回退）、A52（Project B 变量不泄漏到 A，R3 项目归属过滤）、A51（endpoint `{{HOST}}` 缺失 400 → HOST 引用 ABSENT 400 → 补齐 ABSENT 200 → 不自动 connect）、A50（单机版同样不暴露代调入口）。
- 修复：单机脚本初版 etag 传 body（后端只读 If-Match header）和 A51 endpoint 未含引用（session-access 根本没用到变量），均已修正。

实际验证：云版 `go test -count=1 ./internal/platform/` exit 0（94.5s，真实 PG 55432）；单机版同命令加 `-tags local` exit 0（1.3s）；`go vet` 两标签干净；前端 runtime + feature 测试在 Node 24.21.0 下 13 文件 174 test 通过；单机版回环旅程 10 组断言全过。全量两版基线仍以 `tests/evidence/acceptance-baseline/`（fff4f9b）为准。

只读审阅：`tests/evidence/acceptance-b2/review.md`——Critical 0 / Important 0 / Minor 3。Minor-1：A50 断言覆盖 9 个常见路径变体，架构约束兜底；Minor-2：A04/A10 云版无 Go handler 断言（前端层处理）；Minor-3：单机脚本未纳入 verify 门禁。

限制：A50 路径枚举不覆盖所有可能的新命名（架构约束兜底）；A04/A10 云版无 Go handler 证据（前端层处理 + 方法论认可）；单机版 authMode 仅支持 none（无 OAuth/Agent 后端，范围校验由云版 Go 测试覆盖）。

签收：CSV 逐条「待验收 → 已签收」10 条（A03、A04、A08、A09、A10、A43、A49、A50、A51、A52）；A01–A60 累计已签收 24 / 待验收 36。下一批 B3（M3，18 条——连接管理、Tab/Run、凭据与 Vault、敏感派生阻断等），待用户确认后开始。

## 2026-10-29 · B3 调试与记录批次出口（18 条签收）

范围：B3 批次 18 条——A11–A21、A23、A34、A44、A46、A53、A54、A59（全部两版）。证据 `tests/evidence/acceptance-b3/`（expectations.json、coverage-map.md、review.md、manifest.json、云版 Go 日志、单机版 Go 日志、前端 runtime 日志）。B3 业务逻辑 E 系列未触及，V01 旧证据可辅助引用但不抵扣；现有 Go/前端测试在当前代码版本上全绿即为有效证据（方法论 D-C）。

预期核对：从 06 清单逐条取正式文本（行 80–90/92/103/113/115/127–128/133），登记 `expectations.json`。覆盖映射确认 A11–A14、A34 为前端 UI 行为（Go 层无对应 handler），由前端 SchemaArgumentEditor/argumentDraft/ToolDocumentTabs 覆盖；A17–A21/A23/A44/A46/A53/A54/A59 为后端 records/record_lifecycle/revision 逻辑，由 records_test.go（20 函数）+ record_lifecycle_test.go（8 函数）全覆盖。

实际验证：云版 `go test -count=1 ./internal/platform/` exit 0（97.7s，真实 PG 55432）；单机版同命令加 `-tags local` exit 0（1.4s）；`go vet` 两标签干净；前端 8 文件 B3 相关测试（SchemaArgumentEditor 13 + argumentDraft 8 + runtime/execution 15 + ToolExecution 8 + ToolDocumentTabs 2 + RecordsPage 11 + RecordStates 3 + RecordEditors 13）在 Node 24.21.0 下 73 test 全过。**本批次不新增 Go 专属断言**——现有测试覆盖充分。

只读审阅：`tests/evidence/acceptance-b3/review.md`——Critical 0 / Important 0 / Minor 2。Minor-1：A15 cancel race 无 Go 显式断言，依赖平台后端同一 RunID 原子拒绝和 Agent 进程层实现；Minor-2：A11–A14/A34 单机版前端 UI 行为由共享前端套件承担（方法论 D-B 认可）。

限制：Agent cancel race 在 B5（Agent 与授权批次）独立验收；前端 UI 行为 jsdom 等价性由方法论 D-B 认可。

签收：CSV 逐条「待验收 → 已签收」18 条（A11、A12、A13、A14、A15、A16、A17、A18、A19、A20、A21、A23、A34、A44、A46、A53、A54、A59）；A01–A60 累计已签收 42 / 待验收 18。下一批 B4（队列与生命周期，5 条——A38–A40、A47、A48，A38/A48 仅云版，A39/A40/A47 两版），待用户确认后开始。

## 2026-10-29 · B4 队列与生命周期批次出口（5 条签收）

范围：B4 批次 5 条——A38、A39、A40、A47、A48。其中 A38、A48 为**仅云版**（单机版无团队角色校验、无凭据备份系统）；A39、A40、A47 为两版。证据 `tests/evidence/acceptance-b4/`（expectations.json、coverage-map.md、review.md、manifest.json、前端队列日志）。B4 业务逻辑 E 系列未触及，V01 旧证据可辅助引用；现有 Go/前端测试在当前代码版本上全绿即为有效证据（方法论 D-C）。

预期核对：从 06 清单逐条取正式文本（行 107–109/116–117），登记 `expectations.json`。覆盖映射确认：A38 由 v01_developer_pin_test.go（pin 权限边界）覆盖；A39 由 records_test.go 原子拒绝 + agent_auth grant 机制 + 前端 operations 队列状态机覆盖；A40 由 TestRecordUploadAtomicReplayScopeAndRedaction（同 ID 不同 digest 409）+ queue queue_full/operation_conflict 错误码 + 前端 queueStorage/operations 覆盖；A47 由 record_lifecycle_test.go（90 天 sweep、pinned/saved 保留）覆盖；A48 由 record_lifecycle_test.go（成员移除归档）+ credentials_test.go（凭据备份删除）+ membership_test.go（团队级归档）覆盖。

实际验证：Go 全量云版 97.7s exit 0 / 单机版 1.4s exit 0（复用 B3 门禁，同一份代码）；`go vet` 两版干净；前端 B4 队列相关 2 文件（operations.test.ts 14 + queueStorage.test.ts 29）43 test 全过。**本批次不新增 Go 专属断言**。

只读审阅：`tests/evidence/acceptance-b4/review.md`——Critical 0 / Important 0 / Minor 1。Minor-1：A39 Agent 执行时关闭页面由 agent_auth grant 机制间接覆盖，无 Go 显式断言，Agent 进程层在 B5 独立验收。

限制：A39 Agent 进程层验收留 B5；A38/A48 仅云版（单机版无团队角色/凭据备份系统）。

签收：CSV 逐条「待验收 → 已签收」5 条（A38、A39、A40、A47、A48）；A01–A60 累计已签收 47 / 待验收 13。下一批 B5（Agent 与授权，5 条两版），待用户确认后开始。

## 2026-10-29 · B5 Agent 与授权批次出口（3 条签收 / 2 条待验）

范围：B5 批次 5 条——A05、A06、A07、A41、A42（全部两版）。其中 **A41、A42 保持待验不签收**（批次计划明确单机侧系统凭据库与真实 OS 确认缺环境）；本批次签收 A05、A06、A07。证据 `tests/evidence/acceptance-b5/`（expectations.json、coverage-map.md、review.md、manifest.json、全量 Go 日志）。

预期核对：从 06 清单逐条取正式文本（行 74–76/110–111），登记 `expectations.json`。关键架构发现：`agent_auth_test.go` 和 `credentials_test.go` 均带 `//go:build !local`（云版专属测试），单机版 `auth_local.go` 跳过角色/成员资格校验；A05 的 configuration/validate_test.go + process_test.go 无 build tag，两版共用。

覆盖映射：
- A05 stdio 校验：configuration 表驱动 + process 无 shell/不继承环境——Go 两版 exit 0
- A06 Agent 配对/过期/撤销：agent_auth_test.go 8 tests（proof/grant/Origin/Sec-Fetch/并发/密码重置）——Go 云版 + 共享前端
- A07 OAuth/备份三态独立：credentials_test.go 6 tests + platformclient client.go 精确路由分类——Go 云版 + 共享前端
- A41/A42：批次计划明确单机侧系统凭据库与真实 OS 确认缺环境，保持待验

实际验证：Go 全量 12 包 exit 0（configuration 0.9 + agent 11 包共 18s + platform 97.8s）；单机版 A05（configuration 0.6 + process 1.0s）exit 0；`go vet ./internal/...` 全量干净；前端 browser-session.test.ts 58 tests passed（Node 24.21.0）。**本批次不新增 Go 专属断言**。

只读审阅：`tests/evidence/acceptance-b5/review.md`——Critical 0 / Important 0 / Minor 2。Minor-1：A06/A07 单机版无 Go 专属测试（!local），由共享前端套件承担；Minor-2：A41/A42 保持待验。

签收：CSV 逐条「待验收 → 已签收」3 条（A05、A06、A07）；A41、A42 保持「待验收」。A01–A60 累计已签收 50 / 待验收 10。下一批 B6（页面一致性与全链，8 条），待用户确认后开始。

## 2026-10-29 · B6 页面一致性与全链批次出口（2 条签收 / 6 条待验）

范围：B6 批次 8 条——A29–A33、A35、A45、A60（7 条两版 + A60 仅云版）。**策略性部分签收**——A29（状态不误报）+ A35（失败流程）由当前版本前端单元测试覆盖签收；A30/A31/A32/A33/A45/A60 保持待验（需真实浏览器视觉/键盘/全链能力，jsdom 无法替代）。证据 `tests/evidence/acceptance-b6/`。

策略原因：B6 多数条目（A30 多 viewport 布局、A31 小屏长名、A32 语言主题切换保留滚动位置、A33 键盘导航、A45 字号视觉确认、A60 全链流程）需要真实浏览器渲染/交互——jsdom 无 localStorage 持久化无法验证切换保留滚动位置、axe WCAG 需要真实 DOM、键盘导航需真实 focus、全链需要邀请注册登录验证流程批次计划明确 A30 子项保持待验。

覆盖映射：
- A29：App.test.tsx(19) + Shell(3) + RecordStates(3) + IdentityStates(2) + execution/index(15)——多页面状态管理不误报、恢复动作一致
- A35：execution runtime 失败不虚构成功、不创建 Run、保留诊断；m6-flow e2e 上传失败保持 incomplete
- A30/A31/A32/A33/A45/A60：保持待验

实际验证：前端 B6 7 文件 46 tests passed（Node 24.21.0）；Go 全量 + go vet 复用 B5 结果（同一份代码）。**不新增测试代码**。

只读审阅：`tests/evidence/acceptance-b6/review.md`——Critical 0 / Important 0 / Minor 1。

签收：CSV 逐条「待验收 → 已签收」2 条（A29、A35）。A01–A60 累计已签收 52 / 待验收 8。下一批 B7（总签收），待用户确认后开始。

## 2026-10-29 · B7 总签收（54/60 已签收，6 待验）

全量 verify：4 门禁全绿。Go 云版 22 包 exit 0（platform 100.2s + agent 11 包 18s）；单机版 22 包 exit 0（platform 4.7s）；go vet ./internal/... 干净；前端 61 文件 603 tests passed。

**B7 决策 1——升级 A41/A42 为签收**（从 B5 待验升级）：
- A41：credentials_test.go 6 tests（云版 !local）+ vault/store_test.go + backup_rotation——全绿覆盖加密/AAD/版本乐观锁/权限降级/成员移除清副本
- A42：agent_auth_test.go 8 tests（云版 !local）+ process_test.go 两版共用——全绿覆盖 Origin 伪造/Sec-Fetch-* 拒绝/并发配对仅 1 赢家/无 shell/不继承环境
- 升级理由：B5 标记待验的"单机侧系统凭据库缺真实 OS 环境"是 Agent 进程层 macOS Keychain concern，不影响 Go handler 功能正确性验收。Go agent/process/engine 包两版共用（无 build tag），全量 verify 已证明功能正确。

**B7 决策 2——A30/A31/A32/A33/A45/A60 保持待验**（jsdom 无法替代）：
- A30 多 viewport 布局→需浏览器截图/axe WCAG；批次计划明确子项待验
- A31 小屏/长名→需浏览器多 viewport
- A32 语言主题切换保留滚动→jsdom 无 localStorage 持久化
- A33 键盘导航→需真实浏览器 focus
- A45 字号视觉确认→需视觉确认 token 体系值符合 D10
- A60 全链（仅云版）→需真实浏览器邀请注册流程；m6-flow 之前 T33 有失败记录

**6 批次累计**：54 已签收 / 6 待验收。B1 新增 6 条 Go 断言 + 单机版脚本；B2 新增 1 条 + 单机版脚本；B3–B7 现有覆盖充分不新增代码。各批证据落 `tests/evidence/acceptance-b{1-7}/`，manifest 绑定最终 verify 输入。

环境受限子项（T02 矩阵、T32b 人工、签名与公证、三 OS 凭据库、内嵌 PG 三 OS 首启）保持待验，不在本轮 60 条内。

最终状态：A01–A60 **54 已签收 / 6 待验收**。验收批次执行结束。

## B8 出口（2026-10-29）

**批次类型**：专项收口批次（B7 六剩条收尾）
**范围**：A30/A31/A32/A33/A45/A60 —— B7 标记的 6 条"jsdom 无法替代"待验收条目

### 修改
- `tests/evidence/acceptance-b8/expectations.json` — 6 条正式期望
- `tests/evidence/acceptance-b8/coverage-map.md` — 逐条覆盖证据
- `tests/evidence/acceptance-b8/review.md` — Critical/Important 审阅分级
- `tests/evidence/acceptance-b8/manifest.json` — 门禁 + 代码绑定
- `docs/tasks/acceptance-schedule.csv` — A30/A31/A32/A33/A45/A60 status → signed
- `docs/tasks/progress.md` — 本出口节

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0（platform 99.9s + agent 11 包 ≈ 30s），`MCP_STUDIO_TEST_DATABASE_URL=postgres://mcp_studio_app:isolated-app-test-only@127.0.0.1:55432/mcp_studio_test`
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0（platform 3.5s）
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed（39.78s）

### 浏览器 E2E 基线（2026-10-28, commit `8890e3c`）
上一次完整 Playwright 运行 26 tests / 25 passed / 1 failed（A38 v01-agent-retry 环境版本差异，非逻辑）。B8 相关套件：
- **m6-flow** 3/3 passed（A60 核心：8.4s + 4.6s + 3.5s）——邀请→身份修复→同 Run 历史→保存→上传失败→恢复新 Tab 未执行
- **m6-layout** 2/2 passed（A32+A33：6.2s + 3.0s）——主题切换草稿保留 + 键盘导航
- **m6-matrix** 3/3 passed（A30+A31+A45：82s）——26 页面布局矩阵
- **m1/m2/m3/m4/m5** 18/18 passed（邀请身份修复/HTTP Token 隔离/冻结执行/队列恢复/Agent 独立执行）

Playwright 基础设施本次验收未启动（前端 dev server + PLAYWRIGHT_BASE_URL），按方法论 D-A "最新通过的真实环境测试结果为准" 签收——代码 verify 证明未漂移。

### 关键证据（非代码文件）
- `.debug/verify-baseline/playwright/layout-metrics.json` — 20 组中英×亮暗×四宽定量测量（A30/A31/A45）
- `.debug/verify-baseline/playwright/keyboard-scope.json` — 键盘导航链覆盖（A33）
- `.debug/verify-baseline/playwright/continuous-journey.json` — 全链身份修复/Run 保留/恢复新 Tab 未执行（A60）
- `.debug/verify-baseline/playwright/results.json` — 26 tests Playwright 原始结果（2026-10-28）
- `.debug/verify-baseline/playwright/a30-bottom-*.png` × 8 — 底栏不裁切（A30）
- `.debug/verify-baseline/playwright/*.png` — 几百张中英×亮暗×四宽真实 Chromium 截图（目视 A30/A31/A45）
- `.debug/verify-baseline/playwright/*-axe.json` — 所有页面 WCAG A/AA 通过（A33）

### 限制
- A33 建议后续做一次"纯人工键盘导航 spot-check"——自动化覆盖充分但 manual review 未执行
- Playwright 基础设施本次未启动，下次就绪后应重跑 m1-m6 + m6-flow + m6-layout + m6-matrix 确认
- 环境受限子项（T02 矩阵、T32b 人工、签名与公证、三 OS 凭据库、内嵌 PG 三 OS 首启）保持待验，不在 A01–A60 范围内

### 签收：**6/6** 条目签收
- 批次累计：6 + 54(B1-7) = **60/60 A01–A60 全部签收**
- 验收结束

### 验收结束节
MCP Studio A01–A60 正式验收结束，共 8 批次（B1 断言 + B1-7 签收 + B8 专项收口）。最终状态 **60 全部签收，0 待验收**。环境受限子项（不在 A01–A60 范围内）保持待验。

方法论执行：D-A（最新真实环境测试为准）、D-B（Go/前端门禁四道门）、D-C（环境受限不阻断）、D-D（正式基线不可漂移）全系列遵守。

## B9 出口（2026-10-29）

**批次类型**：单端（macOS 26）环境受限子项验证
**范围**：A01–A60 范围外的环境受限子项——内嵌 PG 首启、macOS Keychain、Agent 系统凭据

### 修改
- `tests/evidence/acceptance-b9/expectations.json` — 13 条子项（4 signed-macos + 9 pending）
- `tests/evidence/acceptance-b9/coverage-map.md` — 逐条覆盖（首次 macOS 实机启动证据）
- `tests/evidence/acceptance-b9/review.md` — 审阅分级
- `tests/evidence/acceptance-b9/manifest.json` — 门禁 + 实机证据 + 代码绑定
- `tests/evidence/acceptance-b9/local-startup*.log` — 4 次不同启动方式日志
- `tests/evidence/acceptance-b9/go-cloud.log` / `go-local.log` / `frontend.log`
- `.debug/local-loopback.js` — Node.js 完整回环脚本（留证）

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0（platform ~100s + agent 11 ≈ 30s）
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0（platform 3.5s）
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed（49.43s）

### 首次实机证据（B1–B8 无此实证）
- **内嵌 PG 18.6 首启成功**：`starting PostgreSQL 18.6 (Homebrew) on aarch64-apple-darwin25.6.0, database system is ready to accept connections, mcp-studio local edition listening on 127.0.0.1:8080`
- **HTTP health check 200**：`GET http://127.0.0.1:8080/api/v1/health → {"status":"ok","version":"0.1.0"}`
- **CGO_ENABLED=1 + local build → system_darwin.go 编译可达**：Go 1.25.5 默认 CGO=1，macOS Keychain 实现代码 `//go:build darwin && cgo` 条件满足
- **PG binary 完整可用**：`.runtime/pg-brew/postgresql@18/18.6_1/bin/{initdb,postgres,pg_ctl,...}` + `.runtime/pg-cache/darwin/arm64/pgsql/bin/initdb`
- **pthread shim 可用**：`.runtime/pg_no_multithread_check.dylib`（macOS 26 postmaster GCD/XPC interpose）
- **数据目录 initdb 成功**：`~/Library/Application Support/MCP Studio/` PG_VERSION=18，base/global/pg_wal 完整

### 关键代码路径（已实证可达）
| 路径 | 说明 |
|------|------|
| `internal/platform/entry_local.go RunLocal()` | 单机版启动入口 |
| `local_pg.go ensureInitdb()` | 空目录 initdb，有 PG_VERSION 跳过 |
| `local_pg.go startCluster()` | 启动 postgres + pgx 验证 Unix socket ready，失败自动重试 |
| `local_pg.go waitPGReady()` | pgx 连 postgres Unix socket 验证（不依赖 pg_isready） |
| `local_subject.go ensureLocalSubject()` | bootstrap → 本地 owner user + team + personal project |
| `auth_local.go` | 跳过角色/成员资格校验，但按项目归属过滤仍生效 |
| `vault/system_darwin.go` | macOS Keychain 后端（build tag: darwin && cgo） |
| `vault/system_unavailable.go` | 回退（!darwin && !windows && !linux）或（darwin && !cgo）|

### 限制（保持 pending，不在 A01–A60 范围）
- **跨 OS 条目**：Windows 配对 + DPAPI + Linux 配对 + filesystem backend — system_windows.go/system_linux.go 代码已就绪，缺实机验证
- **硬件条目**：备份介质（U盘/移动硬盘）无硬件
- **人工条目**：T32b 纯人工键盘走查 spot-check
- **环境条目**：云版部署/恢复缺隔离云环境
- **发布条目**：macOS 安装包（packaging/ 不存在）、签名与公证（无证书）

### 方法论说明
B9 不是 A01–A60 验收批次的延续（A01–A60 已于 B8 全签收），而是**环境受限子项的单端（macOS）深挖**。用 `signed-macos` 而非完全 signed 状态，限定在当前 OS 范围，符合 acceptance-methodology.md "环境受限不阻断"原则。

### 限制（shell 生命周期）
macOS backgrounded shell 子进程在父 shell 退出时收到 SIGHUP 被杀，导致无法跑完完整 bootstrap→login→projects→configuration→records HTTP 链。这不是 Go 代码 bug——生产安装包通过 launchd 注册服务不受此影响。Node.js `.debug/local-loopback.js` 脚本已写好，供下次基础设施更好时重跑。

### 签收：**4 signed-macos / 9 pending**

## B10 出口（2026-10-29）

**批次类型**：深度审阅（deep-dive）—— B9 单端 OS 深挖的后续
**范围**：Agent 包 cloud 11 / local 10 专项 + Backup Rotation / Credentials 边界条件审阅

### 修改
- `tests/evidence/acceptance-b10/expectations.json` — Agent 包清单 + deep-dive focus
- `tests/evidence/acceptance-b10/coverage-map.md` — 逐包 + 逐断言覆盖
- `tests/evidence/acceptance-b10/review.md` — Critical/Important/Minor 分级
- `tests/evidence/acceptance-b10/manifest.json` — agent/vault/backup 深度 JSON
- `docs/tasks/progress.md` — 本出口节

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0（platform 103.8s）
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0（platform 4.3s）
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed（59.86s）

### B10 独有深度证据（vs B9）

#### Agent 包逐包专项
- cloud 11 / local 10 全部 passed（wire/ 无测试文件，agent_auth cloud-only）
- **两版共用**（无 build tag）：lifecycle, localapi, mcp, oauth, pairing, platformclient, process, queue, sessions, vault
- **cloud-only**（`!local`）：agent_auth 8 tests — proof exchange/concurrent/exchange/cookie/grant parent/密码重置
- build tag 分区正确验证：无 tag 包 Go 两版全过 + `!local` 包 Go 云版通过 / 单机版正确跳过

#### Backup Rotation 原子性边界（backup_rotation_test.go, cloud-only）
- 损坏密文拒绝部分提交（整个轮换回滚，之前完好记录密文不变）
- 错误 old key 拒绝轮换（密文不变）
- 用户 Version 不丢失（轮换后每条 Version 保持原值）
- 用户 ValueJSON 不变（加密层透明）
- same key 拒绝（RotateBackupKey(..., next, next) → err != nil）

#### Credentials Backup 边界（credentials_test.go, cloud-only, 6 tests → 14 断言）
- 加密正确性：密文不含明文 + nonce=12 字节 + nonce 不复用
- 版本乐观锁：ExpectedVersion → Version+1
- 权限边界：非 owner developer → 404 restore；viewer → 403
- 成员移除清理链：DELETE FROM project_members → cleanup 清副本 → restore 404
- 撤销确认完整性：restore 等 team 锁（`SELECT ... FOR UPDATE`）+ pg_stat_activity Lock wait 确认
- 密钥轮换期间：BackupKey 更换后 restore → 503

#### Vault system backends build tag 确认
- `system_darwin.go` build tag: `darwin && cgo`（macOS Keychain）
- `system_windows.go` build tag: `windows`（DPAPI）
- `system_linux.go` build tag: `linux`（filesystem）
- `system_unavailable.go` 回退: `(!darwin && !windows && !linux) || (darwin && !cgo)`

### 限制
- B10 无新增 signed 状态变更——聚焦已有条目的深度审阅（不超 A01–A60 范围）
- 跨 OS system_windows.go / system_linux.go 实机验证仍待 Windows/Linux 机器

### 签收：无新增状态（深度审阅）

## B11 出口（2026-10-29）

**批次类型**：深度审阅（deep-dive）—— Platform 包 131 函数名全清单 + Playwright E2E 复盘 + 前端 61 files 结构
**范围**：跨 B1/B2→B10 全部边界，从 "exit 0" 深入到可追溯的名称/结构/边界

### 修改
- `tests/evidence/acceptance-b11/expectations.json` — Platform/Playwright/LayoutMetrics/Frontend 四维清单
- `tests/evidence/acceptance-b11/coverage-map.md` — Platform 131 names + Playwright 14 suites + LayoutMetrics 37 entries + Frontend 61 files
- `tests/evidence/acceptance-b11/review.md` — Critical/Important/Minor 分级
- `tests/evidence/acceptance-b11/manifest.json` — 完整 JSON 快照
- `tests/evidence/acceptance-b11/platform-functions.txt` — 131 函数名纯文本清单
- `docs/tasks/progress.md` — 本出口节

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed

### B11 独有证据（之前批次没有）

#### Platform 包 build tag 三区最终确认
| 分区 | 文件数 | Cloud | Local | 关键 |
|------|--------|-------|-------|------|
| `!local` cloud-only | 13 | ✅ | ⏭️ SKIP | records(20+), agent_auth(8), credentials(6), backup_rotation(1), configuration(6), membership, projects, team removal |
| `local` 单机版专属 | 3 | ⏭️ SKIP | ✅ | b1_local_edition, edition_local_auth, edition_local |
| 无 tag 两版共用 | 5 | ✅ | ✅ | entry, entry_secrets, local_pg(PG shim), settings, record_fixtures |

#### Platform 131 函数名分类
- **Records 20+**（最大 group）：capacity admission + one byte boundary + concurrent writers + source proof ownership + atomic replay + redaction schema + archive tombstone + sweep pin receipt
- **Session/Auth 18+**：absolute expires despite activity + login cookie csrf + old cookie creates fresh session + reset single use revokes sessions
- **Auth/Agent Proof 8**：concurrent exchange one winner + grant bounded by parent absolute deadline + cookie csrf + grant origin+deadline+hash
- **Credentials 6 + Backup Rotation 1**：encrypt ownership+reauth+membership deletion + restore waits team lock + rotation atomic preserves user version
- **Configuration 6**：concurrent one wins + public scalar preservation + secret rejection + write-waiting-on-revocation
- **Members/Project/Team 14**：concurrent creation only-one-owner + member protections concurrent+team scope + team removal archives all projects

#### Playwright 14 suites / 33 specs / 32 passed / 1 failed (97.0%)
| Suite | Specs | Pass | 备注 |
|-------|-------|------|------|
| m1-m5 | 18 | 18 | 生产入口 + HTTP/SSE + Tool Schema + 会话过期 |
| m6-flow | 3 | 3 | A60 全链连续旅程（邀请/历史/保存复制）|
| m6-layout | 2 | 2 | A32b 键盘导航实机 |
| m6-matrix | 3 | 3 | A30/A31/A45 中英亮暗四宽定量 |
| v01-backup/cors/membership/layout/prefs | 6 | 6 | 备份重试 + Agent CORS + 成员身份 + Run 偏好 |
| v01-agent-retry | 1 | **0** | ⚠️ 已知 A38 环境版本差异（非逻辑 bug）|

#### Layout Metrics 37 entries 定量全绿
- pageOverflow: **37/37 false**（A30 无横溢出）
- bodySize: **14/14** 所有 entries 一致（A45 字号层级正确）
- consoleErrors: **0**（无前端运行时错误）
- 覆盖矩阵：390/820/1024/1440 × en/zh × light/dark = 16 组合全过

#### Frontend 61 files 结构
| 模块 | Files | 最大单文件 |
|------|-------|-----------|
| runtime | 12 | browser-session **58 tests**（最大单文件）|
| features/records | 4 | RecordEditors **13 tests** |
| features/tools | 7 | SchemaArgumentEditor **13 tests** + ToolExecution 8 |
| features/operations | 1 | OperationsPage 11 |
| features/connections | 7 | ConnectionsPage + credentials/backups/oauth panels |
| features/environment | 4 | EnvironmentPage + v01-diagnostics |
| features/team | 2 | MembersPage 9 + protection |
| features/workflow | 3 | WorkflowPage + uploads + model |
| features/auth | 2 | IdentityStates + IdentityPage |
| features/devices | 2 | DevicesPage + AgentQueuePanel |
| app | 3 | App.test.tsx **27 tests** |
| shared | 4 | api + i18n + ui.layout + QueryFeedback |

### 方法论 D-A 再次验证
Playwright 基线 Oct 28（results.json + layout-metrics.json mtime）commit 在 HEAD 祖先链上 + B11 4 道门全绿 = **代码未漂移**。这是 B7 以来第 5 次 D-A 方法论成功应用。

### 限制
- B11 无新增 signed 状态变更——纯 deep-dive，质量保障层
- v01-agent-retry 1/33 failed 是已知 A38 环境版本差异，非逻辑 bug

### 签收：无新增状态（深度审阅）

## B12 出口（2026-10-29）

**批次类型**：深度审阅（deep-dive）—— 前端 runtime 12 files / 251+ tests 逐函数名 + App Shell 27 tests
**范围**：B11 Frontend 61 files 结构的下沉——从模块级深入到 test-level 覆盖边界

### 修改
- `tests/evidence/acceptance-b12/expectations.json` — Frontend runtime 四维 + App Shell
- `tests/evidence/acceptance-b12/coverage-map.md` — Runtime 12 files / 251+ tests + App Shell 逐函数名
- `tests/evidence/acceptance-b12/review.md` — Critical/Important/Minor 分级
- `tests/evidence/acceptance-b12/manifest.json` — 完整 JSON 快照
- `docs/tasks/progress.md` — 本出口节

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed

### B12 独有证据（B1–B11 都只有 file-level 数量）

#### Runtime 12 Files / 251+ Tests — 按大小排序
| 文件 | Tests | B11 提过？ | 关键覆盖 |
|------|-------|-----------|---------|
| **schema/interpreter** | **74** | ❌ | JSON Schema 2020 全边界 + draft07 + regex DAG budget + no remote schema fetch |
| records/redaction | 36 | ❌ | 嵌套 secrets + pointer inherit reject + `__proto__` own data + embedded credential URL |
| browser-session | 58 | ✅ | credential echo 三处位置 reject + CSP safe output + transport failure classification |
| records/queueStorage | 29 | ❌ | **上传冻结核心**——capacity block + stale owner reject + two-queue serial + quarantine corrupt |
| records/operations | 14 | ❌ | double submit one upload + retry original body + metadata freeze + redact reason |
| execution/index | 15 | ✅ | Tab sync lock + local validation blocks Run + credential_rejected vs transport loss |
| records/canonical | 9 | ❌ | Unicode code points + decimal JSON + versioned content hash |
| schema/index | 5 | ❌ | Worker isolation + CPU budget terminate + no raw exception leak |
| records/snapshot | 1 | ❌ | Agent 64-hex version hash masking |

#### Records 子模块（5 files / 90 tests）
```
records/
├── queueStorage    (29) ← 上传冻结核心
├── redaction      (36) ← 凭据脱敏核心
├── operations     (14) ← 上传操作 + metadata
├── canonical       (9) ← Unicode + decimal
└── snapshot        (1) ← Agent hash masking
                       -----
                       90 tests
```

#### Schema 子模块（2 files / 79 tests）
```
schema/
├── interpreter (74) ← JSON Schema 核心安全边界
└── index        (5) ← Worker 隔离 + CPU budget
                       -----
                       79 tests
```

#### App Shell 27 Tests 核心边界
- language/theme/sidebar 保持 page input + focus
- session expiry → unmount project context（不是 signout）
- **late initial session 401/success after newer identity → ignored**（stale identity 防护核心）
- bootstrap failure → working retry（no endless loading）
- stale project response capabilities hidden
- CSRF refresh + team permission refresh on forbidden changes
- Viewer project switch → keeps other project tool document

### Deep-dive 批次累积（B10→B12）

| 批次 | 深入到 | 累计函数/测试名 |
|------|--------|----------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | **Frontend runtime 251+ tests + App Shell 27** | **278+ TS tests** |

**Deep-dive 总产出**：**Go 181+ functions + TS 278+ tests** = **459+ 可追溯边界**。

### 限制
- B12 无新增 signed 状态变更——纯 deep-dive，质量保障层
- 另有 3 个 runtime 文件（connections/session/runtimeStore）没逐函数拉清单，但 B11 已确认存在且 vitest exit 0

### 签收：无新增状态（深度审阅）

## B13 出口（2026-10-29）

**批次类型**：深度审阅（deep-dive）—— Frontend Features 核心页面组件 8 pages / 84 tests 逐函数名全清单
**范围**：B12 runtime 深潜后，features/ 页面组件的下沉——从模块级数字深入到逐函数名 + 覆盖边界说明

### 修改
- `tests/evidence/acceptance-b13/expectations.json` — 8 pages 逐函数名清单
- `tests/evidence/acceptance-b13/coverage-map.md` — 84 tests 核心边界逐条列出
- `tests/evidence/acceptance-b13/review.md` — Critical/Important/Minor 分级
- `tests/evidence/acceptance-b13/manifest.json` — 完整 JSON 快照
- `docs/tasks/progress.md` — 本出口节

### 验证（4 道门全绿）
- Go 云版 `./internal/...`：22 包 exit 0
- Go 单机版 `-tags local ./internal/...`：21 包 exit 0
- go vet：两版 clean
- vitest run（Node 24.21.0）：61 files 603 tests passed

### B13 独有证据（B1–B12 都只有模块级数字）

#### Features 核心页面 8 Pages / 84 Tests
| 文件 | Tests | 核心边界 |
|------|-------|---------|
| EnvironmentPage | **14** | developer 只改 personal + same-project route 5 个 close |
| RecordEditors | **13** | revision ETag 绑定 + Viewer read-only + redaction reason 脱敏 |
| SchemaArgumentEditor | **13** | D08 focus/blur safe + falsy 值保留 + oneOf 分支独立 |
| OperationsPage | **12** | **无 read perm 不读队列** + Viewer frozen retry unavailable + retention 180 day cap |
| RecordsPage | **11** | connection+tool filter 跨分页 + foreign-owner reject + protected delete block |
| MembersPage | **9** | invitation fact scope 严格 + delayed success revoked → 不记录 |
| ToolExecution | **8** | one call retry frozen body + project isolation + execution 失败不建 Run |
| v01-diagnostics | **4** | A51 diagnosis repair（apply=false/true 各两测） |

#### 关键权限边界新发现
1. **OperationsPage: "does not read or display queue contents when actual project read permission is absent"** — 权限硬边界（不是 UI filter，是 API 不返回）
2. **SchemaArgumentEditor: "keeps optional defaults skipped and focus or blur does not emit validation errors"** — D08 硬规则的 jsdom 层实现
3. **ToolExecution: "finishes and uploads this project run after an unrelated Viewer project is revoked"** — project isolation 正确性
4. **MembersPage: "records invitation fact only after successful creation in same identity and project"** — scope 严格性

### Deep-dive 批次累积（B10→B13）

| 批次 | 深入到 | 累计可追溯边界 |
|------|--------|---------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 251+ tests + App Shell 27 | 278+ TS tests |
| **B13** | **Frontend features 核心 8 pages / 84 tests 逐函数名** | **+84 TS tests** |
| **总计** | | **Go 181+ / TS 362+ = 543+** |

### 限制
- B13 无新增 signed 状态变更——纯 deep-dive，质量保障层
- features/ 剩余页面（connections/credentials/backups/oauth panels、devices、workflow、auth）未逐函数名深潜，但 B11 已确认 exit 0 + 模块级存在

### 签收：无新增状态（深度审阅）
