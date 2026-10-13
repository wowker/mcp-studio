# T15 / M3 调试与记录工程合同

2026-10-13；当前授权先补T15，再执行T16–T21，不进入M4。继承D01–D15与003状态合同；设计快照不修改。实施版本与实际验证只登记docs/tasks。

## 顺序与身份

先完成T15真实SDK工具分页发现、工具定义和独立Tab命令并验证，再实施T16参数校验；T17接收边界与脱敏先于T18真实执行上传，T19历史、T20保存修订、T21恢复/追加脱敏顺序推进。一次Run、一次上传操作、独立saved record、元数据/追加脱敏修订各有独立ID。用户/项目/连接/Tab/Run不按Tool名称或URL合并。

M3的重试操作仅在本会话内保留冻结脱敏快照；不保存原始请求响应/凭据。IndexedDB队列、刷新恢复、重认证后可靠调度、容量/保留/封存作业均留M4；该阶段不给刷新恢复承诺。Agent的连接、执行和上传认证留M5。平台始终不代调MCP。

## 正式参数校验

T16选定 Hyperjump JSON Schema 1.18.0（浏览器AST解释器）与Go jsonschema/v6，采用正式JSON Schema校验器，支持明确版本的2020-12（MCP未声明时默认）与draft-07；不以M0有限oracle替代生产校验。声明支持范围、格式annotation策略、复杂度边界和可兼容pattern约束；外部$ref和改变$id后的外部引用明确阻止，不请求网络。对象、数组、枚举、nullable、oneOf可表达时结构编辑；anyOf/allOf与复杂局部采用JSON编辑并完整校验。skip、touched、原文、上次可解析值、显式null分别保存；可选项包括嵌套层默认skip，focus/blur/取消skip不新增错误。

## 冻结、结果与脱敏

执行前检查最新平台权限、当前连接配置/Tool Schema/环境；无效草稿不生成Run。冻结后改草稿不变Run；同Tab防重复，运行Tab不可关闭。取消/超时/网络中断保留发送事实与remoteOutcome=unknown，不承诺上游回滚；迟到不改终态。

协议错误、Tool isError、认证失败、网络未知分开。请求/响应/协议正文默认脱敏用于复制、保存、上传，原始响应只在生成会话调试。来源敏感标签+默认规则+项目规则+记录追加路径传播到嵌套/派生回显；无法可靠脱敏的二进制/大正文只留元数据和省略原因。使用结构化脱敏路径/类型，不能凭字符串“***”认定可恢复或缺失。

## 平台记录接口

平台OpenAPI已兼容升级1.2.0：record-uploads接收独立history/saved，record-operations/{operationId}查询本人回执，records列表/详情、revisions元数据或追加脱敏、pin和删除。请求/响应/Schema/协议正文使用JSON编码字符串，沿用valueJSON风格；冻结字符串不再格式化。规范摘要包含完整身份、责任端及冻结脱敏内容，外层安全整数与字符串规范化由Go/TS共同向量证明。回执status为recorded，修订targetKind为revision；摘要证明客户端操作一致性，不是上游执行的签名证明。

数据与幂等回执在同事务写入。先会话与真实project_members权限，再查回执；与成员变更同团队行锁，锁后重读关系。Developer可上传本人Run、创建/修改/删除本人private saved；项目saved发布/写入、pin和清理仅Maintainer；Viewer只读共享及本人private；Owner/Admin目录权限不授权内容或他人private。相同operation同身份同摘要复用回执，异摘要/身份409；修订新operation+If-Match/baseVersion，不修改请求响应。

默认50、最大100稳定(createdAt,id)游标；认证游标绑定用户/项目/种类/规范筛选/highWater，每页SQL过滤本人private与当前权限。记录保留历史连接身份而不使用级联删除配置外键；saved有独立快照，来源历史清理不丢失saved。

