---
name: acceptance-batch-executor
description: MCP Studio A01–A60 分批验收执行器，覆盖盘点、门禁、单机回环、签收文件、提交推送、CSV 与 progress 登记全流程。触发词：验收、批次、签收、acceptance、B1 B2 B3。
---

# Acceptance Batch Executor

在 MCP Studio 仓库中按批次（B1 / B2 / ... / Bn）执行 A01–A60 正式验收。每批次走完六个阶段才进入下一批；不要提前签收尚未验证的条目。

## 何时调用

用户说"验收"、"签收"、"acceptance batch"、"B1/B2/B3..."或明确要求执行某批 A01–A60 条目时调用。

## 前置条件

执行任何阶段前先确认：

- Go 1.25.x 可用
- Node 24.21.0 可用（**必须**；Node 25+ 的 jsdom 跳过 localStorage，会让 vitest 大面积假红）
  ```bash
  export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
  node -v   # 期望 v24.21.0
  ```
- Docker PG 容器运行：`mcp-studio-m1-pg`
  ```bash
  psql "postgres://mcp_studio_app:isolated-app-test-only@127.0.0.1:55432/mcp_studio_test" -c "SELECT 1"
  ```
- 工作区有既有非验收改动（约 80 项）——**按 AGENTS.md 保留不提交**，验收提交只用 `git add <具体路径>`

## 阶段 1 · 盘点

1. 读 `tests/evidence/acceptance-bX/expectations.json`，拿批次条目、形态（云版 / 单机版 / 两版）、前置条件。
2. 盘点现有覆盖：
   - `internal/**/*_test.go` 搜批次条目关键词，记录函数名和 build tag（`!local` 云版专属 vs 无 tag 两版共用）
   - `frontend/tests/**/*` 搜对应组件 / hook
   - 架构分区速查（每次都要核对）：
     - 云版专属（`!local`）：`agent_auth_test.go`、`credentials_test.go`
     - 两版共用：`configuration/validate_test.go`、`agent/process/process_test.go`、`records/record_lifecycle_test.go`
     - 单机版 `auth_local.go`：`projectRole` 恒 `(owner, maintainer)`、`csrfOk` 恒 true，但**按项目归属过滤仍生效**（R3 / R4）
3. 判断 E 系列（expectations 条目）是否被现有测试触及：
   - **触及充分** → 不补代码，直接进阶段 2
   - **缺失覆盖** → 在 `internal/platform/` 新建 `bX_*_assertions_test.go` 补 Go 断言，先让门禁红起来

## 阶段 2 · 门禁（4 道门必须全绿）

```bash
# 先设 DB URL（platform 包约 70 个测试强依赖；忘设会报 "MCP_STUDIO_TEST_DATABASE_URL required"）
export MCP_STUDIO_TEST_DATABASE_URL="postgres://mcp_studio_app:isolated-app-test-only@127.0.0.1:55432/mcp_studio_test"

# 门 1：云版 Go 测试（agent 11 包 + platform 包；platform 约 97–100s）
go test -count=1 ./internal/... 2>&1 | tee tests/evidence/acceptance-bX/go-cloud-platform.log

# 门 2：单机版 Go 测试（-tags local 会跳过所有 !local 的云版专属测试）
go test -count=1 -tags local ./internal/... 2>&1 | tee tests/evidence/acceptance-bX/go-local-platform.log

# 门 3：go vet（两版各跑一次）
go vet ./internal/... && go vet -tags local ./internal/...

# 门 4：前端 runtime 测试（用上面导出的 Node 24 路径）
cd apps/web && npx vitest run 2>&1 | tee ../../tests/evidence/acceptance-bX/frontend-bX.log
cd ../..
```

任一门禁非 0 退出 → 停下修复，不进入后续阶段。

## 浏览器证据验收策略（阶段 1.5，门禁后专项条目前置）

当批次含 **jsdom 无法触及的条目**（视觉布局 / 键盘导航 / 全链旅程 / 字号层级）时，执行以下策略之一：

### 策略 A — 定量证据（首选，无需启动基础设施）

`.debug/verify-baseline/playwright/layout-metrics.json` 包含 20 组真实 Chromium 测量（中英 × 亮暗 × 390/820/1024/1440）。检查：

- **pageOverflow: false** — 无整页横溢出（A30）
- **footer.unobstructed: [true,true,true]** — 底栏三维无遮挡链（A30）
- **parameterAction/resultAction box bounds** — 在 `.tools-workspace` bounds 内（A31）
- **bodySize: 14, minimumTextSize: 14** — 字号正确（A45）

配合 `.debug/verify-baseline/playwright/a30-bottom-*.png × 8`、`*-short.png`、几百张中英亮暗四宽截图目视确认。

### 策略 B — 最近 Playwright E2E + 代码无漂移

当 Playwright 基础设施未启动（`PLAYWRIGHT_BASE_URL` 未设，导致所有测试秒失败 "Cannot navigate to invalid URL"），按方法论 D-A "最新通过的真实环境测试结果为准"：

1. 查 `.debug/verify-baseline/playwright/results.json`，确认最近一次完整 Playwright 运行的日期和 commit
2. 该 commit 必须在当前 HEAD 祖先链上（代码未漂移）
3. 4 道门必须全绿（进一步确认无漂移）
4. 引用具体通过的测试条目，如：
   - `m6-layout.spec.ts:27 T32b keyboard navigation — PASS 3.0s`
   - `m6-flow.spec.ts:13 T33 invitation/history/saved copy — PASS 8.4s`
5. 配合 `continuous-journey.json`、`keyboard-scope.json` 等专项 JSON 做连续旅程 / 键盘导航链的断言补充

### 策略 C — 直接启动 Playwright（基础设施就绪时）

```bash
export PLAYWRIGHT_BASE_URL="http://localhost:3000"   # 或实际地址
export MCP_STUDIO_TEST_DATABASE_URL="..."
npx playwright test tests/e2e/m6-flow.spec.ts tests/e2e/m6-layout.spec.ts tests/e2e/m6-matrix.spec.ts
```

## 阶段 3 · 单机版回环脚本（仅当批次含单机版条目时）

启动 `.runtime/local-platform`（`go build -tags local` + 内嵌 PG）→ 回环 HTTP 断言 → 留证 JSON。执行时必须遵守三条硬约束（全部踩过坑）：

1. **etag 只走 `If-Match` header**，不要放进 body。后端 `configuration.go:88-91` 只读 header，body 里传 etag 返回 428 `if_match_required`。
   ```
   // 正确
   headers: { 'If-Match': etag }
   body:    { /* 不含 etag 字段 */ }
   
   // 错误 → 428
   body: { etag: etag, ... }
   ```
