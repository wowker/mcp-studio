# V01 A38 · 真实 Agent 重试责任端与 Viewer 补证

2026-10-14，基于登记10e369f／验证源f2fd29b，仅执行用户授权的A38剩余重试条款。Go切片144e4b4、真实接口b2bc47a、门禁测试同步修补及完整冻结 **b3b6fa305d09fe615e599a726f6eaaa40e65a12a**；本轮无生产代码修改、无复现A38产品缺陷，不发布。

## 实际连续接口旅程

两个账号实际邀请→注册→邮箱验证→登录→手动接受，真实PG项目Developer/团队member，分别通过生产浏览器配对同一Go Agent。平台proof/通道token按真实Origin/User/device验证，直接Agent HTTP仅使用实际配对token及Origin，调用节点不带平台Cookie，不模拟角色。测试helper仅控制本机确认/独立MasterStore，未替代生产认证/权限/SDK/队列。

本人一次Agent HTTP Tool成功，只注入上传503，实际加密队列保持operation/target/digest/快照。浏览器另保存同Run的私有副本，验证responsibleEndpoint=browser、targetKind=saved、snapshot.executor=agent，执行与新保存operation独立。

- 另一个已配对Developer对真实他人operation，在 `/v1/queue/{id}/retry` 和 `/v1/operations/{id}/retry` 均409 operation_missing；其队列为空，错误schema只有code，无内容泄漏。
- 本人的真实Browser保存operation在上述两Agent路由亦409 missing；浏览器cookie/CSRF原样重传Agent冻结上传403 executor_not_authenticated。无通道请求401 channel_required，排除依赖平台Cookie授权。
- 拒绝后实际队列整体/冻结inputJSON、上传尝试、SDK initialize/Tool、本人历史/私有保存副本保持，未产生新平台历史。
- 平台Maintainer实际降级本人Viewer，GET确认角色；保留旧配对token/连接版本/Run输入，两个retry、connect及run均409 project_permission_revoked。队列GET仍只读可见，私有保存GET保持，队列未删除、无新增上传/Tool/历史/audit。
- 恢复Developer后只重试原冻结上传：原operation/target/digest及实际入库快照相等，Tool计数保持1；成功队列正文按既有隐私策略清除、bytes0，第二别名幂等重试不再上传。平台Owner依旧看不到该成员的私有历史。

通道token只在测试内存使用，实际localStorage/sessionStorage/IndexedDB及URL检查无token；证据仅保存ID/digest/状态和布尔，不输出通道凭据或原始请求响应。当前实际错误责任端证明为Browser↔Agent；真实多设备/OS环境仍待验。

## Go 边界回归及审阅

实际SDK Tool/加密Queue/Engine.ServeAuthenticated：两个别名各4种、合计8拒绝子case（他人、错误项目、未持有、browser责任端），错误端入队拒绝，无内容泄漏/队列变化/上传/Tool；受控Viewer授权seam证明读许可不等于执行/上传写许可，恢复后相同冻结输入及幂等上传。Session/平台授权直接由测试供给，明确不冒称真实localapi/PG角色；真实角色证据由上述HTTP旅程承担。

sessions+queue整包27顶层测试通过含新1顶层；E2E strict Bundler实际exit0另有[typecheck结果](../../tests/evidence/v01-a38-agent-retry-focused/browser/typecheck-result.json)。独立只读审阅无Critical/Important；Minor建议的Browser副本保留Agent来源/同Run直接断言已补并重跑通过。最新focused1浏览器旅程通过，不累加多次重跑凑旅程数。详见[focused说明](../../tests/evidence/v01-a38-agent-retry-focused/README.md)。

## 验证阻塞与完整门禁

首轮完整verify在已有 `abort waits for TERM-ignoring descendant after its parent exits first` 单次失败（应130、观察到error.exitCode undefined），Node33中32通过，尚未执行后续完整门禁；[失败记录](../../tests/evidence/v01-a38-agent-retry-verify-first-failed/result.json)与log保留。独立runtime4和同一完整Node33带临时信号诊断复核均通过，精确创建的父子进程已结束、返回130；诊断只见正常ESRCH，未稳定复现首次原因，不归因为环境或产品，也不宣称修复。未修改runtime源码、原断言或时限；该偶发验证器失败保留为限制。

第二轮完整verify的Node/前端/Go/运维/部署通过，浏览器32通过/1失败：M2 OAuth保存后尚未完成列表刷新就打开移除确认框，随后编辑器卸载使按钮detach，60秒超时。[第二轮失败](../../tests/evidence/v01-a38-agent-retry-verify-second-failed/result.json)及错误上下文保留。`b3b6fa3` 仅改该测试，保存前注册真实connections GET等待，保存后检查200及正文完成，再等待新资源不匹配提示后打开确认；全部原断言/60秒不变，未改产品。单项1通过、strict compiler实际exit0，独立只读审查通过。

新冻结源重新运行[完整verify](../../tests/evidence/v01-a38-agent-retry-final/verify.log)，实际exit0：601前端/61文件、33基础Node、12运维/分发、真实PG全量Go/24个具测试包/vet/生产及helper构建、四目标未签名Agent候选/平台镜像及隔离HTTPS/STARTTLS/权限/恢复/未来迁移拒绝、33浏览器。0失败/跳过/重试。Go无测试包仅编译，race/依赖审计未重跑。[manifest](../../tests/evidence/v01-a38-agent-retry-final/manifest.json)绑定362冻结输入SHA `31550f8693dd9ee971daecce182de9601d0f635b2dadc6e8acb4f6f1976d452b`、实际环境与产物；835PNG/159axe/0确认违规，两color-contrast incomplete仍人工待验。

[清理](../../tests/evidence/v01-a38-agent-retry-final/cleanup.json)：自有准确租期schema/Compose资源0，预存PG保留；运行夹具已结束本次Agent/平台/MCP/OAuth/SMTP/TLS。不做前缀批量删除；独立诊断只终止其创建的PID。历史V02完整Go阶段CLI中止证据未重跑。

## 登记与范围

[增量JSON](v01-a38-agent-retry-supplement.json)绑定正式原文/行号/文件摘要/版本及环境，CSV仅A38追加，其他59行不变；原审计和三补证JSON、原72叶子、设计快照及M7旧归档不动。[登记检查](../../tests/evidence/v01-a38-agent-retry-final/registration-check.json)核对这些边界。

仅本条partial补为受控支持，有效117支持/67部分/0未找到/3环境。A38三条具受控证据仍不等于正式签收；全部A待验收、0签收，A30整体部分/环境、T02/T32b及既有实机/人工/介质不变。不推送、合并、tag、签名、公证或发布；下一步仍选明确剩余软件证据或具备环境的验收批次，验证器偶发失败原因亦可后续专项诊断，不擅自推进。
