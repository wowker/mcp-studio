---
name: local-ui-polish
description: 渐进式前端视觉打磨工作流。在已跑通 unit/build 门禁的应用上做 1-3 个视觉点小步迭代。使用触发：UI 升级、视觉收敛、设计 token 微调、响应式断点、WCAG 对比度、组件密度调整。
---

# Local UI Polish

在已跑通 `typecheck + unit tests + build` 门禁的前端应用上做渐进式视觉收敛的工作流。每次 commit 只改 **1–3 个视觉点**，改完立刻跑门禁再继续。

## 触发条件

- 用户要求 "UI 升级 / 视觉打磨 / 设计收敛 / 响应式 / 对比度"
- 用户明确授权某个阶段（如 "第四轮"、"响应式断点"）后
- **不要**在用户未确认阶段编号时擅自推进

## 边界冻结

开始任何改动前，用 3 句话以内声明：

1. 本轮改哪些文件（范围）
2. 本轮改哪些视觉点（内容）
3. 本轮停止点（完成后停下等用户确认，不自动进入下一轮）

例如：

> 本轮只改 `redesign.css` 末尾集中媒体查询块。覆盖 Servers 表格横向滚动、工作台侧栏 1000px 收窄、弹窗 640px 全宽。完成后停下。

## 核心原则

### 1. CSS-only 优先，JSX 包裹谨慎

- 能只改 CSS 就不动 JSX。
- 需要独立视觉块时（如 auth 分组）才给 JSX 加 `<section>` 包裹，改完先跑 `typecheck` — DOM 结构变动会让已有 feature test 级联失败。
- JSX 改动后**先跑涉及的 feature test**（如 ConnectionPanel.test.tsx 31 个），再跑全量。

### 2. i18n key 先 grep 再新增

- 新增 key 前 grep 现有 key（尤其是 en-US 和 zh-CN 同时存在的 key），避免重复或语义冲突。
- 同一概念在两种语言下不要用完全相同的英文词（如 authSectionTitle="Authentication" 和 authMode="Authentication" 重复会让 `getByText("Authentication")` 找到多个元素）。
- 新增 key 必须 en-US + zh-CN 同步，不要只改一个语言。

### 3. 媒体查询集中追加，不打散点

- 不动已有散点 `@media`（经验：补丁式堆叠会出现断点不一致）。
- 在 `redesign.css` 末尾加**新的集中块**作为 override，标记清楚目标断点和覆盖区域。
- 断点设计参考：平板 1000px、手机 640px（单机版当前基线）。

### 4. CSS 变量做唯一可信来源

- 多断点不要给父子元素各维护一套像素值（容易冲突且维护翻倍）。
- 在 token 层定义语义值，各断点只覆盖 token。
- 当需要降低视觉权重时，优先改 token 或用 opacity 而非改 color。

### 5. WCAG 对比度从 token 层修

- 不要逐个元素 override color。
- 用 AxeBuilder 跑一轮，提取所有违规的 fg/bg 对：
  ```bash
  cat test-results/*/error-context.md | python3 -c "
  import sys, re
  md = sys.stdin.read()
  msgs = re.findall(r'contrast of ([\d.]+) \(foreground color: ([\da-fA-F#]+), background color: ([\da-fA-F#]+)', md)
  seen = set()
  for ratio, fg, bg in msgs:
      key = (fg, bg)
      if key not in seen:
          seen.add(key)
          print(f'fg={fg} bg={bg} ratio={ratio}')
  print(f'Total violations: {len(msgs)}, Unique pairs: {len(seen)}')
  "
  ```
- 64 个 color-contrast 违规如果全是同一个 token（如 `--ui-text-muted: #737d78` 在白底 4.25:1 < 4.5:1），直接把 token 调暗 5-8% 一次性解决。

### 6. 每轮三道门禁 + Playwright

每完成一个视觉点后，必须按顺序通过：

```bash
# 用 Node 24（Node 26 会让 jsdom 测试挂）
PATH=/Users/wuwei/.nvm/versions/node/v24.21.0/bin:$PATH \
  npm --prefix local run typecheck          # 1. 类型检查

PATH=/Users/wuwei/.nvm/versions/node/v24.21.0/bin:$PATH \
  npm --prefix local run test:release        # 2. 单元测试（105 files / 796 tests）

PATH=/Users/wuwei/.nvm/versions/node/v24.21.0/bin:$PATH \
  npm --prefix local run build               # 3. 构建

PATH=/Users/wuwei/.nvm/versions/node/v24.21.0/bin:$PATH \
  npm --prefix local run test:e2e            # 4. Playwright e2e（6 tests）
```

Playwright 首轮跑失败后，区分**两种根因**再决定修复策略：

| 失败类型 | 表现 | 修复 |
|----------|------|------|
| **设计裁剪遗留** | 测试断言了已删除的导航项或功能（如 Automated testing / Test suites） | 直接删断言 |
| **真 bug** | WCAG 违规、对比度、缺失样式、可访问性 | 修 CSS/token |

视觉快照过时（改了颜色 token 导致像素差异）直接 `npx playwright test --update-snapshots`，然后复跑确认稳定。

## 提交规范

每个 commit 只对应一个视觉主题，信息结构：

```
feat(local): 第 N 轮 UI — <摘要>

- <改动点 1>
- <改动点 2>
- <改动点 3>
- 门禁：typecheck ✅ unit ✅ e2e ✅ build ✅
```

## 常见坑

| 坑 | 原因 | 解决 |
|----|------|------|
| ConnectionPanel 27 测试级联失败 | JSX 结构变动后第一个挂的测试让后续依赖它的测试全挂 | 先跑 feature test，修复第一个 |
| Node 26 下 jsdom 测试全挂 | jsdom 与 Node 26 不兼容 | PATH 前置 Node 24 |
| foundation-style.test 找不到 CSS | 从根目录跑 vitest 会找不到文件 | 必须从 local/ 跑 |
| 单元测试 flaky（App.test.tsx lazy timeout 5s→15s） | Vite transform 链 + jsdom 超时 | timeout 从 5s 调到 15s |
| 改 token 导致视觉快照全过不了 | token 改了颜色 baseline 过时 | update-snapshots + 重新跑确认稳定 |
