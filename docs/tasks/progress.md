# M0–M3 执行账本

2026-10-13。T15及M3 T16–T21已逐项实现并验证，代码cf9b6cf；本轮授权完成，未进入M4。T02完整矩阵仍待验。Git 分支 `codex/m0-m1`；设计参考基准提交 `7eac7d4`。下列历史中间状态保留追溯，以末尾最终签收为当前状态。

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
