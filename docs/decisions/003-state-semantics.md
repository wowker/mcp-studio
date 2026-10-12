# 003 · 跨端状态、幂等与共享语义合同

日期：2026-10-13；合同1.0.0；适用T03a/T03b。继承 [001](001-baseline-domain.md)、设计04/05与08 D03–D15。平台API生成与依赖选择见 [004](004-engineering-contract.md)。本文件及schemas/fixtures是M0合同，oracle是隔离参考演算，未实现M2环境/参数生产特性或M5 Agent。

## 协议与版本

平台REST+OpenAPI管理身份、权限、共享配置和脱敏记录；SSE只传已授权的失效通知。Agent本机API负责配对与本人本机执行。MCP transport连接独立上游服务。不得用平台上传或平台SSE当作Tool调用结果。消息声明contractVersion；v1相容新增可选字段，删除/改变身份语义需major版本。未知必需能力或major版本拒绝并显示incompatible，不降级绕过安全边界。

[状态Schema](../../contracts/schemas/state-v1.schema.json)、[语义向量](../../contracts/fixtures/semantics-v1.json)、[Agent合同](../../contracts/agent/security-v1.json)分别版本化。schema约束结构；状态转换/所有权/权限/唯一责任端还必须由服务端应用逻辑检查。

## 状态轴与操作身份

| 对象 | 状态/冻结内容 | 允许转换 |
| --- | --- | --- |
| Run | runId,userId,projectId,connectionId,tabId,executor,toolDefinitionVersion,configurationVersion,environmentVersion,参数/来源标签 | 校验通过后创建running；只能转succeeded/failed/cancelled一次；草稿无效不建Run |
| remoteOutcome | known/unknown，与本地终态独立 | 成功/工具isError/RPC错误/已知401是known；超时/中断/取消是unknown，不能推断回滚 |
| UploadOperation | operationId,kind,owner,project,connection,targetId,responsibleEndpoint,frozenDigest | pending→uploading→recorded/failed；失败重试相同操作与摘要；暂停身份/权限不改Run |
| SavedRecord | recordId独立、保存实际时间、immutable请求/响应快照、sourceRunId可选 | private/project；合法JSON Schema错只能private+incomplete；来源删除不删除保存 |
| RevisionOperation | 新operationId、recordId不变、baseVersion、新元数据或附加脱敏路径/原因、固定摘要 | 条件更新成功生成version+1；失败重试原冻结修订；用户再改后保存创建另一operation |

一个Run只有browser或agent一个上传责任端。浏览器从Agent Run保存记录，是新的浏览器operation，不冒用Agent队列。执行来源仍记agent；Run成功但上传失败仍显示成功+未记录，不能重新调Tool。记录保存请求/请求响应内容类型分别明确。取消不删除已发送请求，不声称撤销上游事务。

## 取消、迟到与结果未知序列

1. running→cancelled(remoteOutcome=unknown)→迟到成功：Run仍cancelled，迟到观察只能附加诊断事件，不能改状态或当前草稿。超时/中断亦不得被迟到成功覆盖。
2. 用户明确重新执行：重新校验当前权限、配置、Schema、容量，生成新runId；没有自动Tool重试。
3. 浏览器刷新导致无法继续跟踪已发出请求：保留可用脱敏快照并标remoteOutcome=unknown；不得恢复成可重放任务。
4. Agent页面关闭：Agent可以完成已获准请求并排队；Agent重启只能查询/恢复队列状态，不自动重放Tool。
5. UI提交回调前比对(userId,projectId,connectionId,tabId,runId/recordId,operationId,viewGeneration)；不匹配忽略页面提交，但不能宣称后台写入已撤销。平台operation状态查询给出权威结果。

## 摘要、上传与修订

冻结摘要使用SHA-256，输入为UTF-8版本化规范JSON：对象键递归按Unicode码点排序，数组有序；允许null/boolean/string、精确安全整数及有限JSON number，跨端涉及小数须用合同规定的十进制文本/规范序列化实现后加数值向量。禁止NaN/Infinity/undefined、重复对象键和不安全整数进入摘要。字符串不自动trim或Unicode归一化。摘要包含contractVersion、完整身份、责任端和脱敏快照；不包含网络重试计数或上传时间，不包含原始秘密。M0状态向量用合成摘要标签演算冲突，尚未声称验证规范序列化算法。

幂等索引至少为(userId,projectId,connectionId,operationId)，run身份也必须与原绑定一致。先校验最新会话、对象所属项目权限、本人和责任端，再读取幂等回执：同身份同摘要返回原回执；同operationId异摘要409 digest_conflict；身份改变409 identity_conflict；无权403/不泄漏原回执。首次操作原子写入数据、摘要和回执，不出现“写入成功但未登记幂等”。接收后平台再脱敏，新接收数据仍按原上传摘要识别幂等，内部处理不重调Tool。

修改名称/备注/范围：请求响应不变，冻结新metadata，带baseVersion。追加脱敏：新operation、新规则版本，审计只保存actor/time/reason/路径/版本；原因本身亦脱敏。一个事务修订目标与关联保存副本并发出失效事件，不保留被移除秘密的旧正文。401/403/409/容量错误都不是“重试Tool”。

## 权限撤销与离线

