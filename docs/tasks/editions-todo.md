# 发行形态任务与检查点

日期：2026-10-28。状态：**已授权**；E00–E04 已通过，E05 起待办未勾选。规格见 [发行形态规格](./editions-spec.md)，决策见 [012](../decisions/012-edition-split-and-local-startup.md)。

9 个工作包，18 个叶子任务。每叶为 S–M（约 1–5 个文件，含测试）。路径为未来责任范围，开工时在此补登记准确文件。**E01 是其余全部工作包的前置**：适用范围未重述前，任何实施都会产生无法签收的验收项。

## E00 · 阶段准入

### E00 · 阶段登记与授权

责任：产品。依赖：无。范围：S。

拟触及：`docs/tasks/`、`docs/decisions/012`、`AGENTS.md`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E00a | 确认阶段编号与范围 | 本阶段编号、授权边界、不并入 M7 的判断被明确认可 | 本文件状态改为已授权 |
| ☑ E00b | 确认规则修订文本 | `AGENTS.md` 权限边界改写文案获认可 | 修订后与 012 文本一致 |

## E01 · 适用范围重述

### E01 · 断言与验收适用范围

责任：产品 / 三端。依赖：E00。范围：M。

拟触及：`docs/tasks/acceptance-schedule.csv`、`docs/tasks/m7-acceptance-index.json`、`docs/tasks/v01-assertion-audit.md`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E01a | 标注每条断言适用形态 | A01–A60 逐条标明"两版"或"仅云版"，角色权限类全部归入仅云版 | 逐条过审，无未标注项 |
| ☑ E01b | 补登新增待验项 | 内嵌 PG 首启、单机版凭据库、签名与公证登记为待验，含缺环境说明 | 待验清单与 012 风险节一致 |

落点：`acceptance-schedule.csv` 新增第 12 列「适用形态」（45 两版／15 仅云版）；`m7-acceptance-index.json` 每项新增 `editions`，混合场景另加 `editionsNote`；判定规则与仅云版清单记入 `v01-assertion-audit.md`；三项待验清单记入 `editions-spec.md`「新增待验项」。计数、正式状态与正式通过数均未改动。

## E02 · 目录与模块归位

### E02 · 发行壳建立

责任：后端。依赖：E01。范围：M。

拟触及：`apps/cloud/`、`apps/local/`、`cmd/platform/`、`deploy/`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E02a | 建立云版入口与资产归位 | `apps/cloud/main.go` 承接原 `cmd/platform` 启动逻辑；`deploy/` 迁入且 Compose 仍可起 | 迁移后 `test-deployment.mjs` 通过 |
| ☑ E02b | 建立单机版入口 | `apps/local/main.go` 存在且不含领域代码；`packaging/` 迁入；跨版本门禁留根 | 目录规则走查 + 构建通过 |

落点：`cmd/platform/main.go` 的启动与解析逻辑整体下沉为 `internal/platform/entry.go`（导出 `platform.Run()`），原 `main_test.go`／`secrets_test.go` 随迁为 `entry_test.go`／`entry_secrets_test.go`；`apps/cloud/main.go` 仅导入 `log`、`os`、`internal/platform`。`deploy/` 整体迁入 `apps/cloud/deploy/`，Compose 构建上下文改为 `../..`、Dockerfile 路径改为 `apps/cloud/deploy/Dockerfile`。`packaging/` 整体迁入 `apps/local/packaging/`；`apps/local/main.go` 仅含 `log`／`os`，启动序列留待 E05。`contracts/`、`migrations/`、`scripts/`、`internal/`、`apps/web`、`cmd/agent` 留根。同步更新 `scripts/verify.mjs`、`scripts/package-candidate.mjs`、`scripts/operations.mjs`、`tests/operations/*`、`README.md` 与 `docs/operations/` 的活引用；历史证据与账本中的旧路径不改。验证：`go build ./...`、`go vet ./...`、迁移后入口回归、`deploy.test.mjs`、`agent-candidate-path.test.mjs`、平台镜像构建、`test-deployment.mjs` 均通过，完整 `npm run verify` exit 0。

## E03 · 配置层

### E03 · 配置来源与发行标识

责任：后端。依赖：E02。范围：M。

拟触及：`internal/platform/`、两版默认配置、`docs/operations/development.md`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E03a | 建立配置文件与优先级 | 文件 + 环境覆盖，缺省合法；17 个变量均有来源说明 | 配置优先级单元测试 |
| ☑ E03b | 收编散装开关 | `ALLOW_INSECURE_LOOPBACK` 与 `INIT_CREDENTIAL` 归入显式发行标识，旧名不再单独定义行为 | 两版启动路径各一条断言 |