2. **`authMode: 'none'`**。单机版无 OAuth / Agent 后端，传其他值返回 400 `invalid_auth_mode`。
3. **endpoint 必须含 `{{VAR}}` 引用**才能让 session-access 阻断链完整走通。`{{ABSENT}}` 变量只有在 endpoint 引用它时才会被判定为缺失。
   ```
   // 能走通阻断链
   endpoint: 'http://localhost:9123/{{HOST}}'
   
   // 不会触发变量解析 → session-access 直接 200
   endpoint: 'http://localhost:9123/mcp'
   ```

结果写入 `tests/evidence/acceptance-bX/local-edition.json`。

## 阶段 4 · 签收文件

在 `tests/evidence/acceptance-bX/` 下生成四份：

- `expectations.json` — 批次条目 + 形态 + 前置条件（阶段 1 已读，此时复制到证据目录）
- `coverage-map.md` — 逐条列出每个条目被哪个 Go / 前端 / 脚本文件覆盖
- `review.md` — 审阅分级：`Critical`（阻断签收）/ `Important`（批次内修）/ `Minor`（记录但不阻断）
- `manifest.json` — 门禁 JSON 摘要 + 每个条目的代码绑定（git commit / 测试函数名）

## 阶段 5 · 提交推送

如果阶段 1 补了 Go 断言，**先代码后签收**，两个独立 commit：

```bash
# 代码 commit
git add internal/platform/bX_*_assertions_test.go
git commit -m "test(acceptance): BX <简述> — <N> assertions"

# 签收 commit（只有验收相关路径）
git add tests/evidence/acceptance-bX/ \
        docs/tasks/acceptance-schedule.csv \
        docs/tasks/progress.md
git commit -m "docs(acceptance): BX signoff — <N>/<N> signed, <N> pending"

# push 前必须 fetch + 核验远端 ref（之前多次误推过期 ref）
git fetch origin main
git branch -vv          # 确认当前分支 tracking origin/main 且 commit 一致
git push origin HEAD:main
```

**禁止 `git add -A`** — 工作区约 80 项既有非验收改动按 AGENTS.md 保留。

## 阶段 6 · CSV + progress.md 登记

```bash
# acceptance-schedule.csv 第 7 列（status）改为 signed / pending
python3 -c "
import csv, sys
rows = list(csv.reader(open('docs/tasks/acceptance-schedule.csv')))
for r in rows:
    if r[0].startswith('A'):
        r[6] = 'signed' if <本次签收条件> else 'pending'
csv.writer(open('docs/tasks/acceptance-schedule.csv','w')).writerows(rows)
"

# progress.md 追加批次出口节
echo "
## BX 出口（YYYY-MM-DD）
- 修改：<列出新增 / 修改的文件>
- 验证：<4 道门的 hash 和 PASS/FAIL>
- 限制：<保持 pending 的条目及原因>
- 签收：<N>/<N> 条目签收
- 下一批：<B_{X+1} 范围预览>
" >> docs/tasks/progress.md
```

## 终端收口批次模式（B8 示范）

当多批次累积后剩下的都是 jsdom 无法触及的条目时，可以发起一个 **special-terminal** 批次一次性收尾：

1. 盘点前几批次的 pending 条目（如 B7 的 6 条）
2. 跑 4 道门确认当前代码无漂移
3. 执行"浏览器证据验收策略"（策略 A 定量 + 策略 B 最近 E2E + 策略 C 基础设施）
4. 不补代码（所有待验条目是能力边界而非缺失覆盖）
5. manifest.json 的 `batchType` 标为 `"special-terminal"`
6. 总 tally 写在 manifest + progress.md 末尾

## 单端 OS 环境深挖批次模式（B9 示范）

当 A01–A60 主批次全部签收后，对**跨 OS / 硬件 / 发布流程类环境受限子项**在当前机器上尽可能深挖：

1. **盘点范围**：找出 progress.md 末尾反复标记的 pending 条目（T02 矩阵跨 OS 子项、T25/T28 三 OS Agent 凭据、T29b 备份介质、T34a 云版部署、T35a 安装包、签名公证）
2. **当前 OS 可做判定**：
   - macOS：system_darwin.go (`darwin && cgo`) → Keychain；Homebrew PG 18 + 内嵌 PG 首启 + pthread shim
   - Windows：system_windows.go (`windows`) → DPAPI（需实机）
   - Linux：system_linux.go (`linux`) → filesystem backend（需实机）
3. **实机启动单机版**（下面"单机版启动实机流程"节）
4. **编译可达性验证**：`CGO_ENABLED=1 go build -tags local ./internal/agent/vault/`
5. **签收状态用 `signed-macos` / `signed-windows` / `signed-linux`** 而非完全 signed，限定在当前 OS 范围
6. manifest.json 的 `batchType` 标为 `"single-os-macos"` / `"single-os-windows"` 等
7. 跨 OS 代码已就绪（build tag 条件满足）→ 保留 pending，注明"代码已就绪，缺实机验证"

## 单机版启动实机流程

### 前置条件

| 资源 | 位置 | 说明 |
|------|------|------|
| 单机版 binary | `.runtime/local-platform` | 上次 `go build -tags local` 产物 |
| PG binary (Homebrew) | `.runtime/pg-brew/postgresql@18/18.6_1/bin/` | `initdb`, `postgres`, `pg_ctl`, `pg_config` |
| PG binary (embedded) | `.runtime/pg-cache/darwin/arm64/pgsql/bin/` | 打包候选，至少要有 initdb + postgres |
| pthread shim | `.runtime/pg_no_multithread_check.dylib` | macOS 26 interpose `pthread_is_threaded_np()` |
| 数据目录 | `~/Library/Application Support/MCP Studio/` | initdb 会创建；已有 PG_VERSION 则跳过 |
| HTTP 端口 | 8080（默认） | 不是 9123；单机版硬编码 `127.0.0.1:8080` |
| Unix socket | `<dataDir>/.s.PGSQL.16432` | pgx 连 PG 的方式（不走 TCP） |

### 启动命令（macOS 专用）

```bash
export PATH="$PWD/.runtime/pg-brew/postgresql@18/18.6_1/bin:$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"
# macOS 禁止 shell 子进程 SIGHUP 杀：用 subshell 或 Node.js child_process 彻底脱离
( .runtime/local-platform > logs.log 2>&1 & )
sleep 10
curl -s http://127.0.0.1:8080/api/v1/health
# 期望: {"data":{"status":"ok","version":"0.1.0"}}
```

