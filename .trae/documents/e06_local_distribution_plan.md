# E06 单机分发 · 实施计划

## Repository Research

### 当前状态

**打包脚本现状**（全部面向 Agent，不是 Platform）：
- `apps/local/packaging/build-agent.mjs`：跨平台编译 `./cmd/agent`（darwin-arm64, linux-amd64/arm64, windows-amd64），生成 tar.gz / zip / macOS pkg，带 manifest.json + CHECKSUMS.sha256
- `apps/local/packaging/install.sh`：调 `mcp-studio-agent --install-prefix ... --state-dir ...`（Agent 生命周期）
- `apps/local/packaging/install.ps1`：同上 PowerShell 版
- `scripts/package-candidate.mjs`：把 agent 候选产物塞进 m7 交付包

**本地平台现状**（E05 后）：
- `apps/local/main_local.go` → `platform.RunLocal()`
- `RunLocal` 自己管 PG 子进程、数据目录，不读任何秘密来源
- 入口签名 `RunLocal(options Options) error`，Options 只有 `Defaults []byte`
- 数据目录：macOS → ~/Library/Application Support/MCP Studio / linux → $XDG_DATA_HOME/mcp-studio / windows → %LOCALAPPDATA%\MCPStudio
- PG 二进制定位：PATH 或 `MCP_STUDIO_LOCAL_PG_BIN` / `MCP_STUDIO_LOCAL_PG_DIR`
- 端口默认 `16432`

### 缺失的打包链路

1. 没有 cross-compile 本地平台二进制的脚本（`go build -tags local ./apps/local`）
2. 没有把 PG 二进制打进产物的机制（E05 只定位不下载）
3. 没有 install.sh / install.ps1 面向平台（现有脚本全是 Agent 的）
4. 没有自动打开浏览器（E06 边界可能包含）
5. 没有签名 / 公证（签名在 E06 边界但公证需要 macOS 开发者账号，实际是 CI 做）

### PG 二进制分发策略选型

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A. 随包打 PG 二进制** | 用户一键安装；离线可用 | 包体积 50–80MB；需要为 4 个平台(OS/arch)各准备一份；升级需要重打包 |
| **B. 安装时下载 PG** | 包体小；PG 版本可独立升级 | 需要网络；下载源（Postgres.app / PGDG / EDB）维护成本 |
| **C. 系统包管理器依赖** | 与 OS 生态对齐 | 用户需额外安装；跨 OS 不一致 |

**E06 选 A + B 结合**：
- 构建时：脚本从 PGDG（PostgreSQL Global Development Group）官方 tarball URL 下载 PG 18.x 二进制，校验 SHA256，和 Go 二进制一起打包
- 安装时：优先用包内 PG；缺失则退到 PATH 查找（E05 的 resolveExecutable 逻辑已支持）
- 用户可手动指定 `MCP_STUDIO_LOCAL_PG_BIN` 覆盖

PG 18.x 官方二进制下载源（需在打包脚本里维护 URL + SHA256）：
- macOS arm64: https://get.enterprisedb.com/postgresql/postgresql-18.x-osx-arm64-bin.tar.gz (或 Postgres.app)
- Linux x86_64: PGDG 官方 tarball
- Linux aarch64: PGDG 官方 tarball
- Windows x86_64: EDB 官方 zip

这些 URL + SHA256 清单放在一个 JSON 文件里（`apps/local/packaging/pg-bins.json`），打包脚本按 OS/arch 匹配。

### 安装/升级/卸载策略

**安装**（install.sh / install.ps1）：
1. 解压包到 prefix（安装前缀）
2. 把 PG 二进制放到 prefix/bin/pg/（独立子目录，不和 Go 二进制混放）
3. 创建符号链接/快捷方式（macOS: /usr/local/bin/mcp-studio，Linux: ~/.local/bin/mcp-studio）
4. 注册自动打开浏览器（首次启动后）

**升级**：
1. 覆盖 Go 二进制和 PG 二进制
2. **保留数据目录**（install.sh 不改 data dir）
3. manifest 检查版本号，不自动回滚

**卸载**：
1. 删 prefix 下文件
2. **不删数据目录**（独立步骤让用户决定）
3. 可选：提示手动 `rm -rf ~/Library/Application\ Support/MCP\ Studio`

### 平台 vs Agent 打包的关系

- **Agent 打包**（现有 `build-agent.mjs`）：面向远端 Agent 进程，有 `--install-prefix` 生命周期
- **本地平台打包**（新增）：面向本机嵌入式 PG + HTTP server，没有 `--install-prefix`；PG 生命周期完全由 RunLocal 管

