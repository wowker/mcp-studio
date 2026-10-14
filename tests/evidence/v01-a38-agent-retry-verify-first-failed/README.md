# 首轮完整 verify 失败记录

源 b2bc47a，实际 exit1。基础 Node 中止回归 `abort waits for TERM-ignoring descendant after its parent exits first` 期望130但观察到undefined；32通过/1失败，其后门禁尚未执行。见[result](result.json)、[verify](verify.log)。

独立runtime4及同Node33临时诊断复核通过，原因未稳定复现；不宣称修复，不改原源码/断言/超时。新完整验证另在[最终目录](../v01-a38-agent-retry-final/README.md)，不覆盖此失败。
