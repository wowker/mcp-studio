# M6 最终生产入口证据

候选实现 `5a07743`，范围 T31–T33。完整 verify 的实际退出状态、计数及产物 hash 在完成后由 manifest.json 登记；本目录未完成的输出不代表通过。

复跑：在本机配置明确的 loopback、非超级用户测试 PostgreSQL URL 为 `MCP_STUDIO_TEST_DATABASE_URL`，设置 `PLAYWRIGHT_EVIDENCE_DIR=tests/evidence/m6-final` 后运行 `npm run verify`。该门禁实际执行合同/Node/TypeScript/全部前端测试及构建、隔离真实PG Go测试、vet、平台/Agent/受控helper构建，最后运行M1–M6全部生产浏览器用例；结束清理自己创建的schema、Agent、邮件、MCP/OAuth与临时TLS夹具。

矩阵：identity-management/configuration/records三份coverage记录正式37个领域子视图，每个20组合；初始化由第一条M1真实一次性入口另记录20组合，后续matrix已初始化所以不伪造第二Owner。布局测试额外保留参数/服务草稿、参数和表格滚动的语言主题切换检查。axe文件仅rule/impact/targets，不保存HTML、值或原URL；incomplete仍需人工确认。密码/code/token已填时PNG会withhold，而不是截图秘密。M1旧回归的PNG和M6矩阵PNG分别按文件名保留；不声称每个P有独立深链接。

continuous-journey.json记录真实sameRun/UID/PID/CID/history/saved IDs与邀请修复、刷新继续、显式重连恢复不执行的范围；真实上传503重传与Tool业务失败另有生产用例。恢复不是重新执行，重试上传不是重调用。

已观察过的失败追溯在其他m6目录：真实axe required-children、错误测试文案、connected配置禁止编辑、详情返回列表、刷新后需要显式重连、Run ID同时匹配option与p，以及语言切换后英文ARIA locator过时。m6-verify-first/second的完整门禁未通过，不能当作最终通过；中间重复PNG仅保留代表图，失败日志/JSON保留。m6-root的源码回归RED/GREEN与切片记录也保留。原先沙箱EPERM监听失败是环境失败，有解除限制后的完整实际结果。

T02完整支持矩阵、真实OS凭据库/人工配对/备份介质、仅键盘/读屏/人工视觉签收及正式A01–A60仍待验；真实受控helper不抵扣实机。仅Playwright Chromium，未补做Chrome/Edge/跨OS/公网HTTPS LNA测试。不进入M7。
