# M0–M3 执行账本

2026-10-13。历史授权 T01–T14，当前追加授权补 T15 与 M3 T16–T21；不进入 M4。Git 分支 `codex/m0-m1`；设计参考基准提交 `7eac7d4`。

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
