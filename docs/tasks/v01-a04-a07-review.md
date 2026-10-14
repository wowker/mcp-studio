# V01 A04 / A07 连续旅程与独立备份补证

2026-10-14。基于登记aab7330，仅执行用户授权的A04 CORS→显式Agent连续旅程和A07独立备份失败/重试；分切片补证、实际缺陷RED/GREEN、完整verify。冻结实现 **3ad64452210d9f916b6bf530ecf1416ecf9ae487**（A04 ab2042e、A07 3ad6445）；正式A01–A60全部待验收，0签收，不发布。

## A04 · 同连接显式切换与凭据隔离

新增 `/cors-token-mcp` 受控鉴权MCP：OPTIONS无ACAO，Browser实际CORS失败；同endpoint原生SDK必须有token才能调用。fixture能力先RED再GREEN，非产品缺陷。生产浏览器旅程预置Browser token及另一同URL连接的可用Agent token：CORS失败时配置/上游/Agent执行无变化；用户手动保存Agent通道后原project/connection/endpoint不变、version+1，零自动连接。首次明确连接仍credential_missing、零initialize/Tool；仅显式保存目标Agent凭据后连接/调用成功，唯一历史 executor=agent、credentialSource=token。新旅程源位置/摘要及正式原文见[增量JSON](v01-a04-a07-supplement.json)。未修改生产CORS策略、通道选择或认证规则。

## A07 · 三种结果独立，备份失败后仅重试备份

同OAuth连接实际PKCE授权→本地保存→一次真实Tool/上传。错误平台密码触发真实平台403，备份为0；授权attempt仍authorized/saved，本地密文文件摘要/mtime/size、实际历史、OAuth/save/Tool次数均保持。保留密码与明确勾选；纠正密码后仅再发一次backup，同scope/kind/reference/sourceDigest/version，实际平台200且恰一条备份，清空表单。失败/重试后OAuth、save、Tool各1，restore0；浏览器持久存储检查仅输出布尔，不输出秘密。既有M5保存失败/重试用例也在本次完整门禁重跑。

实际产品RED：平台正确返回 `reauthentication_failed`，Agent把所有403映射为 `project_permission_revoked`；Go创建/恢复和生产浏览器分别复现。修补仅在有效项目/连接（恢复含backup ID）的精确POST路由、≤4096字节合法错误响应中保留固定重认证错误；请求前Validate不变。9个拒绝子case覆盖未知/秘密消息、畸形/oversize、GET/非备份POST、grant拒绝，401仍身份过期。未改变平台权限、重认证验证、API合同或迁移。

控制夹具只观察备份transport状态和kind/reference/version/digest，并输出本地密文文件元数据；原始密码/token/grant/凭据内容不写证据。测试MasterStore/自动本机确认不抵扣真实OS凭据库或本机确认。仅证明真实错误重认证失败/重试，未声称所有备份故障类型通过。

## 实际验证和范围

- 聚焦fixture7项；组件1项及类型检查；platformclient/sessions两整包Go与3个新增具名顶层测试；两生产浏览器连续旅程2/2，零失败/跳过/重试。独立只读审查无Critical/Required，审阅者未跑测试。[focused说明](../../tests/evidence/v01-a04-a07-focused/README.md)区分产品RED、fixture RED、测试编写错误及sandbox限制。
- [完整verify](../../tests/evidence/v01-a04-a07-final/verify.log)实际exit0：600前端/60文件、33基础Node、12运维/分发、真实隔离PG全量Go/24个具测试包、vet及生产/helper构建、四目标未签名Agent候选、平台镜像及隔离HTTPS/STARTTLS/权限/备份恢复/未来迁移拒绝、31浏览器。零失败/跳过/重试；无测试Go包只编译，race/依赖审计未重跑。
- [manifest](../../tests/evidence/v01-a04-a07-final/manifest.json)：356个冻结输入SHA `049b051a87e6c6ce166e4dc91b2c55e2ac0f8df60c7c6e4aba1ee68df5705332`，环境与产物摘要如实记录。827 PNG/159 axe/0确认违规，原color-contrast incomplete仍人工待验。
- [清理](../../tests/evidence/v01-a04-a07-final/cleanup.json)：本次准确租期schema及Compose资源0、预存mcp-studio-m1-pg保留；runtime finally结束自有夹具。只读schema计数不是前缀批量删除；本轮未另跑真实CLI中止，V02该证据仍属历史。
- CSV只追加A04/A07两行；索引新增独立补证字段。原审计JSON和六条补证JSON保留字节不变，仅四个目标partial条款变为受控assertion-backed，当前有效115支持/69部分/0未找到/3环境。无批量重评或签收，原T叶子/T02/T32b/实机/人工/介质未变。

本次只保留本地提交与未签名候选；旧M7交付归档和证据未替换，不推送、合并、tag、签名、公证或发布。下一步仍从明确的部分证据条款或具备环境的验收批次选择，不擅自执行其他项。
