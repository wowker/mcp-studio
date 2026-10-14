# A04 / A07 聚焦验证与失败分类

本目录为逐切片证据，最终完整门禁另见[final](../v01-a04-a07-final/README.md)。

- cors/fixture-red.log：新增CORS拒绝端点原先仍含ACAO，属于测试夹具能力RED；fixture-green.log实际7项通过，非产品故障。
- cors/browser-first.log、results-selector-error.json：字段label错误；browser-after-navigation.log及results.json为单项通过。
- integrated/browser-first.log、results-harness-first.json：测试未等created URL/旧详情完成及Browser状态期望错误，均测试编写问题。
- integrated/browser-second.log、results-second-red.json：A07真实重认证失败误报权限撤销是产品RED；同轮A04旧连接ID取值属测试导航时序错误。
- backup/platformclient-red.log：真实HTTP创建/恢复403错误码分类RED；platformclient-sessions-green.log修补后两整包通过含3新增顶层测试/边界子case。
- backup/platformclient-sandbox-error.log：默认sandbox拒绝loopback监听，环境错误，非RED；提升到授权环境后执行真实HTTP测试。
- backup/unit.log：组件1项GREEN，未改生产UI。typecheck/E2E strict通过；fixture-compile/spec-list仅编译和发现，不算执行测试。
- integrated/browser-fixed.log、results.json：冻结前最新两项实际通过，2/2零失败/跳过/重试；A04/A07安全元数据和A07清空密码后截图另存。

所有证据不输出原始密码/token/grant或凭据内容。Go helper使用测试MasterStore/本机确认，真实OS/目标浏览器/人工/介质待验。本目录失败日志保留原样，不作完整verify通过证据。
