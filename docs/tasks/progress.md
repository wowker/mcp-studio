# M0–M1 执行账本

2026-10-13。授权：T01–T09；不进入 M2。Git 分支 `codex/m0-m1`；设计参考基准提交 `7eac7d4`。

| 切片 | 状态 | 修改与实际验证 |
| --- | --- | --- |
| T01a | 完成 | 001基线文档：26页面、15交互、D01–D15来源映射；只读取参考快照 |
| T01b | 完成 | 001身份词表与目录/内容/私人能力，64向量中12权限反例在JS/Go通过 |
| T02a | 当前设备实验完成，完整矩阵待验 | 002；browser-green.json，Chrome155/macOS26.6.2：9/9。公网HTTPS LNA、另版Chrome/Edge/远程网络未验 |
| T02b | 当前设备实验完成，完整矩阵待验 | 回环Host/Origin/短期一次码/撤销＋本机stdin明确确认：node --test安全/本机确认4/4。Windows/Linux/原生人工UI未验 |
| T03a | 完成 | 003状态/事件/etag/游标/幂等合同、Agent security-v1、平台OpenAPI v1及Go/TS生成，生成一致性1/1通过 |
| T03b | 完成合同准备，后续产品联验保留 | JS/Go各64共同语义向量通过；锁定Go1.25.5/Node24.21.0/PG18与依赖；GoSDK1.4/TS SDK1.29 in-memory握手工具发现各1/1；TS生成文件严格类型检查与Go wire编译通过 |

M0验证：`node --test scripts/generate-contracts.test.mjs tests/fixtures/sdk/ts-sdk.test.mjs` 2/2；`node scripts/contract-semantics.mjs` 64；`GOCACHE=/private/tmp/mcp-studio-go-cache go test ./internal/contracts ./internal/wire ./tests/fixtures/sdk` 通过（wire无单测，仅编译）。回环检查需获批socket访问，沙箱EPERM不是功能失败或通过证据。

M0推进判断：完整T02与C01保持未勾选。未验证MCP通道不放行；M1身份、数据库和协作与这些通道无执行依赖，按plan“风险未解决，不批准依赖路径”和缺测试环境保留待验规则继续。没有把有限Schema oracle、内存SDK或原型209项计作产品验收。M2/M5补HTTP SDK/OAuth/stdio与目标浏览器OS矩阵。

M1共享接口检查：T04产生数据库、平台同站点入口，T06使用独立Cookie会话；T07验证真实邮件归属，T08/T09消费最新会话与数据库关系；UI消费生成Zod合同，不决定服务端权限。所有写请求Origin/CSRF复核。T08/T09共享团队行锁顺序，邀请/成员授权与项目关系在同事务重查，避免最后维护者与旧邀请覆盖竞态。

M1正在执行；每叶验证后单独补登记，正式A项未完整覆盖仍待验。