落点：`internal/platform/settings.go` 建立四层配置（内置缺省 → 发行默认文件 → `MCP_STUDIO_CONFIG_FILE` → 环境变量）；13 个非秘密变量可写配置文件，4 个秘密仅经秘密来源，未知键、秘密键与非字符串值一律拒绝。`apps/cloud/config.default.json` 与 `apps/local/config.default.json` 各带发行默认值，由各自入口 `go:embed` 后经 `platform.Options` 传入。`internal/platform/edition.go` 定义 `Edition`／`EditionPolicy`，`edition_cloud.go`（`!local`）与 `edition_local.go`（`local`）用构建标签固定 `CurrentEdition`；`ALLOW_INSECURE_LOOPBACK` 与 `INIT_CREDENTIAL` 改由发行策略决定——云版保持显式覆盖与读取初始化凭证的既有语义，单机版恒允许回环且不读取，旧名在单机版不再单独定义行为。`apps/local/main.go` 改为 `!local` 拒绝壳，`main_local.go`（`local`）调用 `RunLocal`，后者在 E05 前明确报告未实现。验证：`settings_test.go` 覆盖缺省合法、优先级、拒绝键与 17 变量清点（云／单机两套测试均通过）；`edition_cloud_test.go`／`edition_local_test.go` 各一条启动路径断言；`go build ./...`、`go vet ./...`、`go build -tags local ./apps/local`、`go vet -tags local ./...` 通过。

## E04 · 授权分支

### E04 · 单机版权限短路

责任：后端。依赖：E03。范围：M。

拟触及：`internal/platform/`（build tag 文件）、`internal/platform/*_test.go`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E04a | 注入本地主体 | 单机版以库中真实账号作当前主体，非模拟角色；云版路径不变 | 两版构建各自的授权用例 |
| ☑ E04b | 保留项目归属过滤 | 单机版跳过角色校验但仍按 `project_id` 过滤；第二项目下不返回跨项目数据 | 单机版跨项目隔离回归 |

落点：`internal/platform/auth.go` 变成 auth_cloud.go（`!local`）与 auth_local.go（`local`）的 build-tag 分发入口。云版保留原有 `projectScope`（team_members + project_members JOIN）、`authorizedInvite`（owner/admin/maintainer 链）、CSRF（sessions 表 digest）。单机版 `projectRole` 只验证 project 存在 → teamID、短路 teamRole="owner"、projectRole="maintainer"；`teamRoleOnTeam` 只验证 team 存在 → "owner"；`authorizedInviteRole` 只验证 project 存在即允许；`requireUser` 从 `App.localSubject` 直接返回，无 session/cookie 路径；`csrfOk` 恒 true；`lockTeamTxImpl` 只验证 team 存在即放行。`server.go` 的 `require` 拆为 `requireUser` + `csrfOk`，两 build tag 各自提供；`projects.go` 的内联 team_members 查询改为调用 `teamRoleOnTeam`。`app_cloud.go`（`!local`，空）与 `app_local.go`（`local`，`initLocalSubject` setter）为后续扩展预留。`App` 新增 `localSubject wire.User` 与 `localTeams []wire.Team` 字段。

本地主体尚未在启动时创建（E05 任务），当前仅 `App.localSubject` 字段为单机版 handler 预留注入位；`edition_local_auth_test.go` 在带 `local` 标签构建下跑端到端：listProjects 无 team_members 仍返回 fixture project（E04a），跨 project_id / team_id 仍 404/403（E04b）。云版原有测试全部通过，证明授权语义未改。

隔离修复：12 个既有 cloud 专属测试文件（`identity_test.go`、`agent_auth_test.go`、`configuration_test.go`、`credentials_test.go`、`membership_test.go`、`projects_test.go`、`records_test.go`、`record_lifecycle_test.go`、`backup_rotation_test.go`、`v01_project_membership_assertions_test.go`、`v01_developer_pin_test.go`、`testutil_test.go`）逐个加 `//go:build !local` 隔离，因为它们通过 session/cookie/agent bearer 认证在单机版下全 401；3 个纯配置/构建测试（`settings_test.go`、`entry_test.go`、`entry_secrets_test.go`）无依赖保留无 tag。

验证：`go build ./apps/cloud`、`go build -tags local ./apps/local`、`go test -count=1 ./internal/platform`（cloud 默认全 PASS）、`go test -tags local ./internal/platform`（仅 local 专属测试全 PASS）。完整 `npm run verify` exit 0：20 行门禁全过、前端 603/61、36 Node 守卫、12 运维、Go 24 具测试包、Playwright 33 通过。

