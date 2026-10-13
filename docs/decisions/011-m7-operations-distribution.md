# 011 · M7 运维与候选分发边界

授权仅T34–T36，本次不发布。基线acf7197；T02/T32b及既有实机、人工、介质待验保持不变。参考设计快照只读。任务切片与审阅结论登记docs/tasks，部署/安装说明在docs/operations。

## 平台与秘密

同一前端/API生产入口，Caddy终止HTTPS；PostgreSQL18独立持久卷，业务角色mcp_studio_app为NOSUPERUSER/NOBYPASSRLS，不使用初始化管理员角色。仅TLS端口按明确绑定地址暴露，默认回环；平台/db无host ports，没有Redis。平台与TLS非root、只读、no-new-privileges；cap_drop ALL，Caddy仅加NET_BIND_SERVICE。真实无cap Caddy版本命令exit255、加单一cap后exit0；不是为通过测试改用root/privileged。

敏感配置可从显式_FILE文件读取，环境值与文件并存拒绝；超限、NUL、symlink/身份改变拒绝，错误无值/路径。Compose只存文件引用，不把密码/初始化凭证/key写入environment或镜像。Compose文件秘密是bind来源，不称为加密存储；本地provision生成0700私有目录与0444文件，让被明确挂载的非root进程读取，宿主目录访问权仍受限。私有目录和文件必须一起保管，不能把父目录改公开。个人平台备份key仅显式backup override配置，默认不配；SMTP认证密码为独立可选override，正式SMTP仍需STARTTLS。

依据：[Docker Compose秘密](https://docs.docker.com/reference/compose-file/services/#secrets)、[Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls)、[反向代理](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。官方基础镜像固定tag+实际核验摘要，不宣称别的架构/网络已运行。

## 离线恢复和key轮换

数据库归档仅应用schema，私有受管目录/0600文件，不含平台key；归档仍含身份/业务数据，须放在受保护/加密介质中，不能作为公开交付物。pg_dump custom archive使用流式数据和hash；restore验证manifest/hash、明确空目标、实际app schema为空，用TOC只移除唯一预建app schema的CREATE项。保留业务角色、不提升权限、不--clean现有内容，pg_restore单事务且exit-on-error；其他schema拒绝。

所有平台实例停止后才使用studio-admin显式--offline-confirmed轮换个人备份key；同一排他事务更新cipher/nonce，保留身份/AAD/用户version，错key或任一损坏记录整笔回滚。新key不写库、不显示；成功后由运维替换挂载key再启动。key丢失不重新生成伪称可解密；metadata/delete仍可用，灾难恢复需要对应数据库代际和独立保管的key。此功能不轮换Agent系统库key，不支持线上多实例无停机轮换。

受管归档按1–30天淘汰；完整、孤立metadata和无metadata残留dump均有处理路径，不因一个半组阻断其他合法过期项；不碰非受管名称/目录/symlink目标。异常项需运维处理，不能将非零清理报为合规。软件时钟回归不抵扣物理介质、异地副本、真实30天策略或断电验收。

依据：[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)、[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)。实际隔离HTTPS/STARTTLS/权限/新库恢复/未来迁移拒绝已通过；最终统一门禁与修补后的重新验证另记m7-final。

## Agent与交接

仅构建未签名候选：Darwin arm64需CGO1以链接真实库；Windows amd64/Linux amd64/arm64交叉构建。macOS pkg、Windows zip+PowerShell入口、Linux tar+CLI入口的支持状态均显式pending-native-validation。不从doctor初始化state/keychain，不自动注册daemon或批准配对。受管安装前缀按当前用户/state/摘要绑定，升级/卸载与实际运行共用锁，保留state/queue/vault/device。独立审阅发现binary/marker两文件更新中断窗口，已用保留旧快照、同步journal/完成标记和持锁恢复修补，并重建候选通过实际完整门禁；注入中断不等于真实掉电或Windows原生耐久性。

完整候选门禁必须包含operations测试、离线CLI构建、候选包构建/载荷/安装temp-prefix回归、真实容器部署恢复及原M1–M6全部门禁。不把旧verify单独当M7覆盖；不批量签收A01–A60。不推送、发布tag、注册域名或调用签名服务。
