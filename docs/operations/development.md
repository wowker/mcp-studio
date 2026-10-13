# M1–M5 本机启动与验证

正式入口包含身份协作、连接配置、环境定义、个人内存授权、浏览器 HTTP 会话，以及 T15/M3 的工具目录/Tab、参数编辑、实际调用、脱敏上传、历史/保存/修订和恢复。M4 提供浏览器脱敏持久队列，M5 新增受保护本机 Agent；实际验证状态和实机待验项见执行账本。

需要锁定版本 Go 1.25.5、Node 24.21.0、PostgreSQL 18；依赖使用 `go.sum` 与 `package-lock.json`。安装 `npm ci`，首次浏览器验证运行 `npx playwright install chromium`。网络受限环境需预先准备这些依赖。

## 数据库

正式入口要求显式 `MCP_STUDIO_DATABASE_URL`，拒绝 SUPERUSER / BYPASSRLS 业务账号。由数据库管理员创建专用数据库、非超级用户角色和其拥有的独立 schema，配置 `search_path` 指向该 schema。不要复用旧工程库或 SQLite。启动时按 `migrations/` 编号运行迁移；校验和不符时停止。

测试另建 `mcp_studio_test` 数据库和 `mcp_studio_app` 非超级用户角色，允许其在该测试库创建 schema。verify 只接受回环 URL、这个库名与角色名，实际测试使用随机 schema 并清理。生产角色不需要创建数据库；本机测试 provision 与应用业务连接分开。当前 runtime 集成通过本机 Docker 容器 `mcp-studio-m1-pg` 的 psql 控制测试 schema，需要 Docker 可用；数据库连接本身走 pgx。

## 本机测试库首次准备

下面固定口令仅用于回环、tmpfs、可丢弃的合成测试，不能用于正式环境。已存在本次创建的容器时直接复用；不要覆盖同名容器或已有业务库。

```sh
docker run --name mcp-studio-m1-pg --detach --publish 127.0.0.1:55432:5432 --tmpfs /var/lib/postgresql --env POSTGRES_USER=mcp_studio --env POSTGRES_PASSWORD=isolated-test-only --env POSTGRES_DB=mcp_studio_test postgres:18
docker exec mcp-studio-m1-pg pg_isready -U mcp_studio -d mcp_studio_test
```

健康后，首次创建业务测试角色（不是容器管理员业务访问）：

```sh
docker exec -i mcp-studio-m1-pg psql -U mcp_studio -d mcp_studio_test -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE mcp_studio_app LOGIN PASSWORD 'isolated-app-test-only';
GRANT CONNECT, CREATE, TEMPORARY ON DATABASE mcp_studio_test TO mcp_studio_app;
CREATE SCHEMA app AUTHORIZATION mcp_studio_app;
ALTER ROLE mcp_studio_app IN DATABASE mcp_studio_test SET search_path TO app;
SQL
export MCP_STUDIO_TEST_DATABASE_URL='postgres://mcp_studio_app:isolated-app-test-only@127.0.0.1:55432/mcp_studio_test?sslmode=disable'
npm run verify
```

停止或重建 tmpfs 容器可能清除角色和库，需要重新准备；验收证据保存在仓库，不靠该容器持久化。

## 正式入口

用 shell 环境或部署秘密管理器配置（密码、初始化凭证和 SMTP 密码不写仓库）：

| 变量 | 含义 |
| --- | --- |
| MCP_STUDIO_DATABASE_URL | 专用数据库连接，角色非超级用户 |
| MCP_STUDIO_ORIGIN | 精确外部 origin，无路径、query、fragment；正式环境 HTTPS |
| MCP_STUDIO_LISTEN | 监听地址；默认 127.0.0.1:8080 |
| MCP_STUDIO_STATIC_DIR | 构建产物目录 apps/web/dist |
| MCP_STUDIO_INIT_CREDENTIAL | 一次初始化凭证；首次 Owner 在表单输入 |
| MCP_STUDIO_SMTP_ADDRESS / FROM | 邮件服务器 host:port / 发信邮箱 |
| MCP_STUDIO_SMTP_USERNAME / PASSWORD | 按邮件服务器配置认证 |
| MCP_STUDIO_BACKUP_KEY | 可选 base64 编码 32 字节 AES 主密钥；由部署秘密管理器提供，数据库外保存，未配置时备份写入/恢复不可用，metadata/删除仍可用 |
| MCP_STUDIO_ALLOW_INSECURE_LOOPBACK | 仅显式本机开发设 true；HTTP origin 与监听都必须回环 |

HTTPS 部署由前置 TLS 入口终止，平台使用 Secure、HttpOnly、SameSite Cookie；SMTP 要求 STARTTLS，只有显式回环开发例外。未配置 SMTP 可初始化和登录，不能假装完成邮箱验证或新用户验证。邮件只含非秘密邀请 ID 链接，验证／邀请／重置码由收件人在表单输入，不放 URL。

```sh
npm run build
mkdir -p .runtime
go build -o .runtime/platform ./cmd/platform
MCP_STUDIO_STATIC_DIR=apps/web/dist .runtime/platform
```

运行前设置上表中的必需变量，并创建 `.runtime` 目录。`npm run dev` 仅前端开发预览，正式流程以 Go 同站点生产入口为准。

## 完整门禁

为专用测试库设置 `MCP_STUDIO_TEST_DATABASE_URL` 后：

```sh
npm run verify
```

缺少数据库、Agent 集成测试 helper、SMTP 测试捕获器、浏览器或任一测试失败均非通过，不静默跳过。门禁包含生成合同一致性、64 个共同语义向量、SDK／回环安全／邮件／runtime 测试、前端类型／组件测试／生产构建、真实 PostgreSQL Go 测试、vet、Go 构建以及真实生产入口 Playwright 旅程。测试 SMTP 只监听回环，收件内容只在进程内，结束关闭；浏览器 trace、video、failure screenshot 关闭，避免采集验证码。

