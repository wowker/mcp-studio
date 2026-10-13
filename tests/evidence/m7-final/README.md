# M7 最终候选证据

实现源：3056a6b0ab771149b39435f7f2535d2bcd0881bc；源摘要：21306836fe20aae846c0249fa7632bc891c4a762dce2d3bee3d2608c6781ff28。

verify.log实际exit0：591前端/57文件、20基础Node、12运维/分发、真实PG全量Go/vet/生产入口构建、4目标Agent及5候选归档、独立容器HTTPS/STARTTLS/权限/数据库恢复/未来迁移拒绝。浏览器26/26，零失败/跳过/重试。

Docker平台候选实际为linux/arm64，ID见manifest；Agent两OS/两Linux架构是构建目标而非原生支持。Mac pkg未签名，原生安装/库/签名/旧版仍待验。

候选归档：/Users/wuwei/code/github/mcp-studio/.runtime/m7-handoff-0abe66a449df5c4b/mcp-studio-m7-candidate.tar.gz；71591053 bytes；SHA-256 fb6c61b10f504cb71a9f6b4d0d8ad61c39117398d6e9ae04387a5b273d4000c2。
delivery-check.json实际检查41个文件，逐项hash/size与CHECKSUMS吻合、物理白名单/权限/镜像ID和无秘密environment。解压临时目录删除。

824张PNG、159次axe、0确认violation；2份color-contrast incomplete仍需人工。视觉、人工键盘/读屏未签收。

cleanup.json：test_/e2e_为0，自有M7容器/卷/网络为0，原合成PG容器保留。fixture-statistics只有计数/脱敏状态，trace/video/failure screenshots关闭。

m7-final-first是首轮门禁通过，随后归档内容失败；m7-final-interrupted是主动中止130，不能当通过；m7-delivery-first旧归档不可交付。真实RED/GREEN与不足的初次tar列表测试均保留m7-root。

当前源和最终交付tar禁用mac copyfile/ACL/xattrs，以物理头检查候选而不是BSD tar隐藏条目的列表。pkg内部._是明确的生成器元数据、原生待验。

开发门禁中止Go内层t.Cleanup自动回收暂递延，本次仅按已核对的一个具体schema ID清理；普通最终结束清理为0。T02/T32b/既有实机、人工、媒体待验不变。A01–A60全部正式待验，逐项版本/相关证据仅作索引；不发布、不推送、不tag、不签名。
