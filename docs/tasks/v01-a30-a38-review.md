# V01 A30 / A38 布局与固定 API 补证

2026-10-14。基于登记d9b3609 / 前轮验证源3ad6445，仅执行用户授权的A30必要pane/底栏、A38 Developer固定API直拒；实际缺陷复现后最小修补，完整verify，逐项登记，不发布。A38切片8e8aa66、A30冻结 **f2fd29bdffb40e49673fe9e6669bc8669505876b**。

## A30 · 先证明必要内容，补回遗漏底栏

原verifyLayout的shown会先过滤零宽高，不能证明必需pane存在。新旅程预先声明main、工具根/目录/工作区/文档/tabpanel、debugger布局/split/request/result共10个selector，逐一检查count=1、宽高>0及显示状态，中英×亮暗×390/820/1024/1440及1024×480共20格。实际Browser MCP先执行一次长结果Run，逐格保持草稿、唯一历史及一次Tool；参数校验、结果复制和侧栏语言控件真实滚动/聚焦/trial-click，检查完整rect、各层裁切和命中，无force点击。

复现产品缺陷：Shell缺少设计03明确的64/24顶栏/底部状态栏；真实组件RED、生产入口浏览器RED均失败“底栏不存在”。按已有基线补回独立24px网格底栏和sidebar跨三行，移动布局也使用三行。只显示当前可读项目名称（含完整title），无canRead时显示项目目录，复用语义token/双语/共享Shell；不伪造运行或Agent状态。组件回归验证失去内容访问时不泄漏名称/title并保留输入。

底栏逐格完整视口、非零尺寸和3点无遮挡命中；共用verifyLayout同时加强既有实际P01–P26状态/截图矩阵的main和底栏检查。人为压零request及移动底栏越界的受控CSS探针被新oracle拒绝、finally恢复；它们是断言有效性证据，不冒称新增产品缺陷。8份新截图已保存，根代理检查手机英文亮/桌面中文暗的布局，不抵扣人工视觉/读屏/目标浏览器验收。

## A38 · Developer 直接 pin/unpin 拒绝且无副作用

真实隔离PG/生产API middleware，用实际cookie/CSRF登录的Developer及普通团队成员Maintainer，live项目读取证明真实角色。两种实际上传共享历史：Developer本人所有、另一成员所有。Developer读取成功，但携带当前有效ETag的pin=true和pin=false各403 forbidden，完整API记录/etag/version/updatedAt、原始PG记录及项目audit/revisionaudit均不变。推进测试时钟确保意外更新时间写入可检测。

每条记录按Developer拒绝pin→非Owner Maintainer200 pin→Developer拒绝unpin→Maintainer200 unpin，正向版本/ETag/time/audit增长，只归成功维护者。现有权限实现直接GREEN，无生产源修补，不以UI隐藏或Owner成功外推拒绝。未扩展其他Agent队列/降级责任端组合条款。

## 实际验证、登记和限制

- 聚焦Shell两文件4项、前端类型/构建、E2E strict Bundler类型均通过；新生产浏览器1/1（20格＋2负向oracle），0失败/跳过/重试；整个platform真实PG Go包通过，新增1顶层测试含本人/他人两子case。[focused说明](../../tests/evidence/v01-a30-a38-focused/README.md)保留真实底栏RED、测试编译/命令配置错误及GREEN。
- 限定独立审阅无Critical/Important/Minor，审阅者只读、未跑测试。修补/测试各切片后冻结f2fd29b，实现输入在完整门禁中保持一致。
- [完整verify](../../tests/evidence/v01-a30-a38-final/verify.log)实际exit0：601前端/61文件、33基础Node、12运维/分发、真实隔离PG全量Go/24个具测试包、vet/生产与helper构建、四目标未签名Agent候选、平台镜像及真实隔离HTTPS/STARTTLS/权限/恢复/未来迁移拒绝、32浏览器。0失败/跳过/重试；Go无单测包仅编译，race/依赖审计未重跑。
- [manifest](../../tests/evidence/v01-a30-a38-final/manifest.json)：360冻结输入SHA `a83115b856ce86852885f7f2063787fa2305d977b311c01d95eb013da94b39bd`；真实环境/产物/锁文件摘要如实登记。835PNG/159axe，0确认违规，原英文工具亮/暗color-contrast incomplete仍人工待验。
- [清理](../../tests/evidence/v01-a30-a38-final/cleanup.json)：自有准确租期schema和Compose资源0，预存PG保留；runtime finally结束本次Agent/平台/SMTP/MCP/OAuth/TLS。未做前缀批量删除；CLI中止证据仍为历史V02，不称本轮重跑。
- [增量JSON](v01-a30-a38-supplement.json)绑定正式原文/新行号/摘要/执行版本。CSV只追加A30/A38两行，其他58不变；原审计与两轮补证JSON、全部原72叶子、设计快照和M7归档不变。[登记核对](../../tests/evidence/v01-a30-a38-final/registration-check.json)保留检查记录。

A30两目标受控自动缺口已补齐，但整体仍保留partial/environment-pending，目标浏览器与人工条件未完成。仅A38固定条款从partial补为受控支持，有效116支持/68部分/0未找到/3环境；其他条款不批量重评。全部60项正式待验收，0签收；T02、T32b及实机/人工/介质保持待验。只保留本地提交/未签名候选，不替换旧M7交付归档，不推送/合并/tag/签名/公证/发布。下一步仍选明确剩余软件证据或具备环境的验收批次，不擅自执行。
