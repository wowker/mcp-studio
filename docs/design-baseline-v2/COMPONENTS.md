# 工作台标准组件与复用约定

Baseline 2 补充：用户已确认 D01–D15，新增的未完成草稿、维护者固定、本人队列重试、Owner 接管、凭据恢复及冲突 / 配额状态见 [交付组件规范](./design-handoff/03-components-and-visual-spec.md) 与 [已确认规则](./design-handoff/08-decision-proposals.md)。下面保留既有原型组件契约；发生差异时以新交付规则为准。本轮没有修改原型组件。

状态：设计原型的组件契约。正式前端采用 TypeScript + React，遵循项目现有 primitives、Phosphor 图标、语义 tokens 与共享 i18n；不增加第二套设计系统。

## 已拆出的预览组件

主原型通过 `workbench-components.js` 使用以下九个无业务状态的组件，基础样式在 `workbench-components.css`，管理页面组合样式在 `workbench-management.css`。共享调用历史表同时服务于项目总历史与当前工具历史。它们可单独修改和验证；主页面负责授权、路由、数据范围和命令执行。

| 预览函数 / 正式组件名称 | 输入 | 标准状态 | 复用位置 |
| --- | --- | --- | --- |
| `pageHeading` / `ManagementPageHeader` | 单语标题、说明、图标、操作槽、可选上下文 | 宽 / 窄、无操作、禁用操作、亮暗 | 服务、执行设置、环境、总历史、已保存、团队、页内编辑 |
| `sectionHeading` / `FormSectionHeader` | 分区序号、标题、说明、辅助状态 | 说明缺失、辅助徽标、亮暗 | 服务配置、变量编辑、团队邀请 |
| `account` / `AccountControl` | 用户名、头像缩写、角色；正式版本通过事件打开账户入口 | 完整文字、紧凑头像、键盘聚焦 | 所有页面右上角 |
| `appearance` / `AppearanceControls` | 当前 locale、主题；正式版本提供受控变更事件 | 中文 / 英文、亮色 / 暗色、收起侧栏 | 应用侧栏底部 |
| `documentTabs` / `ToolDocumentTabs` | 当前连接的 Tab 列表、activeId | 当前、非当前、固定、运行、恢复草稿、横向溢出 | 工具工作区 |
| `tabMenu` / `ToolTabMenu` | 已计算的命令列表、tabId | 禁用、选中固定项、焦点、边缘定位 | 每个工具 Tab 右侧 |
| `savedRecordTable` / `SavedRecordTable` | 已授权且限定作用域的记录、scoped | 私人 / 项目、请求 / 请求响应、空、筛选 | 总已保存、当前工具已保存 |
| `recordSnapshots` / `RecordSnapshots` | 参数 HTML、响应 HTML 与是否有响应 | 只读、有响应、无响应 | 保存预览、保存详情 |
| `historyTable` / `CallHistoryTable` | 已按权限和范围筛选的记录、selected、scoped | 成功、失败、取消、固定、空列表、只读 | 总历史、当前工具历史 |

预览通过注入 `escape / icon / t / button / iconButton / badge` 复用基础能力。正式 React 实现使用现有组件和 Hook，不直接沿用字符串模板代码。组件不能自行读取全局项目状态、查询全项目历史或从 URL 推断认证。

## 调试核心组件的正式开发边界

以下为下一阶段的组件规划；尚未从正式客户端中实现或发布。

