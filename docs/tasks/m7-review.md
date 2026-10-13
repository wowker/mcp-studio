# M7 候选审阅与未验项

授权范围是T34–T36实现和可执行验证；不发布。M6基线acf7197；M7实现449c1f6，最终冻结源3056a6b。扩展完整verify实际exit0：591前端/57文件、20基础Node、12运维/分发、真实隔离PG Go全量/vet/生产platform+agent+admin构建、4目标Agent/5归档及非rootHTTPS/STARTTLS/权限/新库恢复/未来迁移拒绝烟测。浏览器26/26，0失败/跳过/重试。实际工具/构建hash见tests/evidence/m7-final/manifest.json，完整输出verify.log；无单测包只编译，未重跑race或依赖审计，不冒称通过。A01–A60逐项相关回归与剩余条件见m7-acceptance-index.json，正式状态均待验收。

## 独立审阅及最后一轮修复

新上下文审阅使用gpt-6-astra，仅读源，不执行测试。不把该审阅当实际验证。两项Important按实际影响确认，均进入一次修复：

- Agent替换binary后唯一marker写失败会失去可启动的旧版本。真实0400 marker RED复现；改为保留旧binary/marker快照、同步journal和提交/回滚完成标记，在安装锁及state锁内恢复。受控发布失败、升级/卸载中断、首次安装恢复、提交后清理回归GREEN；恢复启动要求重启。证据tests/evidence/m7-agent/review-original-marker-red.txt、review-transaction-red.txt、review-transaction-green.txt。
- 一个孤立metadata让淘汰抛ENOENT，阻断后续合法过期副本；无metadata旧dump未被清理。真实RED复现；按家族独立处理，孤立JSON继续清理，孤立旧dump按mtime淘汰，异常/symlink保留并报告，不能阻断其他合法过期文件。证据tests/evidence/m7-root/retention-orphan-red.log、retention-orphan-green.log、operations-review-green.log。

审阅Minor：没有单独递延项；审阅指出完整verify缺运维入口属于本阶段未完工作，已补入候选构建/真实安装烟测/容器烟测及admin构建。两项Important修复后完整套件由根任务执行，不请求重审。T36白名单交付工具由根任务自检，含逃逸/符号链接/覆盖/摘要篡改回归；不冒称其经过独立审阅。

T36实际归档验证发现原Mac tar带AppleDouble，BSD tar列表又隐藏这些物理条目，初轮Node列表检查不能证明物理白名单。交付和三个Agent tar均明确禁用mac copyfile/ACL/xattrs，增加实际xattr夹具和物理TAR头校验；真实RED→GREEN。第一份归档及首轮门禁保存在m7-delivery-first/m7-final-first，不能作最终交付；中间轮因修补同问题主动SIGINT（exit130），保存在m7-final-interrupted。最终source另行冻结及全门禁重跑，不把中止计为通过。

Final: minor (deferred): 开发verify主动中止go test时，外层schema清理但内部t.Cleanup可能未执行，留一个合成schema；本次核对owner并只删除具体ID，证据m7-final-interrupted/recovery-cleanup.json。正常完整门禁结束会检查全部test_/e2e_为0。递延信号中止嵌套Go测试的自动回收优化；影响限开发夹具残留，非产品数据删除/恢复能力。后续中止须只按已确认的本次ID清理，不能做前缀批量删除。

## Rulings I made / 未判断事项逐项裁定

下列是审阅拒绝判断或范围冲突的裁定，不是签收。

