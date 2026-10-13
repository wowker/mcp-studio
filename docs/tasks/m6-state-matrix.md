# M6 · 正式页面状态矩阵

范围：T31a/b，设计交付 11 的 P01–P26；正式入口 `apps/web`。本表登记当前生产组件与组件回归，原型 `uiState`、209 项历史模型证据均不抵扣正式验收。A29 / A51–A60 仍需候选实现版本及统一门禁 / 浏览器联验，不能仅凭本表签收。

状态约定：L=真实请求或提交 pending（禁止重复）；E=真实空对象及下一步；N=筛选无结果及清除；X=错误及作用域内重试（表单原输入保留）；F=真实 API 拒绝/当前能力不可用（不显示敏感内容，返回目录/联系维护者）；M=对象不存在/不可访问（返回来源，不猜测替代对象）；R=只读及理由。N/A 后给出结构依据。公共加载/错误由 `shared/ui.tsx` 的 QueryFeedback/Feedback 承载；业务页明确传入返回动作，`forbidden/not_found` 有返回动作时不展示重复查询，网络等可同时显式重试与返回，权限最终仍由平台/Agent 检查。页内表单取消只关闭编辑，不能宣称撤销已发出的服务端请求。

| 页面 | 生产入口 / 实际组件 | L | E / N | X / 恢复 | F / M / R |
| --- | --- | --- | --- | --- | --- |
| P01 身份流程 | `login/initialize/register/forgot/reset/verify` → IdentityPage | bootstrap/session/邀请查询、各提交 pending | E/N N/A：身份表单不是集合；空输入原地校验 | 登录/验证码/邮件失败保留当前输入；登录、重设、验证分开；邀请查询失败就地重查同 ID | F：一次性初始化关闭、邀请身份校验；M：失效邀请说明并返回登录；R N/A：身份动作不是内容编辑 |
| P02 账号与会话 | `account` → App 账号区域/退出确认 | session refresh、退出 pending | E/N/M N/A：当前会话仅已认证用户存在 | 会话故障重查；退出失败保留会话和待上传说明 | F：到期遮蔽工作区，重新登录；R N/A：只展示本人身份及会话操作 |
| P03 项目目录 | `projects` → ProjectDirectory + App 项目 query | 目标团队目录请求 | E：空项目→有权者创建；N：搜索无结果→清除 | 同团队 query 重试，搜索保留 | F：目录 API 拒绝；M N/A：集合不指单对象；R：非 Owner/Admin 无创建动作 |
| P04 创建项目 | `create-project` → ProjectDirectory | POST pending | E/N/M N/A：新对象表单 | 重名/网络失败保留名称描述；取消→目录；成功→真实空项目 | F：实际团队角色拒绝，不退化成目录假成功；R N/A：无权者不能提交 |
| P05 起始/项目流程 | `project-flow` → WorkflowPage（M6正式接入） | 项目/连接/记录真实 query | E：无连接→配置；N N/A：进度无搜索 | 步骤按同项目/连接/Run，失败调用/上传失败不完成 | F/M：项目门控隐藏上下文；R：Viewer只读及不可执行理由 |
| P06 项目访问/接管 | `project` 无内容权→ProjectAccess | 接管 POST、管理审计 query | E：无管理记录；N N/A：无过滤 | 接管失败保留原因与确认；审计只重试审计 | F：无成员关系只显示目录关系；Admin不自授；M：项目 query返回目录；R：无接管能力的访问说明 |
| P07 成员/邀请列表 | `members` → MembersPage / InvitationList | 项目成员/团队成员/邀请列表 query | E：成员/邀请空态→允许创建邀请；N：局部筛选清除 | 列表失败同项目/团队重试；切局部页不沿用旧集合 | F：真实权限变化；M N/A：集合；R：普通成员无管理动作 |
| P08 成员详情 | MembersPage 选择→MemberEditor | PATCH/DELETE pending | E/N N/A：已选成员对象 | 修改/移除失败保留角色与确认；取消移除不发送 | F：旧管理权失效拒绝；M：成员消失返回成员列表；R：本人/Owner/最后维护者及角色限制 |
| P09 创建邀请 | MembersPage→InvitationEditor | POST pending | E/N/M N/A：新邀请表单 | 邮件/网络/校验失败保留邮箱/角色/期限；取消返回来源 | F：当前项目管理能力及团队授予边界；R N/A：无权不能创建 |
| P10 邀请详情/接受 | `invitation` → IdentityPage；管理端InvitationList | 公共邀请 query、接受/重发/撤销 pending | E/N N/A：邀请对象/动作 | 原邀请 ID 身份修复，不自动接受；终态无接受；查询失败重试同 ID | F：匹配邮箱/验证/真实权限；M：无效邀请不伪造空邀请；R：过期/撤销/替代只读状态 |
| P11 连接配置 | `servers` → ConnectionsPage / ConnectionEditor | 三域 query、保存/连接 pending | E：无服务→维护者创建；N N/A：连接侧栏无搜索 | 草稿保存失败保留；冲突比较/重载/显式合并；修复引用不自动连接 | F：项目内容拒绝；M：显式连接 ID 失效→服务入口，不能报空；R：Viewer/Developer共享配置只读 |
| P12 授权/凭据 | ConnectionEditor→AuthorizationPanel / AgentCredentialsPanel / AgentOAuthPanel / AgentBackupsPanel | OAuth、凭据保存、备份分别 pending | E：未授权/无备份有明确动作；N N/A：无过滤 | 授权与凭据保存/备份失败独立，保存重试不重调用；秘密仅内存输入 | F：本人+项目+连接；M：当前连接失效返回服务；R：Viewer无个人执行授权动作 |
| P13 Agent | `devices` → DevicesPage；连接→AgentConnectionPanel | probe/pair/confirm pending | E：未配对→检查/配对；N N/A：单设备通道 | 离线/拒绝/过期/不兼容真实状态；用户显式重查/刷新配对；恢复不连MCP | F：Host/Origin/身份联合校验；M N/A：本机通道无平台对象详情；R N/A：配对身份不授予项目内容权 |
| P14 环境变量 | `environment` → EnvironmentPage / AgentEnvironmentPanel | 环境/连接/变量 query，保存/应用 pending | E：真实无定义→维护者创建；N：过滤无结果→清除过滤 | 失败不得当空表；重试保留过滤/环境/连接；四层解析错误定位所属定义 | F：项目门控；M：失效环境/连接明确说明，选择基础/项目范围要显式；R：Developer可个人值，Viewer只读 |
| P15 变量编辑 | EnvironmentPage→VariableEditor | POST/PATCH pending | E/N N/A：由已查询对象/创建动作进入；M：编辑对象被删以API not_found呈现，取消回来源；新建对象M N/A | 输入保留；版本冲突比较/重载/显式合并；取消返回当前环境 | F：维护者共享编辑及API复查；R：无权入口不可用 |
| P16 个人值/备份 | PersonalValueEditor / AgentPersonalValueEditor / AgentBackupsPanel | 本机保存/备份/恢复分别 pending | E：缺值/无备份→本人配置；N N/A：无筛选 | 解析/保存失败保留内存输入；恢复密码重新验证；删除本机/备份/上游分开 | F：本人+项目+变量定义/连接；M：定义或连接失效回环境；R：共享定义不显示个人秘密 |
| P17 工具调试 | `tools` → ToolsPage / SchemaArgumentEditor / ToolExecution / AgentToolExecution | 工具列表/校验/执行独立 | E：无服务→服务；未连接→配置；无工具/未选Tab；N：工具搜索清除 | Tool列表重试保留搜索/Tab；执行失败不自动重试；取消结果可能未知；JSON错误保留原文 | F：执行角色+平台准入；M：旧连接/移除工具说明；R：Viewer不执行/授权 |
| P18 工具定义 | 当前工具Tab→定义details | N/A：复用当前工具列表 query，无第二次详情请求 | E/N N/A：已选定义对象 | 列表重载/定义版本变化提示，草稿保留 | F：项目门控；M：移除工具保留已持有定义并标记；R：定义本身只读 |
| P19 工具历史/详情 | ToolExecution / AgentToolExecution→RecordsPage(scope) / RecordDetail | 限定连接+工具 query | E：无历史→同工具调试；N：清除本scope过滤 | list query重试保留scope/分页；详情返回同scope | F：真实记录权限；M：不可访问详情返回工具记录列表；R：Viewer/非本人动作限制 |
| P20 工具保存/保存页 | 同一Tool scope→RecordsPage(saved)/SaveRecordEditor | 列表/策略/保存 pending | E：无保存→当前工具保存动作；N：清除本scope过滤 | 保存来源冻结；失败重试只上传同operation；表单保留 | F：本人可见范围/执行角色；M：详情失效返回当前工具已保存；R：未完成草稿不发布 |
| P21 项目历史 | `history` history→RecordsPage | 项目范围记录 query | E：无历史→工具；N：清除筛选，非创建提示 | 重试保留筛选/游标；时间区间错误不发query | F：真实项目记录权限；M N/A：集合；R：固定仅维护者、保护pending记录 |
| P22 项目已保存 | `history` saved→RecordsPage | 保存集合 query | E：无保存→工具/历史来源；N：清除筛选 | 与工具scope独立过滤/分页；本人上传失败仅重传 | F：私有/项目查询权；M N/A：集合；R：不可写说明 |
| P23 历史详情 | `history&record=...` → RecordDetail | 记录/审计 query | E：无审计；N N/A：单详情 | 获取失败重查同ID；恢复失败保留源；追加脱敏原因按项目+记录隔离 | F：不可读不渲染快照；M：失效/跨scope返回来源列表；R：冻结快照不可修改 |
| P24 保存详情 | RecordsPage saved详情→RecordDetail | 记录/审计 query | E：无审计；N N/A：单详情 | 来源历史删除仍读独立快照；失败重试不换ID | F：私有记录不泄漏；M：当前保存失效返回列表；R：非本人/Viewer限制 |
| P25 保存/元数据编辑 | SaveRecordEditor / AdditionalRedaction | 策略query/独立operation pending | E/N N/A：必须由已持有合法来源进入；M：元数据目标被删由API拒绝，取消回来源；新保存目标M N/A | 失败保留元数据/原因；新保存和元数据修订独立identity；冲突显式重载 | F：所属项目/本人/可发布范围复查；R：非法JSON阻断，Schema错仅私有未完成 |
| P26 记录与设备 | `operations` → OperationsPage / AgentQueuePanel / CapacitySection | 队列读取/保留策略/容量query | E：本人责任端无待上传；N N/A：队列分页无搜索 | storage损坏/配额/网络失败可管理且不静默删；上传只重传；策略冲突保留draft | F：本人/所属项目实时权限；M N/A：队列集合，单operation消失动作中再次校验；R：Viewer不能重传；待上传/上传中保护 |

