# Agent 分发候选与生命周期

2026-10-13 · M7 / T35 候选交付。当前版本 `0.1.0-m7-candidate`；初轮构建基于M6基线的dirty工作树，最终冻结提交及通过完整门禁的归档位置见 `tests/evidence/m7-final/manifest.json` 和 `candidate-location.json`。精确源文件摘要、二进制摘要与工具链写入每个候选manifest。未发布、未形成支持版本承诺，T35a / T35b 完整叶子验收继续待验。

## 生成与核对

```sh
node packaging/build-agent.mjs
# 完整 verify 可选择一个全新目录，保留已有候选：
# MCP_STUDIO_CANDIDATE_DIR="$PWD/.runtime/verify-agent-unique" node packaging/build-agent.mjs
# MCP_STUDIO_CANDIDATE_DIR="$PWD/.runtime/verify-agent-unique" node --test tests/operations/agent-*.test.mjs
cd .runtime/distribution
shasum -a 256 -c CHECKSUMS.sha256
```

构建使用生产 `./cmd/agent`，不包含集成测试 helper、测试服务器、凭据、运行状态或队列。输入摘要覆盖 `cmd/agent`、`internal` 的 Go / 原生源文件、`packaging` 脚本以及 go.mod / go.sum；不是仅把 HEAD 当作实际实现版本。`MCP_STUDIO_CANDIDATE_DIR` 可选，必须是 `.runtime` 下的全新绝对路径，目录及祖先不得是符号链接；未设置时仍写 `.runtime/distribution`。构建器和生产候选测试使用同一变量。构建器拒绝覆盖已存在的候选目录；再次构建前把整个 `.runtime/distribution` 移到一个新的、仅本机使用的归档目录，例如 `.runtime/m7-agent-previous-build`。这些目录已被 gitignore 排除。Node / Go 与 pkgbuild 只用于构建，安装后的 CLI 不需要 Node。

| 目标 | 实际候选文件 | 原生验收 / 支持状态 |
| --- | --- | --- |
| macOS arm64 | tar.gz + unsigned pkg；CGO=1 保留系统 Keychain 实现 | macOS 26.6.2 arm64 构建、离线诊断与临时前缀烟测有证据；正式 pkg 安装、签名、公证、权限及 Keychain 联验待验 |
| Windows amd64 | zip + PowerShell 安装入口；原生 Credential Manager 实现 | 交叉构建成功；缺 Windows / PowerShell / WiX 环境，原生安装、MSI、签名与凭据库联验待验 |
| Linux amd64 / arm64 | CLI tar.gz + shell 安装入口 | 交叉构建成功；清洁 Linux 安装与 Secret Service 联验待验；系统凭据实现需要 `/usr/bin/secret-tool` 及可用用户会话 |

macOS pkg 是候选文件投放容器，目标为 `/Applications/MCP Studio Agent Candidate`，没有安装脚本或自动启动服务；受管 per-user 安装仍通过下述显式入口完成。只生成并检查包，未在本机安装此 pkg。pkgutil 展示的 `._*` 是 pkgbuild 生成的文件元数据；逻辑载荷仅四个允许文件。Windows zip 是候选替代交付，不能当作 Windows 安装包 / MSI 验收已完成。

各包内含生产二进制、一个 OS 安装入口、manifest.json、CHECKSUMS.sha256。外层另有全体归档校验和及 manifest。SHA-256 用于检查候选完整性；当前产物没有可信发布签名，不能把摘要校验当作来源认证。`support=pending-native-validation`、`signing=unsigned-not-published` 保留在 manifest。

## 诊断与前台启动

```sh
./mcp-studio-agent --version
./mcp-studio-agent --diagnose
./mcp-studio-agent --origin https://work.example --state-dir /absolute/private/state
```

两个离线信息模式都先于状态初始化返回，不创建目录、不访问系统凭据库、不联网；只输出构建版本 / revision、OS / 架构、Go / CGO、支持待验状态和本机终端确认要求。`vault=not-probed` 是未探测，不表示凭据库可用或不可用。诊断不回显 Origin、运行参数、设备身份或路径。非法参数只返回稳定错误码，不输出原始参数。

启动保持前台；配对与 stdio 启动仍读取真实控制终端的明确确认。安装器不添加 LaunchAgent、Windows 服务、systemd 服务或 PATH 修改，不提供绕过本机确认的发布开关。选择 HTTP / stdio 执行端与每连接隔离仍沿用 D06 / D15。

## 安装、升级与卸载

把候选解压到一个只由本人控制的目录，从该解压目录执行；prefix 是新的专用私有目录，其父目录需已存在，不能指向已有软件目录。state 是明确选定的 Agent 状态目录；需要升级时必须传入原安装登记的同一个 state。两者必须绝对路径、互不包含，路径及祖先不能是符号链接；macOS 临时目录请使用真实 `/private/...` 路径。

```sh
# Linux / macOS: 用真实绝对路径替换示例，勿使用 sudo。
./install.sh install /absolute/private/agent-install /absolute/private/agent-state
./install.sh upgrade /absolute/private/agent-install /absolute/private/agent-state
./install.sh uninstall /absolute/private/agent-install /absolute/private/agent-state
```