每次平台请求查询对象真实项目与当前关系；Agent每个新执行/上传都在线复核平台权限，不信任浏览器角色或既往grant。降级Viewer允许本人可见私有记录只读，拒绝执行、修订、凭据管理和上传；移除拒绝全部项目内容，包括本人私有。已发出上游调用不能保证撤销，其结果可本端完成/脱敏排队，但平台上传以最新权限判断。会话到期暂停上传并隐藏上下文，同账号认证后再复核；不同账号不得读取前账号缓存。平台不可达、项目/本地队列容量已满阻止新项目调用，已发出结果仍尝试保留且说明失败风险。

## ETag、游标、事件合同

- 配置/元数据响应使用不透明强ETag，与对象ID+单调version绑定。写入If-Match必需；缺失428 precondition_required，版本不符409 version_conflict（平台API具体编码按OpenAPI统一），保留客户端草稿。不能以If-Match绕过对象权限。新对象成功后返回新ETag；不能用更新时间代替version。
- 列表默认50、上限100，按(createdAt,id)稳定降序keyset分页。游标是不透明认证编码，绑定用户、项目、collection、规范筛选、固定highWater和末项排序键；改作用域/筛选/身份拒绝cursor_invalid，不能复用另项目游标。每页重新授权，私有owner过滤在SQL内。游标不携带正文/凭据，权限变化后不凭游标保留访问。并发新增不混入原翻页窗口；删除允许页面不足但不能重复返回旧项。
- SSE envelope：contractVersion,eventId,sequence,occurredAt,projectId,kind,objectId,version。eventId和sequence用于去重/顺序，平台返回的是通知事实，不承诺每个写入消息只到达一次；客户端按对象版本合并。正文不含原始参数响应/秘密，仅失效键。订阅前、发送前及重连后再次授权，撤销即停止相关项目事件；无法传内容时仅发会话级access.changed，不带无权对象细节。
- Last-Event-ID只恢复已授权可保留事件；游标未知/过期/范围不符返回reset_required，客户端重新查询有权资源，不能靠重放复原权限。心跳不增加领域版本。断线后仍可凭operationId查询写入结果。

## 共享语义与映射

[64个合成向量](../../contracts/fixtures/semantics-v1.json)独立写出预期值并携来源：14环境、17Schema、7脱敏、6Run、5上传、3恢复、12能力反例。JS与Go各自解释同一JSON文件，对每行literal expected独立断言；两端共享数据而不复用同一解释器。

| 语义 | TypeScript/JS映射 | Go映射与要求 |
| --- | --- | --- |
| 缺失/null/falsy | Object.hasOwn；skip删除字段；0/false保留 | map键存在性与nil分开；float64(0)/false不可当missing |
| 层与个人值 | ordered layer definitions；personal[definitionId] | 有序layer slice后按name决胜；个人值按定义ID，不按同名或URL |
| JSON错误 | parseable独立于schema validity | JSON unmarshal错误独立；unknown/remote dialect显式unsupported |
| 错误路径 | JSON Pointer ~0/~1与数组index | 同一escape；错误码与path独立于文案/顺序 |
| Run/Upload | 两个独立状态轴 | Run终态不能被upload事件改变；同operation摘要不可变化 |
| 凭据敏感标签 | 派生字符串/嵌套JSON传播 | 内部可解析值与对外脱敏row分离；对外不输出敏感value |

环境向量锁定四层最终定义、不回退缺值、只解析有效依赖、循环/缺失分类、JSON嵌套敏感派生、finite number与boolean不自动coerce。生产环境选择上下文由项目/连接ID绑定，oracle输入由合成测试提供。

Schema oracle仅覆盖测试列出的draft2020-12有限子集：type/enum/const/properties/required/additionalProperties/items、数值/长度边界、oneOf/anyOf/allOf、文档内$ref/$defs。未识别keyword、远程ref、不支持dialect/递归ref显式unsupported，且不会网络取回；不宣称完整dialect校验。生产T16必须采用正式完整校验器、声明支持范围并继续扩充跨端向量。optional默认skip，focus/blur不校验留待真实编辑器回归；合成skip向量仅检查请求语义。可解析Schema错可保存private/incomplete，非法JSON只留编辑器原文。

脱敏oracle检查来源秘密回显、嵌套认证/Cookie/email/phone字段、秘密URL、追加JSON Pointer、无法解析二进制元数据、falsy保留。真实实现需来源标签+默认+项目+单记录附加规则、平台复核、所有持久化/复制/导出一致。遮罩字符串只是合成输入；生产应使用带类型/path的脱敏标记，不能仅凭字符串认定秘密可恢复。默认正则不保证识别全部业务秘密。

## 实际验证与未验证

2026-10-13，本机Go1.25.5 darwin/arm64，Node24.21.0。先用空oracle得到JS第一个向量assertion失败与Go64向量失败，再实现。`node scripts/contract-semantics.mjs`：64 passed。模块建立前 `GO111MODULE=off go test ./internal/contracts`：通过；正式模块建立后 `GOCACHE=/tmp/mcp-studio-domain-go-cache go test ./internal/contracts` 与 `go vet ./internal/contracts` 均通过（缓存放到可写目录）。Go SDK1.4.0与TS SDK1.29.0已在测试依赖锁定，分别用in-memory握手和tool discovery得到RED缺tool→GREEN；这些不是HTTP/OAuth/跨OS兼容证据，详见004。

这些结果只证明M0有限合同演算和跨语言JSON映射；不证明浏览器调用、OAuth、邮件、数据库授权、Agent回环/凭据库、生产JSONSchema全面支持、真实队列或A01–A60。T03b的版本/生成兼容证据由004与实际锁文件/门禁补齐；目标OS/浏览器缺环境保持待验，不因此oracle补签。
