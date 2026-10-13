# M6 生产脱敏规则校验

实际实现的共享 recording-v1 向量从 19 增至 30，旧预期保持不变；M0 reference oracle 64 不变。修补原因与边界见 docs/decisions/010-default-redaction-parity.md。

red*.log / go-red-union.log 为新增回归在旧实现的真实失败（Go overlay 读取 HEAD 原代码，未回退共享工作区）；green-union.log / go-green-union.log、records-focused.log、typecheck.log 为保守并集修补后的实际结果。m0-semantics.log 证明独立 oracle 仍是 64。完整生产门禁由 m6-final 统一登记，不以此 focused 检查代替。
