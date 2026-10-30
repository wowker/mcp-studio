# M0 共享语义向量 v1

`semantics-v1.json` 是64个仅含合成值的合同向量，hand-checked expected源于design-handoff 04/05、08和06的编号验收。字段来源保留在每个case。`contractVersion`变化必须由Go与JS解释器同时接受，并扩充对应回归。例子中的secret/token/email均为合成哨兵，禁止添加真实凭据。

执行：

```sh
node scripts/contract-semantics.mjs
go test ./internal/contracts
```

两端分别与同一literal expected比对。Go oracle只存在于`*_test.go`，JS文件也明确禁止引入应用路径。它们是M0有限演算，不是生产环境解析器、Schema校验器、脱敏实现、权限服务或Agent。正式实现阶段用真实模块运行同一向量，并补齐完整dialect、touched/编辑器、秘密来源、持久化、OS和网络测试。

JSON映射保持object key existence与null/0/false独立；数值向量限制安全整数/有限数。比较JSON结构，不比较对象键序；错误路径有序去重。摘要冲突用合成标签演算，不代表规范JSON摘要算法通过。状态结构Schema与Agent安全合同分别见`../schemas/`、`../agent/`，详细行为/验证边界见`../../docs/decisions/003-state-semantics.md`。
