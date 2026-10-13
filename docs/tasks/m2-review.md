# M2 T10–T14 独立审阅记录

2026-10-13；范围：平台配置/环境持久化、浏览器个人内存授权、OAuth 与 HTTP/SSE 会话及真实入口；不含 T15/M3、Agent 或 T02 完整兼容矩阵。审阅与测试结果来自新工程实现，未使用原型模型抵扣。

初轮审阅未发现 Critical，发现并逐项修复以下行为；每项均有对应回归，不以界面禁用代替 API 权限。

| 问题 | 修复与回归位置 |
| --- | --- |
| SDK 断流仍误报连接，旧 SSE 重试 GET | browser-session.ts / browser-session.test.ts：onerror abort/close，真实 SDK transport 断流回归 |
| Viewer 降级仅清页面、根级内存仍保留 | App.tsx / App.test.tsx：真实能力刷新使所有个人值和会话清理 |
| 多个公共变量拼接后产生可识别秘密URL | Go configuration_references / configuration_test，TS connection / connection.test：解析后检查完整URL与decoded path；红→绿 |
| JSON Infinity 被视为合法值或Go序列化为null | Go resolve_test，TS environment/configuration，VariableEditor：有限JSON值强制校验；红→绿 |
| 服务器信息敏感叶子超上限后漏屏蔽 | browser-session.test：超过4096叶子整块隐藏，最后秘密叶子不会回显 |
| legacy SSE POST 401/403被归为普通网络错误 | browser-session.test：fetch入口保留安全状态并映射认证/拒绝，原始错误不进入UI |
| 个人敏感JSON误用公共秘密阻止规则 | VariableEditor.test：个人值只校验有限JSON及类型，允许Token/JWT/秘密内容且不持久化 |
| 回调查询要等effect才被清理 | App模块入口同步调用安全回调helper，先replaceState再postMessage |
| 非法stdio参数离开页面丢失、OAuth scope空格无法编辑 | ConnectionsPage.test：原文独立草稿，解析成功才同步配置；scope编辑原文保留；红→绿 |
| OAuth token被带至修改后的资源，弹窗同主机名发送平台Cookie | oauth/browser-session/vault测试：绑定resource；同主机名弹窗拒绝；fixture双主机名cookieRequests=0 |
| HTML select精确可访问名称混入选项文本 | ConnectionsPage / EnvironmentPage / VariableEditor明确aria-label；exact combobox组件与真实浏览器回归 |

第二轮审阅实际运行8文件96测试通过；新增两项 P2 均已修复：

- Vault失效通知只含用户/项目/连接与原因，M2Memory按实际拥有者断开对应SDK会话，包括未挂载面板。runtimeStore.test 的100ms TTL与真实SDK回归先失败，再修复通过；Vault迟到过期通知受更换代际保护。
- 所有连接/环境/变量 DELETE 响应写入Memory/导航前检查 operationGeneration；连接导航还在 useAction mounted completion 内执行。迟到DELETE barrier回归证明新身份同连接草稿不会被旧响应删除。

最终独立复核实际运行 vault、runtimeStore、ConnectionsPage、EnvironmentPage **4文件23测试通过**；无剩余 Critical / Important。完整 verify 与浏览器结论以执行账本最终证据为准。
