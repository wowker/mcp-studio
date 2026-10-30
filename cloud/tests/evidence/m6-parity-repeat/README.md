# 脱敏修补后的实际来源保存复跑

实现 fc0b161，新生产前端与平台 / Agent / helper 均重建。原60s门槛、无自动重试，M5 browser从Agent真实HTTP Run保存独立副本且继续执行真实stdio的生产旅程重复15次：15 passed，exit0。每次实际保存POST必须200且通过严格receipt schema；独立ID、同sourceRun、executor与上传责任及实际Tool调用计数均继续断言。

第一次重建后的复跑11通过/4超时（最长超过15分钟）保留m6-parity-repeat-first，不作为通过；没有invalid_source诊断文件，但不冒称超时根因已经证明。清理夹具后本次15次实际完整通过，不调高超时、不改产品逻辑。完整verify另见m6-final。
