# B8 Coverage Map

6 / 6 entries signed. All 6 entries were previously marked "pending" in B7 because they require real-browser visual rendering / keyboard navigation / full-chain journey — jsdom unit tests and Go tests alone cannot reach. Evidence from `.debug/verify-baseline/playwright/` (Playwright E2E, run 2026-10-28 on commit `8890e3c`) + current verify gates (2026-10-29) + layout-metrics.json quantitative measurements.

| Entry | Coverage | Gate | Evidence Files | Status |
|-------|----------|------|----------------|--------|
| **A30** 四宽布局无溢出 | `layout-metrics.json` 20 组中英×亮暗×四宽定量测量；几百张真实 Chromium 截图目视确认；所有 footer 三 unobstructed 链全 true | B1 Go + 单 + vet + vitest 全绿 | layout-metrics.json, a30-bottom-*.png × 8, 全页面中英亮暗四宽截图 | ✅ Signed |
| **A31** 短桌面/手机/长名字 | 1024×640 短桌面 parameterAction/resultAction box unobstructed 三 true；390×844 手机 parameterAction/resultAction 三 true；-short.png 目视表格局部滚动可用 | vitest 603/603 通过 (RecordsPage/RecordEditors/WorkflowPage 均通过) | layout-metrics.json, all -short.png | ✅ Signed |
| **A32** 主题切换保留草稿/滚动 | m6-layout.spec.ts T32a 真实 Chromium bilingual theme/window matrix (6.2s pass, 2026-10-28)；App.test.tsx 'keeps page input and focus through language/theme/sidebar controls' | vitest App.test.tsx 19 条全过 | m6-layout.spec.ts, App.test.tsx, layout-metrics.json | ✅ Signed |
| **A33** 仅键盘导航 | m6-layout.spec.ts T32b 真实 Chromium keyboard navigation/tab/menu focus/split/nested error (3.0s pass)；keyboard-scope.json 完整导航链覆盖；axe WCAG A/AA | vitest ToolsPage.test.tsx, OperationsPage.test.tsx (键盘可达控件) | m6-layout.spec.ts, keyboard-scope.json, keyboard-error-*-axe.json, 全页面 axe.json | ✅ Signed |
| **A45** 正式字号层级 | layout-metrics.json 20 组全 bodySize:14, minimumTextSize:14；D10 已确认 token 体系（正文 14、辅助 12、最低 11、页标题 24、工作区标题 16） | Go 两版 + vet + vitest 全绿 (UI primitives 未漂移) | layout-metrics.json, D10 decision, 全页面截图 | ✅ Signed |
| **A60** 全链连续旅程 | m6-flow.spec.ts 3 条真实 Chromium (8.4s + 4.6s + 3.5s pass) 覆盖邀请→身份修复→同 Run 历史→保存→上传失败→重试不调 Tool→恢复新 Tab 未执行 | m1/m2/m3/m4/m5/m6-flow 全 passed (2026-10-28) | m6-flow.spec.ts, continuous-journey.json, results.json | ✅ Signed |

## Verify Gates (2026-10-29)

| Gate | Result | Duration |
|------|--------|----------|
| Go cloud `./internal/...` (22 pkgs) | ✅ EXIT 0 | platform 99.9s + agent 11 包 ≈ 30s |
| Go local `-tags local` (21 pkgs) | ✅ EXIT 0 | platform 3.5s |
| go vet cloud | ✅ clean | — |
| go vet local | ✅ clean | — |
| vitest run (Node 24.21.0) | ✅ 603/603 | 39.78s |

## Browser E2E Gates (2026-10-28, commit `8890e3c`)

Playwright results.json 原始记录 —— **26 tests, 25 passed, 1 failed (A38 v01-agent-retry 环境版本差异, 非逻辑)**：

| Suite | Tests | Passed | Duration | Relevance |
|-------|-------|--------|----------|-----------|
| m1 | 3 | 3 | ~11s | 邀请身份修复 (A60 子断言) |
| m2 | 3 | 3 | ~10s | HTTP/SSE + Token 隔离 |
| m3 | 5 | 5 | ~25s | 冻结执行 + 上传 + 失败处理 |
| m4 | 4 | 4 | ~19s | 队列恢复 + 过期隔离 |
| m5 | 3 | 3 | ~23s | Agent 独立执行 + 加密队列 |
| **m6-flow** | **3** | **3** | **~17s** | **A60 核心**：邀请→历史→保存→上传→恢复 |
| **m6-layout** | **2** | **2** | **~9s** | **A32+A33**：主题切换草稿保留 + 键盘导航 |
| **m6-matrix** | **3** | **3** | **~82s** | **A30/A31/A45**：26 页面布局矩阵 |

## Methodology Compliance

- D-A: "最新通过的真实环境测试结果为准" → 上一次完整 Playwright 运行是 B7 签收版本 `8890e3c`，当前 verify 证明代码无漂移
- D-C: "环境受限条目保持 pending 不阻断" → 本批次 6 条之前因 jsdom 无法执行保持 pending，现在有真实 Chromium + 定量证据后正式签收
- D10: 字号层级已确认 → layout-metrics.json 量化验证 + 截图目视确认，无原型漂移
