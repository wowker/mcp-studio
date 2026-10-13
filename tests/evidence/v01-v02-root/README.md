# V01 / V02 聚焦验证证据

2026-10-13–14。V01是源断言和历史M7报告的逐条审计；V02使用实际Go子进程、独立进程组和专用本地PostgreSQL。合成测试身份，不修改业务库或已有个人Agent状态。

| 证据 | 实际含义 |
| --- | --- |
| v01-integrity.json | 60个唯一编号/正式预期逐字匹配；187条款、347引用的文件摘要与M7相符、行号范围有效，历史报告存在；非新执行或正式签收 |
| abort-schema-red.log | 修补前两个真实中止/exit7内部Go schema均残留；2失败 |
| abort-schema-green.log | 初始租期修补后4项通过 |
| abort-process-red.log、abort-process-green.log | 默认sandbox的fs.watch EMFILE环境错误；文件名含green也不能充作通过证据 |
| abort-process-behavior-red.log | 授权实际环境复现原AbortError提前返回，停止marker不存在；1失败 |
| abort-process-behavior-green.log | 原父/继承子收尾3项通过 |
| connection-identity-red.log / green.log | 用实际池错库配置复现guard缺失；修补后身份与事务2项通过 |
| fallback-identity-red.log / green.log | Go overlay移除fallback guard后，BeforeConnect观察到本应拒绝的配置；未真的联网；修补后通过 |
| abort-safety-green.log / abort-signal-green.log | 逐切片10项、12项通过，包含SIGINT/SIGTERM受控入口；不是完整verify CLI所有阶段强制中断 |
| schema-safety-final.log、schema-review-final.log | 专用库/user/host/fallback在联系前拒绝，CREATE/COMMENT之间取消回滚；2个Go测试，后者具名记录四个身份子情景 |
| review-regressions-red.log | 审阅两项Important的3条回归全部失败：TERM后父先退仍遗留后代；替换schema清理覆盖130/7 |
| review-regressions-green.log | 上述修补后15项通过，尚未包含后来加的readiness回归 |
| review-final-green.log | 最终冻结源9ed9292，16项通过，无失败/跳过；包含无marker提前exit7的readiness回归 |

初始失败用具体自有ID收尾；测试明确证明同前缀但未拥有schema及并行租期不被删除。最终全量验证见[完整门禁](../v01-v02-final/verify.log)，记录源版本和清理结果另见该目录manifest/cleanup。日志中未打印数据库连接串或凭据。

完整门禁后[实际verify CLI的Go阶段中止](../v01-v02-interrupted/result.json)观察到真实内部Go schema，再发SIGINT；实际130、父/子为0且没有手动删除。此中止日志不是第二次完整GREEN，也不是其他部署阶段强制中止验收。

独立审阅：第一轮2 Important/1 Minor；补实际RED/GREEN后限定源复核关闭。审阅者没有运行测试，16项执行由根代理实际完成，不冒称复核执行。

范围限制：Windows/脱离进程组、验证器直接SIGKILL/掉电、Docker阶段全流程强制中止、原生确认/凭据库、人工与介质继续待验；本次不发布。