### macOS shell SIGHUP 陷阱

macOS backgrounded shell 子进程在父 shell 退出时会收到 SIGHUP 被杀。**不是 Go 代码 bug**（生产 launchd 服务不受此影响）。规避方案：
- 用 `( binary & )` subshell 或 Node.js `child_process.spawn + detached:true + unref()`
- 不要用 `nohup`（zsh 下有时不完全脱离）
- 看到本地 port 8080 LISTEN 确认存活

### 完整 HTTP 回环

```
GET  /api/v1/bootstrap          → {initialized: false/true}
POST /api/v1/initialize         → {ok: true}  （首次启动 bootstrap）
POST /api/v1/login              → Set-Cookie session=...
GET  /api/v1/auth/current       → {user: {...}, team: {...}, role: "owner"}
GET  /api/v1/projects          → [...]
GET  /api/v1/connections        → [...]
GET  /api/v1/configuration      → {...}
GET  /api/v1/records            → [...]
GET  /api/v1/agent/health       → {...}
GET  /api/v1/agent/platforms    → [...]
```

Node.js 完整脚本模板在 `.debug/local-loopback.js`。

### 关键代码路径（实机验证可达）

| 路径 | 说明 |
|------|------|
| `platform/entry_local.go RunLocal()` | 单机版启动入口 |
| `platform/local_pg.go ensureInitdb()` | 空目录 initdb；有 PG_VERSION 跳过；有非点文件拒绝 |
| `platform/local_pg.go startCluster()` | startPG → waitPGReady (pgx Unix socket)，失败自动重试 5 分钟 |
| `platform/local_pg.go waitPGReady()` | pgx 连 Unix socket（不依赖 pg_isready binary）|
| `platform/local_subject.go ensureLocalSubject()` | bootstrap → owner user + team + personal project |
| `platform/auth_local.go` | projectRole 恒 owner/maintainer；csrfOk 恒 true；项目归属过滤仍生效 |
| `agent/vault/system_darwin.go` | macOS Keychain (build tag: `darwin && cgo`) |
| `agent/vault/system_windows.go` | Windows DPAPI (build tag: `windows`) |
| `agent/vault/system_linux.go` | Linux filesystem (build tag: `linux`) |
| `agent/vault/system_unavailable.go` | 回退 `(!darwin && !windows && !linux) \|\| (darwin && !cgo)` |

## 待验条目保留策略

以下类型保持 `pending` 不阻断同批其他条目（**但** 若后续有足够证据链可升级签收，如 B7 → B8）：

- 需真实浏览器视觉渲染 / 键盘导航（A30 / A31 / A32 / A33 / A45）—— 定量 evidence + 最近 Playwright 可升级
- 全链登录 → 邀请 → 保存 → 恢复（仅云版 A60）—— m6-flow E2E 可升级
- 单机 OS 凭据库缺当前执行环境（A41 / A42 已在 B7 升级为签收：Go handler 功能正确验收不受具体 OS 凭据库影响）
- T02 矩阵、T32b 人工、签名 / 公证、三 OS 首启等——这些在 A01–A60 范围外，保持 pending

记录在 `docs/tasks/acceptance-schedule.csv` 第 7 列和 `tests/evidence/acceptance-bX/review.md`。

## Deep-dive 批次模式（B10 示范）

当所有条目（A01–A60 + 环境受限子项）已签收后，发起 **deep-dive** 批次对**安全/正确性关键边界**做深度审阅：

1. **范围选择**：挑核心安全边界——原子性、密钥轮换、成员移除清理链、权限降级等待、加密作用域、凭据不可复活
2. **跑 4 道门 + 可选 go test -v 逐包专项**：`go test -count=1 -v ./internal/agent/...` + `-tags local` 对照
3. **从 exit 0 深入到每个测试函数名 + 断言**：读测试源码，列出具体断言（不是只说"这个包过了"）
4. **不新增 signed 状态变更**——deep-dive 是质量保障层，不是签收层
5. manifest.json 的 `batchType` 标为 `"deep-dive"`，`previousBatch` 指向上一批

### 审阅重点清单（按优先级）

| 包 / 文件 | build tag | cloud | local | 关键审阅点 |
|-----------|-----------|-------|-------|-----------|
| `agent/lifecycle` | 无 | ✅ | ✅ | Agent 进程 start/stop/restart 生命周期 |
| `agent/process` | 无 | ✅ | ✅ | 子进程隔离（无 shell、不继承 env）— **安全边界** |
| `agent/queue` | 无 | ✅ | ✅ | 上传冻结 + 重试不重调 Tool + 过期隔离 — **正确性核心** |
| `agent/sessions` | 无 | ✅ | ✅ | A38 foreign-owner/wrong-project/not-held/browser-responsibility 全拒 — **权限边界** |
| `agent/vault` | 无 | ✅ | ✅ | 6 tests：加密重启删/不可用不删 session/symlink 拒绝/凭据不可复活/nonce+cleanup/master 串行 |
| `agent/oauth` | 无 | ✅ | ✅ | OAuth callback/token swap（单机版 authMode=none 但 handler 可达）|
| `agent/pairing` | 无 | ✅ | ✅ | 并发配对仅 1 赢家 — **核心安全** |
| `agent/localapi` | 无 | ✅ | ✅ | 单机版本地 API 端点（local edition 独有）|
| `agent/platformclient` | 无 | ✅ | ✅ | Agent 调 Platform endpoint 凭据隔离 |
| `agent/mcp` | 无 | ✅ | ✅ | MCP 协议 JSON-RPC handshake + stdio/SSE transport |
| `agent_auth_test.go` | `!local` | ✅ | ⏭️ SKIP | 8 tests：proof exchange+concurrent/grant history+ownership/grant origin+deadline+hash/proof cookie+CSRF+origin rejection/grant bounded by parent/exchange without cookie/password reset proofs+grants/concurrent exchange one winner |
| `credentials_test.go` | `!local` | ✅ | ⏭️ SKIP | 6 tests → 14 断言：加密+nonce=12+密文不含明文/list 不暴露 valueJSON/restore JSON 不变/版本乐观锁 nonce 不复用/BackupKey 更换后 restore→503/非 owner developer→404 viewer→403/成员移除→cleanup 清副本→restore 404/DELETE 后 restore→404/restore 等 team FOR UPDATE 锁 + pg_stat_activity Lock wait 确认 |
| `backup_rotation_test.go` | `!local` | ✅ | ⏭️ SKIP | 7 断言：原子性（损坏密文拒绝部分提交，完好记录密文也不变）/错误 old key 拒绝轮换/用户 Version 不丢失/用户 ValueJSON 不变/same key 拒绝/完整轮换 count==len(saved) |