| 组件 | 责任 | 受控输入与输出 |
| --- | --- | --- |
| `WorkbenchShell` | 可收起侧栏、连接栏、账户入口、页面容器 | projectId、connectionId、用户权限、collapsed；导航事件 |
| `ConnectionContextBar` | 服务选择、环境、认证归属、权威连接状态 | connectionId 与当前会话；选择连接、连接 / 断开事件 |
| `ToolCatalog` | 搜索、分类与选择工具 | 工具定义列表、选中项、query；选择事件 |
| `DebuggerLayout` | 上下请求与结果分栏，独立滚动，拖动及键盘调节 | request / result 槽位、splitPercent；比例变更 |
| `SchemaArgumentEditor` | Form / JSON、嵌套结构、数组、字段路径和错误 | Schema、草稿原文、解析值、错误；草稿变更与校验结果 |
| `RunResultViewer` | 结果、JSON、调用详情，成功 / 失败 / 取消与过期结果提示 | 执行快照、当前草稿版本；切换视图与复制脱敏结果 |
| `ToolHistoryPage` | 当前工具的列表与只读详情页面 | projectId + connectionId + toolName、分页、筛选；选择与恢复事件 |
| `CallSnapshotViewer` | 只读请求、响应与协议快照 | runId 与已授权且已脱敏的快照；用于两种历史详情 |
| `SavedRecordTable` | 当前工具或项目的已保存集合 | 已授权且限定作用域的记录；选择事件 |
| `RecordSnapshots` | 保存页和保存详情中的只读参数 / 响应 | 请求、可选响应、响应缺失状态；不伪装成当前执行结果 |
| `RecordSavePage` | 页内名称、备注、范围和保存状态 | 冻结快照、元数据草稿、权限、错误；保存 / 取消事件 |
| `PlatformRecordStatus` | 与执行状态分开的平台记录状态 | recorded / pending / failed；仅重传记录事件 |
| `ExecutionRouteSelector` | 协议和执行通道选择、stdio 兼容约束 | transport、channel、连接状态；选择事件 |
| `LocalAgentStatus` | 设备状态及页内配对说明 | deviceId、配对 / 在线状态；配对、恢复事件 |
| `StdioCommandFields` | 命令、字符串数组参数和本机工作目录 | 命令草稿、错误；变更、校验事件 |
| `CredentialStorageSettings` | 会话 / 本机凭据库与个人平台备份选项 | channel、storage、备份状态；变更、独立确认事件 |
| `RecordingPolicySummary` | 平台记录内容、范围和重传语义 | 记录策略；无执行行为 |

组件的规模按领域职责划分，不把整个 Tools 页面包装成一个组件。Shell、Tabs、Layout 属于工作区层；Schema 编辑器和快照展示属于调试领域；基础按钮、表格、菜单和状态徽标继续复用现有 primitives。

## 状态与命令约定

- Tab 身份包含项目、连接、Tab ID；命令明确携带目标 Tab ID。对非当前 Tab 打开菜单不会改变正在编辑的草稿。
- 固定项位于当前连接的前部，左右移动限制在各自固定分组内。批量关闭只处理当前连接中未固定、未运行的 Tab。
- 复制 Tab 只复制参数、编辑模式与原文草稿；生成新 ID，执行结果和 running 状态不继承。
- 历史组件接收已筛选的记录。工具历史查询以 `projectId + connectionId + toolName` 为约束，禁止靠 URL 相同判断连接相同。
- 恢复历史参数生成新的个人草稿，经过检查后再执行；历史快照保持只读。
- 主题、语言是应用偏好；业务草稿、凭据和响应不进入浏览器偏好存储。正式实现的账户偏好由用户设置管理。

## 独立开发与管理方式

管理页面补充以下设计组件；当前均为原型契约，未建立正式组件目录：

| 组件 | 责任 | 受控输入与输出 |
| --- | --- | --- |
| `ManagementPageHeader` | 页标题、说明与主操作 | 文字、图标、操作槽；无查询行为 |
| `MasterDetailLayout` | 左侧列表、固定详情头、滚动内容与操作尾部 | 主 / 从槽位、选中身份；窄屏布局 |
| `FormSectionHeader` | 序号、标题、说明、状态 | 统一视觉层级；不管理字段状态 |
| `VariableTable` | 变量名称、遮罩值、类型、范围和来源 | 已解析且已脱敏的变量；编辑事件 |
| `VariableEditPage` | 完整变量编辑与局部错误 | projectId、profileId、connectionId、variableId、草稿；保存 / 取消 |
| `InvitationPage` | 邮箱、团队角色、初始项目与项目角色 | 已授权项目、草稿、提交状态；创建 / 取消 |
| `AccessPreview` | 所选角色的实际能力与邀请有效期 | 团队角色、项目角色、项目；纯只读说明 |
| `ManagementFormFooter` | 固定保存或邀请操作及会话说明 | 受控可提交状态、错误 / pending；提交 / 取消 |

这轮 `workbench-management.js` 仅演示页内草稿管理；`pageHeading` 和 `sectionHeading` 已供多个原型页面复用。模型检查：`node docs/redesign/verify-management-model.mjs`。浏览器验收与截图见[管理页面统一设计](./2026-10-12-management-design.md)。

正式版本按上述名称建立组件目录，每个目录维护组件、受控类型、样式及行为测试。沿用现有仓库的组件展示基础设施；若暂无展示工具，先增加本地组件预览页，不为此引入新依赖。组件预览必须能选择两种语言、两种主题和窄 / 宽容器。

