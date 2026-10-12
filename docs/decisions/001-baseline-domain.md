# 001 · Baseline 2 与领域责任合同

日期：2026-10-13。合同版本：1.0.0。适用任务：T01a、T01b。记录工程细化，继承已确认产品规则，不重开 D01–D15。本会话授权先补 M0 再执行 M1 T04–T09；不进入 M2。

## 来源与范围

[README](../../README.md) → [交接说明](../handoff/REFERENCE-NOTES.md) → [08](../design-baseline-v2/design-handoff/08-decision-proposals.md) → [11](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md) 是入口。01–06 提供领域与验收细则；03 的视觉要求由 D10 对齐。规则优先级：用户确认基线 > 领域交互 > 原型；旧集中后端调用、旧 SQLite、旧测试产品与早期草案只供追溯。

首版范围为连接配置、环境、工具调试、历史/保存及支撑它们的身份、项目、团队、个人授权与 Agent。不纳入测试套件产品、压测、脚本/Skills、SSO、计费、旧数据导入。保留设计参考快照，不修改其进度；唯一进度位于 docs/tasks。本文的对照完成不代表 A01–A60 已通过。

基线校验定位：
- `docs/handoff/MANIFEST.json` SHA-256：`746c0fc280b55138ca77674d31ee993f8e11b7da483ef730eedfe05bc95f4187`
- `docs/design-baseline-v2/design-handoff/08-decision-proposals.md` SHA-256：`8e497df9476c2f0be60d5d90d270eadcb2804a2ea9cc456fe9299e98e6c2f4e7`
- `docs/design-baseline-v2/design-handoff/11-final-delivery-checklist.md` SHA-256：`8d755d83e0b4a13a56c0e025f4d3b9d045c443c7ca8c032c9c5d14589b8a832f`

## 26 页面映射

以下编号是追踪标识，不是生产路由。11 是每行权威索引，01 是入口/返回条件，领域详细规则分别查 02–05，验收正文查 06。

