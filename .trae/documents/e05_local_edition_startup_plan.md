# E05 单机版启动序列 · 实施计划

## Repository Research

### 当前状态（E04 后）

- `apps/local/main_local.go`：build tag `local`，embed config.default.json，调 `platform.RunLocal()`
- `internal/platform/entry_local.go`（`local`）：stub，返回 `errors.New("local edition startup is implemented in E05")`
- `internal/platform/entry.go`：云版完整启动序列——加载 settings → 秘密来源（DATABASE_URL/BACKUP_KEY/SMTP_PASSWORD）→ infrastructure.Database 建 pool（拒绝超级用户）→ migrations.Apply → 建 App → 启动 record sweep job → HTTP server + signal
- `internal/platform/app_local.go`（`local`）：已预留 `initLocalSubject(u wire.User, teams []wire.Team)` setter
- `internal/platform/auth_local.go`（`local`）：所有 handler 走 `App.localSubject`；若为空则返回 401
- `infrastructure.Database()`：**拒绝超级用户**（检查 rolsuper OR rolbypassrls），单机版需要跳过此检查，因为它自己管理 PG 子进程
- `migrations.Apply()`：可用，单机版直接复用
- `identity.go` `initialize()`：展示了完整的 user+team+team_members+bootstrap 事务结构，单机版首启复制此结构但不经 HTTP
- `wire.User`/`wire.Team`/`wire.Project`：结构体清晰
- 已有外部 PG 容器 `mcp-studio-m1-pg`（test DB 隔离 schema）

### PG 内嵌方案选型

Go 生态做单机版内嵌 PG 的主流做法是**运行外部 PG 二进制**（参考 `github.com/fergusstrange/embedded-postgres`）。PG 二进制来源三种：
- 开发时：PATH 里找（brew install postgresql@18 / apt install postgresql / 用户自带）
- 分发时：随包带（E06 packaging 实现）
- 测试时：允许注入自定义路径

E05 边界**不做跨平台下载**，只实现启动序列和二进制定位接口。

### 单机版与云版的核心差异

| 维度 | 云版 Run() | 单机版 RunLocal() |
|---|---|---|
| DB URL | 从秘密来源读 `MCP_STUDIO_DATABASE_URL` | 自己创建 `postgres://mcp_studio_local:<empty>@localhost:<port>/mcp_studio_local?sslmode=disable` |
| PG 生命周期 | 外部 Compose 管理 | 自己 `initdb` + 启动 + 信号关闭 |
| 角色权限 | 拒绝超级用户 | 启动时先超级用户建角色+DB，再切非超管；但 local edition 可以放宽 |
| 初始用户 | POST /api/v1/initialize（HTTP，需 INIT_CREDENTIAL） | 启动序列里直接创建（不经 HTTP） |
| 数据目录 | PG 容器卷 | 跨平台标准路径 |
| Origin/Listen | 读 settings | 固定 `http://127.0.0.1:<port>`，listen 同端口 |

### 数据目录跨平台路径

| 平台 | 路径 |
|---|---|
| macOS | `~/Library/Application Support/MCP Studio/` |
| Linux | `~/.local/share/mcp-studio/` |
| Windows | `%LOCALAPPDATA%\MCPStudio\` |

Go 标准库 `os.UserConfigDir()` / `os.UserDataDir()` 可辅助，Windows 需特殊处理。

### PG 版本要求

与云版一致 PG 18.x。单机版不主动升级；数据目录版本不兼容时明确拒绝启动并打印提示（用户可手动清理或升级）。

---

## Files and Modules

### 新增文件

| 文件 | 说明 |
|---|---|
| `internal/platform/local_data.go` | 数据目录定位、PG 二进制定位、默认 port/socket 路径 |
| `internal/platform/local_pg.go` | PG 子进程管理：initdb 检测、启动、健康检查、优雅关闭 |
| `internal/platform/local_subject.go` | 本地主体初始化（user+team+team_members+project+project_members+bootstrap） |
| `internal/infrastructure/database_local.go` | 本地版 DB pool 创建（跳过超级用户检查，build tag 分发） |

### 修改文件

| 文件 | 说明 |
|---|---|
| `internal/platform/entry_local.go` | stub → 完整启动序列：定位数据目录/PG → initdb → 启动 PG → 等健康 → 建 role/database → migrations → 本地主体 → HTTP server → signal 关闭 |
| `internal/infrastructure/database.go` | 新增内部入口 `newPool(ctx, url)`（去掉权限检查），cloud 版 `Database()` 加权限检查 |
| `apps/local/config.default.json` | 加本地版默认 port（或用 builtin）；Origin 固定 `http://127.0.0.1` |
| `internal/platform/server.go` | `App` 加 `pgCmd *exec.Cmd`（仅 local build tag），关闭时先停 PG 再关 HTTP |
| `internal/platform/entry.go` | 改调用 `infrastructure.newPool` 而非直接 `pgxpool.New`（cloud 版 Run 仍调用 `Database()`） |

### 不触碰（E06 边界外）