每个组件需要展示正常、空、loading、error、disabled 等适用状态；Tab 额外展示运行与固定，结果额外展示取消与草稿版本变化，编辑器额外展示非法原文和嵌套字段。组件完成后进入组合页面验证，不能只依据静态组件截图验收。

交互组件采用受控 props 与事件；项目查询、执行状态和权限由 feature 容器与共享 runtime schemas 管理。正式异步历史还需要 loading、分页、重试和失去权限状态，原型中的内存表格不替代它们。

## 通用验收

- 使用统一语义 tokens，颜色和布局样式不散落在业务处理器中。
- 单一当前界面语言；原始 Tool 名、参数名、用户配置名、服务响应保持原值。
- 图标按钮有可访问名称；收起导航仍能通过键盘和读屏识别四个模块。
- 菜单支持方向键、Home / End、Escape；Escape 回到触发器，Tab 继续导航；点击编辑区关闭菜单但不抢走输入焦点。
- 切换主题与侧栏不会重建编辑器或丢失输入；切换语言保留草稿与运行状态。
- 页面层验证项目 / 连接 / Tab / Run 隔离；后端必须独立验证租户权限与认证归属。

当前原型回归命令：`node docs/redesign/verify-workbench-controls.mjs`。正式组件的交付还须运行仓库前端规范规定的测试及 `npm run verify`。

新增记录流程由 `workbench-records.js` 独立管理，`workbench-components.js` 复用列表和双栏快照。专项验证命令：`node docs/redesign/verify-workbench-records.mjs`。完整流程与平台数据契约见[平台历史与已保存记录](./2026-10-10-platform-history-and-saved-records.md)。

参数输入区已独立拆为 `workbench-parameters.js` 与 `workbench-parameters.css`，通过注入共享 validator 管理渲染 / 输入适配，参数状态仍归对应 Tab 所有。`preview-schema-entry.ts` 是共享运行时校验器的浏览器入口，由 `build-preview-schema.mjs` 生成本地 bundle。正式 `SchemaArgumentEditor` 的尺寸和跳过规则见[参数输入区契约](./2026-10-10-schema-argument-editor.md)，专项验证：`node docs/redesign/verify-workbench-parameters.mjs`。

## Tools 完整状态补充（2026-10-12）

沿用已有布局及组件分类，新增受控组件契约：

| 组件 | 输入与输出 | 边界 |
| --- | --- | --- |
| `NestedObjectFields` | Schema、路径、值、skip / null / touched；变更事件 | 不拥有跨 Tab 草稿；不生成网络请求 |
| `ArrayItemEditor` | 数组 Schema、值、项展开状态；增删 / 变更事件 | 新行先待输入；执行时完整校验 |
| `ParameterIssueList` | 共享校验器的路径和错误；定位事件 | 展开祖先区域并聚焦字段或对象组 |
| `ExecutionStatePanel` | Run 身份、阶段、等待时间、冻结参数；取消事件 | 取消不等于远端回滚 |
| `ToolErrorPanel` | 工具 / RPC / 认证 / 连接 / 超时错误；手动恢复事件 | 只读历史模式不展示执行按钮 |
| `PlatformRecordStatus` | queued / uploading / recorded / failed；上传 / 重试事件 | 与执行状态独立；绝不再次调用工具 |
| `HistoryRestoreNotice` | 来源记录 ID、是否执行 | 创建新草稿，原快照只读 |

`workbench-debugger.js` 是内存模拟模型及视图，不是正式 MCP 执行服务。`workbench-parameters.js` 负责复杂参数视图和输入适配；所有 Schema 规则继续通过共享 validator 判断。焦点、原文、参数滚动位置和数组项展开状态在交互刷新后保留。新增状态说明与示例截图见 [完整调试交互设计](./2026-10-12-tools-debugger-states.md)，模型检查：`node docs/redesign/verify-debugger-model.mjs`。


## 服务配置与授权补充（2026-10-12）

