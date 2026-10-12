# 新会话启动提示词

这些文字供用户在需要时复制发送；交接文件本身不授权开发。本包仅完成整理，下面三个提示词均未执行。

## 第一次：只执行 M0

在 Codex 中打开 `/Users/wuwei/code/github/mcp-studio`，复制以下整段：

```text
这是 MCP Studio 的独立开发目录：/Users/wuwei/code/github/mcp-studio。
现在授权执行实施计划的 M0（T01–T03），本次不进入 M1。

先阅读本目录 AGENTS.md、README.md、docs/handoff/REFERENCE-NOTES.md，
再阅读 docs/design-baseline-v2/design-handoff/ 下的：
README.md、08-decision-proposals.md、11-final-delivery-checklist.md，
以及 docs/tasks/plan.md、docs/tasks/todo.md、docs/tasks/acceptance-schedule.csv。
按领域查阅设计交付 01–06，涉及前端遵循 docs/FRONTEND-DEVELOPMENT-STANDARDS.md。

以用户已确认的设计基线 v2 和 D01–D15 为准。
参考原型为 docs/design-baseline-v2/workbench-preview.html。
历史对比稿、早期实施计划与旧产品源码架构不作为当前实现依据。

技术基线为 React + TypeScript + Vite、Go 平台、Go 本机 Agent、PostgreSQL。
浏览器直连可访问的 HTTP MCP；受限 HTTP 经用户显式切换 Agent；
stdio 由 Agent 执行；平台默认不代调 MCP。

M0 需要完成：
1. 登记设计来源、范围、身份模型、领域职责及权限矩阵。
2. 验证 HTTPS 工作台的 HTTP / localhost 与 Agent 回环通信关键兼容性。
3. 细化平台和 Agent 接口、执行 / 上传 / 修订状态、幂等、环境解析与脱敏合同。
4. 依据官方资料和兼容验证确定工程依赖版本，形成共同校验向量及工程决策。

允许为 M0 编写隔离的最小实验和规格，不提前实现完整业务或复制旧工程。
不使用真实凭据或生产数据。缺少目标 OS 或外部测试条件时，记录明确缺口，
推进不依赖部分，不能把模拟成功写成真实兼容通过。
保留 docs/design-baseline-v2/ 参考快照；进度和证据更新到 docs/tasks/，
工程决策写入 docs/decisions/，不要修改源项目或启动正式 MCP 业务调用。

完成后汇报 M0 产物、实际验证、未解决风险和 M1 的具体范围。
本次完成 M0 后停止，不自动进入 M1。
```

## 后续：只执行一个阶段

下面以 M1 为例；进入其他阶段时，同时替换阶段、任务编号和下一阶段边界，不要只改其中一项。

```text
继续当前 MCP Studio 工程，先阅读 AGENTS.md、docs/tasks/plan.md、
docs/tasks/todo.md、已有工程决策和上一阶段证据。

本次授权执行 M1（T04–T09），不进入 M2。
核查 M0 的前置条件和遗留风险，按依赖逐项实现新工程基础、统一 Shell、
身份会话、邮箱身份修复、项目访问、邀请和成员保护。
每个切片同时完成对应接口、页面、验证和任务登记，不预建全部业务模块。
沿用设计基线 v2；遇到新的实质规则冲突先说明，不用原型模拟替代真实实现。

完成当前阶段后，汇报修改、验证证据、待联验项、未完成项和下一阶段范围。
只勾选真正完成的叶子任务；正式验收未覆盖全部分支时保持待验。
```

阶段范围：M0 T01–T03；M1 T04–T09；M2 T10–T15；M3 T16–T21；M4 T22–T24；M5 T25–T30；M6 T31–T33；M7 T34–T36。M7 交付不等于自动发布或部署到生产。

## 换会话：先恢复上下文

```text
接手当前 MCP Studio 工程。本次先核对状态，不新增实现。
阅读 AGENTS.md、README.md、docs/tasks/ 下的计划与任务登记、已有工程决策，
检查工作区未提交修改和最近的验证证据。
区分原型参考、正式实现、未完成任务和仍待验的能力，不重跑已完成任务来制造进度。
输出目前阶段、未完成事项、风险和建议接着执行的最小任务范围，等待我指定开发范围。
```
