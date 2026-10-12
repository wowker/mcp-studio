# 工程合同与版本选择（M0 T03）

2026-10-13；产品规则沿用 Design baseline 2，不改 D01–D15。API 版本 `/api/v1`，合同版本 1.0.0。`contracts/platform/openapi.json` 为平台 wire 唯一来源，通过 `scripts/generate-contracts.mjs` 生成 Go `internal/wire` 与 TS/Zod 边界；`--check` 拒绝生成漂移，未知字段在平台和客户端均拒绝。所有响应 `data` 或 `error.code`；错误不含原始数据库异常或秘密。

## M1 身份、事务与授权

邮箱 trim/lowercase；项目名称在团队内 trim/lowercase 唯一。ID 为 128-bit 随机值。独立 users / teams / team_members / projects / project_members / sessions / invitations / email_tokens / audits，不按 URL 推导身份。初始化凭证来自部署环境；初始化单例行锁，完成后入口关闭。初始 Owner 未验证时不能创建项目或接受邀请，必须完成邮件验证；无邮件不能伪造已验证。

平台密码使用 bcrypt cost 12（12–72 UTF-8 bytes），会话与一次性邮件/邀请令牌均 256-bit 随机，仅存 SHA-256 摘要。Cookie `__Host-mcp_studio_session`、Secure、HttpOnly、SameSite=Lax、Path=/；仅显式 localhost 开发配置可使用非Secure另名 Cookie。默认 idle 8h / absolute 24h，可配置且两者都需有效；每请求权威查库。到期响应401，退出删除会话。前端期限到达先遮蔽再复核服务端期限，活跃 API 的 idle 延长不误报本地退出；拒绝写403重新查询能力并清除失效上下文。敏感响应Cache-Control:no-store。写请求校验精确Origin和已认证会话CSRF，登录/初始化同样检查Origin。密码重置撤销所有会话；登录创建会话锁用户行并重查已校验 hash，避免重置后旧密码创建会话；不接受模拟角色。

项目内容读取只依据 project_members，Owner/Admin目录信息和成员管理独立检查。Admin不能给自己增加内容关系；Owner接管要求confirmed=true和非空原因，只改目标关系并记公开审计。成员保护事务锁团队行，重新读取操作者/目标/各项目维护者数量后变更，避免并发移除最后维护者。本人/Owner受保护，Admin只调整普通成员，团队移除级联所有项目并撤销待接受邀请。未来记录封存及备份删除由M4/M5实现，不把现阶段无数据视为联验通过。

邀请默认7天、允许1/7/30；同project+email有效pending只允许一条。重发生成新ID与新令牌、旧pending置superseded；重复接受只能授权一次，旧邀请不覆盖已有关系，保留已有团队角色。创建/重发/接受均重新检查发起者授权上限及现有项目管理能力。邀请状态与邮件投递状态分离。邮箱归属只能由受控邮件验证；注册只允许有效匹配邀请，无公开注册。

秘密不进入URL。邮件含非秘密邀请ID链接与独立一次性代码；邀请页面输入代码，POST发送令牌。验证/重置代码同样手动输入，不在URL持久存储或默认复制。邮件可用SMTP适配器；未配置验证／注册／找回邮件时返回mail_unavailable；邀请仍独立登记delivery=disabled，不标投递成功。测试使用隔离SMTP捕获器，禁止生产凭据。

## 版本与可复现检查

锁定 Go 1.25.x（实测1.25.5）、Node24（实测24.21.0）、PostgreSQL18、pgx/v5 5.7.6、x/crypto0.43.0；前端具体版本见package.json，npm完整传递树见package-lock.json，Go见go.sum。不采用latest运行时漂移。React19.1.0/ReactDOM19.1.0、Vite7.3.6、TS5.9.3、Vitest3.2.7、Playwright1.59.1、Phosphor2.1.10、i18next26.4.0/react-i18next17.0.12/Zod4.3.6。前端以独立依赖安装，不复制旧业务或复用其生产入口。

MCP兼容基准固定2025-11-25，Streamable HTTP与旧2024-11-05 SSE分开检测；MCP Go SDK1.4.0、TS SDK1.29.0锁为隔离实验依赖；`tests/fixtures/sdk` 已实测两端各自in-memory协议握手与工具发现（各1项RED→GREEN）。M1产品不导入MCP运行时。此证据不覆盖SDK HTTP/SSE/stdin/OAuth或跨语言互连；正式M2/M5受影响路径需补实验，禁止跟随draft。

各切片真实检查记录在docs/tasks与tests/evidence。M0的跨OS/Edge限制不得阻塞不依赖本机MCP的M1身份协作，但不得放行受影响的M2/M5通道。

来源：[MCP transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)、[PostgreSQL locks](https://www.postgresql.org/docs/18/explicit-locking.html)、[bcrypt](https://pkg.go.dev/golang.org/x/crypto/bcrypt)、[pgx](https://pkg.go.dev/github.com/jackc/pgx/v5)、[Vite guide](https://vite.dev/guide/)。官方资料说明约束，具体版本兼容通过本工程测试证明。
