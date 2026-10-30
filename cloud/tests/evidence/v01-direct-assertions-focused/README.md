# 六条直接断言聚焦证据

2026-10-14。A01/A09/A28/A32/A51补证，现有生产实现直接GREEN，未复现产品行为缺陷。本轮没有生产源修改，没有刻意制造行为RED。

| 目录 / 日志 | 实际范围 |
| --- | --- |
| projects-members/go.log | 真实PG/API A01空项目、A28署名；两个Go顶层测试及具名子情景 |
| projects-members/frontend.log、typecheck.log | 9个MembersPage组件回归与修正后的类型检查 |
| projects-members/browser.log、results.json | 子代理首次实际生产入口两条A28取消旅程，2passed |
| projects-members/test-authoring-corrections.md | 测试期望字符串与ByRoleOptions编写错误说明；非行为RED |
| diagnostics/baseline.log、focused.log、summary.json | 初始两case到最终4case；3文件29通过包含相关原回归；平台HTTP边界受控的真实组件修复链 |
| diagnostics/typecheck.log | 并行新增MembersPage类型参数错误，未算通过；最终类型以integrated和full为准 |
| environment-blocking/browser-baseline.log | Node-only共享teardown缺localStorage；两测试主体走完后teardown错误，非产品RED |
| environment-blocking/browser-green.log | 修正Node测试环境后实际BrowserSession/SDK两种依赖错误connect/Run、零Tool与修复后恢复 |
| environment-blocking/agent-baseline.log | 实际Go引擎/SDK/临时测试vault两种依赖错误，真实HTTP/Tool/入队计数及显式修复 |
| integrated/frontend-focused.log、typecheck.log、e2e-typecheck.log | 整合15组件/运行时测试与前端/E2E strict类型检查通过 |
| browser-integrated/runtime.log、results.json、run-preferences.json | 根代理统一生产入口切片3/3：A28两作用域取消、A32在途/完成Run中英×亮暗；0fail/skip/retry |

参与者基于同一工作目录分文件改动，聚焦产物在源码冻结前生成；最终冻结版本与全门禁以[v01-direct-assertions-final](../v01-direct-assertions-final/README.md)为准。限定独立审阅无Required/Important/Critical，审阅者未执行测试。

真实系统凭据库/终端、目标Chrome/Edge矩阵、人工/介质、A项正式签收全部待验。本次不发布。原V01/V02清理及M7证据不修改。