### Platform 包 build tag 三区（23 files / 131 functions）

| 分区 | 文件数 | Cloud | Local | 关键文件 |
|------|--------|-------|-------|---------|
| `!local` (cloud-only) | **13** | ✅ | ⏭️ SKIP | records(20+ functions), agent_auth(8), credentials(6), backup_rotation(1), configuration(6), membership, projects, team removal, v01 assertions |
| `local` (单机版专属) | **3** | ⏭️ SKIP | ✅ | b1_local_edition_assertions, edition_local_auth, edition_local |
| 无 build tag (两版共用) | **5** | ✅ | ✅ | entry_test, entry_secrets_test, local_pg_test(PG shim), settings_test, record_fixtures_test |

**函数名清单生成**：`go test -count=1 -v ./internal/platform/ 2>&1 | grep -E "^=== RUN" | sort > platform-functions.txt`

**Records 是最大 group（20+ functions）**：capacity admission + one-byte boundary + concurrent writers + source proof ownership + atomic replay + redaction schema + archive tombstone + sweep pin receipt。

**Session/Auth 第二大（18+ functions）**：absolute expires despite activity + login cookie csrf + old cookie creates fresh session + reset single use revokes sessions。

### Playwright results.json 正确 outcome 判断

results.json 不是扁平 `{passed, failed}` 结构。正确走法（B11 修正）：

```python
import json
r = json.load(open('.debug/verify-baseline/playwright/results.json'))
total_p = total_f = 0
for suite in r['suites']:            # ← 不是 r['stats']
    f = suite['file'].split('/')[-1]
    for spec in suite.get('specs', []):
        for test in spec.get('tests', []):
            for res in test.get('results', []):    # ← 不是 test['outcome']
                status = res.get('status', '?')    # 'passed' / 'failed' / 'skipped'
                if status == 'passed': total_p += 1
                elif status == 'failed': total_f += 1
print(f'{total_p} passed, {total_f} failed across {len(r["suites"])} suites')
```

**不要**用 `test['outcome']`（Playwright 版本差异）或 `r['stats']`（某些版本 stats 返回 None）。

**唯一已知失败**：`v01-agent-retry.spec.ts` — A38 环境版本差异（非逻辑 bug），pass rate 通常 32/33 = 97.0%。

### Layout Metrics 定量检查清单（macOS 生产入口）

```python
import json
lm = json.load(open('.debug/verify-baseline/playwright/layout-metrics.json'))
m = lm['metrics']                    # ← 不是 lm['pages']
# A30 四宽无溢出
assert all(not x.get('pageOverflow') for x in m), 'pageOverflow=true found!'
# A45 字号层级
assert len(set(x['bodySize'] for x in m)) == 1, 'bodySize varies!'
assert m[0]['bodySize'] == 14, f'bodySize != 14: {m[0]["bodySize"]}'
# 运行时错误
assert lm.get('consoleErrors', []) == [], 'consoleErrors found!'
# 覆盖矩阵
widths = set()
langs = set()
for x in m: widths.add(x.get('width')); langs.add(x.get('lang'))
# expect widths={390,820,1024,1440}, langs={'en','zh'}
print(f'entries={len(m)}, pageOverflow=false, bodySize=14 uniform, consoleErrors=0')
```

**正确路径**：`lm['metrics']`（37 entries, list of dict）。**错误路径**：`lm['pages']`（不存在 → 空列表）。

### Frontend 61 Files 结构速查

| 模块 | Files | 最大单文件 | 关键 |
|------|-------|-----------|------|
| runtime/ | 12 | **schema/interpreter 74 tests**（前端最大） | browser-session 58, records 5(90 tests), schema 2(79), execution 15 |
| features/tools | 7 | SchemaArgumentEditor **13** + ToolExecution 8 | 核心 MCP Tool 交互 |
| features/records | 4 | RecordEditors **13** + RecordsPage 11 | Record 生命周期 |
| features/operations | 1 | OperationsPage 11 | 操作/上传冻结 |
| features/environment | 4 | EnvironmentPage + v01-diagnostics | 环境变量 |
| features/connections | 7 | ConnectionsPage + credentials/backups/oauth panels | Agent 凭据 |
| features/team | 2 | MembersPage 9 + protection | 成员身份 |
| features/workflow | 3 | WorkflowPage + uploads + model | 工作流 |
| features/devices | 2 | DevicesPage + AgentQueuePanel | 设备/队列 |
| features/auth | 2 | IdentityStates + IdentityPage | 身份认证 |
| features/projects | 1 | Projects | 项目 |
| app/ | 3 | App.test.tsx **27** | Shell 全局行为 |
| shared/ | 4 | api + i18n + ui.layout + QueryFeedback | 通用 |

### Frontend Runtime 逐测试函数名深潜（12 files / 251+ tests）

按大小排序，每文件列出**核心覆盖边界**：

| # | 文件 | Tests | 核心覆盖 |
|---|------|-------|---------|
| **1** | `schema/interpreter.test.ts` | **74** | JSON Schema 2020 全边界 + draft07 兼容 + regex DAG budget + **no remote schema fetch** + 4096 node cap + decimal multipleOf 精确 |
| **2** | `records/redaction.test.ts` | **36** | 嵌套 secrets + credentials + email + URL + **pointer inherit reject** + `__proto__` own data + embedded credential URL + browser alias |
| **3** | `browser-session.test.ts` | **58** | SDK tool listing streamable-http+SSE + **credential echo 三处位置 reject** + CSP safe output schema discovery + call classification + connection credential freeze |
| **4** | `records/queueStorage.test.ts` | **29** | frozen body reload + etag retry + **capacity block + inflight explicit loss risk** + **stale owner reject** + **two-queue one-op serial** + digest corrupt quarantine |
| **5** | `records/operations.test.ts` | **14** | double submit one upload + retry original body + **metadata freeze + redact reason** + identity clear safe + source secrets provenance+annotation cannot echo |
| **6** | `execution/index.test.ts` | **15** | **Tab sync lock before async schema validation** + local validation blocks Run creation + scoped authority+policy required + **credential_rejected vs generic transport loss** + **authorization_denied vs generic transport loss** |
| **7** | `records/canonical.test.ts` | **9** | Unicode code points + decimal JSON text preserved + versioned content hash |
| **8** | `schema/index.test.ts` | **5** | **每 job 独立 Worker** + **CPU budget terminate + no raw exception leak** + oversized job pre-reject |
| **9** | `records/snapshot.test.ts` | **1** | Agent 64-hex version hash masking before save |