## 本轮审计与证据

本切片已修复下表缺口并保留真实RED/GREEN日志；集合加载不再伪造empty，未登录邀请也显示查询异常。13 个focused文件、69 个测试实际通过，最终命令与结果在 `tests/evidence/m6-states/focused-final.log`。范围仅正式组件回归，不能代替服务端权限、浏览器或实机集成证据。

| 切片 / P映射 | 实际修复与回归 | 证据 |
| --- | --- | --- |
| 服务旧链接 P11–P12 | 显式失效ID即使集合为空仍missing；清失效ID回服务；过期的记忆选项回真实第一项 | `connections-red.log`、`environment-connections-green.log`；ConnectionsPage.test 11项 |
| 环境 P14–P16 | 所有必要query成功才render ready表格/动作；网络故障不empty；无匹配过滤→清除；旧连接不降成项目scope | `environment-red.log`、`environment-connections-green.log`；EnvironmentPage.test 8项、VariableEditor.test 4项 |
| 成员邀请 P07–P10 | 局部搜索空结果；对象消失返回来源；失败保留邀请输入；实际POST+匹配user/project/canManage才发创建事实，delivery失败仍不算送达 | `members-red.log`、`members-green.log`、`focused-final.log`；MembersPage.test最终7项 |
| 身份 P01/P10 | 未登录失效邀请返回登录；同邀请网络重试保留邮箱/密码，注册query未确认时禁止提交 | `identity-red.log`、`identity-green.log`；IdentityStates.test 2项 + IdentityPage.test 3项 |
| 创建/Agent恢复 P04/P12/P13/P16 | 非管理者create-project深链明确拒绝；同pending challenge及备份/恢复网络失败保留内存输入，成功/终态/作用域变化清除秘密 | `recovery-red.log`、`recovery-green.log`；Projects.test 1项、DevicesPage.test 3项、AgentBackupsPanel.test 4项 |
| 记录空态 P19–P22 | 真空集合进入同连接工具；筛选无结果只清筛选，不引导新调用；原筛选/分页/失败冻结重试回归继承 | `records-red.log`、`records-green.log`；RecordStates.test 3项、RecordsPage.test 8项 |
| 公共状态 P01–P26适用query | back由业务传入；F/M只返回，不重复重试；network显式retry+back；不改useQuery身份/授权fence | `shared-query-red.log`、`focused-final.log`；QueryFeedback.states.test 3项；OperationsPage.test 12项 |

