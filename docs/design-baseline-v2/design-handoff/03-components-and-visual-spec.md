# 03 · 组件与视觉规范

[交付首页](./README.md) · [完整受控组件契约](../COMPONENTS.md)

## 视觉基调

高密度、低干扰的开发者工作台。中性灰白 / 深绿灰底色、低饱和青绿色强调、清晰分割线；不采用营销页大标题、渐变或嵌套卡片。强调色用于选中、聚焦和主要动作。信息层级依赖排列、间距、字号和字重，不能堆叠多个状态徽标。

现有原型是视觉参考；正式组件沿用语义 tokens、系统字体、Phosphor 图标、共享 i18n 和现有 primitives。字符串模板与内存模型可丢弃，不应原样成为正式前端架构。

## 设计 tokens 与几何基线

| 类别 | 规格 |
| --- | --- |
| 间距 | 4 / 6 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px |
| 圆角 | 控件 6；面板 8；浮层 12；状态标签 pill |
| 阴影 | 只用于菜单、Popover、Dialog 等浮层；数据面板无阴影 |
| 字体 | 系统无衬线；工具名、路径、ID、JSON、协议数据使用 mono |
| 字号 | 已确认正文 14 / 1.5、辅助 12、最低 11、页面标题 24、工作区标题 16。当前原型已按此方向统一；新目录仍需独立建立 token 与组件验收 |
| 按钮 / 输入 | 常规输入 36 高；图标按钮标准 32×32，紧凑 28×28；触屏点击目标至少 40×40 |
| 侧栏 | 展开约 192；中等窗口可收至 176；折叠 80 |
| 顶栏 / 底部状态 | 桌面 64 / 24；窄屏顶栏可分行至 100 |
| 工具目录 | 236 默认，204 / 184 紧凑，超宽约 260；窄屏改约 92 高横向目录 |
| 文档 / 结果 Tab | 文档约 44，紧凑 40；结果页签约 36 |
| 参数 / 结果分栏 | 默认参数 52%，可调 30%–65%；提供恢复默认与展开预设 |
| 动效 | 120–180ms；仅 opacity / transform / 颜色等轻反馈；尊重减少动态效果 |

这些数值是容器与密度基线，不允许依照单张截图给整页写死宽高。根容器 `100dvh`，各可伸缩子级允许收缩，内容滚动责任明确。

### 当前原型色板

| 语义 | 亮色参考 | 暗色参考 |
| --- | --- | --- |
| canvas | `#f5f6f5` | `#151b19` |
| surface | `#ffffff` | `#1d2522` |
| surface-muted | `#f7f8f7` | `#232d28` |
| text | `#27312e` | `#e1e9e4` |
| text-muted | `#737d78` | `#a8b8af` |
| border | `#e0e5e1` | `#35423b` |
| accent | `#267565` | `#85cfb5` |
| accent-muted | `#e8f2ee` | `#293f34` |
| success | `#287452` | `#8bcda6` |

颜色通过主题语义层提供，不散落在 feature CSS。warning / danger / focus 等同样使用共享 tokens。颜色参考不代替对比度验收；状态同时有文字或图标，不能只靠红绿区别。

## 组件分层与独立开发责任