**Records 子模块全景**（5 files / 90 tests）：
```
records/
├── queueStorage    (29) ← 上传冻结核心（capacity/stale owner/serial）
├── redaction      (36) ← 凭据脱敏核心（pointer inherit reject/embedded URL）
├── operations     (14) ← 上传操作 + metadata freeze + reason redact
├── canonical       (9) ← Unicode + decimal + version hash
└── snapshot        (1) ← Agent version hash masking
```

**Schema 子模块全景**（2 files / 79 tests）：
```
schema/
├── interpreter (74) ← JSON Schema 核心安全边界（no remote fetch）
└── index        (5) ← Worker 隔离 + CPU budget + no exception leak
```

**App Shell 23 Tests 核心边界**（实测修正原 27）：
- language/theme/sidebar controls → page input + focus 保持
- session expiry → unmount project context（不是 signout）
- **late initial session 401/success after newer identity → ignored**（stale identity 防护核心）
- bootstrap failure → working retry（no endless loading）
- stale project response capabilities hidden
- CSRF refresh + team permission refresh on forbidden changes

**vitest 测试名抓取方法**：
```bash
# 正确：vitest verbose 输出用 ANSI escape + " > " 分隔 file 和 test name
npx vitest run --reporter=verbose 2>&1 | grep -E "✓|×" | sed 's/.*> //' > frontend-test-names.txt

# 错误：简单 grep "^\s+(✓|×)\s" 抓不到（ANSI escape codes 在 ✓ 前面）
```

### Frontend Features 核心页面组件逐函数名深潜（8 pages / 84 tests）

B13 完成——在 runtime 深潜后，features/ 页面组件逐函数名全清单。每页面列出**核心覆盖边界**：

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | `EnvironmentPage.test.tsx` | **14** | developer 只改 personal + **same-project route 5 个 close 测试**（personal UI / env removal / definition removal / env conflict late=false / late=true）+ connection draft ≠ project definitions + **reference repair 后 apply 需 explicit action** |
| **2** | `RecordEditors.test.tsx` | **13** | **revision ETag 绑定**（重试用原 ETag，不是新的）+ **Viewer read-only standalone save editor** + redaction reason 脱敏 + **source credential capture（redaction 后 edit 也不能泄露）** + policy re-read opaque field masking + **source Run cache invalidation after additional revision** |
| **3** | `SchemaArgumentEditor.test.tsx` | **13** | **D08 focus/blur safe**（不误报）+ **falsy 值保留**（zero/false/null/empty arrays）+ malformed Raw → Form blocked + **oneOf 分支独立编辑** + enum values distinct + **local JSON draft error 保留 text for later correction** + enabled empty optional number → reject 不是 default 0 |
| **4** | `OperationsPage.test.tsx` | **12** | **无 read perm → 不读队列**（API 不返回，不是 UI filter）+ **Viewer 永远不能 frozen retry** + discard 确认后才开始上传 → refuse（race condition）+ retention **上限 180 天** + If-Match policy reload（不乐观锁）+ competing window upload 解释不暴露任意细节 |
| **5** | `RecordsPage.test.tsx` | **11** | connection+tool filter **跨分页保持** + **foreign-owner facts reject** + late detail 必须匹配当前 connection scope + protected operation → confirm delete block + copy editor 成功上传后关闭 |
| **6** | `MembersPage.test.tsx` | **9** | invitation fact **scope 严格**（same identity + project 才记录）+ **delayed success 跨 project → 不记录** + **permission revoked 后 → 不记录** + delete member 需要 scope confirmation |
| **7** | `ToolExecution.test.tsx` | **8** | one call retry **frozen body 不受 draft edit 影响** + **redaction invalidates cache 只影响当前 project** + **unrelated Viewer project revoked → this project still finish**（project isolation）+ **execution 失败 → 不创建 Run**（publish validation into parameter editor）+ expiry/revocation 期间不 upload，等 admission 恢复 |
| **8** | `v01-diagnostics.test.tsx` | **4** | A51 missing dependency + invalid typed reference → repair clears diagnosis（apply=false/true 各两测）|

### Frontend Features 全量逐函数名深潜（B14 / 29 files / 132 tests）

B13 完成 features 核心 8 pages（84 tests）。B14 分两步补齐：先覆盖剩余 12 modules（其中 2 个实属 `shared/`，共 48 tests），再补漏此前遗漏的 **17 个 features 测试文件（84 tests）**。合起来 features/ **35 files / 211 tests 逐文件全覆盖**。

> **2026-10-29 复核修正**：本节原写「12 files / 52 tests / 全部 20 files / 136 tests」。用 `npx vitest run --reporter=json` 实测发现：`AgentBackupsPanel` 实为 4 非 5；表格逐项相加仅 49；`features/` 实际 35 files / 211 tests，当时只覆盖 18 files，**「全部完成」不成立**。现已补漏并修正。

#### Part 1 — 剩余 12 modules（48 tests）

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | WorkflowPage.test.tsx | **13** | config optional skip + keyboard actions; **no current project access → no config requests + all context hidden**; seven-step page upload failure explicit → direct retry to owner queue; **missing personal applied env → incomplete（不使用 shared default）**; reload from observed history |
| **2** | ConnectionsPage.test.tsx | **11** | version conflict retains draft; **viewer sees config but cannot edit personal auth or connect**; **stale async query does not pollute next project**; deleted auth definition identity retained |
| **3** | AgentBackupsPanel.test.tsx | **4** | **does not create backup until confirmed**; reauth input retained after failure; password cleared after restore |
| **4** | AgentQueuePanel.test.tsx | 3 | **offline Agent records unknown（separate from empty browser queue）**; retries only Agent retained upload; ignores late queue list when permission revoked |
| **5** | DevicesPage.test.tsx | 3 | **requires local approval code + never approves natively from the web**（**安全边界**）; pairing code retained after network failure |
| **6** | IdentityPage.test.tsx | 3 | **keeps original invitation after registration + never accepts automatically**（**安全边界**）; wrong-password login retains typed identity; manual-code reset after password repair |
| **7** | IdentityStates.test.tsx | 2 | unavailable invitation state before sign-in; sign-in inputs retained during invitation retry |
| **8** | AgentOAuthPanel.test.tsx | 1 | authorization separate from saving + retries local without repeating OAuth |
| **9** | AgentCredentialsPanel.test.tsx | 1 | backup off by default + Agent token independent of browser vault |
| **10** | Projects.test.tsx | 2 | denied create-project explains + returns without write; evidence only after real scoped success |
| **11** | `shared/`QueryFeedback.states.test.tsx | 3 | forbidden/not_found → offer return instead of repeat; transient error → explicit retry + separate return |
| **12** | `shared/`ui.layout.test.tsx | 2 | shared button class preserved with caller styles; keyboard separator within bounds |

