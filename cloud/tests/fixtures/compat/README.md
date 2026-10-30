# M0 隔离兼容实验

任务 T02a/T02b 的可重现测试夹具，不是产品 Agent、MCP SDK 或业务源码。仅绑定 `127.0.0.1` 动态端口；内存中的配对与 MCP 会话随进程退出清除。测试用户、设备、能力固定为非真实身份。

从仓库根目录执行（需要 Node、OpenSSL、Playwright 1.59.1 与已安装 Chrome）：

```sh
node --test tests/fixtures/compat/security.test.mjs tests/fixtures/compat/local-confirmation.test.mjs
node tests/fixtures/compat/browser.mjs
```

浏览器命令生成 `tests/evidence/m0-compat/browser-green.json` 和无敏感信息截图。`COMPAT_CHROME` 可以指定目标 Chrome/Edge 可执行文件；`COMPAT_REPORT` 可以指定各版本的独立报告。各目标版本必须分别实跑，不以修改报告名字代替验证。当前 runner 的 OS 信息读取采用 macOS `sw_vers`；Windows/Linux 实验需要适配读取 OS 信息后实跑，不能直接签为通过。

HTTPS 宿主与 HTTPS 上游证书通过 OpenSSL 在临时目录生成、退出时删除；Playwright context 只设置 `ignoreHTTPSErrors: true` 接受测试自签证书。没有禁用浏览器安全、CORS、混合内容或 LNA。唯一启动参数把受控 `mcp-fixture.test` 解析到回环，用于重现普通 HTTP hostname 的混合内容阻断；这不是实际公网 HTTP 服务。JSON 报告包括真实浏览器错误与服务端仅含固定路由名的方法记录。

本机确认终端可单独启动：

```sh
COMPAT_ORIGIN=https://your-workbench.example node tests/fixtures/compat/local-confirmation.mjs
```

这只是实验 UI：`show` 展示准确 Origin、测试用户、测试设备和能力；随后 `confirm <requestId>` 是本机明确确认，短期一次性配对码只显示在本人本地界面；`unpair` 撤销会话。不要把该交互终端重定向到日志。远程 HTTP 只有启动/完成配对接口，没有“批准”接口。自动化测试以子进程 stdin 模拟本机操作，配对码留在测试内存，TAP 和 JSON 不包含秘密；它不证明用户已接受原生确认弹窗。

必须结合 `docs/decisions/002-compatibility.md` 的限制判断结果。公网 HTTPS 工作台到回环的 LNA allow/deny、目标最近两个稳定 Chrome/Edge、Windows/Linux 和原生确认仍待实机验收；不能拿本机 HTTPS 的成功替代。
