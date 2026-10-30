# B6 · 页面一致性与全链 · 只读审阅

日期：2026-10-29。基线：`5394c4a`。审阅对象：A29/A35 两条目签收；审阅方式：只读。结论：**无 Critical、无 Important**，Minor 1 条。

## 1. A29 每页状态不误报

App.test.tsx 19 tests 覆盖：会话过期卸载项目上下文、深链接不回内容、Viewer 项目切换保留另一项目草稿、旧授权表单在权限撤销后隐藏等——验证 Shell/页面错误状态不误报、恢复动作（重新认证/返回入口）保留上下文。Shell.test.tsx + RecordStates + IdentityStates 覆盖各模块状态管理。execution/index 15 tests 覆盖 forbidden/离线/业务失败状态。

## 2. A35 失败流程

execution runtime 验证：平台离线/权限拒绝/工具业务失败→不虚构 HTTP 成功、不创建 Run、保留诊断、区分 output_invalid。m6-flow e2e（之前版本）覆盖上传失败保持 incomplete、不调用 Tool。

## 3. 其余 6 条保持待验原因合理

| 条目 | 待验理由 | 方法学依据 |
|---|---|---|
| A30 | 需浏览器截图/axe；批次计划明确子项待验 | 批次计划 acceptance-batches.md:16 |
| A31 | 需浏览器多 viewport 渲染 | 同 A30 |
| A32 | jsdom 无 localStorage 持久化 | 方法论 D-B jsdom 等价性不覆盖"切换保留滚动位置" |
| A33 | 需真实浏览器键盘导航 | 同 A30 |
| A45 | 需视觉确认字号 | 同 A30 |
| A60 | 仅云版 + m6-flow 之前 T33 失败 | m6-flow/results.json |

## 4. 门禁

| 门禁 | 结果 |
|---|---|
| 前端 B6 7 文件（Node 24.21.0） | **46 tests passed** |
| Go 全量 | 复用 B5（同一份代码） |
| go vet | 复用 B5 |

## 5. 审阅结论

A29/A35 有当前代码版本上的可执行证据（前端单元测试全绿）。A30/A31/A32/A33/A45/A60 保持待验——需真实浏览器视觉/键盘/全链能力，jsdom 无法替代。**建议签收 A29、A35，保留 6 条待验。**
