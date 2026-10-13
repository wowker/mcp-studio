# M5 工作包审阅 · T25–T30

范围：仅 M5。T02 完整兼容矩阵、缺少实机环境的验收仍待验，未进入 M6。生产入口与统一门禁已完成可执行验证，以下不代表正式 A 项通过。

| 叶子 | 实现与可重复检查 | 尚需验收 |
| --- | --- | --- |
| T25a | platform proof / grant；Agent exact Host / Origin / 身份；重放、并发一次性兑换、期限与撤销测试 | T02 公网 HTTPS LNA / 目标浏览器矩阵 |
| T25b | 生产 TTY 明确批准与一次性码；设备页当前绑定、离线未知、恢复不连接；受控浏览器配对 | 人工本机确认、真实设备解除与恢复，保留未签收 |
| T26a | 配置 / 程序 / 参数 / cwd / 最小环境核对，首次及变更确认；真实 SDK child process | 跨 OS 原生进程矩阵 |
| T26b | stdio 独立会话、实际生命周期与状态，HTTP 状态 0，不伪造 HTTP 响应 | 缺少实机路径待验 |
| T27a | 锁定 Go SDK Streamable HTTP / 旧 SSE，真实受控 HTTP 服务；每用户/项目/连接隔离 | T02 其他浏览器、远程网络与未验证 transport 不宣称支持 |
| T27b | 用户明确 Agent 选择，浏览器与 Agent 授权/会话独立；Agent Run 由 Agent 上传 | 正式浏览器 CORS/LNA 全矩阵 |
| T28a | 原生 OS key provider，AES-GCM + AAD/nonce、原子私有密文；不可用/丢 key/重启/清理失败回归 | macOS/Windows/Linux 实际系统凭据库和人工状态，保留未签收 |
| T28b | 原生回环 PKCE、issuer/resource/state/scope、实际授予范围、保存与授权分离 | 未验证的 DCR/自动 refresh 不支持声明 |
| T29a | 默认关闭，本人密码重认证与当前权限；expectedVersion；AAD、密钥失效、并发与事务测试 | 正式部署秘密管理与新实机恢复 |
| T29b | 本机/平台备份/上游三种操作分离；成员移除事务即时删除在线备份，重加不恢复 | 备份介质生命周期运行验收，保留未签收 |
| T30a | 加密冻结队列、预留计入限额、本人内存选择；Agent 重启只恢复上传，接受回执擦正文 | 物理断电与 OS 存储矩阵仍待验 |
| T30b | 本人/所属项目/实时权限，独立 Agent 操作页；保存来源为新的 browser operation | 后续正式跨角色/运行环境验收 |

独立只读审阅修复：已知秘密的 Schema 结构键；备份第二次覆写 revision；备份/恢复/OAuth 保存实际响应 DTO；OAuth 返回减少 scope 不可伪称获得全部请求范围；会话替换不复活旧本地凭据；terminal Run 完整结果缓存限额与过期；上传失败不得覆盖并发内存保留选择；OS 临时锁定不得误报密文损坏或误报内存-only。Root 另补 vault/queue 共享主密钥并发初始化回归。

RED / GREEN 分目录见 tests/evidence/m5-agent-runtime、m5-vault、m5-queue、m5-contract。Review 的摘录日志标明是已观察失败，最终实际命令日志单独保留。受控 tests/fixtures/m5-agent 注入仅测试 MasterStore、明确确认和临时 CA；生产 cmd/agent 不接受自动批准、假 vault 或 TLS 跳过选项。受控 fixture 不抵扣真实 OS 或人工确认验收。最终统一 verify 与精确版本将在完成后追加。

最终签收：实现 `98d5049`，完整 verify 退出0；Node20、前端497、Go真实PG/vet/平台+Agent构建、18条M1–M5浏览器旅程、Agent全包race通过。证据 `tests/evidence/m5-final/`；首次迁移与旧E2E断言失败保留追溯，修复增强检查后重跑通过。TTY控制字符、实际credential/status枚举及测试key副本问题也有RED/GREEN。9叶子可执行验证签收；T25b/T28a/T29b和C09/C10整组仍有人工实机/介质验收，未勾选。A项正式待验，T02不扩大支持，未进入M6。
