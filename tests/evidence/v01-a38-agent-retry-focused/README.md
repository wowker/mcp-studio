# A38 Agent 重试聚焦证据

[最终门禁](../v01-a38-agent-retry-final/README.md)与本目录区分。

- agent-unit/focused-initial.log、go.log：新测试直接GREEN；sessions20+queue7顶层通过。实际SDK/加密队列/Engine路由，授权/Session受控seam，不冒称真实localapi/PG角色。
- browser/first.log、results-first-harness-error.json：测试错误地在接受邀请前读取session.teams；修正为接受后刷新，非产品RED。
- browser/second.log、results-second-harness-error.json：错误预期成功队列仍保留正文；既有成功隐私清除是正确行为，改为验证原身份/摘要/实际入库快照，非产品RED。
- browser/final.log、results-third-harness-error.json：误用Owner读取他人私有历史作为成功对照，正确返回空；改用记录本人，并继续证明Owner不可见，非产品RED。
- browser/green.log：首个完整旅程通过；审阅加强直接Agent来源/同Run后review-green.log和results.json为最新1passed。typecheck-result.json记录实际strict compilerexit0，空log不独立冒充退出码。
- browser/agent-retry-boundaries.json：实际2验证账号/配对token、10拒绝响应、降级/恢复、同冻结上传/零Tool重放及安全元数据，通道值不入证据。
- verifier/runtime-first.log：既有中止4项独立复核通过；drain-probe.json只记录其创建的PID/返回130/已结束；node-gate-diagnostic.log与verify同一33项通过，临时观察只见正常ESRCH。首轮原因未稳定复现，未改源码/断言/时限，未称修复。

- m2-save-sync/verify.log、results.json、typecheck-result.json：门禁第二轮复现既有OAuth测试保存刷新时序错误；等待实际刷新后1通过，strictexit0。原全部断言/60秒保持，无生产修改，独立复核通过。

[第二轮完整失败](../v01-a38-agent-retry-verify-second-failed/result.json)及错误上下文保留。首轮完整verify失败另保留[记录](../v01-a38-agent-retry-verify-first-failed/result.json)，最终完整通过不覆盖失败。测试仅受控MasterStore/本机确认及单Agent真实HTTP，不抵扣目标浏览器、多实机/人工/介质或正式验收。本次不发布。
