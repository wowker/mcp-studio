# 010 · 默认脱敏一致性与 Agent 来源保存

范围：M6 T31–T33 完整门禁发现的跨端回归修补。平台 / Agent 合同版本、上传责任端、来源证明和 M0 64 条语义向量不变，不进入 M7。

## 问题与证据

M5 浏览器从 Agent Run 保存独立副本的真实旅程间歇返回 `400 invalid_source`。增加实际 POST 状态及严格回执断言后，15 次复跑有 2 次失败；`tests/evidence/m6-m5-source-diff` 保留两份脱敏诊断：仅 environmentVersion 与 redactions 不同，平台历史已有 `/context/environmentVersion` default marker，浏览器保存缺失该 marker。日志不记录原值、请求正文或凭据。

Go 默认规则会遮盖包含长数字序列的版本哈希；TypeScript 原默认规则没有对应的通用电话规则。平台再脱敏历史，浏览器保存却提交未一致处理的来源快照，因此严格来源证明正确地拒绝保存。不能通过放宽 `sameSourceSnapshot` 或允许不一致来源解决。

## 决定

两端采用既有保护规则的保守并集。TypeScript 增加 Go 已有的通用电话、8 字符以上 sk 前缀、敏感字段子串、空 userinfo 与完整 HTTP-scheme URL 保护；Go 保留这些规则并补 TypeScript 的 passwd/mobile 别名、嵌入式 URL、signature 查询名、丰富邮件字符与 Bearer 空白。两端均不缩小原保护范围，保留 0 / false / null。

`contracts/fixtures/recording-v1.json` 新增 11 条固定生产校验向量，共 30 条，由实际 TypeScript / Go 脱敏实现消费。原 19 条预期不改；M0 reference oracle 64 条独立保留，不能把新增生产向量冒称为 M0 oracle。

Agent UI 先验证原始 Run / user / project / connection / tab 身份，再使用共享 sanitizeSnapshot 设置结果缓存，默认复制与后续保存得到一致的安全快照。没有改变 Agent 执行和上传责任、浏览器凭据来源或平台当前真实权限检查。

## 验证

固定哈希的 Go 平台回归验证：历史含 context marker；不一致原值副本拒绝，采用实际记录快照的同 Run 独立副本接受，篡改 Run status 仍拒绝。Agent UI 回归先 RED（缓存原哈希），修补后 GREEN；身份不变、原对象不修改且仅发一次 Run。共享生产向量的 TS / Go RED/GREEN、Go overlay 旧实现失败证据见 `tests/evidence/m6-source-redaction`，root 补充证据见 `tests/evidence/m6-root`。

最终连续复跑和全门禁以 `tests/evidence/m6-final` 的实际结果为准。T02、原生 OS / 人工 / 介质、T32b 人工键盘读屏和正式 A 项继续待验；受控夹具不抵扣实机支持。
