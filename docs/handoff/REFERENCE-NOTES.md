# 交接来源、优先级与携带说明

日期：2026-10-13；来源工程：`/Users/wuwei/Documents/ChatGPT/mcp-inspector`；目标：`/Users/wuwei/code/github/mcp-studio`。整理交接不代表执行 M0。

## 权威资料与工作副本

- 设计规则：`../design-baseline-v2/design-handoff/08-decision-proposals.md` 的 D01–D15。
- 页面 / 交互 / 验收：同目录 11、01–06；正式用例正文为 06，原始验收登记为 acceptance-register-v2.csv。
- 当前可更新计划：`../tasks/plan.md`、`../tasks/todo.md`、`../tasks/acceptance-schedule.csv`。
- 参考目录里的 design-handoff/tasks 是计划交付快照，只读追溯；后续不能同时维护两份执行进度。
- 原型：`../design-baseline-v2/workbench-preview.html`；A/B/C 仅为历史参考。
- 旧规范的字号、恢复行为、栈和范围由 D10 / D11 / D15 与最终范围对齐，其余质量要求继承。
- UPGRADE-2.0.0.md 与 AUTOMATED-TESTING-1.5.0.md 只补全旧规范引用，不引入自动化测试产品、脚本、套件、SQLite 迁移或旧 Node 后端。

## 原型与历史证据边界

保留原型所需 HTML、CSS、JS、翻译、图标、Schema 预览工具、截图、模型验证脚本与既有报告。本次不重写原型，不运行它来冒充正式能力。

原报告中的 209 项模型、各阶段浏览器截图与布局数量都属于历史证据；本次只检查交接文件、资源引用、任务和验收登记的一致性。验收仍全部待完成。

复制的历史文档 / 验证脚本内可能出现旧绝对路径、`docs/redesign/` 命令或旧端口，这是出处和当时执行上下文，不表示目标机器具有旧工程。当前启动方式以根 README 为准。浏览器验证脚本可能依赖旧仓库 Playwright，未承诺本包一键运行它们；静态原型本地资源齐备，不需要旧工程才能预览。

历史文档内提及的旧 ZIP / exports 报告是出处说明，本包不嵌套旧压缩包。本包的实际文件以 MANIFEST.json 为准，交接检查以 verification.json 为准，不能拿旧交付检查报告验证新包。

## 携带和校验

可直接复制本包全部内容到空目录；若目标已有同名文件，先比较，不能直接覆盖工作。当前指定目标目录在交接准备时为空。

MANIFEST.json 列出每个资料文件的相对路径、大小与 SHA-256；排除清单自身以避免自引用。verification.json 登记本次文档和资源检查，不是生产测试。压缩包和其 SHA-256 文件保留在来源工程 exports 下，解压根目录为 mcp-studio/。

若复制到另一个路径，基线与原型的相对链接保持可用；提示词中的目标绝对路径换为实际目录即可。不要把旧项目的 `.env`、数据库、个人 Token 或 node_modules 一起搬入。