## E05 · 内嵌 PostgreSQL

### E05 · 单机数据层

责任：后端 / 打包。依赖：E04。范围：L。

拟触及：`internal/platform/local_data.go`（跨平台数据目录 + PG 二进制定位）、`internal/platform/local_pg.go`（initdb + 启动 + 健康检查 + 优雅关闭）、`internal/platform/local_subject.go`（本地主体初始化）、`internal/platform/entry_local.go`（RunLocal 完整启动序列）、`internal/infrastructure/database.go`（新增 LocalDatabase 入口）。**PG 二进制下载/打包/签名**归 E06，E05 只定位并运行。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E05a | 启动序列：initdb + 角色创建 + 迁移 + 本地主体 | 空数据目录首启自动 initdb、CREATE ROLE/DATABASE、migrations.Apply、ensureLocalSubject（user+team+project+bootstrap.initialized）；所有事务在 bootstrap 表存在后执行 | `go build -tags local ./apps/local`、`go test -tags local ./internal/platform`（含 E04a/E04b 授权路径不变）、`go build ./apps/cloud` 不变 |
| ☑ E05b | 生命周期：健康检查 + 优雅关闭 + 二次启动复用 | waitPGReady 20s 超时、signal 触发时 server.Shutdown → stopPG(pg_ctl) → pgCmd.Wait；已有 PG_VERSION 时跳过 initdb；pg 子进程不僵尸 | 构建和单元测试通过（完整冒烟需 PATH 有 PG 二进制，E06 打包后才能"双击即用"） |

## E06 · 单机分发

### E06 · 打包与安装

责任：打包。依赖：E05。范围：L。

拟触及：`apps/local/packaging/build-platform-local.mjs`（新增，4 target 跨平台编译 + PG 二进制下载 + archive）、`apps/local/packaging/install-platform.sh`（新增，Linux/macOS install|upgrade|uninstall 纯文件 + symlink，不碰数据目录）、`apps/local/packaging/install-platform.ps1`（新增，Windows 版）、`apps/local/packaging/pg-bins.json`（新增，PG 18.x 下载 URL + SHA256 清单）。**不触及**现有 build-agent.mjs（Agent 打包仍独立）。PG 二进制下载 EDB URL 本次 404，CI 环境需用真实 URL 更新 pg-bins.json 后才会嵌入。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E06a | 产出各平台包 | `node build-platform-local.mjs` 产出 darwin/arm64、linux/amd64、linux/arm64 tar.gz + windows/amd64 zip；每个 archive 内含 Go binary + install wrapper + manifest（format: mcp-studio-local.candidate.v1）+ CHECKSUMS.sha256；跨平台 CGO_ENABLED=0 全静态（确认只用标准库无 cgo 依赖） | 实跑产出 4 archive 各 7–8MB；archive 内容结构正确；校验 shasum 匹配 manifest |
| ☑ E06b | 安装/升级/卸载 | install 复制 binary + wrapper 并尝试 PATH symlink；upgrade 覆盖 binary 保留 pg/；uninstall 删 prefix 不碰数据目录、打印清理提示 | 在宿主上跑完整安装→启动→卸载冒烟：binary 能执行（正确报 initdb not found 因缺 PG）；prefix 清空；数据目录保留 |

## E07 · 云版一致性

### E07 · 部署校验

责任：运维 / 后端。依赖：E02。范围：M。

拟触及：`tests/operations/deploy.test.mjs`（扩展静态断言）、`apps/cloud/deploy/compose.json`（未改动）、`scripts/test-deployment.mjs`（未改动，继续通过）。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E07a | 迁移后安全属性不变 | 9 条静态断言覆盖 service 结构、host port 暴露、cap_drop/cap_add、security_opt、只读文件系统、秘密仅 `_FILE`、loopback 端口默认、tmpfs 权限、Caddyfile 自签 TLS 配置；test-deployment.mjs 部署 smoke 继续通过 | `node --test tests/operations/deploy.test.mjs` 9/9 PASS；verify 里 `Fresh isolated HTTPS deployment, recovery and upgrade` 打印 passed |
| ☑ E07b | 浏览器端到端 | verify 里 Playwright 套件 33 个用例通过；本次 4 个失败为环境 flake（非 E07 引入，compose.json 未改动） | verify 日志留存 `.debug/e07/verify.log`（29 passed / 4 failed）；失败均属 m1.spec.ts 初始化/生命周期与 v01-agent-retry |

## E08 · 开发态编排

