# V01 六条直接断言补证审阅

2026-10-14。基于3219b1e/V01审计，仅补A01、A09、A28、A32、A51的六条not-found条款。分切片提交1df5fca、c78fb00、d36331f、c3a1dc0；完整verify使用冻结源c3a1dc0678765e1720bc90e64f20663a898dd8d0。没有复现产品行为缺陷，本轮生产源未改动；新增断言在现有实现上直接GREEN，未伪造行为RED。本次不发布。

## 逐项实现与验证

| A项 / 条款 | 新直接断言与实际结果 | 证据 |
| --- | --- | --- |
| A01 成功空项目 | 实际PG/API创建空项目，与有内容兄弟项目对照；连接、环境、变量、历史、保存与record operations零内容，唯一成员为创建者维护者 | projects-members/go.log具名TestV01A01；新platform测试文件 |
| A09 连接和执行一致阻断 | 循环与嵌套缺失引用分别验证Browser connect/Run及Agent connect/Run；阻断时零Tool/无Run、Agent零新增HTTP/入队。连通对照与显式修复后实际调用成功 | environment-blocking/browser-green.log两case、agent-baseline.log具名两子case |
| A28 署名保留 | 两种实际移除后，共享历史及由私有记录实际发布的保存记录完整保留；详情全等、列表ownerId/ownerName仍原作者，移除成员失去项目读取 | projects-members/go.log具名TestV01A28/project、team及history/saved子case |
| A28 取消无副作用 | 组件及生产浏览器分别取消项目/团队确认；零API mutation，成员角色/作用域保留；真实成员关系、邀请、审计重载前后全等，两项目角色可访问仍一致 | integrated/frontend-focused.log；browser-integrated/results.json具名两旅程 |
| A32 运行保留 | 显式MCP barrier保持在途，中英×亮暗同项目/连接/Tab，草稿/运行状态保留，一次调用/零提前上传；释放后唯一历史Run和一次上传，四组合的完整Run快照/状态/结果一致 | browser-integrated/results.json、run-preferences.json及两张截图；新production spec |
| A51 失效诊断清除 | 补缺失原依赖/修复原类型值 × 显式apply/直接return共4case；原精确诊断与alert消失，新预览有效，连接仍断开、Connect可用、零自动权限/MCP请求 | diagnostics/focused.log；integrated/frontend-focused.log；新真实组件修复旅程 |

具体测试名/行号、SHA、正式原文和有效计数见[增量JSON](v01-direct-assertions.json)。这些断言只补对应条款，不将其他部分/环境证据自动改判，也不把整个A项签为正式通过。

## 实际验证和失败记录

- 整合聚焦：3前端文件15测试通过（A28文件9、A51四case、Browser A09两case），前端与两新E2E的strict类型检查通过；实际PG平台两个具名Go测试、实际Agent一个Go测试/两子case通过。
- 新生产浏览器切片3/3通过，零失败/跳过/重试，使用同站点生产构建、独立PG、实际MCP barrier。子代理A28先跑2条和根代理整合3条分别记录，没有相加冒称独立场景数。
- 测试编写错误保留：Node-only测试共享teardown缺localStorage、testing-library误用exact选项、测试期望文案错误。它们是测试代码/环境错误，修正后通过；不称产品RED或产品修复。详见[聚焦证据说明](../../tests/evidence/v01-direct-assertions-focused/README.md)。
- 限定独立源审阅批准，无Required/Important/Critical；复核具体六条断言均有独立字面预期、真实副作用和范围说明。审阅者没有执行测试或更改源码。

完整门禁、环境、冻结源输入、候选产物与清理结果以[本轮manifest](../../tests/evidence/v01-direct-assertions-final/manifest.json)和[verify.log](../../tests/evidence/v01-direct-assertions-final/verify.log)实际结果为准；只记录真实已结束的运行，不把未来命令称通过。

实际完整verify exit0：59文件/599前端、32基础Node、真实隔离PG全量Go24个具测试包、vet、platform/Agent/admin/helper及四目标Agent候选构建、12运维、平台镜像、隔离HTTPS/STARTTLS/权限/备份恢复/升级拒绝、29浏览器旅程（原26＋本轮3），0失败/跳过/重试。826 PNG/159 axe、0确认违规，原tools英文亮/暗2份color-contrast incomplete仍人工待验。最终test_/e2e_ schema0、本次准确Compose项目容器/网络/卷0，原PG容器保留。

## 状态与范围边界

原V01审计JSON保持历史187条款/105支持/73部分/6未找到/3环境。当前增量只将这6条改为受控断言支持，有效合计111支持/73部分/0未找到/3环境。其余条款没有本次重新批量审计，347条历史引用不冒称新执行次数。

原347处引用的源版本是3056a6b；新成员测试插入导致旧文件部分行号后移，追溯旧引用应按该历史提交还原，不能把旧行号当当前文件位置。增量8处断言引用单独保存当前行号与SHA，绑定c3a1dc0。

正式A01–A60仍60/60待验；仅五个目标A行追加当前源与补证路径，其他55行不变。原T02/T32b、T25b/T28a/T29b及M7完整叶子、实机/人工/介质状态不变。A09 Browser是在Node中跑实际运行时/SDK，Agent平台授权边界供应作用域响应，未冒称新权限/目标浏览器矩阵；A51是jsdom真实组件且平台HTTP边界受控，未冒称实机/实浏览器签收；A32在途UUID没有UI出口，用barrier/同Tab/一次调用证明持续，完成后直接比对Run UUID与全快照。

候选只在本地新目录留存，未签名/公证/发布；原M7归档、V01/V02证据及设计参考快照不替换。V03之后、其余73条部分证据（如A04/A07/A30/A38/A45/A47/A53/A55）和A21静态风险未进入本次范围。后续继续按明确A编号或具备环境的V批次授权执行。