| 层 | 组件 | 输入 / 输出和边界 |
| --- | --- | --- |
| 基础 | Button、IconButton、Input、Select、Checkbox、Tabs、Disclosure、Badge、Menu、Table、StateFeedback | 受控值、状态、事件；不查询项目、不处理 MCP |
| 工作台 | WorkbenchShell、ConnectionContextBar、AccountControl、AppearanceControls | 显式项目 / 连接 / 权限 / 语言主题；发出切换事件 |
| 工具导航 | ToolCatalog、ToolDocumentTabs、ToolTabMenu | 已限定连接的定义、Tab 列表、activeId、命令能力；目标 Tab ID 随命令传递 |
| 参数 | SchemaArgumentEditor、NestedObjectFields、ArrayItemEditor、ParameterIssueList | Schema、原文、解析值、skip / touched / null、错误路径；输出变更和定位，不自行调用工具 |
| 调试 | DebuggerLayout、ExecutionStatePanel、RunResultViewer、ToolErrorPanel | Run 身份、冻结快照、当前草稿版本、阶段；取消 / 重新执行事件由领域容器处理 |
| 快照与记录 | CallSnapshotViewer、RecordSnapshots、HistoryFilterBar、RecordCollectionTable、RecordDetailPage、SavedRecordEditor、PlatformRecordStatus | 已授权且已脱敏数据、筛选、上传状态；选择 / 恢复 / 保存 / 仅上传事件 |
| 管理布局 | ManagementPageHeader、MasterDetailLayout、FormSectionHeader、ManagementFormFooter | 标题、说明、内容槽、操作能力；不管理业务持久化 |
| 服务 | ConnectionConfigForm、ConnectionStatusPanel、LocalAgentPanel、AuthorizationFlow、CredentialStoragePanel | 配置草稿、已保存快照、尝试 ID、设备 / 授权 / 保存状态；不能按 URL 推导身份 |
| 环境 | EnvironmentNavigator、VariableTable、ResolutionChain、VariableEditor、EnvironmentValidation、PersonalSecretPanel | 定义、环境、来源层级、脱敏值、引用问题；应用会话与浏览分别发事件 |
| 项目团队 | ProjectDirectory、ProjectCreateForm、MembershipTable、MemberAccessEditor、InvitationEditor、InvitationStatusPage、MemberRemovalConfirmation、RolePermissionMatrix | 可访问项目、成员与角色能力、邀请状态；不能自行扩大角色能力 |
| 引导与通用状态 | ProjectWorkflowOverview、WorkflowContinuationBar、ReadOnlyNotice、StateFeedback | 从业务状态推导进度 / 恢复动作；不能伪造完成 |

设计名称描述责任，不强制每个名称必须独立一个源文件。正式组件目录应包含受控类型、样式、交互说明、代表状态和行为验证。以低层组件、领域组合、页面三层复用；避免把整页封装为一个不可拆分的“大组件”。

## 参数控件规格

| 类型 | 呈现 | 空值 / 校验 / 长度 |
| --- | --- | --- |
| string | 单行；长文本用多行 | 常规最大宽约 640，不无限撑满；按 Schema 的长度 / pattern 校验 |
| number / integer | 短数值输入 | 约 180 宽；保留 0；空输入不变为 0；限制有限值、整数与范围 |
| enum | Select / 少量短选项分段控件 | 约 280 宽；未选择说明明确；不能伪造 Schema 外值 |
| boolean | 清晰真 / 假控件 | false 是有效值；可选省略由独立跳过控制 |
| object | 整行字段组 / 结构与 JSON | 子字段路径完整，祖先可展开，必填组始终可见 |
| array | 整行列表、项序号、增删和折叠 | 空数组与缺少字段不同；新增项先待输入，执行全量校验 |
| nullable | 独立“空值”选择 | null 与 skip 互斥的语义；受 Schema 允许范围约束 |
| JSON | 等宽编辑器、格式化、示例 | 初始约 132 高，最小 120，常规最大 320 后内部滚动；不丢弃非法原文 |

普通字段两列，复杂对象和数组独占一行；窄屏一列。单字段顺序：名称 + 必填星号 + 类型 / 跳过 → 描述 → 约束 → 输入 → 就近错误。错误 summary 用于导航，不重复大段错误内容。

跳过字段清楚显示未参与请求，可随时启用；必填不能跳过。不能仅靠降低对比度让人猜测是否生效。无参数工具最终发送 `{}`，不展示人为必填输入。

## 通用组件状态和行为

- **按钮**：同一区域最多一个主要动作；图标按钮有名称与 Tooltip；进行中不改变宽度、不重复提交；禁用能解释原因。
- **表单**：错误与字段关联；提交聚焦首个错误；取消不保存；页内尾部次要在前、主要在后；失败不清空输入。
- **表格**：操作列右对齐；表头与数据列对齐；hover 弱背景；长 ID / 名称可省略并查看全值；说明自然换行。
- **Tab**：文档 / 局部视图 / 结果页签各占自己的层级，不能多个相似样式挤在同一工具栏。当前项只有一个视觉强调。
- **菜单**：限制在视口内，不被分栏裁切；Escape 关闭回到触发器。非当前 Tab 菜单不切换编辑草稿。
- **状态**：行内 Badge 用短文案；完整诊断留在页内；一次事件不同时堆叠 Toast、Banner 和重复错误段落。
- **敏感输入**：默认遮罩，查看按钮位置固定不影响宽度；只显示有权读取的个人示例 / 值，遮罩不替代授权检查。