当前目标设备证据见 `docs/tasks/progress.md`。T02 的跨浏览器／跨 OS／公网限制矩阵继续待验，M2/M3 的局部受控证据不放行未验证 MCP 通道。

## M2 使用与验证范围

维护者可在服务页保存 HTTP/stdio 共享配置，在环境页维护项目/服务定义。开发者与查看者可读，查看者不能连接；真实 API 复核所属项目权限。保存只保存配置，不连接；版本冲突显示远端并保留草稿，需本人明确合并。stdio 执行由 M5 Agent 提供，真实 OS 和人工确认验收状态见账本。

环境预览与“用于我的会话”分开；应用选项按当前用户/项目/连接仅保留内存，不覆盖共享默认环境。个人 Token 和敏感变量值也只在当前会话内存，刷新后需要重新输入；退出、到期或权限失效清除并断开。HTTP 地址可含非敏感 query，秘密用个人授权/敏感定义提供。

浏览器手动连接明确选择的 Streamable HTTP 或旧 SSE，平台只核验权限与配置。受 CORS、混合内容、本地网络限制时显示诊断和 Agent 配置入口，这是 M2 阶段的边界；当前 M5 的显式 Agent 入口见下节。OAuth 仅支持预注册公共客户端的 HTTPS PKCE/resource/issuer 协议范围；同平台主机名授权弹窗受 Cookie 边界限制。协议范围详见 [runtime 合同](../../apps/web/src/runtime/README.md)。

完整 verify 使用生产 Go 静态入口 + 临时自签 HTTPS 终止器，保证 Secure Cookie 流程；需要本机 `openssl`。MCP HTTP/SSE 和 HTTPS OAuth 夹具只绑定回环，授权主机为 localhost、平台主机为127.0.0.1。仅隔离 Playwright 上下文忽略测试 TLS 证书错误，正式应用不放宽 TLS。fixture 的邮件、Token、code 与 verifier 为临时合成值，数值统计不记录凭据；结束清理临时证书、进程和随机 schema。M2 E2E 同时回归 M1 身份协作，M1 原证据文件不覆盖。

## M3 使用与验证范围

连接服务后进入工具目录，打开独立Tab。可选参数默认skip；Raw JSON语法错禁止保存/执行，合法但Schema错只可保存为私有未完成请求。执行前检查当前工具、应用环境与平台权限；执行后编辑不变Run快照。取消/超时不承诺上游回滚，上传失败重试仅重发原冻结记录，不重调工具。

总历史与工具历史分别保留筛选/游标。保存请求或请求响应创建新记录；元数据和追加脱敏均为独立条件修订。恢复创建新未执行Tab，采用当前连接/Schema/环境，脱敏参数需要重新填写。协议快照是SDK摘要，不是原始HTTP帧trace。

M3 阶段的失败操作当时仅保留在内存，Agent 来源测试仅为合成存档。当前 M4 已提供脱敏持久队列、容量/保留/封存作业；M5 Agent 实际执行与上传由独立真实接口联验覆盖，原 M3 合成证据不抵扣这些验收。完整verify同时运行M1/M2回归和M3连续旅程；最新证据与实现版本见 [执行账本](../tasks/progress.md)。

## M5 Agent 启动与边界

使用锁定 Go 版本构建生产二进制：

```sh
go build -o .runtime/agent ./cmd/agent
.runtime/agent --origin https://workbench.example.test --state-dir /absolute/private/agent-state
```

Origin 替换为实际工作台的精确 HTTPS Origin；目录使用独立绝对路径，已有其他文件的目录不可挪作 Agent 数据。默认监听 127.0.0.1:45455，可用 --listen 指定其他回环端口，并在设备页填入相同本机地址。不要通过代理暴露本机接口。正式进程必须有可用的本机终端确认界面；stdin 管道不能批准配对或进程执行。配对页显示当前设备、身份与能力，本机确认后在浏览器输入一次性码；恢复配对不自动连接 MCP。

主密钥从当前 OS 凭据库读取，生产没有测试 key 或自动批准开关。系统库锁定/不可用会阻止默认加密队列的新调用；仅本人明确选择内存队列可继续，Agent 停止会丢失这部分未确认记录。浏览器页面关闭和 Agent 进程停止是不同生命周期。会话凭据只在 Agent 内存，本地凭据为独立密文；本地删除、个人平台备份删除和上游撤销各自操作。平台备份默认关闭，保存/恢复要求当前权限与本人密码，平台托管加密不叫端到端加密。生产环境保管主密钥，丢失后已有备份不能恢复；不要随意换 key 伪称轮换。

仅开发 HTTP 回环可显式使用 --allow-insecure-loopback；不放宽正式 TLS。HTTP Agent、旧 SSE、stdio 只采用已验证的受控协议路径，T02 的公网 HTTPS LNA、目标 Chrome/Edge 和跨 OS 完整矩阵继续待验。公共 OAuth client ID、PKCE、resource/issuer/scope 约束以实际合同为准；DCR、自动 refresh 等未验证能力不宣称支持。

完整 verify 构建生产平台、生产 Agent 与独立 tests/fixtures/m5-agent helper。浏览器旅程链接正式 Agent 模块，仅 helper 注入受控本机确认、分离测试主密钥及临时 CA，支持重启/上传中断回归。helper 不用于部署，不抵扣真实系统凭据库、人工本机确认或缺少实机的验收。测试统计只保存 operation/digest/调用次数等脱敏证据，不采集配对码、OAuth code 或凭据。