1. Ruling: 审阅未执行任何命令 — 以根任务和T35实际RED/GREEN及最终完整门禁补足，源审阅不能证明运行行为 — 判断失误会把静态可读误作运行成功。
2. Ruling: 修复后hash/最终门禁尚未生成 — 冻结实现提交后重建四目标候选和平台镜像、运行全部门禁，再登记摘要 — 失误会交付不同于验证版本的binary。
3. Ruling: T36证据/操作说明/正式签收未完成 — 交付60项索引和候选包，但全部正式状态保持待验，T36a不勾选 — 失误会形成未经联验的验收承诺。
4. Ruling: macOS pkg清洁安装、Developer ID、公证、Keychain与卸载 — 只有本机构建/诊断/私有临时前缀烟测及未签名pkg检查；原生条件待验 — 失误可能导致Gatekeeper阻止启动或真实凭据不可用。
5. Ruling: Windows MSI、PowerShell、ACL、Credential Manager和原生升级 — 仅交叉构建zip候选，缺环境，不宣称MSI/安装/支持 — 失误可能导致安装失败或权限不安全。
6. Ruling: Linux清洁安装/Secret Service — 仅两架构CLI交叉构建，依赖用户会话及secret-tool；原生待验 — 失误可能导致库不可用或状态权限不符。
7. Ruling: 真实旧版本升级、格式迁移与兼容回退 — 当前同格式替换和受控中断回归，不能替代历史发行版矩阵；不自动down迁移 — 失误可能使旧版误读队列/库。
8. Ruling: 真实DNS/可信证书/SMTP供应商/目标网络 — 本地独立容器、临时显式信任CA与真实受控STARTTLS有证据；目标环境仍待验 — 失误可能使正式登录/邮件/连接不可用。
9. Ruling: T02目标Chrome/Edge、本地网络权限/公网HTTPS与T32b人工键盘/读屏 — 保留原未勾选；受控Chromium/axe不扩大支持 — 失误会向不兼容环境承诺可用或可访问。
10. Ruling: 原生人工配对/解除/跨OS多用户 — 受控确认和真实生产API解除有回归，终端/多用户/OS库仍待验 — 失误可能让真实设备无法授权或解除。
11. Ruling: 真掉电、异地/物理介质、30d淘汰与密钥托管灾难恢复 — 文件操作中断/数据库合成恢复只是软件证据，全部真实介质条件待验 — 失误可能丢数据或保留超期副本。
12. Ruling: 在线多实例key轮换 — 本次只实现所有平台实例停止后的离线事务；无在线能力声明，不扩展范围 — 未遵守停止条件会使旧实例无法解密新代际。
13. Ruling: 发布准备与支持版本承诺 — 产物固定候选/未签名/待验状态，本次无推送、tag、签名、注册表发布或正式部署 — 失误会把审阅候选变成未经授权发行。

## 工作包状态与交付限制

T34a：同站点HTTPS、非root入口、独立PG角色、秘密文件/可选备份key/SMTP配置、初始化和权限烟测已实现；正式部署环境待验。T34b：离线轮换事务、坏key/损坏回滚、custom备份空目标单事务恢复、未来迁移拒绝、1–30d软件淘汰已实现；真实介质/异地演练待验。

T35a：四目标生产binary、Mac unsigned pkg、Windows zip候选、Linux CLI、hash与离线诊断；三OS原生安装/签名/支持仍待验。T35b：停止后锁保护升级、可恢复事务、状态/queue/vault保留及解除后旧channel/grant拒绝新Run；真实历史发行版/原生连续旅程待验。

T36a：运行新工程完整verify并保留实际失败及修复证据；正式A01–A60联验未完成。T36b：候选平台镜像、Agent归档、合同/5条编号迁移、恢复说明、摘要及逐项证据索引按白名单交付；正式设计签收未完成。全部6个M7叶子按完整完成标准保持未勾选，实际可执行门禁/登记可单独签收。T02、T32b、T25b、T28a、T29b及C01/C09/C10/C11原待验不变。

软件失败记录（不得抵扣通过）：初始sandbox module cache EPERM，轮换owner_id列修补，Docker候选tag/init脚本权限/Caddy执行能力，测试客户端漏CSRF，恢复TOC重复CREATE SCHEMA；失败目录保留，最后实际成功只认最终exit0。正式平台安全检查、非超级角色及CSRF没有降低。

无真实生产秘密、OS凭据读取或现有用户安装修改；夹具只操作本次独立loopback容器/临时目录，新库与schema清理。候选归档不包括helper、秘密、state或数据库备份。SHA-256是完整性检查，不是签名。