| 组件 | 受控状态与事件 | 边界 |
| --- | --- | --- |
| `ConnectionConfigForm` | 协议、通道、地址 / 命令、环境、草稿、字段错误；保存事件 | 保存配置不发起连接；HTTP / stdio 字段互斥；值保留在草稿 |
| `ConnectionStatusPanel` | 连接身份、尝试 ID、已保存快照、阶段和错误；连接 / 取消 / 重试 | 不在内部拥有 MCP 客户端；迟到结果由状态模型过滤 |
| `LocalAgentPanel` | 来源、设备、配对状态、能力；确认 / 取消 / 重连 / 解除 | 设备配对与 MCP 会话分别呈现；不启动进程 |
| `AuthorizationFlow` | 当前用户 + 项目 + 连接、授权尝试、权限、状态；授权 / 取消 | 不按 URL 共用授权；不显示原始 Token |
| `CredentialStoragePanel` | session / local、保存代次、备份确认、保存 / 备份状态；保存 / 重试 / 移除 | 个人备份和本地保存独立；备份重试不重新执行 MCP |
| `SafeConfigPreview` | 已保存配置快照 | 排除凭据、个人授权、配对数据和启动参数值 |

主预览使用 `workbench-connections.js` 和 `workbench-connections.css`，只处理内存示例与模拟阶段。旧 `workbench-execution.js` 保留为历史参考，不再加载。新增组件仍复用工作台页面 / 分区标题、表单、标签、按钮与 tokens。完整约束见 [服务配置与授权设计](./2026-10-12-server-authorization-states.md)。正式组件的实现、运行时校验器和工程验证在后续开发阶段进行。


## 环境变量完整状态补充（2026-10-12）

| 组件 | 受控输入与事件 | 边界 |
| --- | --- | --- |
| `EnvironmentNavigator` | 环境列表、预览环境、会话环境、连接状态；预览 / 应用 | 浏览不更改会话；连接中禁用应用 |
| `VariableTable` | 定义或解析结果、作用域、搜索、过滤；定位 / 编辑 | 生效值去重，定义保留继承来源；只显示脱敏值 |
| `ResolutionChain` | 有序候选、生效身份、可操作权限；覆盖 / 删除确认 | 不在组件中自行推断优先级；缺失值不偷偷回退 |
| `VariableEditor` | 草稿身份、类型、个人值模式、字段错误；保存 / 取消 | 保留原环境；个人值模式不能改共享定义 |
| `EnvironmentValidation` | 引用路径、使用位置、错误码；修复 / 新建 | 与连接和执行前检查复用同一模型；0 / false 有效 |
| `PersonalSecretPanel` | 用户 + 项目 + 变量 ID、可用状态、位置、备份阶段；示例更换 / 移除 / 备份 / 恢复 | 不接收真实凭据；备份失败不改变本机值；敏感派生值同样脱敏 |

视图和内存模型位于 `workbench-environments.js`，样式位于 `workbench-environments.css`。设计稿中的标准组件是后续开发的复用契约，不代表正式组件已经开发完成。完整交互见 [环境变量设计](./2026-10-12-environment-states.md)。


## 调用历史与已保存记录补充（2026-10-12）

| 组件 | 受控输入与事件 | 边界 |
| --- | --- | --- |
| `HistoryFilterBar` | 项目 / 连接 / 工具范围、搜索、条件、排序、分页；筛选 / 重置 | 总历史与各工具筛选独立；回列表保留；不把参数写入 URL |
| `RecordCollectionTable` | 已授权记录、结果状态、上传状态；详情 / 固定 / 重试 | 执行结果与记录状态分列；不在表格内执行工具 |
| `RecordDetailPage` | 记录身份、只读快照、当前环境；页签 / 来源 / 恢复 | 全页面；失效来源不影响已保存快照；页签支持键盘 |
| `RedactedSnapshotPanel` | 统一脱敏后的参数 / 响应 / 协议、路径、缺失状态；复制 / 追加规则 | 所有输出共享规则；追加不能撤销自动脱敏；区分 null、无响应和仅请求 |
| `RecordUploadStatus` | 项目 + 连接 + 记录 ID、尝试次数、进行中 / 失败；重试 | 同一 ID 幂等语义；只传快照，不执行工具；上传中锁定修改 |
| `SavedRecordEditor` | 冻结来源、名称、备注、范围、校验；保存 / 取消 | 默认本人；元信息编辑不改快照；独立上传状态 |
| `HistoryRestoreNotice` | 来源、移除参数名、当前环境；进入新草稿 | 脱敏参数不作为真实值恢复；无旧响应，不自动执行 |

这是设计组件契约与内存原型，不是正式工程组件开发。完整状态与复核路线见 [历史与已保存交互设计](./2026-10-12-history-saved-states.md)。


