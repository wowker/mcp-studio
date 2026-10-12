# M1 本机启动与验证

本阶段是 Go 平台、PostgreSQL、React 前端的身份与协作入口。MCP 执行、连接、环境、调用记录和 Agent 属于后续阶段。

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

缺少数据库、SMTP 测试捕获器、浏览器或任一测试失败均非通过，不静默跳过。门禁包含生成合同一致性、64 个共同语义向量、SDK／回环安全／邮件／runtime 测试、前端类型／组件测试／生产构建、真实 PostgreSQL Go 测试、vet、Go 构建以及真实生产入口 Playwright 旅程。测试 SMTP 只监听回环，收件内容只在进程内，结束关闭；浏览器 trace、video、failure screenshot 关闭，避免采集验证码。

当前目标设备证据见 `docs/tasks/progress.md`。T02 的跨浏览器／跨 OS／公网限制矩阵继续待验，当前 M1 成果不放行未验证 MCP 通道。
