# V01 / V02 完成审阅

2026-10-14。M7候选源3056a6b → V01/V02初始修补d8ca1ea → 审阅修补冻结源9ed9292473b4902e6b4ba7bd424f7915f6ff4a02。只执行正式预期/断言核对和verify中止Go夹具回收；本次不发布。

## V01：逐项证据核对

60个A项共187条款：105有受控断言支持、73部分、6未找到直接断言、3依赖环境。逐项正式预期、测试名/文件行号、历史实际运行报告、环境和缺口保存在[审计JSON](v01-assertion-audit.json)，[可读表](v01-assertion-audit.md)逐项列出条款状态。

[完整性记录](../../tests/evidence/v01-v02-root/v01-integrity.json)确认60个有序唯一编号、正式预期与原CSV逐字一致、347条引用的文件摘要与M7源inputs吻合且行号范围有效，历史报告存在。347是源断言引用，Go历史日志按包、浏览器按旅程；不称为347次独立运行。新门禁是9ed9292的运行证明，不改写旧3056a6b证据或交付包。

CSV逐A追加条款计数和审计路径，原版本/证据保留。**A01–A60正式全部待验，0项签收**；即使条款均有受控断言，也不据此批量勾选。T36a/b及M7六个完整叶子仍未勾选。T02/T32b、既有原生/人工/介质条件不变。

直接断言缺口为A01空项目、A09跨端连接/执行一致阻断、A28署名与取消无副作用、A32活动Run保留、A51诊断清除。其他部分证据包括A04连续CORS→显式Agent切换、A07独立备份失败、A30必要pane非零高/底栏裁切、A38 Developer固定API拒绝、A45标题24/工作区16字号、A47精确边界和容量贡献、A53/A55完整组合等。A21删除确认状态转换是静态待复现风险，不报告为已确认故障。本次仅登记，不越界扩产品行为修补。

## V02：修补与实际验证

- 平台与migration两处Go夹具共用testsupport.CreateSchema。事务内CREATE+COMMENT，父租期advisory lock串行创建/关闭；运行nonce限定子schema，关闭后迟到创建拒绝。实际库/user/Host/fallback及非SUPER/non-BYPASSRLS角色均验证。
- Node保存父OID与完整租期标记；回收逐对象核对名字、owner、OID和准确comment，不扫test_前缀。对象替换时拒绝清理，并保留未拥有/其他运行对象。
- 受控POSIX命令独立进程组，中止TERM后5s KILL，父先退出时仍等待后代消失；不能确认则失败。主exit130/7在安全拒绝清理时保留，追加固定脱敏说明；readiness有界且观察提前失败。
- 新真实Go中止/失败/租期/信号回归加入verify基础Node门禁，夹具先构建；无测试跳过、门槛降低或前端/Go门禁绕过。

[聚焦RED/GREEN](../../tests/evidence/v01-v02-root/README.md)保留原夹具泄漏2失败、原提前返回1失败、实际池错库/fallback guard失败、审阅3条失败，以及逐切片GREEN。默认sandbox两个含green/red命名的EMFILE日志只是环境错误，不算通过。最终16项Node聚焦与2个具名Go测试实际通过；身份测试四个子情景也具名记录。

独立第一轮审阅2 Important/1 Minor，均已修补：忽略TERM后代、清理覆盖退出码、无readiness夹具启动失败。限定复核关闭，审阅者未跑测试；根代理执行16项最终GREEN包含新增readiness回归，未把15项旧GREEN冒称16项。

冻结源[完整verify](../../tests/evidence/v01-v02-final/verify.log)实际exit0：32基础Node、591前端/57文件、类型/生产构建、真实隔离PG全量Go、vet、platform/Agent/admin/helper构建、四目标未签名Agent、12运维/分发、平台镜像与隔离HTTPS/STARTTLS/权限/恢复/未来迁移拒绝，26浏览器旅程零失败/跳过/重试。新Go包无测试的条目仅是编译，不计为测试；race和依赖安全审计未重跑，不冒称本次通过。

环境、冻结源/锁文件/产物摘要、实际清理及候选目录见[manifest](../../tests/evidence/v01-v02-final/manifest.json)。候选仅留本地，原M7交付归档不替换。

完整门禁结束后另做[实际verify CLI中止](../../tests/evidence/v01-v02-interrupted/result.json)：直接运行`node scripts/verify.mjs`，观察真实Go阶段一个内部已提交租期schema，再向验证器发SIGINT。实际exit130；父及内部夹具均为0，不作手动删除，不运行后续部署阶段。其日志仅证明中止与收尾，不能算第二次完整门禁通过。最终清理读数：test_/e2e_ schema0，本次准确Compose项目容器/网络/卷0，预存PG容器保留。

## 范围与剩余条件

支持结论限于当前macOS26.6.2 arm64、Node24.21.0/Go1.25.5、Docker/PG18.6和受控Chromium147环境。Windows原生进程树、脱离进程组的程序、直接SIGKILL验证器/掉电、Docker部署全阶段强制中止未验；不能由Go租期清理推断这些通过。真实系统凭据库、终端确认、目标Chrome/Edge两版本矩阵、人工键盘/VoiceOver/视觉、签名公证、旧版实机升级、真实SMTP网络和介质待验照旧。

建议后续授权软件补证明确A编号，并由验收人员开展V03/V04；有隔离账号再做V05/V06。[剩余批次](m7-remaining-acceptance.md)继续按环境逐格登记。V13正式签收与发布仍未执行。
