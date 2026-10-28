# 012 · 单机版与云服务版拆分及双启动路径

本文件是分析结论，不是实施授权。未修改任何代码、配置或 `AGENTS.md`。基线：`npm run verify` 退出码 0（2026-10-28，证据 `.debug/verify-baseline/`）。

## 决策

需求原文：支持本地启动（单人开发直接在本地终端启动）与云平台启动（部署到服务，浏览器访问）。

| 编号 | 决策 | 结论 |
| --- | --- | --- |
| Q1 | 本地启动形态 | 自用单机版，长期当工具用，不要求 Go 工具链 |
| Q2 | 单人本地是否绕过账号/项目/团队 | 绕过 |
| Q3 | 云平台目标环境 | 单台 Linux VM + Compose，一个部署 = 一个团队 |
| Q4 | 拆分方式 | 当前目录拆两个子目录 |
| Q5 | 两个子目录装什么 | 两个发行壳，业务代码只有一份 |
| Q6 | 单机版承载形态 | Go 单二进制 + 内嵌前端 + 内嵌 PostgreSQL |
| Q7 | 单机版授权语义 | 编译期裁掉账号/团队/邀请/角色，权限检查短路 |
| Q8 | 短路到哪一层 | 只跳过角色与成员资格校验，保留按项目归属过滤 |
| Q9 | 数据与凭据位置 | 各平台标准用户数据目录；凭据进系统凭据库 |
| Q10 | 部署资产归位 | `deploy/` 迁入云服务版，`packaging/` 迁入单机版，跨版本门禁留在根 |
| Q11 | 本地开发编排范围 | 一条命令起 PG + 平台 + 前端；Agent 单独启动 |

## 目录布局

`internal/`、`apps/web`、`contracts/`、`migrations/`、`scripts/` 留在根，两份发行各自只有入口与分发资产。

```
/
├── apps/web/            共享前端（两版同一份构建产物）
├── internal/platform/   平台领域，含两版分歧点（build tag）
├── internal/agent/      Agent 领域，与发行形态无关
├── cmd/agent/           Agent 入口，两版共用，保持现状
├── contracts/  migrations/  scripts/   跨版本合同、迁移、门禁
├── apps/cloud/          main.go、默认配置、deploy/（compose、Caddyfile、Dockerfile、init-db、backup、smtp override）
└── apps/local/          main.go、默认配置、packaging/（打包、内嵌 PG 拉取、安装器）
```

`cmd/platform` 并入 `apps/cloud/main.go`；其解析逻辑下沉到 `internal/platform`，避免外壳里出现领域代码。`cmd/agent` 不拆分，Agent 在两种形态下相同。

## 两条启动路径

**单机版**：单进程。启动时确定数据目录（macOS `~/Library/Application Support/MCP Studio/`、Linux `~/.local/share/mcp-studio/`、Windows `%LOCALAPPDATA%\MCPStudio\`），首次运行在该目录 `initdb`，以本地主体初始化，创建个人项目，随后监听回环端口并打开浏览器。凭据进系统凭据库（Keychain / libsecret / DPAPI），沿用 Agent 现有来源，不新增第二种凭据存储。无外部依赖、无 Compose、无 TLS。

**云服务版**：沿用现有 `apps/cloud/deploy/compose.json` 三服务（db、platform、tls），Caddy 终止 HTTPS，PG 独立持久卷，秘密以 `_FILE` 挂载。浏览器访问，平台不代发 MCP 调用。

**开发态**：`npm run dev` 起 PG（Compose 前提起或本机实例）+ 平台 + Vite；`npm run dev:agent` 单独起 Agent。Agent 的终端配对确认是刻意保留的人工环节，不进自动编排。这填补当前 `dev` 只起 Vite 的缺口。

## 需要新增或改动

1. 配置层：17 个 `MCP_STUDIO_*` 环境变量目前无文件、无默认值、无优先级。需要一层配置（文件 + 环境覆盖），两版各带自己的默认值文件。
2. 发行开关：现有 `MCP_STUDIO_ALLOW_INSECURE_LOOPBACK` 与 `MCP_STUDIO_INIT_CREDENTIAL` 是散装隐式开关，需收编为显式发行标识（`local` / `cloud`），由构建标签确定。
3. 授权分歧：`internal/platform` 增加 build tag 分支。单机版注入不可删除的本地管理员作真实主体，跳过角色/成员资格校验，保留 `project_id` 过滤；云版路径不变。
4. 内嵌 PG：拉取与内嵌 PG 二进制（按架构），首次运行 `initdb`、健康检查、版本升级时的数据目录兼容。
5. 单机打包与安装：`apps/local/packaging/` 产出各平台安装包。
6. 门禁：`scripts/verify.mjs` 增加本地发行冒烟（构建标签编译、`initdb`、健康检查、数据目录权限），云版仍跑现有 `test-deployment.mjs`。

## 与现有验收的关系

- **A41、A42 范围扩大**：单机版同样依赖系统凭据库与真实 OS 确认，且新增签名与公证要求。这三项目前都因缺环境处于待验，单机发行版只能停留在未签名内部试用。
- **角色权限类断言只对云版成立**：Q7 裁掉单机版授权链后，任何"成员资格"断言都必须标注适用范围，否则单机版运行会记出假失败。
- **不受影响**：页面矩阵（A29–A33）、脱敏（A23/A52）、容量（A47）、历史与记录语义不变，因数据层与前端只有一份。
- **verify 基线**：当前门禁不覆盖任一新路径，在加入冒烟前，"两版都能起"不得报告为通过。

## 规则修订（已于 2026-10-28 确认）

`AGENTS.md` 现有边界为「平台 API 和 Agent 都检查对象所属项目的真实权限；模拟角色不是授权来源」。Q7 使其只对云版成立。已改写为：

> 云服务版平台 API 和 Agent 都检查对象所属项目的真实权限；模拟角色不是授权来源，目录管理权不等于项目内容权。单机版不做角色与成员资格校验，但仍按项目归属过滤；其本地主体是库中真实账号，不是模拟角色。

## 未决与风险

- **两套授权语义是本方案最大的长期成本**：云版越权排查时须先排除单机分支。若将来单机版要补回登录，应优先删除编译分支而非叠加。
- **schema 不分叉**：单机版库中仍存在账号、团队、项目表，只是入口与校验被裁。做数据迁移或备份恢复时不能假设这些表为空。
- **PG 内嵌的体积与升级**：每架构约 +50MB，PG 大版本升级需处理既有数据目录，这属于新增运维面。
- **阶段归属**：建议作为新阶段（发行形态）推进，不并入 M7。理由是它改变了分发方式与授权语义，并重新界定了 A41/A42 的适用范围；在 A01–A60 适用范围重述之前开工，会产生无法签收的验收项。