## 项目与团队完整状态补充（2026-10-12）

| 组件 | 受控输入与事件 | 边界 |
| --- | --- | --- |
| `ProjectDirectory` | 可见项目、当前身份、项目计数、搜索；创建 / 切换 / 管理成员 | 项目切换不复制草稿、授权或触发执行 |
| `ProjectCreateForm` | 名称、描述、验证及保存阶段；提交 / 取消 | 创建空项目；创建者成为维护者；重复提交保护 |
| `MembershipTable` | 团队 / 项目范围、已授权成员、角色筛选；查看详情 | 团队角色与项目角色分别呈现 |
| `MemberAccessEditor` | 成员 ID、项目 ID、权限草稿、角色边界；保存 | 保留其他项目角色；保护本人、所有者及最后维护者 |
| `InvitationEditor` | 邮箱、目标项目、授予角色、有效期、字段错误；创建 | 提交前展示权限；未接受不产生成员关系 |
| `InvitationStatusPage` | 邀请 ID、有效状态、受邀账号状态、操作阶段；接受 / 撤销 / 重发 | 接受前复核账号和有效期；幂等加入；新邀请替代旧身份 |
| `MemberRemovalConfirmation` | 成员、范围、影响及操作状态；确认 / 取消 / 重试 | 项目移除与团队移除分离；不删除历史署名 |
| `RolePermissionMatrix` | 团队与项目能力集合 | 权限文字说明不能代替正式服务端授权 |

组件是设计阶段复用契约，原型只有内存状态。详细权限及生命周期见 [项目与团队设计](./2026-10-12-project-team-states.md)。


## 跨页面流程补充（2026-10-12）

| 组件 | 受控输入与事件 | 边界 |
| --- | --- | --- |
| `ProjectWorkflowOverview` | 项目、当前连接、成员与邀请、配置与变量状态、最新调用及保存记录；步骤导航 / 可选跳过 | 只计算进度，不创建业务状态；可选步骤不伪造完成 |
| `WorkflowContinuationBar` | 当前项目进度及下一步骤；概览 / 下一步 | 不改变既有页面布局与滚动所有权；保留当前服务和草稿；保存页重复进入不重建草稿 |

流程模型不负责执行、上传或权限判定；这些仍由各自原型模块处理。完整走查与身份契约见 [完整流程设计](./2026-10-12-complete-workflow.md)。

### StateFeedback / StatePreview / ReadOnlyNotice

原型共享状态模块位于 `workbench-states.js` / `workbench-states.css`，文案位于 `state-locales.js`。统一图标、标题、原因、恢复动作和列表骨架。StatePreview 仅用于设计评审，按页面完整上下文隔离且不修改数据；正式实现应由真实加载/权限状态驱动。ReadOnlyNotice 与“完全无访问权限”分开表达。

### Layout sizing and scroll ownership

`workbench-layout.css` 汇总原型的容器收缩、按钮换行、表格焦点、窄屏过滤器和结果栏布局。状态容器不重写 `.page` 的高度；页面保留独立滚动所有者。主入口按页面完整身份保留原生滚动位置，语言与主题变更不切换业务上下文。

## Baseline 2 补充组件合同

全部仍为设计合同与静态示例。正式组件在独立工程实现。

| 区域 | 责任与状态 |
| --- | --- |
| AccountSessionPage / IdentityFlow | 初始化、登录、验证、找回；与 MCP 授权分离；会话遮蔽、同身份恢复与退出前队列决策 |
| ProjectAccessPanel | 未加入项目内容拦截，Owner 原因确认与接管审计，Admin 不自助加入 |
| DeviceRecordQueue | 本人责任端队列、在线 / 离线、刷新恢复、满额阻止、同快照重试 |
| CredentialRecoveryPanel | 备份归属、重新验证、恢复目标、过期 / 失败、删除备份和撤销授权分离 |
| ProcessLaunchReview | 执行配置快照、有效变量名、首次 / 变更再确认，不隐式 shell |
| ConfigurationConflictPanel | 本地 / 远端比较，保留草稿，再明确保存；禁止静默覆盖 |
| RecordRedactionRevision | 预览与提交分离、权限、原因、失败重试、关联副本更新、无秘密原文审计 |

静态载体：`workbench-baseline.js`、`workbench-baseline.css`、`baseline-locales.js`，以及对应领域模型；复用现有 pageHeading、button、badge、field 和 notice 表现。