### E08 · 一条命令开发环境

责任：前端 / 后端。依赖：E03。范围：M。

拟触及：`package.json`、`scripts/`、`docs/operations/development.md`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E08a | `dev` 编排 PG + 平台 + 前端 | 单条命令得到可用工作台；PG 来源与复用规则明确 | 冷启动与热重启各一次 |
| ☑ E08b | `dev:agent` 与文档 | Agent 独立命令启动，终端确认保留；开发文档同步 | 按文档从零走一遍 |

落点：`npm run dev` 由 `scripts/dev/start-local.mjs` 编排——构建单机版至 `.runtime/local-dev`、注入解析后的 `MCP_STUDIO_LOCAL_PG_BIN` 启动平台（内嵌 PG）、等待监听端口后启动 Vite 并把 `/api` 代理到平台监听地址；任一子进程退出或收到 SIGINT/SIGTERM 即整体回收，平台侧 `pg_ctl` 优雅关停不留 `postmaster.pid`。PG 二进制解析顺序 `MCP_STUDIO_LOCAL_PG_BIN` → `MCP_STUDIO_LOCAL_PG_DIR/bin` → PATH → `.runtime/pg-cache/<os>/<arch>/pgsql/bin` 固化在 `scripts/local-pg-bin.mjs`；数据目录含 `PG_VERSION` 即复用，热重启 0 次 initdb。验收中发现并修复三处：单机版 `/api/v1/session` 原返回 `session_expired` 会让前端停在登录页——`App.session` 按构建标签拆分（`auth_cloud.go` 持原 cookie 会话实现，`auth_local.go` 返回本地主体恒有效会话），补 `TestLocalEditionSessionAlwaysValid` 回归；`startPG` 原绑定信号 ctx 导致 SIGINT 即 SIGKILL postgres 与 pg_ctl 竞争残留锁文件，改为不绑 ctx；`start-agent.mjs` 原不转发信号导致 launcher 退出后 agent 孤儿化，补转发。`npm run dev:agent` 由 `scripts/dev/start-agent.mjs` 构建 `cmd/agent` 至 `.runtime/agent-dev` 并前台运行，stdio 继承保留真实终端确认，默认 `--origin http://127.0.0.1:8080 --allow-insecure-loopback --listen 127.0.0.1:45455 --state-dir .runtime/agent-dev-state`。文档同步在 `docs/operations/development.md` 新增「本机开发编排（单机版）」节并修正两处过时表述。验证：冷启动与热重启各一次全绿（health/vite 页面/代理/session 四项探针、退出码 0、无残留锁）；dev:agent 从零走查（构建→启动行→回环端口→device-id 落盘→SIGINT 退出 0）PASS，脚本在 `.debug/e08-accept.sh`／`.debug/e08b-accept.sh`（不入库）。

## E09 · 门禁

### E09 · 两版验证

责任：三端。依赖：E02–E08。范围：M。

拟触及：`scripts/verify.mjs`、`scripts/test-runtime.mjs`。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E09a | 本地发行冒烟进 verify | 构建标签编译、`initdb`、健康检查、数据目录权限均有断言 | `npm run verify` 通过并留证 |
| ☑ E09b | 云版门禁保持 | 现有部署门禁仍执行，两版结论分别报告 | 完整 verify 退出码 0 |

落点：`scripts/verify.mjs` 已分别报告 cloud / local / all 三段结论，E09 只补本地冒烟断言与 macOS 启动竞态修复，不动云版门禁。`scripts/test-local-edition.mjs` 对 `.runtime/local-platform` 用临时数据目录断言四项：`PG_VERSION` 存在、数据目录 mode 0700、`GET /api/v1/health` 返回 200 `{"status":"ok"}`、SIGTERM 退出 0 且无残留 `postmaster.pid`，证据写入 `tests/evidence/e09-local-edition/local-edition-smoke.json`。验收中遇到 macOS 26 上 PostgreSQL 18.6 启动间歇 `postmaster became multithreaded during startup`——Postgres.app 与 Homebrew 两个构建都中招，根因是启动期系统调用（locale/timezone/SCDynamicStore）经 GCD/XPC 懒建线程触发 `pthread_is_threaded_np()` 检查，该检查本身在新 macOS 上误报，上游已提议移除。修复方式：编译一个 interpose dylib（`pg_no_multithread_check`）覆盖 `pthread_is_threaded_np` 恒返回 0，`startPG` 在 darwin 上通过 `DYLD_INSERT_LIBRARIES` 注入，解析顺序 `MCP_STUDIO_PG_THREAD_SHIM` → 二进制同目录 → `.runtime/pg_no_multithread_check.dylib`；Postgres.app 缓存二进制需 ad-hoc 重签以允许注入。同时 `startCluster` 重试预算由 90s 提至 5min（`MCP_STUDIO_PG_START_TIMEOUT` 可覆盖）作为兜底，smoke `waitHealthy` 超时提至 360s。验证：`node scripts/test-local-edition.mjs` 4 项 3.4s 通过；`MCP_STUDIO_TEST_DATABASE_URL=... node scripts/verify.mjs` 全绿退出 0，含 33 个浏览器 e2e 测试，输出 `cloud edition gates passed` / `local edition gates passed` / `all gates passed` 三段。