两包并列但独立：Agent 可以装在远程机器，本地平台只装本机。install.sh 的参数语义不同（Agent 是 `--install-prefix`，平台是纯文件解压 + symlink）。

---

## Files and Modules

### 新增文件

| 文件 | 说明 |
|---|---|
| `apps/local/packaging/build-platform-local.mjs` | 本地平台跨平台打包脚本：编译 Go + 下载 PG 二进制 + 归档 + manifest |
| `apps/local/packaging/pg-bins.json` | PG 18.x 各平台二进制下载 URL + SHA256 清单 |
| `apps/local/packaging/install-platform.sh` | Linux/macOS 平台安装脚本（纯文件 + symlink，无 `--install-prefix`） |
| `apps/local/packaging/install-platform.ps1` | Windows 平台安装脚本 |

### 修改文件

| 文件 | 说明 |
|---|---|
| `apps/local/main_local.go` | 可能加 `-install` 子命令（如果需要让二进制自注册 symlink）；也可以 install.sh 纯 shell 搞定 |
| `apps/local/config.default.json` | 已无改动（数据目录/PORT 由代码里的常量处理） |
| `docs/tasks/editions-todo.md` | E06a/E06b 勾选并补充落点说明 |
| `docs/tasks/progress.md` | 追加 E06 记录 |

### 不触碰

- `scripts/package-candidate.mjs`：仍只打包 Agent
- `apps/cloud/deploy/`：云版部署
- `internal/platform/*`：E05 已完成启动序列
- 签名 / 公证配置文件（实际 CI 做，不在仓库里）

---

## Implementation Steps

### Step 1: PG 二进制清单

新建 `pg-bins.json`，包含 4 个平台（darwin-arm64、linux-amd64、linux-arm64、windows-amd64）的 PG 18.x 官方下载 URL + 预期 SHA256。打包时按 host OS 匹配，不匹配的平台跳过或报错。PG 18 最新小版本在实施时查 PGDG 确认（写作计划时 PG 18.5 是稳定版）。

### Step 2: build-platform-local.mjs

和 build-agent.mjs 同构但针对平台：

```
for each target in [darwin-arm64-cgo, linux-amd64, linux-arm64, windows-amd64]:
  dir = output/mcp-studio-local-{version}-{os}-{arch}/
  
  # 1. Go binary
  run go build -tags local -trimpath -ldflags "-X main.version=..." -o dir/mcp-studio ./apps/local
  
  # 2. Download PG binaries
  fetch PG tarball from pg-bins.json[target].url
  verify SHA256 matches
  extract bin/ initdb postgres pg_ctl pg_isready into dir/pg/
  
  # 3. Install wrapper
  copy install-platform.sh / install-platform.ps1
  
  # 4. Generate manifest + checksums
  write manifest.json (format: mcp-studio-local.candidate.v1)
  write CHECKSUMS.sha256
  
  # 5. Archive
  tar.gz / zip
```

注意：macOS arm64 需要 CGO_ENABLED=1（因为本地代码可能用到 cgo），其他平台 CGO_ENABLED=0 静态编译。如果跨平台 cgo 编译不可行，退到 native build（在 macOS 上编 darwin-arm64，在 Linux CI 上编 linux-*）。

### Step 3: 安装脚本

`install-platform.sh`：
```bash
#!/bin/sh
# Usage: ./install-platform.sh install|upgrade UNPACKED_DIR PREFIX
# install:  解压后直接把本目录内容复制到 PREFIX/
# upgrade:  覆盖二进制，保留 pg/ 目录（避免重复下载）
# uninstall: 删 PREFIX 下所有文件，提示用户手动删数据目录
```

`install-platform.ps1`：
```powershell
param([ValidateSet('install','upgrade','uninstall')]$Action, [string]$UnpackedDir, [string]$Prefix)
```

关键点：
- 不碰数据目录（RunLocal 自己管 `localDataDir()`）
- 升级时保留 PG 二进制子目录（`pg/`）——它在 PREFIX 下不是数据目录
- 卸载时只删 prefix 内容，不删 data dir

### Step 4: Go 二进制可选 install 子命令

main_local.go 可选增加 `-install-dir` flag：如果用户直接 `mcp-studio -install-dir /opt/mcp-studio`，二进制自己复制自己 + 解压附带 PG 二进制到指定目录。但这要求 Go 二进制内嵌 PG 二进制（用 `//go:embed`），会让二进制暴增（PG 18 静态 bin 约 20MB）。

**E06 先不做**：shell 脚本更灵活，不内嵌二进制，包体更小。E08/E09 再看是否需要自包含。

### Step 5: 手动冒烟

