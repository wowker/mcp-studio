# T15 / M3 实施审阅

2026-10-13。范围为补齐 T15、实现 T16–T21。审阅覆盖正式代码、共同向量、真实 PostgreSQL 和生产浏览器入口；设计快照未改动。T02 完整兼容矩阵、M4 持久队列及 M5 Agent 不在本次支持声明内。

## 独立审阅与修复

先按边界审阅参数/Schema、平台记录事务与权限、执行运行时和记录界面；收到问题后分别补回归并修复。以下是已处理的问题及正式验证入口。

| 范围 | 发现的问题与最终处理 | 回归证据 |
| --- | --- | --- |
| T15 | 目录元数据/复制工具名可能回显凭据；关闭焦点丢失；删除记忆连接形成伪空目录 | T15 已在 adf6622 签收；m3-t15/verify.log、browser-session/ToolsPage/workspace tests |
| T16 编辑 | oneOf 切换清除其他字段的非法原文；改单字段清除不相关错误；数组删除后路径状态错位 | SchemaArgumentEditor.test.tsx、argumentDraft.test.ts；m3-t16/focused-final.log |
| T16 跨端 | multipleOf 浮点epsilon、regex和极端JSON指数导致Go/TS语义或计算边界不同 | schema-v1.json 49共同用例；Go/TS正式校验，生产CSP浏览器组合/递归/remote拒绝 |
| T17 脱敏 | Schema属性名被当注释删除；自由上下文、元数据、修订原因及数值/布尔回显遗漏 | runtime/records/{redaction,operations}.test.ts、internal/recording、records_test.go，7摘要/19脱敏共同用例 |
| T17 权限/来源 | 幂等回执不能绕过撤权；来源证明须使用当前规则安全投影；Cookie不能冒充Agent负责history | 真实PG撤权行锁、原操作并发/回滚、不同摘要冲突、来源篡改/旧未脱敏投影拒绝；TestCookieRecordUploadsCannotClaimAgentResponsibility |
| T18 执行 | 最新工具/环境/权限须在Run前检查；环境展开后再限输入；取消迟到与身份撤销不能发布旧结果 | execution/index.test.ts、真实SDK HTTP/SSE fixture.test.ts、m3.spec.ts 延迟/取消/超时/401/RPC/isError/outputSchema |
| T18 生命周期 | 捕获连接授权后异步读取可变选项；撤销Viewer项目A误失效项目B回调；Run整体省略后失去所属项目 | 固定私有连接上下文；identity/project独立代际与私有Run归属；ToolExecution/index/restore/RecordEditors tests |
| T19–T21 | 游标必须固定筛选和highWater；私有记录需SQL过滤；追加脱敏成功在离开页面后仍应清旧缓存 | records_list.go/records_test.go、RecordsPage/viewStore/RecordEditors tests，浏览器关联副本/删除历史/恢复连续旅程 |
| T20 私有来源 | 已掩码请求无法再向新备注提供凭据来源，个人不透明凭据可能回显 | 保存/修订先捕获私有脱敏闭包；operations.test.ts、RecordEditors.test.tsx、实际Token回显/复制/备注浏览器旅程 |
| T21 恢复 | 不能把已脱敏工具名称当真实工具；应用环境与当前session-access不可用旧共享默认替代 | restore.test.ts；拒绝脱敏身份、已删除服务、实际Viewer降级；保留0/false/null、移除marked顶层参数、旧Tab不动 |

## 生产联调发现

- React 参数编辑器和执行器曾使用相同兄弟key，切Tab产生重复编辑器。现在使用独立key，ToolsPage回归与真实多Tab旅程验证。
- 平台回执实现原用accepted，与1.2.0的recorded不符。浏览器真实HTTP 200后合同校验失败揭示问题；receipt-red.log实测失败，receipt-green.log通过，上传/修订回执均遵守生成边界。
- 执行前无效Schema曾只记errors而未更新validation，Raw错误摘要不可见。两项组件回归先失败后通过，实际浏览器无效输入不调用Tool，可保存为私有未完成草稿；非法JSON禁止保存和执行。
- RPC SDK摘要类的静态引用破坏连接SDK懒加载，私有诊断未经大小约束可在克隆时失败。移到execution/protocol.ts，在克隆前限制正文、深度、节点、有限数及循环；保留实际错误码，必要时明确省略。正式构建恢复独立browser-session chunk。
- 目视记录截图发现成功元数据修订后旧编辑表单残留。同根因核查另存入口，真实RecordsPage集成回归也实测失败：上传已recorded但详情重挂载保存表单。保存与重试的成功状态清理需在所属项目代际有效时完成，不能依赖已经卸载的useAction.done；另存开关也放在项目/记录根视图，成功先清再刷新。回归和浏览器检查返回详情无旧表单、另存后关闭且可重新打开/取消。

失败预检保留在 [m3-preflight](../../tests/evidence/m3-preflight/) 与 [m3-t16](../../tests/evidence/m3-t16/)。最终通过证据以 [完整 verify](../../tests/evidence/m3-final/verify.log) 和 [浏览器结果](../../tests/evidence/m3-final/results.json) 为准，版本和实际数量见 [执行账本](./progress.md)。没有削弱CSP、断言、阈值或跳过失败检查。

## 实际限制

协议正文是SDK摘要，未提供原始传输帧trace；HTTP成功状态未知时保留0，不编造200。取消/超时不承诺回滚。平台验证记录身份/权限/内容合同，不将摘要称为上游执行签名。

浏览器失败操作仅会话内冻结重试，没有刷新持久恢复、可靠重认证调度、项目/队列容量和保留封存作业。Agent来源保存只用合成存档证明身份保留，Agent执行及上传认证未实现。受控Chromium、回环HTTP/SSE/HTTPS OAuth和自签测试TLS例外不抵扣目标Chrome/Edge/Windows/Linux或公网LNA矩阵。A01–A60仍待正式联验。