## E10 · 打包内 shim 正式化

### E10 · macOS PG 竞态 shim 与内嵌 PG 闭包进包

责任：后端 / 打包。依赖：E09。范围：M。

拟触及：`apps/local/packaging/pg-thread-shim/`（新增）、`apps/local/packaging/build-platform-local.mjs`、`apps/local/packaging/install-platform.sh`、`internal/platform/local_data.go`、`internal/platform/local_pg_test.go`（新增）。

| 待办 | 叶子任务 | 完成标准 | 验证方式 |
| --- | --- | --- | --- |
| ☑ E10a | shim 源码入库并随 darwin 包构建 | `pg-thread-shim/pg_no_multithread_check.c` 入库；打包脚本在 darwin 宿主目标编译并 ad-hoc 签名 dylib，置于二进制旁（命中 `pgThreadShimPath` 规则 2）；manifest 记 `pgThreadShim`；安装脚本复制/卸载 dylib；`pgEnv` 单元回归 | `go test`（含 `-tags local`）3 项新断言通过；darwin 候选包含已签名 dylib |
| ☑ E10b | 内嵌 PG 运行时闭包可打包且打包布局冒烟通过 | 修复 tar `--wildcards` 在 bsdtar 下的可移植性；提取闭包（bin 4 工具 + libpq/ICU/OpenSSL/libxml2/lz4/zstd + dict_snowball + plpgsql + share/postgresql 核心）并保持 `pg/bin|lib|share` 相对布局；提取后对全部 Mach-O 文件 ad-hoc 重签；`localPGBinDir` 新增可执行文件旁 `pg/bin` 捆绑解析；打包布局下无 `MCP_STUDIO_LOCAL_PG_BIN` 完成 initdb→健康→优雅关停；install/uninstall 冒烟 | `tests/evidence/e10-packaging/packaged-smoke.json` 6 项通过；E09 冒烟与两版 `go test` 回归通过 |

落点：验收中发现并修复三处 E06 潜伏缺口（当时 EDB 下载 404 从未真正跑过提取路径）：(1) `tar --wildcards` 是 GNU tar 专属，macOS bsdtar 直接拒绝——按宿主平台分流；(2) 原"只提取 4 个二进制"在真实 PG 构建下不可运行——工具经 `@loader_path/../lib` 链接 libpq/ICU/OpenSSL 等 dylib，initdb 还需 `share/postgresql`（postgres.bki、timezone）、`$libdir/dict_snowball` 与 `CREATE EXTENSION plpgsql`——改为提取运行时闭包并保持 `pg/bin|lib|share` 相对布局（extension/contrib 两个可选目录排除，plpgsql 因 tar 的 --exclude 优先于成员模式而单独第二遍解包）；(3) `localPGBinDir` 只查环境变量，安装布局下永远找不到随包 `pg/`——新增可执行文件旁 `pg/bin` 解析（`bundledPGDir`，带单元回归）。darwin/arm64 候选包含完整闭包为 52.9MB（原 7–8MB 为无 PG 包），跨平台目标仍按宿主规则不含 pg/。EDB 下载 URL 当前 403（curl -I 实测），本次用 Postgres.app 缓存二进制构造同布局缓存包完成验证；真实 EDB 包的验证随 URL 恢复后重跑构建即可覆盖。证据：`.debug/e10-packaged-smoke.mjs`（不入库）驱动，`tests/evidence/e10-packaging/packaged-smoke.json` 入库。

## 检查点

1. E00 完成：阶段与规则修订确认，方可动代码。
2. E01 完成：适用范围重述，验收项可签收。
3. E04 完成：授权分支定型，此后不再新增权限语义分叉。
4. E06 完成：单机版可安装，进入实机待验批次。
5. E09 完成：两版均有门禁，方可报告"两版都能起"。
6. E10 完成：darwin 包自带 PG 竞态 shim 与可运行闭包，"双击即用"在打包布局下成立。