#### Part 2 — 补漏的 17 个 features 文件（84 tests）

| # | 文件 | Tests | 核心边界 |
|---|------|-------|---------|
| **1** | `workflow/model.test.ts` | **15** | explicit skips + zero-variable env **不自动完成**; failed/cancelled run 不算 complete; **upload 失败后即使看过详情且有 saved copy 仍 incomplete**; **facts 不跨 user/project/connection/Run 合并**; **permission 缺失或 identity suspended → 隐藏全部 progress fact**; newer failed run 替换 successful; restore Tab 不创建 run; **不凭 prior view marker / saved DTO 创建 execution** |
| **2** | `tools/ToolsPage.test.tsx` | 9 | real session catalog + 搜索 + 独立文档 + 键盘导航; tab menu 定位自身文档 + Escape 返焦; list error 重试**不创建/调用 Tool**; **Viewer 或 disconnected runtime → 不 fetch upstream tools**; **root memory revocation 后不 publish late catalog**; **forbidden connection query → 不渲染旧 tool context 且不重试被拒请求** |
| **3** | `tools/workspace.test.ts` | 8 | **duplicate 不继承 result / run identity / pending upload**; tab identity/selection/ordering/drafts 按 project+connection 隔离; 仅在 pinned group 内移动 + 保护 pinned/running 不被批量关闭; **project revocation 只丢弃目标文档、保留另一 project draft** |
| **4** | `tools/argumentDraft.test.ts` | 8 | 每层 optional skip（含 defaults）不设 touched; **显式 0/false/null/空数组与 skip 独立保留**; malformed Raw 保留最后可解析语义值; **remote/advanced ref 用 local JSON 不 fetch**; 删数组项重索引 input/skip/touched/expansion |
| **5** | `records/restore.test.ts` | 8 | 用当前 tool schema 建**独立未执行文档**; **deleted service 可读但不可 restore / 建文档**; **redacted tool identity `/context` `/context/toolName` 在 connection/catalog 请求前阻断**; **stale Developer restore 被实际 session-access 的 Viewer downgrade 拒绝**; **unrelated project revoked 不取消本 project restore**; **Agent history 用当前 Agent session 恢复，绝不用 browser runtime** |
| **6** | `connections/runtimeStore.test.ts` | 7 | **expired credential session 在 panel 未挂载时也断开**; revoke 单 project 后另一 project session/draft 存活; 已签发 result 的 identity 跨 revocation 保留但 **account change 会 fence**; **suspend uploads 但不取消已签发 result、不删 frozen queue**; **memory-only 选择按 account 记住且不串账号**; **stale hydration 完成时保持 expiry paused** |
| **7** | `records/viewStore.test.ts` | 4 | history filters + cursor 按 project 和 connection+tool **独立**保留; additional redaction/metadata forms 按 project+record 隔离且只 revoke 目标; **root Run invalidation 清匹配 copies 与 Tab results，保留其他 Run / project** |
| **8** | `environment/VariableEditor.test.tsx` | 4 | shared number reference expression 保留给 typed runtime resolution; 跨导航保留 conditional version + definition draft; **personal 允许 credential-shaped 值而 shared definitions 拒绝**; **拒绝 personal JSON 内嵌套 nonfinite，不静默存 null** |
| **9** | `tools/AgentToolExecution.test.tsx` | 4 | **Agent 拥有 execution 与 upload，仅显式点击才取消**，保留 safe snapshot 供独立 save; 完成的 Agent Run 可用新 identity 再执行且 **browser 无 upload ownership**; **late results 不能写入 revoked project**; **shared context redaction 在缓存/复制前应用且不改变 identity** |
| **10** | `connections/session.test.ts` | 3 | drafts 按 project + connection identity 保留（含 same endpoint）; saved disconnected/unblocked 时只应用到目标 session; identity end 清除全部 transient data |
| **11** | `records/RecordStates.test.tsx` | 3 | empty history / empty saved list → 提供相同 tool scope 作为下一步; no-match → 提供清 filter，**不给 create-call 动作** |
| **12** | `workflow/uploads.test.ts` | 3 | upload progress **只从匹配的 frozen user/project/connection/Run + target identity 合并**; Agent-owned history 与 saved copies 独立; server-observed Run 缺 upload identity 时**不发明 original history operation** |
| **13** | `team/protection.test.ts` | 3 | self 与 Owner 无论管理角色都受保护; 保护**最后 maintainer** 不被 demote/remove; **Admin 不能修改另一个 Admin** |
| **14** | `tools/ToolDocumentTabs.test.tsx` | 2 | tablist 仅暴露 document tabs，命名动作置于其外; 非当前动作附着自身文档且返焦**不改变选中** |
| **15** | `environment/AgentEnvironmentPanel.test.tsx` | 1 | 预览 Agent personal values，**apply 前重新校验且不连接 MCP** |
| **16** | `records/SessionUploads.test.tsx` | 1 | 解释 paused stale records 与 retention failure，**不给 Viewer retry** |
| **17** | `connections/v01-backup-retry.test.tsx` | 1 | 用保留 scope + 显式 consent 重试被拒 backup，只显示 accepted backup |

**B14 独有发现**（B13 没有覆盖的关键边界）：

| 发现 | 详情 |
|------|------|
| **DevicesPage: "never approves natively from the web"** | 安全边界——Agent pairing 必须 local approval code，web 不能直接批准 |
| **IdentityPage: "never accepts automatically"** | 安全边界——registration 后 invitation 不自动接受，用户必须显式选择 |
| **restore: redacted tool identity 请求前阻断** | `/context` `/context/toolName` 在 connection/catalog 请求前即阻断，字面 masked tool 存在也不放行 |
| **runtimeStore: suspend upload 不取消已签发 result** | 暂停上传 ≠ 取消 tool result ≠ 删 frozen queue，三者独立 |
| **workflow/model: 无 permission → 隐藏全部 progress fact** | 进度事实按权限与 identity 状态整体隐藏 |
| **viewStore: root Run invalidation 精准清除** | 只清匹配 cached copies 与 Tab results，保留其他 Run / project |
| **tools/workspace: duplicate 不继承运行态** | 复制文档不继承 result / run identity / pending upload |
| **ConnectionsPage: stale async request rejection** | 跨 project 导航旧 request 不污染新状态 |
| **WorkflowPage: missing personal env → incomplete** | 不 fallback 到 shared default |
| **AgentQueuePanel: offline Agent ≠ empty browser queue** | 独立概念 |
| **AgentBackupsPanel: two-phase confirm** | confirm 之前不创建 backup |

