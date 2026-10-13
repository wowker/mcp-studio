# 候选平台部署与恢复

本次只有本地隔离候选；不是部署许可或生产支持承诺。实际架构/环境和待验表见docs/tasks/m7-review.md。先准备精确HTTPS Origin、匹配证书/key、真实STARTTLS邮件服务和独立PG18环境。旧工程库/SQLite不可复用。

完整候选位置与SHA-256见tests/evidence/m7-final/delivery.json。核对可信来源提供的摘要后解压，在候选根目录核对CHECKSUMS.sha256。platform-image.tar.gz为本次本机架构的实际镜像，可在同架构本地使用`gzip -dc platform-image.tar.gz | docker load`；它没有注册表发布或多架构支持声明。需正式目标环境授权后才能启动。组合使用已载入的mcp-studio-platform:m7-candidate并指定`up --no-build`；包内Dockerfile只是对应构建说明，如要重新build需完整仓库源码、锁依赖及重新运行verify，不要把交付子集当完整源码树。脚本需要Node24；候选Agent运行无需Node。签收文件/证据/问题清单在docs/tasks，正式验收仍待验。

## 配置与启动

`deploy/compose.json` 是容器组合入口；运行目录为本仓库。固定官方镜像摘要；平台/HTTPS非root，数据库业务账号独立。默认只发布127.0.0.1的TLS端口，db/platform不发布；真实内部网络地址需运维明确配置STUDIO_BIND_ADDRESS。无自动ACME申请、域名变更、邮件身份伪造或Redis要求。

以私有外部目录存admin_db_password、app_db_password（64个小写hex）、database_url、init_credential、tls_cert、tls_key。app数据库URL必须指向新mcp_studio库和app search_path；初始化使用唯一强凭证，首次Owner成功后入口关闭。文件来源秘密需要目录0700、文件0444供非root挂载读取，目录不可对其他宿主用户开放。使用已有的保密管理器时遵守其授权与挂载权限，不复制生产秘密到仓库。

测试与示例初始化函数为scripts/operations.mjs的provision：调用者提供已匹配/有效的证书和精确Origin、SMTP host:port/from；函数拒绝覆盖既有目录，随机生成测试/新环境密码与初始化凭证，不打印其值。配置不等于实际邮件服务已验；正式SMTP仍需另验收认证、证书、投递和供应商。

设置STUDIO_SECRETS_DIR（绝对路径）、STUDIO_ORIGIN、STUDIO_HTTPS_PORT、STUDIO_SMTP_ADDRESS、STUDIO_SMTP_FROM；可选STUDIO_SMTP_USERNAME。环境中只放非秘密配置。构建：`docker compose -f deploy/compose.json build platform`；启动必须另行按实际环境授权。个人备份默认无key；只有明确启用时附加deploy/backup.compose.json并提供独立backup_key。SMTP AUTH附加deploy/smtp-auth.compose.json，独立smtp_password文件。不得使用MCP_STUDIO_ALLOW_INSECURE_LOOPBACK给生产容器放宽TLS/邮件。

健康：TLS入口/api/v1/health检查DB；/api/v1/bootstrap表明初始化与邮件配置，mailConfigured不保证投递成功。安全烟测须验证初始化关闭、Secure/HttpOnly Cookie、CSRF/Origin、当前对象权限和DB角色。初始化脚本执行失败应停止，不临时改用管理员业务连接。

## 备份与恢复

停止所有平台实例，记录构建/迁移版本、密钥代际和独立密钥保管位置。用应用连接获取custom pg_dump，仅app schema；生成归档目录是0700、dump/manifest为0600。归档有hash，不含平台key，但包含身份/业务数据；保护其介质、访问和运输，不公开发送，不把hash当签名或来源认证。

接口：`node scripts/operations.mjs backup PRIVATE_CONFIGURATION_DIRECTORY COMPOSE_PROJECT PRIVATE_BACKUP_DIRECTORY`。配置目录包含configuration.json及上述文件引用，目录必须与当前工程和compose项目一致。compose项目只操作明确指定的独立实例。

恢复必须新PG数据库/预建空app schema、原独立业务角色，并停止所有平台实例：`node scripts/operations.mjs restore PRIVATE_CONFIGURATION_DIRECTORY COMPOSE_PROJECT ARCHIVE_DUMP --empty-target-confirmed`。工具验证hash、唯一app schema TOC和实际空目标，保留预建schema、用非超级用户单事务恢复；不清理/覆盖非空目标。坏归档/不符hash/future迁移/旧checksum应停止。恢复完成启动相同/更高兼容版本，验证身份、项目、对象权限、记录/receipt、初始化关闭及对应key恢复能力。备份数据/密钥必须同代际；恢复不会自动重新执行Tool。

## 平台个人备份key轮换与丢失

只做所有实例停止后的离线轮换，不是无停机更新。保管旧key和轮换前数据库归档；以秘密文件提供新的32字节base64 key。容器中的/app/studio-admin命令为`rotate-backup-key --old-key-file OLD_FILE --new-key-file NEW_FILE --offline-confirmed`，数据库连接仍用MCP_STUDIO_DATABASE_URL_FILE。运行环境须明确挂载新旧文件，不把key值放参数。命令成功只报告记录数，所有cipher变化同一事务；成功后原子替换部署key，再启动并验证本人重认证恢复。保留旧代际key与旧数据库归档的对应关系，按统一介质政策淘汰。

失败返回非零，不换挂载key、不否定旧可恢复备份；修补损坏记录或从对应代际恢复后再操作。全部key丢失时已有cipher不可恢复，metadata/删除仍可用；启用新代际只针对新的明确备份，不把生成新key叫找回。Agent OS key/本地queue另有独立生命周期，不能拿平台key替代。

## 淘汰、升级与回退

`node scripts/operations.mjs purge PRIVATE_BACKUP_DIRECTORY 30`：1–30天参数，只有受管归档目录/名称可删；孤立metadata、无metadata旧dump均可继续处理。异常/symlink不删，返回非零需调查，不能宣称介质合规。运维至少每日运行并核对失败、时钟、离线/异地副本及真实备份介质，仓库不自动创建定时任务。软件测试不足以证明物理介质30天周期。

升级先保留数据库+对应key和当前镜像ID；同版本重启校验编号迁移，历史checksum不变，未来版本数据库拒绝旧binary。没有自动down迁移。仅在备份与binary匹配、所有实例停止和业务影响明确时恢复兼容代际；不能让新binary写过的库直接用旧binary猜测回退。部署架构、真实供应商、密钥 custody/轮换/丢失演练、目标网络与介质仍需后续实际联验。