```powershell
# Windows: 从解压目录使用候选 exe，避免直接运行待替换的已安装 exe。
./install.ps1 -Action install -Prefix C:\Users\you\AgentInstall -StateDirectory C:\Users\you\AgentState
./install.ps1 -Action upgrade -Prefix C:\Users\you\AgentInstall -StateDirectory C:\Users\you\AgentState
./install.ps1 -Action uninstall -Prefix C:\Users\you\AgentInstall -StateDirectory C:\Users\you\AgentState
```

安装在 Unix 创建 0700 专用前缀、0700 二进制和 0600 受管标记；Windows ACL 的继承与最小权限需原生验收。受管标记绑定当前用户身份、明确 state 目录和已安装二进制 SHA-256。Unix 同时拒绝权限放宽的前缀 / 状态目录。升级 / 卸载拒绝无标记、用户或状态不符、二进制已修改、符号链接及意外文件。标记不是跨用户认证服务，也不会从 URL 推导连接身份。

替换时同时持有安装目录锁和生产 Agent 的 `state/agent.lock`；受管生产 Agent 启动时验证标记绑定的 state-dir 并在整个生命周期持有安装锁，避免启动检查与状态锁之间的替换竞态；在另一个 state-dir 启动会拒绝且不初始化该目录。运行中的 Agent 使升级 / 卸载失败，需先停止 Agent，等待退出再操作。升级和卸载使用私有 `.install-transaction`：先同步旧 binary / marker 的校验快照、新文件及事务日志，再分别发布 binary / marker，最后持久写入提交标记。提交前发生普通文件错误会恢复旧文件；旧快照在提交前持续保留，不先截断唯一 marker。只读 marker 在替换前拒绝。受控发布中断后，下一次安装操作或受管启动在同一安装锁 / 状态锁内检查事务并恢复；提交前回滚旧 pair，提交后保留新 pair 并完成备份清理。恢复完成也先记录并同步完成状态，再清理日志和备份，避免清理期间中断使旧文件丢失。恢复不会读取或删除 Agent data、queue、vault 或系统凭据。当前没有队列 / 凭据格式迁移，升级与卸载不会删除 device-id、data、加密队列、密钥或 OS 凭据库项目。卸载只移除受管 binary 和标记，保留前缀的 `.install.lock`；如需重新全新安装，由本人在操作结束后清理这个已空的专用前缀。普通准备阶段失败可能留下仅有安装锁的专用前缀，需检查后再重新尝试；有有效事务的中断首次安装允许原 install 操作恢复并重试，不收养其他已有目录。

恢复时若启动路径返回 `install_recovered_restart_required`，退出后重新启动恢复后的 binary；当前进程可能已经加载另一版本，不能在恢复后直接继续运行。无法完成恢复时保留事务与校验快照，返回 `install_recovery_required`，从可信解压候选再次执行同一操作；不要手动删除事务目录。Windows 运行中的 exe 可能阻止替换，应让失败进程退出后从解压候选执行恢复；Windows 文件替换、ACL 及目录耐久性仍待原生验证（当前仅 file flush，未验证 Windows directory flush）。损坏 / 非本人 / 非对应 state 的事务拒绝自动恢复。注入中断测试并非 OS 断电演练。

回退需停止 Agent，并使用来自可信来源、可读当前合同及加密队列格式的候选，从其解压目录执行 upgrade。没有版本兼容证明时不可自动回退；当前测试中的两版文件替换及同构建 production upgrade 不代表真实旧版本迁移 / 回退完成。

## 解除配对与证据边界

解除配对经受认证本机 API `DELETE /v1/pairing/{pairingId}`，撤销通道并清理配对会话。它与卸载分开：卸载不等于注销上游凭据，也不删除合规待上传队列。新受控回归使用生产 localapi / pairing / sessions / 加密 queue 和真实 MCP HTTP 服务：解除前完成一次 Tool 调用，解除后旧 channel token 与平台 grant 发新 Run 均 401，旧配对确认重放 403，实际 Tool 次数保持 1，并验证旧 session 连接已清理。该测试只控制外部平台授权、终端确认与内存主密钥，不冒充真实 Keychain 验收。

证据见 `tests/evidence/m7-agent/`：诊断 RED、锁回归 RED、focused Go / vet、marker 失败 / 发布中断 / 卸载部分失败与提交恢复回归、独立输出路径回归、生产候选 Node 烟测、真实 unpair、build 元数据、OS 工具链、二进制目标、checksum 和 pkg 载荷 / 未签名结果。测试仅使用 private temp prefix，没有真实用户状态、OS 凭据或实际 `/Applications` 安装操作。完整工程 verify 由 M7 根任务统一执行并登记，不能以本页 focused 证据替代。

仍待验：三 OS 清洁安装 / 卸载 / 权限、Windows MSI 与 PowerShell 原生执行、macOS 签名 / 公证 / 真实 pkg 安装、各 OS 系统凭据库、真实旧版本升级和兼容回退、设备解除的原生连续旅程、T02 / T32b 与既有人工 / 浏览器 / 介质待验。没有正式 A 项签收或发布操作。
