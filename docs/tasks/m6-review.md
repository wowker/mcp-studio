# M6 工作包审阅 · T31–T33

范围仅 M6，基线 cadb8b5。T02、T25b/T28a/T29b 及既有实机、人工、介质联验继续待验；不进入 M7，不签收正式 A01–A60。

| 叶子 | 实现与可执行检查 | 验收限制 |
| --- | --- | --- |
| T31a | P01–P26正式路由/合并视图状态矩阵；真空集合、无匹配、loading、网络、403/404、只读；拒绝/不存在返回合法来源 | 原型状态与旧209项不抵扣正式验收 |
| T31b | 输入及scope保留；bootstrap独立失败、已登录deadline重试、旧initial/session迟到401/成功被隔绝；路径邀请显式离开；环境同项目Back同步真实scope | 会话/权限仍由平台和Agent实际复查 |
| T32a | 中英×亮暗×390/820/1024/1440及1024×640；实际初始化、身份、协作、配置、工具、记录、设备视图；独立滚动、可聚焦表格、每Tab分栏及草稿/滚动保留 | 只有运行日志与coverage证明实际到达的组合；未配对不冒充OS/vault/介质路径 |
| T32b | 真实axe WCAG2/2.1 A/AA及导航Enter、Tab箭头、菜单Esc/Tab、分栏键盘界限、嵌套参数错误定位、skip-link | 人工仅键盘/读屏仍待验，叶子不勾选；axe incomplete不冒充通过 |
| T33a | 真实项目创建/邀请送达、本人项目连接Run、冻结operation/回执及成功详情GET派生七步；失败/取消/上传失败不完成；刷新未知不造事实 | 进度仅会话ID/状态，不保存原始参数响应或秘密，不授权动作 |
| T33b | 真实邮件新账号身份修复返回同邀请且仍需接受；实际HTTP调用、history、sameRun保存、刷新继续、显式重连后新未执行Tab；上传503重试不重调用；失效scope返回 | 受控生产入口证据不是目标浏览器/OS/公网LNA支持矩阵或人工A60签收 |

审阅与实际修补：Tool tablist非法子角色由真实axe发现，改为只含Tab的tablist与外部关联菜单/关闭控件；不禁用规则或伪造角色。记录详情effect改primitive scope依赖，避免等价对象重渲染重复事实。独立只读审阅发现deadline bootstrap失败无Retry、初始session迟到覆盖新登录、路径式邀请无法离开、环境同项目Back继续使用旧scope，均加入回归。初始401先于bootstrap的新竞态另有回归，bootstrap请求拥有独立freshness，不被合法匿名401误弃；同session旧refresh的401也不能触发PlatformClient全局expire，isCurrent将副作用与组件回调都隔绝。

独立工作流审阅未发现身份/项目撤销后晚返回回填漏洞；Browser/Agent现有generation、scope/identity fence继承。保存副本删除后保留“曾保存”历史事实，404详情可返回，不宣称对象仍存在。Go Agent当前status与snapshot同源，未扩大协议或引入新后台持久化。

截图审阅发现成员/邀请/变量表格窄屏逐字断行，补640px局部表宽与可聚焦滚动region，窗口检查新增表宽与键盘可达断言。修补前40视图缩略图保留，最终以完整verify的新矩阵为准。截图遇已填密码/code/token会withhold；axe仅保存rule/impact/target，未保存HTML/值/原URL。

保留真实失败追溯：最初axe required-children；测试错误文案、connected状态不能改连接配置、记录详情返回列表、刷新后未显式重新连接均曾导致浏览器失败。修正测试以遵循正式恢复要求，没有自动连接、自动接受邀请、重调用或降低门禁。前端全套最初沙箱EPERM监听失败，解除该环境限制后562项通过；后续新增回归仍需最终完整门禁证明。

追加状态文案回归：记录列表/过滤/详情的failed不再复用邮件投递failed，使用独立recordRunFailed；双语10项focused通过，真实失败Run另检查双语列表与上下文。后续滚动检查曾在切语言后仍按英文ARIA名称查对象而失败，改用稳定同一scrollregion并单独校验其语言名称，保留failure追溯。

最终版本与完整门禁见本页末尾及执行账本。

完整门禁还捕获 M5 browser 保存 Agent 来源的真实400。严格 POST/回执断言与15次诊断复跑定位为 environmentVersion + redactions 跨端默认脱敏漂移（2/15失败）；未放宽平台来源证明。修补提交 `fc0b161` 采用既有 TS/Go 保护的保守并集，30条实际生产共同向量，固定哈希的 Snapshot/Agent缓存/平台拒绝不一致来源与接受真实安全来源回归。原19条预期和M0 64条oracle不改；具体RED/GREEN见ADR010及m6-source-redaction、m6-root。最终完整门禁结果如下。

最终实现fc0b161，完整verify退出0，Node20、前端57文件/591测试、真实隔离PG Go测试/vet/三产物构建、全部26条M1–M6生产旅程通过；来源保存连续15/15通过。矩阵37真实子视图、760核心几何检查，另37布局检查，axe159次0已确认violation/2份incomplete，824 PNG；实际产物hash和环境见m6-final/manifest.json。T32b人工及既有T02/实机/介质继续待验，正式A项均待验收，不进入M7。

最终截图复审：m6-root/final-visual-review-1–4 汇总本次真实产物的中亮390（42张）、英暗390（42张）、中暗短屏（38张）与英亮1440（49张）共171张代表截图，已检查布局；结合全部逐窗口字体/非零内容/整页溢出/局部表滚动断言。未观察到新的整页遮挡或逐字表格挤压；不把代表图审阅冒称为人工全矩阵视觉或读屏签收。原始824张PNG保留m6-final。
