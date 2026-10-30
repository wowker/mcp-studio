# 实际verify CLI中止检查

冻结源9ed9292，直接运行`node scripts/verify.mjs`；前置门禁按实际顺序执行，观察真实Go阶段已提交内部租期schema后发送SIGINT。result.json记录具体父/子名称、exit130、自动回收为0且manualDeletion=false；verify.log保留中止前实际输出。

probe.mjs保存实际运行的检查脚本副本（执行时位于/private/tmp，路径绑定本机工作区，DB仅由环境提供）。脚本只观察并发信号，不调用DROP；拒绝在已有test_/e2e_资源存在时启动，确保本次对象对应明确。

此执行有意中止，不代表完整verify通过；完整成功证据在v01-v02-final。未进入部署/浏览器阶段，不冒称全阶段强制中止、Windows/脱离组/SIGKILL/掉电清理验收。无业务数据或个人Agent状态参与。
