# V01 / V02 执行与验证范围

基于M7冻结源3056a6b，当前登记基线2432956。用户只授权V01逐项正式预期/证据核对与V02中止Go测试夹具清理修补；不发布、不做原生安装/人工配对/真实凭据库/介质测试。

## V01

逐项读取原正式CSV、06正文、D01–D15和具体断言；审计保存在v01-assertion-audit.json。60项187条款：105受控断言支持、73部分、6未找到、3环境待验；347条引用是源断言位置引用，不是347份独立执行日志。所有断言文件与M7 source.inputs摘要吻合。Go历史日志是包级、浏览器是具名旅程级，源审阅不新增执行证明，不将原型209项抵扣验收。

即使某项各条款都有受控断言，也不能自动勾正式通过：仍核对情景组合、目标环境、证据粒度和该项剩余条件。A01–A60正式状态全部保持待验；T02/T32b及实机、人工、介质边界不变。

明确缺口登记为后续待补，不在本次擅自扩产品行为：新项目全内容空、连接/执行跨端依赖阻断组合、署名/取消效果、语言切换期间活动Run、Developer固定API直拒、指定标题字号等。A30可见pane过滤先排除零高，现有断言不足以证明所有必需pane非零高；A47精确边界与直接容量贡献、A53/A55完整组合、A51旧诊断清除等为部分证据。RecordDetail删除确认状态转换只有静态风险，尚未复现，不报告为已证实故障。

## V02 资源所有权合同

- 原故障真实RED：Go子进程中止/exit7后内部schema仍为1；原runChecked在AbortError先返回，真实子进程尚未完成清理。默认sandbox fs.watch EMFILE是环境失败，授权环境下behavior RED才是复现。
- Node为本次随机e2e schema设置运行标记并保存OID；Go两处真正创建schema的助手共用testsupport.CreateSchema，在事务内CREATE+COMMENT。本次孩子使用不可预测的父nonce命名，评论含完整运行标记；同父advisory lock串行创建与关闭。
- 清理只按本次完整标记选取，再验证名字/实际owner/OID；不对test_前缀做批量删除。父对象替换时fail closed，未知/其他运行资源不删除。关闭后迟到的Go创建在CREATE前拒绝。中断CREATE/COMMENT之间事务回滚。
- 实际Go池Host/User/Database及fallback必须专用回环mcp_studio_test/mcp_studio_app，拒绝SUPER/BYPASSRLS。Node DB秘密只用环境传输，不入argv/日志；所有输出错误为稳定消息。
- 当前macOS下受控命令使用独立进程组，中止先TERM再有界KILL，等待close才进入DB收尾；中止始终exit130，失败exit7保留，不能当通过。测试覆盖真实SIGINT/SIGTERM入口、父/继承子进程、正常失败、并发、自有schema/同前缀未拥有schema、对象替换和租期关闭。
- 范围是本次报告的verify Go阶段/共享runtime数据库租期与受控进程取消。Windows原生进程树、脱离进程组的外部程序、直接SIGKILL验证器或宿主掉电不由finally保证；不宣称这些支持，既有OS/介质待验继续保留。Docker部署阶段既有正常finally证据不被冒称为本次新做全阶段强制中止验收。

阶段验证：focused RED/GREEN见tests/evidence/v01-v02-root；冻结修补源后跑扩展完整verify，验证新助手确实覆盖platform和migration全部Go测试，同时回归原26条浏览器旅程。旧M7证据/交付包保持原版本，本次不是发布或原包无痕替换。