- `apps/local/packaging/build-agent.mjs` / `candidate-path.mjs` / `install.*`：Agent 打包，不在 E05 范围
- 跨平台 PG 二进制下载脚本：E06 做
- 浏览器自动打开：E06 做
- 数据目录版本迁移（PG 大版本升级）：E06 或单独工作包

---

## Implementation Steps

### Step 1: infrastructure 层加内部入口

**改 `internal/infrastructure/database.go`**：把 pool 创建抽成无权限检查的 `newPool(ctx, url)`，`Database()` 调用后加权限检查。单机版直接用 `newPool`。

### Step 2: 数据目录 & PG 二进制定位

**新建 `internal/platform/local_data.go`**：
- `localDataDir() (string, error)`：跨平台数据目录
- `localPGBinDir() string`：默认 PATH，允许 `MCP_STUDIO_LOCAL_PG_BIN` 覆盖
- `localPGPort() string`：默认 "15432"，允许 `MCP_STUDIO_LOCAL_PG_PORT` 覆盖（避免和云版 5432 冲突）
- `localRoleName` / `localDBName` / `localSuperUser`：常量

### Step 3: PG 子进程管理

**新建 `internal/platform/local_pg.go`**：
- `ensureInitdb(ctx, dataDir, pgBinDir)`：检查 `PG_VERSION` 文件，不存在则用 `initdb -U <superuser> -D <dataDir>` 创建
- `startPG(ctx, dataDir, pgBinDir, port) (*exec.Cmd, error)`：`postgres -D <dataDir> -p <port> -h '' -k <dataDir>`（unix socket）
- `waitPGReady(ctx, pgBinDir, port, superUser) error`：循环 `pg_isready -p <port> -U <superuser>` 直到 OK 或超时
- `stopPG(ctx, pgBinDir, port, superUser, dataDir) error`：`pg_ctl stop -D <dataDir> -m fast -w -p <port> -U <superuser>`，超时后 SIGTERM → SIGKILL

### Step 4: 本地主体初始化

**新建 `internal/platform/local_subject.go`**：
- `ensureLocalSubject(ctx, tx, subjectEmail, subjectName, teamName, projectName) (wire.User, []wire.Team, error)`：
  - 查 `bootstrap.initialized`，已初始化则查 users 表拿已有 user
  - 未初始化则创建 user+team+team_members('owner')+project+project_members('maintainer')+bootstrap.initialized=true
  - 单机版不需要密码验证，用户行 password_hash 字段留空（注意 identity.go 的 `passwordHash` 有 min 12 长度限制，单机版不经过 login 路径所以没关系）
  - 返回 `wire.User{ID, Email, Name, Verified: true}` 和 `[]wire.Team{wire.Team{ID, Name, Role: "owner"}}`

### Step 5: 数据库角色 & database 创建

在 PG 启动后、迁移前：
1. 超级用户连接
2. `CREATE ROLE mcp_studio_local WITH LOGIN;`（若不存在）
3. `CREATE DATABASE mcp_studio_local OWNER mcp_studio_local;`（若不存在）
4. 用 `infrastructure.newPool` 以 `mcp_studio_local` 身份连接目标 DB

### Step 6: RunLocal 完整启动序列

**改 `entry_local.go`**：
```
func RunLocal(options Options) error {
  ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
  defer stop()

  // 1. 加载 settings（origin=listen 同端口）
  settings, err := loadSettings(options.Defaults)

  // 2. 数据目录 & PG 二进制
  dataDir := localDataDir()
  pgBinDir := localPGBinDir()
  port := localPGPort()

  // 3. initdb 检测 + 启动 PG
  if err = ensureInitdb(ctx, dataDir, pgBinDir); err != nil { return err }
  pgCmd, err := startPG(ctx, dataDir, pgBinDir, port)
  if err = waitPGReady(ctx, pgBinDir, port, localSuperUser); err != nil {
    pgCmd.Process.Kill()
    return err
  }
  defer stopPG(ctx, pgBinDir, port, localSuperUser, dataDir)

  // 4. 建 role + database
  superPool, _ := pgxpool.New(ctx, localSuperURL(port))
  ensureRoleAndDB(ctx, superPool)  // CREATE ROLE + CREATE DATABASE ON CONFLICT
  superPool.Close()

  // 5. 应用连接（非超管）
  db, err := infrastructure.NewLocalPool(ctx, localRoleURL(port))
  defer db.Close()

  // 6. 迁移
  if err = migrations.Apply(ctx, db); err != nil { return err }

  // 7. 本地主体初始化
  tx, _ := db.Begin(ctx)
  subject, teams, err := ensureLocalSubject(ctx, tx, localSubjectEmail, localSubjectName, localTeamName, localProjectName)
  tx.Commit(ctx)

  // 8. 建 App + 注入 localSubject
  cfg := Config{
    Origin: fmt.Sprintf("http://127.0.0.1:%s", port),
    StaticDir: settings.StaticDir,
    // ... 其他配置
  }
  a := &App{DB: db, Now: time.Now, Config: cfg}
  a.initLocalSubject(subject, teams)

  // 9. record sweep job（复用 Run() 里的 goroutine）
  // 10. HTTP server + signal
  // 11. 关闭顺序：server.Shutdown → stopPG → pgCmd.Wait
}
```