## 滚动与响应式

| 区间 / 容器 | 规则 |
| --- | --- |
| ≥1024px | 完整工作台；目录、参数、结果分别拥有主要滚动区；标题与执行操作保持可达 |
| 760–1023px | 收窄侧栏 / 目录，工具栏允许换行，不隐藏核心动作 |
| <760px | 目录 / 服务列表横向条带；内容纵向；复杂表单单列；筛选单列；结果状态与动作分行 |
| 短桌面窗口 | 保留请求 / 结果最小可操作高度，分区容器可纵向滚动，不用压到零高度解决 |
| 数据表 / 文档 Tab / 目录 | 可以局部横向滚动，必须能键盘聚焦；页面本身不能横向溢出 |
| 长说明 / 错误 / 名称 | 说明换行；导航 / 状态栏名称省略并提供全值；不能靠缩小字体解决 |

同一个方向不能由 body 与主容器同时无序滚动。参数滚动不带走文档 Tab；结果滚动不带走其状态栏。滚动缓存按项目 / 连接 / Tab / 记录上下文隔离；语言、主题切换保留位置，换业务对象不复用无关位置。

## 双语、主题与可访问性

- 支持 `zh-CN` / `en-US`；单个界面显示一种语言。字段名、Tool 名、用户内容和服务原始文本不翻译。
- 中文“服务 / 工具 / 环境变量 / 调用历史 / 已保存 / 成员与邀请”与英文 “Servers / Tools / Environment variables / Call history / Saved records / Members & invitations”一一对应；不在标题同时展示两种名称。
- 所有操作、状态、错误、空态、Tooltip 和 ARIA 名称都国际化；切换语言不清空输入。长英文是标准验收内容。
- 浅色 / 深色覆盖所有 surface、输入、原生选择器、菜单、错误和焦点态；不出现深色主体配白色操作尾部。
- Tab 支持方向键、Home / End；菜单 Escape 返回焦点；分栏有 separator 语义及键盘调整。
- 表格滚动区域有可访问名称和焦点；必填 / 错误通过语义关联而非颜色表达。
- Ctrl / Cmd + Enter 只在可执行的调试上下文生效，不能越过校验、权限、运行中或页面状态保护。
- Loading、错误反馈和结果变化使用适合的状态播报；避免读屏重复宣读完整 JSON。

每个标准组件的展示用例至少覆盖中英 × 亮暗 × 宽窄，以及适用的空、加载、失败、禁用、长文本。组合页再验证实际滚动和焦点，不用孤立组件截图替代整页验收。

## Baseline 2 · 组件状态增补

- RecordCollectionTable / SavedRecordEditor 增加“未完成请求草稿”状态：仅本人、合法 JSON、Schema 未通过、可继续编辑、不可发布或执行。
- PlatformRecordStatus 接收队列责任端、记录所有者、平台权限及容量；重试能力不能仅依据可执行角色判断。
- 历史固定按钮接收独立维护者能力；个人收藏与项目保留标记不能混用。
- ProjectDirectory / 成员组合页承载 Owner 接管确认与审计说明；不把普通打开项目动作变成隐式授权。
- StateFeedback / ReadOnlyNotice 增加平台离线阻止新调用、容量不足、会话到期、角色降级等准确原因。
- 配置表单展示版本冲突与比较；Snapshot Viewer 展示截断 / 省略及来源修订状态，不把不完整 JSON 当完整结构。
- CredentialStoragePanel 展示托管密钥备份范围、重新验证后的恢复及三种独立删除 / 撤销动作。

- ConnectionStatusPanel 的诊断动作携带项目 / 连接 / 环境上下文，修复后重算错误，不只跳到模块首页。
- AuthorizationFlow 的引用选项来自当前环境的敏感定义；未解析的已选项保留名称与不可用状态。
- SavedRecordEditor 区分来源 Run、保存记录与本次修订 / 上传；不得把来源上传缓存当作新保存任务。
- 脱敏表单的受控值按项目 + 记录 ID 定位；AccountControl、成员页和项目切换器使用一致的能力状态，角色预览控件不进入正式产品。
- 无内容访问权的 Shell 不渲染服务上下文 / 进度；目录管理权限单独判断。

这些合同已用于静态原型同步；没有创建正式 React 组件。逐页与逐交互索引见 [11](./11-final-delivery-checklist.md)。
