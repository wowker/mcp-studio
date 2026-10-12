# M1 本机测试运行环境

这里只提供测试 SMTP 捕获端；生产邮箱验证仍通过平台生成并发送邮件，再由测试读取正文中的码提交验证 API。没有修改 verified 状态的接口。

SMTP 与捕获 HTTP API 都仅监听 `127.0.0.1` 动态端口。邮件保持在内存，退出删除。`GET /messages?to=<邮箱>` 返回 `{messages:[{to,from,body}]}`；`body.trim().split(/\r?\n/).at(-1)` 是生产模板的码。API 无 CORS、拒绝网页 Origin 和非法 Host、设置 `Cache-Control: no-store`。不要打印返回正文、验证码或保存这些请求的 trace/video/screenshot。

从工程根目录运行完整门禁，需要先由环境设置 `MCP_STUDIO_TEST_DATABASE_URL`，指向明确隔离的本机 `mcp_studio_test` 数据库，使用 `mcp_studio_app` 非超级用户。不能缺省后静默跳过集成测试：

```sh
node scripts/verify.mjs
```

已经生成 `.runtime/platform` 和 `apps/web/dist` 后，也可单独执行完整生产入口 E2E：

```sh
node scripts/test-runtime.mjs
```

SQL 管理经由已启动的测试容器 `mcp-studio-m1-pg` 内 `psql`，认证始终使用 URL 内的非超级用户，不使用容器管理员作为业务身份。`MCP_STUDIO_TEST_CONTAINER` 可改测试容器名。当前适配器假设容器内 PostgreSQL 在 `127.0.0.1:5432`，对外 URL 指向同一个实例；其他 PostgreSQL 环境需要补相应 SQL 运输适配器。

每次运行检查 PostgreSQL 实际 `current_user` 与 `rolsuper=false`，新建随机 `e2e_<24位十六进制>` schema，平台 URL 加入 `search_path`。Go 集成门禁也在独立 schema 执行；其自建的其他测试 schema 由各 Go 测试清理。`finally` 只删除当前运行创建的 schema，先停止本次平台与 SMTP，失败退出码向上传播。不会清空 public 或其他测试数据，不创建生产部署。

Playwright 配置位于根 `playwright.config.ts`，E2E 由前端负责人维护。运行脚本提供 `PLAYWRIGHT_BASE_URL`、`PLAYWRIGHT_INIT_CREDENTIAL`、`PLAYWRIGHT_MAIL_URL`，平台与 Vite production build 由同一个生产 Go 入口提供。健康检查走真实 `GET /api/v1/health`，必须返回 `data.status=ok`。初始化凭据仅为测试值，不写运行日志；真实初始化仍必须由生产 API 处理。

证据在 `tests/evidence/m1-runtime/`。SMTP、运行环境保护与 schema 集成都有 RED/GREEN；最终完整 verify 的执行结果另由阶段负责人登记，不以夹具单测代替 E2E 或正式验收。
