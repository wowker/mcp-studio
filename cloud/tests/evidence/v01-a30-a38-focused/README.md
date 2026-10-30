# A30 / A38 聚焦验证

最终完整门禁另见[final](../v01-a30-a38-final/README.md)。

- layout/footer-unit-red.log：真实Shell组件未渲染设计底栏，实际产品RED。
- layout/browser-red.log、results-footer-red.json：生产入口/真实PG/实际Browser MCP后底栏count0，实际产品RED；非fixture伪造。
- layout/footer-unit-green.log：现有Shell3项＋新隐私/上下文回归1项，共两文件4项通过。typecheck/build通过。
- layout/browser-after-footer.log：初版修补后的20格1旅程通过；browser-green.log/results.json为加入8截图与两负向oracle后的最终1旅程通过。不要相加凑旅程数量。
- layout/required-pane-footer-metrics.json：20格10必要selector非零/底栏完整/操作可达，零高和越界CSS探针正确拒绝后恢复；探针非产品缺陷。
- layout/e2e-typecheck-first-error.log：根最初选NodeNext要求扩展名，仓库现有E2E为Bundler解析；仅命令配置错误，后续e2e-typecheck.log/final通过。未修改源码扩展名或弱化strict。
- pin-api/go-first-compile.log：初次测试将string赋wire.ProjectRole的编译错误，修正fixture类型后再执行；非产品RED。
- pin-api/go.log：整个真实PG platform包通过；新TestV01A38DeveloperDirectPinAndUnpinDeniedWithoutMutation含本人/他人历史，两pin与两unpin实际403，无副作用，维护者正向成功。已有生产行为GREEN，无权限修补。

本机受控Chromium、fixture用户及临时PG，测试MasterStore/本机确认不作真实OS证据；无真实个人状态/秘密进入证据。A30人工视觉/目标浏览器、T02/T32b/实机/介质及正式A保持待验，本次不发布。