### Step 7: 环境变量支持

单机版允许以下覆盖（走 `MCP_STUDIO_*`）：
- `MCP_STUDIO_LOCAL_PG_BIN`：PG 二进制目录
- `MCP_STUDIO_LOCAL_PG_PORT`：PG 端口（默认 15432）
- `MCP_STUDIO_LOCAL_DATA_DIR`：数据目录（覆盖跨平台默认）
- `MCP_STUDIO_ORIGIN` / `MCP_STUDIO_LISTEN`：覆盖

不读取 `DATABASE_URL` / `BACKUP_KEY` / `SMTP_PASSWORD` / `INIT_CREDENTIAL` 等云秘密来源。

### Step 8: 测试

- `internal/platform/entry_local_test.go`（已有 `//go:build local`）：扩展为启动路径断言（已通过）
- 新增 `internal/platform/local_subject_test.go`（`local`）：ensureLocalSubject 的端到端（需要跑 PG）
- 新增 `internal/platform/local_pg_test.go`（`local`）：initdb 检测、启动、健康检查、优雅关闭
- **完整 verify 不跑 local 启动路径**（E09 才加进门禁）。E05 只保证构建和单元测试通过。

---

## Dependencies and Considerations

1. **infrastructure 拆分**：云版 Run() 当前也直接调 `pgxpool.New`。需要确认 `infrastructure.Database()` 之外是否有其他直接 pool 创建路径——让 cloud 版也走统一入口。
2. **PG 二进制依赖**：开发环境需要 PATH 里有 `initdb`/`postgres`/`pg_ctl`/`pg_isready`。macOS 上 `brew install postgresql@18` 后 `brew --prefix postgresql@18/bin` 加入 PATH。
3. **PG 数据目录权限**：initdb 后数据目录 owner 是当前 OS 用户（和 postgres 进程同用户），这和 cloud 版容器场景不同。不影响业务层。
4. **pg_ctl 版本差异**：不同版本 pg_ctl 可能有 flag 差异（如 `-U`），用最小 flag 集。
5. **`superuser` 字段**：PG 默认超级用户名 `postgres`。但 initdb 时可以用 `-U mcp_studio_local_super` 自定义。单机版自己管理，自定义避免和系统 PG 冲突。
6. **密码**：单机版 role 不需要密码（unix socket 认证 peer）。

---

## Validation

| 验证项 | 预期结果 |
|---|---|
| `go build ./apps/cloud` | ✅ |
| `go build -tags local ./apps/local` | ✅ |
| `go test -count=1 ./internal/platform`（cloud 默认） | ✅ 24 具测试包全 PASS |
| `go test -tags local -count=1 ./internal/platform` | ✅ local 专属测试全 PASS |
| `go build -tags local ./...` | ✅ 无编译错误 |
| `go vet -tags local ./...` | ✅ |
| 手动启动 `go run -tags local ./apps/local`（PATH 有 PG） | ✅ initdb → 启动 PG → 迁移 → 初始化主体 → HTTP server 监听 |
| 二次启动同一数据目录 | ✅ 跳过 initdb，复用已有数据 |
| 数据目录损坏（删掉 PG_VERSION） | ✅ 报错拒绝启动 |
| Ctrl+C 优雅关闭 | ✅ pg_ctl stop → HTTP server Shutdown → pgCmd.Wait |

---

## Risks

1. **PG 二进制不存在**：`initdb` 找不到时立即返回明确错误（"postgresql binaries not found at $PG_BIN"）。单机版**不是**双击即用——E06 随包分发后才解决。
2. **端口冲突**：默认 15432 避免与 5432 冲突，但用户可能已有占用。启动前先尝试监听探测，冲突则递增 10 直到 15439。
3. **unix socket 权限**：pg 子进程用户 = 当前 OS 用户，不会有权限问题。但如果未来 PG 跑在另一用户下需要重新设计。
4. **数据目录跨版本兼容**：PG 大版本升级（18 → 19）后旧数据目录无法启动。E05 明确拒绝（`PG_VERSION` 文件不匹配），不做自动升级脚本（E06/E07 处理）。
5. **infrastructure.Database() 超级用户检查副作用**：单机版绕过后，cloud 版所有 Run() 调用仍走检查。需确保 cloud 测试不受影响。
6. **signal 处理**：当前 cloud `signal.NotifyContext` 在 Run() 里。RunLocal 里复用相同模式，但 pgCmd 是子进程需要先 stop 子进程再关 server。顺序：server.Shutdown → stopPG → pgCmd.Wait。
7. **首次启动时 `bootstrap` 表不存在**：migrations.Apply 会先跑 001 建表，然后 ensureLocalSubject 才查 bootstrap。顺序已保证。

---

## 边界声明（本阶段不做）

- E06 跨平台打包、签名、公证
- 内嵌浏览器自动打开
- PG 二进制下载脚本
- E07 部署安全校验
- E08 开发态编排
- E09 完整 verify 两版冒烟
- Agent 打包改动（E05 不碰 packaging/ 里的 Agent 相关文件）