**Features 完整全景**（B13 84 + B14 127 = **35 files / 211 tests**，实测）：
```
features/                                         files  tests
├── records/    RecordEditors 13, RecordsPage 11, restore 8,
│               viewStore 4, RecordStates 3, SessionUploads 1      6    40
├── tools/      SchemaArgumentEditor 13, ToolsPage 9, ToolExecution 8,
│               workspace 8, argumentDraft 8, AgentToolExecution 4,
│               ToolDocumentTabs 2                                 7    52
├── workflow/   model 15, WorkflowPage 13, uploads 3               3    31
├── environment/EnvironmentPage 14, VariableEditor 4,
│               v01-diagnostics 4, AgentEnvironmentPanel 1         4    23
├── connections/ConnectionsPage 11, runtimeStore 7, AgentBackupsPanel 4,
│               session 3, AgentOAuthPanel 1,
│               AgentCredentialsPanel 1, v01-backup-retry 1        7    28
├── operations/ OperationsPage 12                                  1    12
├── team/       MembersPage 9, protection 3                        2    12
├── devices/    AgentQueuePanel 3, DevicesPage 3                   2     6
├── auth/       IdentityPage 3, IdentityStates 2                   2     5
└── projects/   Projects 2                                         1     2
                                                                  ───   ───
                                                                   35   211
```

### Deep-dive 批次累积总表（B10→B16，实测口径）

| 批次 | 深入到 | 文件 / 测试（实测） |
|------|--------|-------------------|
| B10 | Agent 11 包 + backup/credentials | ~50 Go 函数 |
| B11 | Platform 131 + Playwright 14 suites + Layout Metrics 37 | 131 Go + 33 E2E |
| B12 | Frontend runtime 251+ tests + app 23（实测修正原 27） | 274+ TS tests |
| B13 | Frontend features 核心 8 pages / 84 tests | +84 TS tests |
| B14 | Features 剩余 + 补漏 17 文件 + shared 2 文件 | +132 TS tests |
| **B15** | **internal 零测试包：jsonnumber(7) + wire 合同(6) + agent/wire 合同(5)** | **+18 Go tests** |
| **B16** | **入口层：deviceIdentity(7) + parseOptions 模式(6)；apps 编译验证** | **+13 Go tests** |
| **总计** | | **Go 212+ / TS 490+ / E2E 33 = 735+** |

**覆盖图**：
```
Go 侧:  agent 11 包 ~50 → platform 131 → jsonnumber/wire 18 → 入口层 13
                                                    = 212+ 边界
TS 侧:  runtime 251+ + app 23 → features 全部 211（B13 84 + B14 127）
        + shared 5                                  = 490+ tests
E2E:    Playwright 14 suites 33 specs
量化:   Layout Metrics 37 entries / pageOverflow 0 / bodySize 14
───────────────────────────────────────
总计:   735+ 可追溯边界
```

**vitest 全量分布（实测 61 files / 603 tests）**：
```
runtime/   19 files / 352 tests
features/  35 files / 211 tests   ← B13+B14 全覆盖
app/        3 files /  23 tests
shared/     4 files /  17 tests
```

### Go 缺口深潜批次模式（B15 示范）

当 agent / platform / frontend 全部覆盖后，盘点 `internal/` 找出**零测试包**：

```bash
# 找零测试包（排除生成代码前先看行数）
for p in $(find internal -maxdepth 2 -type d | sort); do
  go=$(find "$p" -maxdepth 1 -name "*.go" | grep -v "_test.go" | wc -l | tr -d ' ')
  tst=$(find "$p" -maxdepth 1 -name "*_test.go" | wc -l | tr -d ' ')
  if [ "$go" != "0" ]; then echo "$p  go=$go  test=$tst"; fi
done
```

判定优先级：

| 类型 | 处理 |
|---|---|
| **手写 + 被多处调用** | ✅ 必补（B15 的 jsonnumber：79 行、5 处调用、D09 数值闸） |
| 生成代码 + 跨语言共用 | 补**合同字段名断言**（不是全量镜像） |
| 生成代码 + 仅内部使用 | 可跳过 |
| 纯组装入口（`main()` + `os.Exit`） | 用**编译可达性**验证，不写进程内测试 |

**jsonnumber 类数值边界测试要点**：
- mantissa 位数上限（128 通过 / 129 拒绝）
- exponent 范围 ±324 + 位数 >3 拒绝
- bounded underflow（`1e-324 → 0`）
- 非有限拒绝（`1e324` +Inf / `abc` / `1e` / 空串）
- ECMAScript 阈值（`1e-6` 定点含边界、`1e-7` 指数、`1e21` 指数）
- **真实负零必须用 `math.Copysign(0,-1)`**，Go 常量 `-0.0` 会退化为 `0`

**wire 合同测试要点**：
- 用真实 API 形状 JSON → 反序列化 → 再序列化 → 断言 key 存在
- 只锁**双方实际消费**的结构（B15 锁 11 个），不锁全部 40+ 类型
- 抓的是字段名漂移，不是字段语义（语义在 platform/前端测试里）

### 入口层深潜批次模式（B16 示范）

盘点 `cmd/` 与 `apps/`：

```bash
wc -l cmd/agent/*.go cmd/studio-admin/*.go apps/local/*.go apps/cloud/*.go
grep -n "^func " cmd/agent/*.go | grep -v "_test.go"
# 查已有测试覆盖了哪些函数
grep -hn "parseOptions\|deviceIdentity\|writeConfirmationPrompt" cmd/agent/*_test.go
```

| 入口文件 | 典型缺口 | 处理 |
|---|---|---|
| `cmd/agent/main.go deviceIdentity` | **symlink 劫持 / 身份不匹配 / 0600 权限** | ✅ 必补（设备冒充风险） |
| `cmd/agent/options.go` | 模式互斥 / 绝对 state-dir / 字面 loopback | ✅ 补充分支 |
| `cmd/agent/confirmation.go` / `diagnostics.go` | 通常已有测试 | 先查再补 |
| `cmd/studio-admin/main.go` | `key` / `run` 通常已有测试 | 先查再补 |
| `apps/*` `main()` | 纯组装 + `os.Exit` | **编译可达性**，不写测试 |

