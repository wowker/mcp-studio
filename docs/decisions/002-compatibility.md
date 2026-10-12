# 002 · M0 HTTP 与本机配对兼容实验

日期：2026-10-13。关联：T02a/T02b、D06/D07。状态：**已完成当前设备的最小隔离实验；完整目标矩阵待验。** 此文不签 A 项，不把试验服务作为产品 Agent，也不批准未验证的安装/配对路径。

## 工程选择与约束

协议实验固定已发布的 MCP `2025-11-25` Streamable HTTP；旧 HTTP+SSE 路径固定 `2024-11-05`。当前夹具手工实现最小 JSON-RPC wire 行为，验证浏览器网络与握手，不宣称任何 Go/TypeScript MCP SDK 已经通过互操作或工具执行。正式 SDK 的版本锁定与全链互操作需独立证据。

按照 [MCP 2025-11-25 transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)，本机服务应仅监听回环、校验 Origin 并认证请求。实验额外严格校验 Host；只有动态端口下的 `127.0.0.1` 与显式登记的 `localhost` 可接受，不接受相似域名或任意 Host。CORS 只是浏览器读取策略，配对后仍要求独立会话令牌。

按 [Chrome 本地网络访问说明](https://developer.chrome.com/blog/local-network-access)，公网地址空间来源访问本地/回环可触发独立的 LNA 权限。当前 HTTPS 宿主在回环，不能证明公网工作台上的权限允许、拒绝或部署网络策略；这一风险继续保留。产品遇到 CORS、混合内容或 LNA 限制时仍须显示具体能力错误，由用户明确选择 Agent，不静默换执行端或平台代理。

## 实测环境与证据

| 项目 | 实际值 / 范围 |
| --- | --- |
| 操作系统 | macOS 26.6.2，Build 25G83，arm64 |
| 浏览器 | 安装的 Google Chrome 155.0.8059.39；Info.plist `KSChannelID=universal`，不据此宣称覆盖最近两个稳定大版本 |
| 工具 | Node v24.21.0、Playwright 1.59.1、系统 OpenSSL |
| HTTPS 源 | 当前进程创建的 `https://127.0.0.1:<动态端口>`；`isSecureContext=true` |
| TLS 例外 | 临时自签证书，仅测试 context `ignoreHTTPSErrors=true`；未禁用 CORS/混合内容/LNA |
| 数据 | 固定虚构用户/设备/能力；随机配对码及令牌只在内存，不写 URL、测试证据或仓库 |
| 实现定位 | `tests/fixtures/compat/`，报告内包含该次运行源码 SHA-256 |

实际执行命令及参数说明见 [实验 README](../../tests/fixtures/compat/README.md)。沙箱起初以 `listen EPERM` 禁止回环监听；随后按已授权实验范围使用获批提升执行，才获得有效失败基线和通过证据。没有把环境阻断算作功能失败测试。

| 实验 | 实际结果 | 证据 |
| --- | --- | --- |
| HTTPS 回环宿主访问 HTTP `127.0.0.1` 与 `localhost` | 允许；正确 CORS 读取成功 | `browser-green.json` |
| HTTPS 宿主访问受控跨源 HTTPS | 允许；仅自签 TLS 信任例外 | 同上 |
| 缺失 Allow-Origin | Chrome CORS policy 拒绝，捕获 `net::ERR_FAILED` | 同上 diagnostics |
| 普通 HTTP hostname | Chrome 明确 Mixed Content 阻断，服务端未收到请求 | 同上；hostname 仅映射到受控回环，不代表真实远程网络 |
| Streamable HTTP JSON | initialize → exposed MCP-Session-Id → initialized 202 → tools/list 成功；后续请求携带协议版本 | 同上 |
| Streamable HTTP SSE 响应 | POST initialize 收到 event-stream 中 InitializeResult | 同上 |
| 旧 HTTP+SSE | 初始 POST 405 → GET endpoint event → POST initialize → SSE result → initialized/tools/list 成功 | 同上；夹具仅支持单条旧 SSE 流 |
| 回环保护 | 非法 Host、缺失/外部 Origin 403；缺少认证 401 | `security-green.tap` |
| 配对与撤销 | 未本机批准 403；配对码 120 秒、一次性；独立会话 60 秒；过期/解除配对后 401 | 同上；可控时钟验证，不靠等待 |
| 本机明确确认 | 独立进程 stdin；先展示准确身份才能 confirm；无码日志，重复码拒绝 | 同上；自动化本机操作，不是人工/原生 UI 验收 |

当前浏览器断言 **9/9**，安全/本机终端断言 **4/4**。诊断中的 CORS、mixed-content、405、403、401 是预期失败路径；GET `/legacy` 的 `ERR_ABORTED` 是测试在获得响应后关闭 SSE，不是声称 SSE 自恢复通过。

本实验借助 Playwright 读取 Chrome console 识别具体 CORS/mixed-content 原因；页面自身的 `fetch` 往往只有泛化的 `TypeError`。正式 UI 不能单凭这个错误断定 CORS，应结合可获得的权限状态/能力诊断，在无法区分时如实显示“浏览器网络访问受限”，提供排查入口和明确的 Agent 切换选择。

RED 证据保留在 [证据目录](../../tests/evidence/m0-compat/)：`security-red.tap`（空服务返回 404 而非 403/202）、`browser-red.json`（握手/HTTP 未实现，6 项失败）、`browser-tls-red.json`（HTTPS 上游缺失，1 项失败）、`local-confirmation-red.tap`（本机界面尚未展示身份）、`local-review-red.tap`（未看身份即可确认）。GREEN 报告和源码哈希只对应最终实验实现，不用 RED 的旧哈希代表最终版本。截图 `workbench.png` 仅证明当前宿主页面，协议结果以 JSON/TAP 为准。

## 未验范围与推进判断

- Chrome 另一稳定大版本、Edge 最近两个稳定大版本：没有运行，保持待验。
- Windows 安装包 / Linux CLI 与 OS 网络权限：没有环境，保持待验。
- 公网可信 HTTPS 工作台的 LNA 允许/拒绝与企业策略：没有部署宿主，保持待验；不关闭浏览器机制来规避。
- 真实远程 HTTP/HTTPS、OAuth、stdio、系统凭据库、加密本地队列、原生人工确认、Go Agent 安装签名/升级、跨项目平台真实权限：本实验不覆盖，按后续任务验证。
- 两分钟/一分钟是实验安全窗口，不是已经冻结的产品配对/会话时长；生产规格另定义。测试身份不是平台认证或授权证据。

T02a/T02b 的目标矩阵完成标准尚未整体满足，任务登记必须继续注明待验。当前证据支持继续开发与本机 Agent 无关的 M1 身份协作基础；未来批准 Agent 依赖路径前，应先补齐公网 HTTPS 与目标浏览器/OS 配对矩阵。这没有扩大到 M2，也不改变 D06/D07。