在宿主环境运行 `node apps/local/packaging/build-platform-local.mjs`：
1. PG 二进制下载是否成功（macOS arm64 用 Postgres.app 或 EDB）
2. 编译 `go build -tags local ./apps/local` 是否成功
3. manifest / checksums 是否正确
4. archive 是否可解压

然后手动安装：解压 → 运行 install-platform.sh install → 运行 mcp-studio → 看 HTTP 日志是否正常启动 → Ctrl+C 关闭 → 再次运行（验证二次启动复用）。

---

## Dependencies and Considerations

1. **跨平台 cgo 编译**：`go build -tags local ./apps/local` 目前只用标准库（net/http, os, os/exec, os/signal），没有 cgo 依赖。确认后可以 CGO_ENABLED=0 全平台静态编译。如果将来加了 CGO 代码，需要退回 native build（在 macOS 机器上编 darwin，在 Linux 上编 linux）。

2. **PG 二进制下载源可靠性**：PGDG tarball 偶尔换 URL 或改 SHA256。pg-bins.json 里 URL + SHA256 配对，打包时不匹配就 fail-fast 而不是静默使用错误版本。

3. **包体积**：Go 二进制（~15MB）+ PG bin（~20MB）= 约 35MB tar.gz。合理。如果要内嵌 PG 二进制到 Go binary 里（embed 方案），会让 Go binary 从 15MB 涨到 35MB+，但省了解包步骤。

4. **macOS 签名/公证**：E06 计划里 build-platform-local.mjs 只生成 unsigned 产物。签名/公证是 CI 里的独立步骤，需要 Apple Developer 账号（不在本仓库里）。

5. **Linux service 注册**：systemd `.service` 文件不是 E06 范围。手动启动 `mcp-studio &` 或用 `nohup` 即可。systemd 集成放 E08/E09。

6. **首次启动后自动打开浏览器**：在 RunLocal 里加一次 `exec.Command("open", origin)` 或 OS 等效命令（仅首次启动成功后，且 HTTP 健康检查通过后）。这个可以作为 E06 的小扩展：在 entry_local.go 里，server 启动成功后首次请求之前，等 1s 然后调 open。

---

## Validation

| 验证 | 预期 |
|---|---|
| `go build -tags local ./apps/local`（host macOS） | ✅ |
| `go build -tags local -GOOS=linux ./apps/local`（验证交叉编译） | ✅ |
| `node build-platform-local.mjs`（下载 PG + 编译 + 归档） | ✅ |
| 解压 archive → install-platform.sh install PREFIX → 运行 mcp-studio → HTTP OK | ✅ |
| 二次启动（数据目录已存在）→ 跳过 initdb → 正常启动 | ✅ |
| Ctrl+C 优雅关闭 | ✅ |
| install-platform.sh upgrade → 覆盖二进制 → 不丢数据 | ✅ |
| install-platform.sh uninstall → 删 prefix → 保留数据目录 | ✅ |
| manifest.json format: mcp-studio-local.candidate.v1 | ✅ |
| CHECKSUMS.sha256 可验证 archive + 二进制 | ✅ |

---

## Risks

1. **PG 二进制下载失败**：打包脚本遇到网络问题时立即退出，不产半成品。用户可手动下载后放到 `~/.cache/mcp-studio/pg/<os>-<arch>/` 并设置 `MCP_STUDIO_LOCAL_PG_BIN`。

2. **不同 PG 小版本差异**：PG 18.5 和 18.6 的 initdb / postgres / pg_ctl 二进制完全兼容。但数据目录有版本号（PG_VERSION 文件），跨大版本（18 → 19）不兼容。E06 只处理 18.x 单版本。

3. **权限问题**：install-platform.sh 如果 PREFIX 在系统目录（如 /usr/local/bin），需要 sudo。脚本开头检测是否可写，不可写就打印提示改用 `sudo` 或给 ~/.local/bin（用户可写）。

4. **Windows PATH 冲突**：如果用户已有系统 PG 安装，`resolveExecutable` 会先找 prefix 里的 pg/ 子目录（因为我们会把 pg/bin 路径放进 PATH 或者 resolveExecutable 的 binDir 参数优先）。不会混用。

5. **首次启动浏览器打开**：macOS 用 `open URL`，Linux 用 `xdg-open URL`，Windows 用 `start URL`。跨 OS 需要 switch。RunLocal 启动成功后触发一次。

---

## 边界声明（本阶段不做）

- macOS 签名 / 公证（需要 Apple 开发者账号，CI 做）
- systemd / Windows service 注册（E08/E09）
- GUI 安装向导（先脚本）
- 自动更新检查器（E08/E09）
- Agent 打包改动（E06 不碰 build-agent.mjs）
- PG 自动版本升级脚本（跨大版本时需要数据迁移，单独工作包）
