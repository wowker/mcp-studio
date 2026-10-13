# M7 T35 Agent 候选证据

2026-10-13，版本 0.1.0-m7-candidate，基线 acf71978d77d8270a9f58229e6a882e2bb14296f + dirty。实际二进制 / 输入 / 包 SHA-256 见 build.json；产物位于 gitignored `.runtime/distribution`。日志只保存受控测试输出。

- red.txt: 初始缺 Apply / BinaryName 的编译 RED；同时保留默认 Go cache 的 EPERM 环境限制。不是通过证据。
- red-diagnostics.txt: 临时移除新版本 / 诊断模式注册，测试因 `invalid_agent_arguments` 失败；随后恢复实现。
- red-lifecycle-lock.txt: 临时把 busy-lock 分支改为成功，运行真实锁回归失败 `upgraded running Agent`；随后恢复。
- red-prefix-permission.txt: 实际 0777 前缀升级被现有实现接受的失败证据；随后补齐 Unix private directory 校验。
- red-managed-startup.txt: 新启动守卫能力缺失的编译 RED，初始测试 API 后调整为持有安装锁的 GuardRuntime；未当作通过结果。
- green-focused.txt / go-green.txt: 实际 GOCACHE=/private/tmp/mcp-studio-go-cache Go focused 测试（后者 count=1）；使用 authorized escalation 访问现有 module cache。
- unpair-original.txt: 新增行为回归检查原有生产解除配对，没有新增 production unpair 实现。真实 API / session engine / encrypted queue / MCP server；测试主密钥与终端确认不代表 OS 原生凭据库。
- vet.txt: `go vet ./cmd/agent ./internal/agent/lifecycle` exit 0，输出为空。
- node-green.txt: `node --test tests/operations/agent-distribution.test.mjs`，3 个实际生产候选 / 包检查 / 输出路径回归通过。只在 private temporary prefix 安装、同构建升级、卸载。
- build.json: `node packaging/build-agent.mjs` 实际四目标构建和 unsigned pkg 生成成功结果。
- toolchain.txt / binary-targets.txt / diagnose.json: 实际 macOS / Go / Node 版本、Mach-O / PE / ELF 目标、生产离线诊断。Darwin CGO=1，vault 未探测。
- checksums.txt: `(cd .runtime/distribution && shasum -a 256 -c CHECKSUMS.sha256)` 六项 OK。
- pkg-signature.txt / pkg-payload.txt: 实际 `pkgutil --check-signature` / `--payload-files`。未签名为预期候选状态，不是签名检查通过；`._*` 为包生成的元数据。

所有局部测试结果不代表完整 verify 或正式验收。T35a / T35b 保留三 OS 原生安装、签名、Windows MSI、原生凭据库和真实旧版迁移 / 回退等待验项。未发布、未签名、未实际安装 macOS pkg，不声明生产支持。

## 最后审阅事务修复

- review-original-marker-red.txt: 原实现的真实 0400 marker + 不同 v2 升级，失败后 binary 已变成 v2，验证旧 binary 丢失的原始 RED。
- review-transaction-red.txt: 发布事务及注入文件操作能力缺失的 fail-first RED。
- review-transaction-green.txt: readonly 预检、标记发布错误自动回滚、binary 替换后受控中断 + state lock 拒绝 + 启动恢复要求重启、卸载部分失败 / 中断、提交后恢复、首次安装中断重试通过。断点通过内部文件操作依赖注入触发，生产无环境开关或自动批准路径；不声称真实断电 / Windows 原生验证。
- review-candidate-path-red.txt / green.txt: 新目录选项缺失 RED，然后真实 temp-root 文件系统验证 fresh / absolute / .runtime containment / symlink / existing artifact preservation GREEN。
- review-custom-build.json / review-custom-node-green.txt: 使用 MCP_STUDIO_CANDIDATE_DIR 指向新的 ignored `.runtime/m7-agent-review-verify-candidate` 完成真实四目标构建 + 3 Node 测试；原交付保留。
- build.json / go-green.txt / vet.txt / node-green.txt / checksums.txt 已刷新为最后稳定实现的默认 distribution。旧默认产物仅移至 ignored `.runtime/m7-agent-pre-review-transaction` 等迭代目录，未发布或删除实际安装。

恢复协议保留前后文件快照和同步 journal，提交标记之前回滚，提交之后验证新 pair 并清理。恢复完成状态同样持久化；清理先同步 journal 删除，再删除完成标记，避免中断复活一个缺备份的旧 journal。所有发布 / 恢复均持有安装与 state 锁，启动恢复后必须重新启动已恢复 binary。文件或权限故障阻止恢复时保留快照并失败关闭；Windows directory durability 及真实掉电仍待验。

## 后续最终交付的物理归档修补

本目录为T35局部历史结果。原node-green的tar列表会隐藏AppleDouble，不能证明物理归档只含四文件；根任务实际核对发现额外条目并补物理TAR头回归。失败见m7-root/agent-archive-metadata-red.log，修补构建和五项GREEN见agent-archive-metadata-build.json及archive-metadata-green.log；最终完整门禁和候选目录以m7-final为准。默认distribution及005d8d79源摘要只是修补前历史候选，不能发作最终交付。最终tar去掉copyfile/ACL/xattrs，pkg仍保持明确unsigned/native-pending状态；没有实际安装或签名。
