# 009 · M6 状态、布局与真实流程进度

用户授权仅 T31–T33。M5 基线 cadb8b5；T02 / T25b / T28a / T29b 及既有人工作业、实机、介质验收保持待验，不进入 M7。依据已确认设计 01–06、D01–D15 和 tasks/plan、todo，原型参考快照不改。

T31 区分未完成加载、查询失败、拒绝、不存在、真实空集合和无匹配筛选；错误不会渲染为成功准备状态。404/403 返回合法列表；网络故障可本人重试且保留来源草稿。秘密只在已有允许的内存范围，成功、过期、身份或作用域变化仍清除；不把未知写结果宣称失败回滚。

T32 沿用现有 token / Phosphor / primitives。分栏由工具文档拥有 ratio / requestScroll / resultScroll，默认52%，30–65%；复制的新Tab不继承旧结果或滚动位置。分栏指针与键盘等价，窄屏纵向，区域独立滚动。语言/主题不更换文档，不清草稿；页面导航焦点与业务对象滚动分开。真实 Playwright + axe 自动检查不能代替人工键盘或读屏签收。

T33 七步由真实项目、连接/定义、本人交互事实、Run、上传回执和实际成功详情GET派生。邀请/无变量允许明确跳过，跳过不授权。失败/取消保留实际调用事实，但不伪称成功；上传失败不完成历史。历史和保存对应同用户/项目/连接/Run。来自平台已上传history详情的事实与尚未确认live upload分开；未知原operationId保持undefined，不捏造或复用其他操作。恢复新Tab不登记执行。内存事实只存ID/状态，不存原始响应/秘密；退出/撤权清除。刷新没有证据时未完成/未知，成功读取本人平台记录可继续。

接口衔接：T31 QueryFeedback.back用于T32可达的返回；T32 DebuggerSplitPane由ToolScope布局字段受控；T33 WorkflowProgress由真实执行和RecordDetail成功GET接线。M6不新增平台持久化或迁移，不用前端进度作为授权来源。

仅新增锁定测试依赖 @axe-core/playwright 4.13.0 / axe-core对应版本，现有Go/SDK/前端运行依赖不升级。按照 [Playwright官方自动可访问性方法](https://playwright.dev/docs/accessibility-testing) 与 [Deque官方包](https://www.npmjs.com/package/@axe-core/playwright) 使用真实引擎；它只能发现一部分问题，incomplete和人工矩阵明确待验。扫描证据只存rule/impact/target摘要，不存HTML、原始URL或输入值。截图遇有效密码/code/token输入不采集。

验证逐片RED/GREEN，最终完整verify保留全部M1–M5回归并添加M6状态/布局/连续正常及异常旅程。26页对应正式路由或局部视图，N/A须说明原因；正式A项不批量签收。最终实际结果和限制只记docs/tasks与tests/evidence。

最终审阅细化：session检查使用请求freshness及身份generation；独立bootstrap metadata不会被同轮匿名401吞掉。PlatformClient的可选isCurrent仅隔绝过时session检查的全局401/403副作用，当前响应仍真实撤销会话/权限；同session两个refresh晚返回401已有RED/GREEN，不能只挡组件回调。canonical邀请明确清ID时离开原path。环境预览props由route驱动，同scope编辑异步完成也必须检查context。局部表格保持640px且scrollregion可聚焦，禁止靠逐字断行满足“无整页溢出”。