追加脱敏在事务内改目标和关联saved副本、递增版本；审计仅人/时间/原因/路径/版本，原因也脱敏，不保留旧秘密正文。返回受影响记录版本，客户端更新/失效缓存；原因草稿按项目+记录隔离，失败保留。同名工具或同URL连接不能替代已失效来源。

恢复只建立新未执行Tab，以当前权限/配置/Schema/环境重新校验；原Tab草稿不动，来源响应只读关联。脱敏/截断项不能作为可发送值，含脱敏标记的顶层参数整体移除并提示。

T02完整Chrome/Edge/OS/公网本地网络授权矩阵继续待验。T15及M3真实受控浏览器证据只证明本次路径，不扩展支持声明。A01–A60保留待验收，分期登记部分实现与证据。

依据：[MCP2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[Ajv Schema](https://ajv.js.org/json-schema.html)、[Go正式Schema校验器](https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6)。引用固定版本语义，不宣称其为最新规范。

T15实现adf6622；真实发现使用SDK Client.request + ListToolsResultSchema，避免SDK listTools隐式Ajv动态编译输出Schema，同时保留边界验证。默认Ajv需要unsafe-eval，不能用于当前严格CSP的动态上游Schema。T16已用独立Worker中的Hyperjump解释器，实际生产CSP浏览器验证通过，禁止http/https/file URI插件及跨文档引用；Worker隔离注册表，1500ms超时终止。cfworker缺少dynamicRef语义，不选作完整2020-12校验器。依据[Ajv CSP限制](https://ajv.js.org/security.html#content-security-policy)、[Hyperjump](https://github.com/hyperjump-io/json-schema)、[MCP可选GET405](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。

## M3 已实施的校验范围与边界

共同Schema新增49向量，并继续运行M0的17条Schema向量；记录共同7条摘要/19条脱敏向量。未声明dialect默认2020-12；draft-07仅明确URI允许。format作为annotation，不强制格式断言；未知keyword/vocabulary/format明确拒绝。支持本地资源、结构递归与dynamicRef；同实例循环/指数引用DAG拒绝。结构模式仅在可无歧义表达时使用oneOf；其余组合完整正式校验，编辑采用局部或整体JSON。便携pattern禁止通配点、\\s/\\S、POSIX、lookaround/backreference等已证明跨端不一致的表达式。

Schema与输入分别1MiB、4096节点、64层；复杂度乘积100000。JSON数字先约束词法尾数128位与指数绝对值324，再按浏览器binary64语义校验，有限下溢归0；原冻结JSON字符串保留。multipleOf使用精确十进制运算，不以epsilon放宽。Go数字边界在进入有理数操作前检查，防极端指数膨胀。响应留存10MiB；超限只保留元数据，但有限结构化输出仍检查outputSchema。平台外层编码请求32MiB预算用于JSON字符串转义，解码后仍检查各正文实际大小，不等于M4项目/队列容量已实现。

协议页保留SDK已解析结果/错误摘要，RPC保留实际错误码；没有伪造原始帧ID、HTTP成功状态或完整传输trace。私有诊断在克隆前限制大小、深度、节点与JSON合法性，不符合时明确省略；UI固定错误代码不携带原始诊断。run结果与upload回执两条独立状态轴。冻结上传只用其所属项目的真实权限，身份代际与项目代际独立；撤销A不丢B的已发出结果。

平台来源证明使用当前项目脱敏规则生成的安全投影；允许JSON键序与binary64等价形式，拒绝篡改及未应用新规则的旧快照。来源敏感标签继续保护新元数据/原因；Schema注释与验证属性名分开，工具名称等自由上下文参与脱敏。追加脱敏同步关联副本与旧审计原因，客户端即使已离开详情也会清除该Run缓存和保存来源。

Cookie客户端不能声称Agent负责history上传（executor_not_authenticated）。测试中已有Agent来源的记录仅用隔离DB合成存档验证浏览器另存的原执行者身份；Agent运行、上传认证与系统凭据库均未实现，留M5。原始凭据与未脱敏正文不进入浏览器持久存储，平台接收也不意味着记录来源经过可信执行端签名。
