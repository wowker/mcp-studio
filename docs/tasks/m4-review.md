# M4 T22–T24 实施审阅

2026-10-13；基准 cf9b6cf。只实现浏览器持久队列、身份/所属项目门控和平台容量/保留封存，不进入M5。设计参考快照没有修改。

## 逐包审阅与回归

| 工作包 | 实际处理 | 回归入口 |
| --- | --- | --- |
| T22a | 原生IDB事务保存脱敏冻结输入；schema+digest损坏条目隔离，不暴露正文、不自动删除；账号分区；存储不可用须本人选择内存模式；偏好只存本人模式，不存凭据/原文 | queueStorage.test.ts；runtimeStore.test.ts；m4.spec.ts 原生刷新、损坏、存储故障/刷新及真实换账号 |
| T22b | 同窗口请求合并/跨窗口租约、过期租约恢复；原operation/digest/ETag重试；回执与payload清理同事务；明确丢弃，退出提醒包含已撤权/损坏条目 | operations/queueStorage tests；OperationsPage/SessionUploads tests；原生已接收但回执丢失旅程，Tool计数只增加一次 |
| T23a | 已发出Run可结束并冻结脱敏队列；到期隐藏上下文并暂停上传；同账号恢复，其他账号不能读原队列；平台不可达禁止新调用 | ToolExecution/index/runtimeStore/App/api tests；m3.spec.ts 离线准入；m4.spec.ts 过期/不同账号/本人恢复 |
| T23b | 每次上传校验Cookie本人及记录所属项目当前Developer/Maintainer；平台先检查真实当前权限再返回回执；A项目拒绝不终止B；已接受本人操作降级为Developer可取相同回执，新的发布/编辑仍拒绝 | queue授权、api路径、ToolExecution跨项目回归；真实PG撤权锁/角色变化/他人回执/Viewer拒绝 |
| T24a | 本人项目队列1000条/100MiB原子准入；请求1MiB/响应留存10MiB继承正式运行时边界；平台默认5GiB逻辑字节，包括归档/回执/记录审计/删除标记；并发事务锁 | queue count/bytes；执行边界；record_lifecycle_test.go 一字节界限/并发写/聚合隔离，真实PG+原生1k队列 |
| T24b | 普通历史默认90天/实际部署上限，固定与保存保护；移除私有封存30天、期限前本人重加恢复，期限后无复活；7天队列仅提醒；作业启动/定期/停止和重复运行 | 可控Now/真实PG Sweep、重加、团队移除、来源独立、tombstone、归档副本追加脱敏及进程配置回归 |

## 独立审阅发现

- 容量合同缺少实际部署最大保留天数，界面硬编码90。已增加maxHistoryRetentionDays，实际部署上限返回/界面使用同合同；上限缩小时已有策略也受限。
- 降低容量后追加脱敏可能被容量拒绝，妨碍移除秘密。当前角色/摘要/快照/路径/安全元数据仍校验，明确的追加脱敏允许有限安全审计开销越过准入；新上传、一般元数据修订和固定继续严守容量。
- IDB不可用时显式选择内存模式不应因删除旧存储失败而阻止新模式。选择后明确提示旧缓存清理未确认，不虚报擦除；只有手动选择才放行，原生故障/刷新旅程验证。
- 切到持久模式等待旧账号hydration后，不能覆盖新账号权限；加入owner/generation及逐项持久化前后的检查，延迟跨账号回归先失败后通过。
- 会话到期必须使未完成的身份恢复失效，同时保留已经发出Run的结果。resumeTicket在到期/clear时失效，identityRevision只在结束身份时变化；实际expiry-hydration-red.log → expiry-issued-green.log证明。
- 同账号在持久模式hydration期间新发生的撤权也须保留；恢复旧集合必须合并期间新撤权，不能用旧快照覆盖。same-owner-red.log → same-owner-green.log及最终门禁验证。
- 正常退出的存储删除失败需保留队列可见/可重试。discardUser内部负责暂停和失败恢复；App去掉额外提前暂停，不称清理成功。

## 联调与证据解释

初次原生测试使用旧M3平台二进制，新purpose=execute字段被拒绝400；重建正式入口后解决，未放宽合同。随后回执丢失测试过早把恢复的旧failed状态视为新重试结束，刷新留下有效租约；operation_busy是正常阻止重复上传。测试现等待真实请求、network失败落盘和租约释放再刷新。全套又发现导航和空目录提示均有Servers按钮，测试明确限定到项目导航；verify-servers-locator-red.log保留真实失败，最终完整门禁通过。安全本地错误通过闭合ApiError码表保留，任意上游错误仍不暴露。

平台审阅还修复已接受操作的角色降级回执顺序、过期历史换新ID复活、归档关联副本再次出现已删除秘密、逻辑字节审计时间小数位不稳定；逐项RED/GREEN记录在tests/evidence/m4-platform/red-green.txt。全量Go race尝试8分钟超时，不能报告通过；定向真实PG容量并发/移除上传race已通过，日志分别保留go-race.txt和focused-race.txt。

最终实现c3fbf2e，37文件473项前端、18项Node、真实PG/Go非缓存/vet/build及15条生产浏览器旅程通过，0失败/跳过/重试。最大JS499.73kB/gzip151.27kB，无阈值告警。完整验证数量与实现版本以[执行账本](./progress.md)、[完整verify](../../tests/evidence/m4-final/verify.log)、[浏览器结果](../../tests/evidence/m4-final/results.json)和manifest.json为准。中间失败保留m4-preflight与m4-platform，不作为最终签收；没有删除回归、降低断言/阈值或放宽CSP。

T02完整Chrome/Edge/OS/公网LNA/原生人工确认路径仍待验；当前受控Chromium证据不抵扣目标浏览器。A01–A60正式状态仍待验收。Agent队列/系统凭据库/个人备份删除和备份介质淘汰待M5/M7联验；本次不宣称已实现。

提交检查只整理预检文本日志的行尾空白和末尾空行；原始输出无损保留于m4-preflight/raw-preflight-logs.json.gz，归档SHA见manifest。测试内容、数量、失败信息和最终原始verify日志未改变。