| ID | 页面 | 权威详细来源 | 责任 |
| --- | --- | --- | --- |
| P01 | 登录与身份流程 | [11 P01](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A24、A36、A58、A60 | identity |
| P02 | 账号与会话 | [11 P02](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A36、A39–A41、A58 | identity |
| P03 | 项目目录 | [11 P03](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A01–A02、A26、A37、A55 | projects/access |
| P04 | 创建项目 | [11 P04](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A01、A60 | projects |
| P05 | 新项目起始 / 项目流程 | [11 P05](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A35、A58、A60 | workflow |
| P06 | 项目访问与接管 | [11 P06](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A37、A55–A58 | access/audit |
| P07 | 成员与邀请列表 | [11 P07](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A22、A24–A28、A57 | membership |
| P08 | 成员详情 | [11 P08](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A26–A28、A48、A57 | membership |
| P09 | 创建邀请 | [11 P09](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A24–A26、A60 | membership |
| P10 | 邀请详情 / 接受 | [11 P10](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A24–A25、A36、A60 | membership |
| P11 | 服务连接配置 | [11 P11](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A03–A06、A43、A49–A52 | connections |
| P12 | 授权与凭据 | [11 P12](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A07、A41、A48、A52 | credentials |
| P13 | 本机 Agent | [11 P13](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A05–A06、A39、A42、A50 | agent |
| P14 | 环境变量 | [11 P14](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A08–A10、A51–A52 | environment |
| P15 | 变量编辑 | [11 P15](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A08–A10、A49、A51 | environment |
| P16 | 个人敏感值与备份 | [11 P16](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A08–A09、A22–A23、A41、A48 | credentials/environment |
| P17 | 工具调试 | [11 P17](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A11–A16、A30–A34、A39、A44 | execution/schema |
| P18 | 工具定义 | [11 P18](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A02–A03、A32、A44 | connections/schema |
| P19 | 工具内历史及详情 | [11 P19](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A17–A19、A22–A23、A59 | records |
| P20 | 工具内已保存及保存页 | [11 P20](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A17–A20、A44、A53–A54 | records |
| P21 | 项目调用历史 | [11 P21](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A17、A21–A23、A38、A47 | records |
| P22 | 项目已保存列表 | [11 P22](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A17、A20–A22、A44、A47 | records |
| P23 | 调用历史详情 | [11 P23](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A16、A18–A19、A23、A46、A59 | records |
| P24 | 已保存详情 | [11 P24](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A18–A23、A46–A48、A53–A54 | records |
| P25 | 保存 / 元数据编辑 | [11 P25](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A20、A23、A44、A53–A54 | records |
| P26 | 记录与设备 | [11 P26](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)、[01](../design-baseline-v2/design-handoff/01-pages-and-navigation.md)；验收 A38–A41、A47–A48、A55 | queue/policy |

## 15 交互映射

| ID | 操作链 | 详细来源 |
| --- | --- | --- |
| I01 | 登录 → 创建 / 接受邀请 | [11 I01](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F00、F02；05 |
| I02 | 创建 → 切换项目 | [11 I02](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F01；04；A55 |
| I03 | 邀请 → 重发 / 移除 | [11 I03](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F02；05 |
| I04 | 无权限 → Owner 接管 | [11 I04](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；05；A56–A58 |
| I05 | 服务保存 → 连接 → 修复 | [11 I05](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F03–F04；A51 |
| I06 | 授权 → 保存 → 备份 / 恢复 | [11 I06](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F05；04；A52 |
| I07 | 环境浏览 → 覆盖 → 应用 | [11 I07](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F06；04 |
| I08 | 编辑参数 → 执行 / 未完成草稿 | [11 I08](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F07；04 |
| I09 | 执行 → 取消 / 错误 | [11 I09](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F08；04 |
| I10 | 执行结果 → 平台记录 | [11 I10](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F09；04 |
| I11 | 历史 → 保存 → 编辑 | [11 I11](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F09；04；A53–A54 |
| I12 | 历史 / 保存 → 恢复 | [11 I12](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；02 F09；08 D11 |
| I13 | 脱敏预览 → 提交修订 | [11 I13](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；04；08 D13；A59 |
| I14 | 离线 / 到期 / 降级 → 恢复 | [11 I14](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；04；05；08 D03–D05 |
| I15 | 语言 / 主题 / 窗口 / Tab 变化 | [11 I15](../design-baseline-v2/design-handoff/11-final-delivery-checklist.md)；01；03；A29–A34 |

## D01–D15 决策映射

| ID | 主题与已确认规则 | 来源 |
| --- | --- | --- |
| D01 | 账号：邮箱密码 + 邀请加入，关闭公开注册，一次性 Owner 初始化；邮件验证 / 找回；会话空闲 8 小时、最长 24 小时；SSO 后续 | [08 D01](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D02 | 跨项目访问：团队管理与内容权限分离；Admin 不自行加入；Owner 显式留痕接管后加入，个人数据边界不变 | [08 D02](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D03 | 记录权限：维护者固定项目历史；本人可执行角色仅重试本人责任端记录；Viewer 只读；移除后撤销访问 | [08 D03](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D04 | 本地与离线：浏览器脱敏 IndexedDB 队列，原始内容 / 凭据不持久化；Agent 加密队列；平台离线暂停新调用；一 Run 一责任端 | [08 D04](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D05 | 凭据与备份：长期凭据使用 Agent 系统凭据库；个人平台备份默认关闭，托管密钥加密，非端到端；恢复需重新认证与项目权限 | [08 D05](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D06 | Agent：Go，macOS / Windows 安装包及 Linux CLI；回环接口与来源 / 身份校验、本机确认；stdio 配置变更重新确认 | [08 D06](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D07 | 协议：Streamable HTTP 为主、兼容旧 SSE；stdio 经 Agent；Chrome / Edge 最近两个稳定大版本首批验收；OAuth 授权码 + PKCE | [08 D07](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D08 | URL：允许非敏感 query 与非敏感引用；禁止内嵌凭据、fragment、认证秘密；不支持仅 query secret 认证的服务 | [08 D08](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D09 | Schema / 草稿：合法 JSON 的 Schema 错可保存私有未完成草稿，不可发布 / 执行；高级组合不能无损表单化时 JSON 编辑；不自动获取远程引用 | [08 D09](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D10 | 字号：正文 14、辅助 12、最低 11、页面标题 24、工作区标题 16；现有 token 体系保留 | [08 D10](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D11 | 恢复：新未执行 Tab 恢复参数，来源响应只读关联；不重放、不覆盖草稿 | [08 D11](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D12 | 优先级：用户确认规则优先于领域文档和原型；旧架构 / 比较稿仅作历史 | [08 D12](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D13 | 脱敏：来源标签 + 默认 / 项目 / 单记录规则，接收端复核；追加脱敏修订关联副本，审计不留秘密原文 | [08 D13](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D14 | 配额与并发：历史 90 天、请求 1 MiB、响应留存 10 MiB、项目 5 GiB；队列 1,000 条 / 100 MiB；私有封存 30 天；配置冲突不覆盖 | [08 D14](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |
| D15 | 技术与部署：Go 模块化单体 + React / TypeScript / Vite + PostgreSQL；HTTPS 同站点容器部署；REST / OpenAPI + SSE；首版不要求 Redis / 微服务 | [08 D15](../design-baseline-v2/design-handoff/08-decision-proposals.md)；[06](../design-baseline-v2/design-handoff/06-handoff-and-acceptance.md) |

## 独立身份与所有权

| 身份 | 范围/不变量 | 责任边界 |
| --- | --- | --- |
| teamId | 组织身份，项目名称只在同团队归一化唯一 | 团队目录/成员管理，不授予项目内容 |
| projectId | 所属 teamId 由平台数据库读取 | 每次对象操作检查真实项目关系，不信任请求中teamId或当前屏幕角色 |
| userId | 平台身份，已验证邮箱是加入条件 | 不当作 MCP 身份；每次请求查有效平台会话 |
| connectionId | 独立配置对象，属于 projectId | 凭据键(userId,projectId,connectionId)，两个同URL连接不合并 |
| tabId | 本人内存草稿，按(userId,projectId,connectionId)隔离 | 同一tool可多个tab；复制/恢复新ID且未执行 |
| runId | 一次明确发出的调用，绑定冻结上下文与责任端 | 草稿校验无效不生成Run；重试上传不生成Run |
| recordId | 保存快照独立于runId，含所有者/可见范围 | 删除来源历史不删保存；私有不转共享；快照修订按独立operation |
| operationId | 一次平台写入、上传、保存或修订的幂等身份 | 同操作冻结摘要；用户显式新修订生成新操作，不借重试更新内容 |

来源 Tool 名称、URL、显示名、导航项目、模拟角色、Tab 序号和时间戳都不作为上述身份替代物。MCP会话按(userId,projectId,connectionId,executorId)分开；连接尝试和页面代次也有独立短期身份，防迟到回调写入新上下文。

## 三端职责

浏览器编排并直连可访问HTTP，冻结/脱敏本人浏览器Run并可靠排队；平台离线阻止新调用。用户明确切换后Agent执行HTTP；stdio固定Agent，以程序+参数数组启动。Agent冻结/脱敏自己的Run并维护加密队列。平台管理身份、权限、配置、脱敏记录、审计及默认关闭的本人托管加密备份，默认不代理Tool。平台REST/OpenAPI、平台SSE、Agent本机API和MCP transport分属四条合同。

## 能力词表

角色转能力由权威端根据对象真实范围和当前关系决定；UI只呈现能力。下表为 v1 词表，平台生成API可用对应lowercase wire枚举，含义不变。

| 能力 | 允许主体及附加条件 |
| --- | --- |
| team.directory.read / team.project.create | Owner/Admin；目录不含服务、变量值、历史、进度 |
| team.member.manage | Owner/Admin管理普通成员，保护本人/Owner/最后维护者；Admin不得管理其他Admin |
| team.admin.grant | 仅Owner；邀请维护者不得借重发提升授予上限 |
| project.takeover | 仅Owner为本人显式确认+非空原因+原子新增维护者关系+管理审计；确认前内容仍拒绝 |
| project.member.manage | 该项目Maintainer，或Owner/Admin目录成员管理能力；受团队授予上限与移除保护约束，不授内容 |
| project.content.read | 当前Maintainer/Developer/Viewer，查询对象所属项目而非当前UI项目 |
| project.configuration.write | 当前Maintainer；配置/环境使用版本条件更新 |
| project.execute / personal.credentials.write | 当前Maintainer/Developer，仅本人；必须在线复核权限/容量，凭据不外传 |
| personal.credentials.read / personal.backup.restore | 仅本人，保有写/执行权限；显式查看/重认证，备份不称端到端加密 |
| record.private.read | 当前项目成员+记录owner=user；Viewer降级后可读，不可写；移除不可访问 |
| record.private.write | 本人+当前Maintainer/Developer；合法JSON的Schema错仅可保存未完成私有草稿 |
| record.project.write / history.pin / history.clean | 当前Maintainer；清理只含已上传未固定历史，排队失败项不可静默删 |
| record.upload.retry | 当前Maintainer/Developer+本人记录+该责任端实际持有；不读取或代上传他人本地队列 |
| record.redaction.revise | 项目记录Maintainer；私有记录本人且有写权限；只追加保护，关联副本同步，审计不留秘密原文 |

## 反例走查

| 反例 | 结论/合同向量 |
| --- | --- |
| Admin未加入项目，从目录猜连接/历史ID | 可管理目录，content.read=false；permission-admin-no-content |
| Admin给自己加入未授权项目 | 不允许自行接管；permission-admin-no-self-grant |
| Owner未接管即读内容，或接管后读他人私有/凭据 | 均拒绝；接管只增加目标项目关系；permission-owner-no-private-override |
| Member是项目Maintainer但创建团队项目 | project角色不授team.project.create，拒绝（05/A26）；平台策略回归在M1 |
| A项目Viewer，B项目Developer；屏幕切到B重试A队列 | 以A当前关系拒绝，不能借B角色；permission-viewer-no-upload |
| Developer固定历史或代传另一成员队列 | 都拒绝；permission-developer-no-pin、permission-no-other-queue |
| Viewer读本人可见私有记录后点击恢复/编辑/重试 | 只读；permission-viewer-own-private-read / permission-viewer-no-upload |
| Maintainer被移除但旧成员页未关闭 | 下一请求以新关系拒绝；permission-removed-no-private，M1另做真实授权回归 |

## 完成与证据边界

T01a：26/26 P、15/15 I、15/15 D均逐项映射11/08与详细来源；未纳入旧工程。T01b：八类独立身份、三端责任和目录/内容/本人能力定义，Owner/Admin/Viewer反例已评审；可执行子集与 [共享向量](../../contracts/fixtures/semantics-v1.json)一致。正式鉴权/浏览器/存储/Agent验收仍按各阶段完成，不以此文档代验。