**入口层门禁必须额外跑**（标准 4 道门只覆盖 `internal/`）：
```bash
go test -count=1 ./cmd/... ./apps/...
go test -count=1 -tags local ./cmd/... ./apps/...
go vet ./cmd/... ./apps/... && go vet -tags local ./cmd/... ./apps/...
# 两版编译可达性
go build -o /dev/null ./cmd/agent ./cmd/studio-admin ./apps/cloud ./apps/local
go build -tags local -o /dev/null ./apps/local ./internal/platform
```

**deviceIdentity 安全断言清单**（`main.go:111-147`）：
1. 首次生成随机身份 + 文件权限 **0600** + 二次调用稳定
2. 显式 requested 匹配 → 复用
3. 显式 requested 不匹配 → `device_identity_mismatch`
4. 已存身份非法（`vault.ValidID` 拒绝）→ 拒绝
5. 显式 requested 非法 → `invalid_device_identity` 且**不落盘**
6. **symlink → `unsafe_device_identity`**（最高价值）
7. 条目为目录 → `device_identity_unavailable`

`vault.ValidID` 规则：1–128 字符，仅 `[a-zA-Z0-9_-]`。

Vault system backend build tag 速查

| 文件 | build tag | 后端 |
|------|-----------|------|
| `system_darwin.go` | `darwin && cgo` | macOS Keychain (CoreFoundation + Security) |
| `system_windows.go` | `windows` | Windows DPAPI |
| `system_linux.go` | `linux` | Linux filesystem |
| `system_unavailable.go` | `(!darwin && !windows && !linux) \|\| (darwin && !cgo)` | 回退 |

## 架构事实速查

- agent 11 包：lifecycle / localapi / mcp / oauth / pairing / platformclient / process / queue / sessions / vault / wire
- Go platform 包耗时：97–100s（含 20 个 `records_test.go` + 8 个 `record_lifecycle_test.go`）
- 前端 runtime 测试：Node 24.21.0 下约 603 tests（vitest run）
- 环境受限不阻断：单机版 `auth_local.go` 跳过角色校验但不跳过项目归属过滤；云版 `!local` 测试在单机门禁中不会被编译

## 踩坑清单（按严重度）

| 问题 | 根因 | 处理 |
|------|------|------|
| PATCH 返回 428 `if_match_required` | 后端 `configuration.go:88-91` 只读 `If-Match` header | etag 只走 header，body 不放 etag |
| session-access 应 400 却返回 200 | endpoint 无 `{{VAR}}` 引用，变量解析链不走通 | endpoint 必须含 `{{HOST}}` 等引用 |
| 单机版 authMode 400 | 传了 OAuth / agent 相关值 | 统一 `'none'` |
| Node 26 下 vitest 416/421 红 | jsdom 跳过 localStorage | 固定 Node 24.21.0 |
| push 到过期 ref | 未 fetch 就 push | 每次 push 前 `git fetch origin main && git branch -vv` |
| 既有非验收改动被提交 | `git add -A` 或路径没收紧 | 只用 `git add <具体文件>` |
| `!local` 测试在单机门禁被跳过 | build tag 语义正确 | 云版专属条目只用云版门禁签收 |
| Go platform 包全部 "MCP_STUDIO_TEST_DATABASE_URL required" | 没设 env var；约 70 个测试强依赖 | 门禁脚本**最开头**就 `export MCP_STUDIO_TEST_DATABASE_URL="postgres://..."` |
| Playwright 所有测试秒失败 "Cannot navigate to invalid URL" | `PLAYWRIGHT_BASE_URL` 未设，前端 dev server 没启动 | 用"浏览器证据验收策略"的策略 A（定量）或策略 B（最近 E2E + verify 无漂移）替代，或先启动基础设施 |
| macOS shell SIGHUP 杀单机版进程 | zsh backgrounded 子进程在父 shell 退出时收到 SIGHUP | 用 `( binary & )` subshell 或 Node.js `child_process.spawn + detached:true + unref()`；生产 launchd 不受影响 |
| Go 单机版本机端口是 8080 不是 9123 | B1/B2 单机版脚本用 `localhost:9123`，但真实 binary 硬编码 `127.0.0.1:8080` | 启动后 `curl http://127.0.0.1:8080/api/v1/health` |
| CGO_ENABLED=0 下 system_darwin.go 不编译 | build tag `darwin && cgo` 条件不满足，回退到 system_unavailable.go | `go env CGO_ENABLED` 默认为 1；Keychain 验证需确保 CGO 启用 |
| 本机没装 postgres/initdb，但仓库 PG binaries 就绪 | PG binary 位置：`.runtime/pg-brew/postgresql@18/18.6_1/bin/` 或 `.runtime/pg-cache/darwin/arm64/pgsql/bin/` | 启动前 `export PATH="$PWD/.runtime/pg-brew/postgresql@18/18.6_1/bin:$PATH"` |
| pthread shim 缺失 → macOS 26 postmaster 崩溃 | macOS 26 postmaster 因 GCD/XPC 延迟 spawn thread 触发 `pthread_is_threaded_np()` 检查 | shim 位置：`.runtime/pg_no_multithread_check.dylib`；`pgThreadShimPath()` 会自动从 `$WD/.runtime/` 找 |
| Playwright results.json outcome 判断错路径 | `test['outcome']` 可能是 'MISSING'（Playwright 版本差异），`r['stats']` 返回 None | 用 `r['suites'][].specs[].tests[].results[].status`；完整代码见 skill "Playwright results.json" 节 |
| Layout Metrics 路径 lm['pages'] 返回空 | layout-metrics.json 没有 pages key，实际是 `lm['metrics']`（list of dict） | 正确路径 `lm['metrics']`，37 entries；`lm['pages']` 不存在会 silent fail → 空列表 |
| vitest verbose 输出 grep 不到测试名 | ANSI escape codes（绿色 ✓ 前面有 `\x1b[32m`）+ " > " 分隔符，简单 `grep "^\s+✓"` 匹配失败 | 用 `grep -E "✓|×" | sed 's/.*> //'` 去掉 ANSI + 前缀；正确示例见 skill "Frontend Runtime" 节 |
| vitest 单文件跑 exit 0 但 test 数为 0 | 直接 `vitest run src/runtime/browser-session.test.ts` 可，但 glob 或路径错会 silent skip | 先跑 `vitest run` 全量确认 exit 0 + File Summary 里的 test count，再定向跑单文件 |
