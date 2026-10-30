# Issue tracker：GitHub

本仓库的 issue 与 spec 存放在 GitHub Issues（`wowker/mcp-studio`）。所有操作走 `gh` CLI。

## 约定

- **建 issue**：`gh issue create --title "..." --body "..."`。多行 body 用 heredoc。
- **读 issue**：`gh issue view <number> --json number,title,body,labels,comments`。
- **列 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合 `--label`、`--state` 过滤。
- **子 issue**：`gh issue create --parent <parent> ...`，或事后 `gh issue edit <parent> --add-sub-issue <child>`（`gh` 2.94+）。旧版 `gh`：`gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`（数据库 id，见下方 **阻塞**）。不支持子 issue 时，在子 issue body 顶部写 `Part of #<parent>`。
- **阻塞**：使用 GitHub 原生 issue 依赖边，这是唯一在 UI 中可见的权威表示。加边用 `gh issue create --blocked-by <n>,<n> ...` 或 `gh issue edit <child> --add-blocked-by <blocker>`（`gh` 2.94+）。旧版 `gh`：`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`，其中 `<blocker-db-id>` 是阻塞者的数字**数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`），**不是** `#number` 或 `node_id`。依赖不可用时退化为子 issue body 顶部的 `Blocked by: #<n>, #<n>` 行。所有阻塞者关闭后，该 ticket 视为解除阻塞。
- **统计未关闭阻塞者**：`gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`（只计 OPEN；0 表示可开始）。`gh issue view <n> --json blockedBy` 会包含已关闭项，需过滤：`--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`。
- **评论**：`gh issue comment <number> --body "..."`。
- **加/删标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`。
- **关闭**：先用 `gh issue comment <number> --body "..."` 说明，再 `gh issue close <number>`。对已关闭的 issue 执行 `gh issue close --comment` 会丢弃评论但退出码仍为 0。

仓库由 `gh` 从当前 clone 自动推断（`git remote -v`）。

只在本人仓库建 issue。不要向 `mattpocock/skills`（这些 skill 的来源仓库）提 issue，除非用户拥有它。fork 场景下 `gh` 可能默认指向上游父仓库，因此每次会话第一次 `gh issue create` 前先用 `gh repo view --json nameWithOwner` 确认目标，若不是 `wowker/mcp-studio` 需与用户确认。

## PR 作为 triage 入口

**把 PR 当作需求入口：否。**（若本仓库把外部 PR 视为 feature request，改成 `yes`；`/triage` 会读取此标记。）

设为 `yes` 时，PR 走与 issue 相同的标签与状态机，命令换用 `gh pr` 版本：

- **读 PR**：`gh pr view <number>`，再 `gh pr view <number> --comments`（非 TTY 下 `--comments` 只打印评论、不含 body），diff 用 `gh pr diff <number>`。
- **列外部 PR 供 triage**：`gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`。
- **评论 / 标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 的 issue 与 PR 共享同一套编号，单独的 `#42` 可能是 issue 也可能是 PR：先用 `gh pr view 42` 解析，失败再回退 `gh issue view 42`。

## 当 skill 说「publish to the issue tracker」

创建一个 GitHub issue。

## 当 skill 说「fetch the relevant ticket」

按上方 **读 issue** 读取。

## Wayfinding 操作

由 `/wayfinder` 使用。**map** 是一个 issue，**child** issue 是 ticket。

- **Map**：单个 issue，标签 `wayfinder:map`，body 承载 Notes / Decisions-so-far / Fog。`gh issue create --label wayfinder:map`。
- **Child ticket**：以 GitHub 子 issue 形式挂到 map（见 **子 issue**）。子 issue 不可用时，把 child 加进 map body 的任务列表，并在 child body 顶部写 `Part of #<map>`。标签用 `wayfinder:<type>`（`research`/`prototype`/`grilling`/`task`）。被认领后 assign 给驱动者。
- **阻塞**：见 **约定** 中的 **阻塞**。
- **Frontier 查询**：列出 map 的未关闭子 issue（`gh issue list --state open`，限定为 map 的 sub-issues / 任务列表），剔除有未关闭阻塞者（见 **统计未关闭阻塞者**，或 `Blocked by` 行中未关闭的 issue）或已有 assignee 的项；按 map 顺序取第一个。
- **认领**：`gh issue edit <n> --add-assignee @me`，作为该会话的第一次写操作。
- **解决**：`gh issue comment <n> --body "<answer>"`，随后 `gh issue close <n>`，再把上下文指针（要点 + 链接）追加到 map 的 Decisions-so-far。