最初connections/members的GREEN尝试曾因测试名称误写或未模拟创建后列表而失败；保留原RED日志，最终修正测试观察条件后通过，未删实现断言或降低门禁。P02 App会话/访问门控、P05 WorkflowPage、P17–P18工具分栏、P23–P25详情事实接线由主任务/其他切片完成和统一验证。本表映射组件实际承载方式：邀请管理详情为列表行/页内确认，变量编辑及定义为领域内视图，不伪称每个P编号都有独立正式深链接。

组件回归证据目录：`tests/evidence/m6-states/`。完整 verify、真实PG、A60/生产浏览器与中英亮暗窗口联验由主任务统一执行和登记。T02完整矩阵、T25b人工实机配对、T28a真实OS凭据库、T29b备份介质及其他人工实机路径保持待验，不新增支持声明。

主任务审阅新增回归：App独立bootstrap请求freshness、deadline错误恢复、initial session迟到401/成功、canonical path邀请明确离开；环境同项目路由/back同步真实connection/environment，保留各scope草稿/过滤、清旧personal/confirm并隔绝旧冲突回调。EnvironmentPage最终14项，主任务App19项已观察通过，最终总门禁另记。Tools/Workflow查询拒绝与missing也已接入back，窄屏成员/邀请/环境表格使用640px局部滚动region，适用区域键盘可聚焦。

最终文案补充：记录failed拥有独立`recordRunFailed`（调用失败/Failed），不复用邀请邮件投递failed。列表status筛选、行状态和SnapshotView上下文统一，双语回归及真实失败Tool场景覆盖；邮件仍保留原邮件状态语义。最终实现fc0b161（M6主实现5a07743），精确最终门禁签收见执行账本末尾。

统一门禁最终实际退出0：前端57文件/591测试、真实PG Go测试/vet/构建、26条生产浏览器全部通过。正式37个领域子视图及初始化矩阵验证；具体结果见m6-final/manifest.json及执行账本。仅自动可执行联验，T02/实机/人工/介质和A项正式验收仍待验。
