# 008 · M5 本机 Agent、个人凭据与上传责任

状态：用户授权执行 T25–T30；不进入 M6。设计来源为已确认 D01–D15、交付 01–06、M0 agent/security-v1 和共同状态合同；T02 未验证路径不扩大为已支持。

## 配对与授权

平台 1.4 合同新增设备证明与委托访问，Agent 本机合同 1.0 单独生成 Go / TypeScript。Cookie 会话只在平台；浏览器持有短期本机 channel token，只在内存；Agent 通过一次性平台 proof 换取不返回浏览器的 grant。Proof 60 秒、channel 至多 900 秒且受父会话到期约束。Exchange 拒绝 Cookie 与浏览器 Sec-Fetch 元数据。平台 grant 每请求重查父会话和真实项目关系，限制 API 白名单；上传事务中再查委托身份。撤销设备、退出与重置使新请求无效。

Agent 只监听字面 127.0.0.1，精确 Host / 端口 / Origin 联合检查，不信任转发头、null、通配来源。生产要求 HTTPS 工作台；仅显式开发配置可允许 HTTP 回环。配对必须本机 TTY 明确批准，显示 Origin、用户、设备与能力，再由浏览器提交一次性码；远程网页不自行批准。通道恢复不连接 MCP。

## 执行、凭据与确认

stdio 用程序和参数数组直接启动，不隐式 shell；cwd 与最小环境校验，首次及配置变更再次本机确认。Agent HTTP 与 stdio 使用锁定 Go SDK 1.4.0；每用户 / 项目 / 连接独立，会话不按 URL 合并。用户明确选择 Agent，浏览器凭据不借用。每次新执行在线复核平台权限、配置、工具与 Schema、容量，再冻结身份和环境。

敏感值只能从本人 Agent vault 取用。Schema 值与结构名称都要检查已知凭据来源，结构名称不能通过改名改变验证语义。URL 禁止敏感值，包括 percent 编码形式。原始错误不能进入 Toast / 日志 / 上传。

本机主密钥由 macOS SecItem、Windows Credential Manager、Linux Secret Service 提供；密文独立存储，AES-256-GCM 使用唯一 nonce 和设备 / 身份 / 项目 / 连接 / 类型 / 引用 AAD。目录由当前 Agent 标记并用 os.Root 限制访问，原子替换、私有文件权限；丢失主密钥不重新生成去覆盖旧密文。OS 库不可用不假报保存成功，授权成功与保存失败分开。改为仅会话须先删除本范围旧密文，重启不复活旧凭据。

OAuth 使用 PKCE、随机 state、原生回环回调、issuer / resource / scope 约束；只接受实际返回授权范围（未返回 scope 才沿用请求范围），缺必要范围拒绝。授权结果与会话 / 本地保存独立，保存重试不重做授权。公共 client ID 路径之外的 DCR、自动 refresh 等未完成路径不宣称支持。

## 平台个人备份

备份默认关闭，明确选择后以本人密码重认证。平台托管 AES-256-GCM，主密钥在数据库外；不是端到端加密。AAD 包含本人、项目、连接、类型、引用与修订号；覆写采用 expectedVersion，冲突不静默覆盖。列表仅 metadata；恢复重查本人当前项目权限与密码。删除本机凭据、删除平台备份和上游撤销互相独立。移除项目 / 团队成员事务清除在线备份，重加不恢复；介质 30 天生命周期留待后续运行验收，未伪称完成。

## Run 与加密队列

一个 Agent Run 只有 Agent 上传；浏览器保存其结果创建新的 browser operation，原 Run 队列不继承。已授权调用不依赖页面生命周期；解除配对不伪称远端调用已撤销。取消先呈现等待实际终态，不捏造 HTTP 或远端结果。

每本人 / 项目预留准入计入 1000 项、100 MiB 上限，执行后的超限 / 落盘失败仍保留可见内存结果和丢失风险。默认加密队列，只有本人明确选择才用内存，其他身份不继承选择。临时锁定 OS 主密钥保留待读密文，解锁重新读取；密文损坏与存储不可用区分。重启只恢复脱敏冻结上传，不执行 Tool；同 operation / digest 重试，接受回执后移除正文，仅保存最小身份 / receipt。完整 terminal 结果另设有界短期内存缓存，避免已上传结果绕过队列限额。7 天只提醒，不自动删除。

## 验证边界与来源

统一 verify 保留平台 / 浏览器已有门禁，增加 Agent 合同、Go Agent 构建和实际 Agent 接口联验。受控浏览器 fixture 可注入本机确认与 MasterStore，只限测试 helper；生产命令不加入自动批准、假 vault 或 TLS 跳过参数。受控 fixture 不抵扣人工 TTY、真实 OS 凭据库、目标 Chrome / Edge、公网 HTTPS LNA、远程网络与备份介质验收。

官方来源：[锁定 Go SDK](https://github.com/modelcontextprotocol/go-sdk/tree/v1.4.0)、[SecItemCopyMatching](https://developer.apple.com/documentation/security/secitemcopymatching(_:_:))、[Windows CredWriteW](https://learn.microsoft.com/en-us/windows/win32/api/wincred/nf-wincred-credwritew)、[Secret Service](https://specifications.freedesktop.org/secret-service/latest/)、[Go os.Root](https://pkg.go.dev/os@go1.25.0#Root)、[Fetch 禁止请求头](https://fetch.spec.whatwg.org/#forbidden-request-header)。实际代码按锁定本地源码验证，不升级依赖来扩大范围。
