# M6 T32 layout slice evidence scope

This slice supplies shared primitives, Shell regressions and a **representative production matrix spec**. It does not establish that all 26 views passed the matrix. At handoff the production spec is discovered, but has not been executed by this worker. Root coordinates production build, fixtures, two browsers and additional journey coverage. Human keyboard/visual review and A01–A60 sign-off remain pending.

Local actual verification: `focused.log`: 15 tests in three files (shared layout, Shell, existing App), successful. `red.log` records missing split and Button class regression; `announcement-red.log` records missing locale announcement. `spec-discovery.log` discovers two production tests. The initial `typecheck.log` recorded another worker's temporary ConnectionsPage test typing failure; root must rerun the final typecheck. No complete verify gate was run by this worker.

| View | Slice matrix | Remaining real coverage at this worker handoff |
| --- | --- | --- |
| P01 Login / identity | Not run | Login, verification, invitation identity repair, password recovery, initialization; screenshot must omit filled secrets |
| P02 Account / session | Not run | Profile, expiry and exit confirmation |
| P03 Project directory | Not run | Long project names, directory table/list, filters |
| P04 Project create | Not run | Draft/error/pending layout |
| P05 Project workflow | Not run | Root T33 journey and progress states |
| P06 Project access / takeover | Not run | Permission notice, confirmation and audit |
| P07 Members / invitations | Not run | Project/team/invitations/permission merged subviews |
| P08 Member detail | Not run | Roles and removal confirmation |
| P09 Create invitation | Not run | Long email/summary and error states |
| P10 Invitation detail / accept | Not run | Guest, wrong identity, expired/accepted/revoked |
| P11 Service config | Written, not run | 16 bilingual/theme/width long-draft screenshots; remaining transport/auth-specific subviews in root journeys |
| P12 Authorization / credentials | Not run | Token/OAuth, backup/restore states; omit filled credentials from evidence |
| P13 Local Agent | Not run | Pairing/online/offline/confirmation; real OS/installation remains outside this automated slice |
| P14 Environment variables | Not run | Filters/definition/preview/source chain |
| P15 Variable edit | Not run | Types, scope and conflict layout |
| P16 Sensitive value / backup | Not run | Empty/masked/failed states; omit filled secrets |
| P17 Tool debugging | Written, not run | 16 bilingual/theme/width plus 4 short desktop screenshots; nested error and keyboard flow; root execution/result lifecycle coverage |
| P18 Tool definition | Written as P17 inline subview, not run | Expanded schema included in P17 matrix; definition-specific long content review |
| P19 Tool history / detail | Not run | Scoped filter/table/detail and restore |
| P20 Tool saved / save | Not run | Scoped list/edit and incomplete draft |
| P21 Project history | Not run | Filters/table, pins, cleanup |
| P22 Project saved list | Not run | Filters/table, pagination and unavailable record |
| P23 History detail | Not run | Snapshot/metadata/protocol/redaction |
| P24 Saved detail | Not run | Snapshot/edit/delete/restore/retry |
| P25 Save / metadata edit | Not run | Long name/note, validation, revision failure |
| P26 Records / devices | Not run | Queue/preferences/failed/paused/capacity and Agent-owned operations |

None of these views is marked N/A merely because the root combines it with another page: merged views still need applicable screenshots/metrics and scan states. Missing artificial loading/empty states must be documented by the state inventory, not inferred here.

`tests/e2e/layout-helpers.ts` exports `verifyLayout(page, viewName, {evidenceDir?, screenshot?})` and `axeScan(page, viewName, evidenceDir?)`. Metrics test body=14, auxiliary small=12, minimum visible typography>=11, no root horizontal overflow, and nonzero actual pane/content rectangles. Screenshots are opt-in and withheld when a filled credential/password/code/pairing control is detected. Callers must also avoid secret-bearing raw result scenes. Axe reports persist rule/impact/selector targets, pass IDs and incomplete IDs only; no HTML, values, raw URLs or diagnostic prose. Axe automatic WCAG A/AA checks do not sign human accessibility acceptance. Incomplete checks require review.

Run the production suite with root's fresh production fixtures and `PLAYWRIGHT_*` variables:

```sh
PLAYWRIGHT_EVIDENCE_DIR=tests/evidence/m6-layout npx playwright test tests/e2e/m6-layout.spec.ts
```

The two tests use 180s and 90s bounded test timeouts. Evidence includes layout metrics, screenshot compositions, sanitized axe summaries and the automated keyboard scope. Root must add the actual final implementation version, test results, two-browser coverage and reviewed screenshot inventory after execution.

## Real production axe failure and structural repair

Root's first production run (`production-first.log`, `tools-en-US-light-axe.json`, `keyboard-error-en-US-light-390-axe.json`) reached actual matrix/keyboard scenes, then failed axe `aria-required-children`: `.tools-document-tabs` placed normal menu/close buttons within a `tablist`. The repair introduces a focusable scroll region, a nested tablist containing only direct `tab` buttons, and per-document action siblings outside that tablist. One CSS grid row with a column subgrid keeps labels and actions adjacent at 44px height. It uses no hidden interactive controls, counterfeit roles, axe exclusions, or disabled rules. Action controls retain target identity and use `aria-describedby` to point to their document Tab.

New focused structural regression was recorded failing in `tab-structure-red.log`; `tab-structure-green.log` passes the two structural/identity tests plus eight existing ToolsPage behavior tests (10 total). Root must rebuild and rerun the actual axe/matrix suite before claiming that the production failure is repaired.

Official grounding: [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) and [MDN Subgrid](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Subgrid). Subgrid aligns the nested label list to parent action columns without relocating ownership with aria-owns.

## Expanded P01–P26 production matrix spec

`tests/e2e/m6-matrix.spec.ts` now adds three real-platform test groups. This worker has **not executed** them; `matrix-discovery.log` discovers the three tests and `matrix-types.log` records a successful isolated TypeScript check. Root must run them against the production build and fresh controlled fixture environment and update this scope with actual outcomes. Existing draft/scroll tests in `m6-layout.spec.ts` remain intact.

| P mapping | Added actual page/subview preparations |
| --- | --- |
| P01 | Anonymous login, forgot, reset; real invited registration and unverified mailbox verification forms. Initialized platform's one-time initialize view is explicitly pending rather than re-created. |
| P02 | Actual authenticated account and session display; expiry/pending logout remain separate lifecycle coverage. |
| P03–P05 | Real project directory, unsaved long project creation draft, empty project's workflow overview. |
| P06 | A second real invited account is registered, mailbox verified and explicitly accepts Admin/Maintainer invitation, then creates a project. Owner accesses this real project without membership and sees takeover/access UI. No role or API response is mocked. |
| P07–P10 | Project/team members, protected current-member detail, permission view, invitation form and sent invitation row, real invited registration and accept-ready detail. |
| P11–P13 | Actual saved token-auth connection with empty personal authorization, and real unpaired device UI. Paired Agent/OS/vault/backup substates explicitly remain pending. |
| P14–P16 | Real platform-created environment plus public and sensitive variable definitions. Resolution table, new variable draft, existing variable edit and empty browser personal-secret form. No secret value is entered for matrix evidence. |
| P17–P18 | Real HTTP MCP connection, argument document, expanded definition, actual echo Run/result; existing separate draft/scroll test is retained. |
| P19–P20 | Real same-tool history/saved lists and history detail inside execution view, plus result save editor. |
| P21–P25 | Real project history/saved lists, frozen history detail, saved detail, metadata editor, and save-copy editor. Saved identity/source Run assertions connect the records to the actual Tool call. |
| P26 | Real operations retention/queue/capacity page, with accurate unpaired Agent queue notice. |

Each reached composed view produces 20 actual geometry cases: Chinese/English × light/dark × 390×844, 820×900, 1024×900, 1440×900 and short desktop 1024×640. Each language/theme performs one real axe scan at 1024×900, without disabling rules. JSON coverage is written after each completed view; failures remain failures, and prerequisite gaps are recorded as pending. Screenshots remain opt-in through the existing sensitive-input withholding helper. Raw mail codes/passwords are never copied into metrics, screenshots, axe output or coverage JSON.

The expanded tests have bounded 900/600/600 second test budgets due to the number of actual compositions; they contain no arbitrary sleeps. Root serializes their execution with the other production tests:

```sh
PLAYWRIGHT_EVIDENCE_DIR=tests/evidence/m6-matrix npx playwright test tests/e2e/m6-matrix.spec.ts
```

The three group outputs are `identity-management-coverage.json`, `configuration-coverage.json` and `records-coverage.json`, plus sanitized axe summaries and safe screenshots. Test discovery and source typing are not substitutes for these production outcomes, two-browser coverage or human visual/keyboard review.

Expanded-spec literal audit: the initial matrix source accidentally carried three prior draft literals. Formal `executionTranslations.ts` defines success as `成功 · 工具结果`; formal `records/translations.ts` defines restore as `恢复为新 Tab` and new save as `另存为新记录`. The matrix now imports those exact pure translation records instead of duplicating their text. Other matrix selectors were cross-checked against the formal identity/team/environment/operations catalogs. The running root process may already have loaded the previous source; root preserves any failed run and reruns the corrected source rather than assuming a live edit changed the loaded test.

Production monitoring located a test prerequisite omission in the original representative T32a layout spec: after establishing the real MCP connection and returning from Tools to Servers, the spec attempted to edit Name while the real connection remained locked/connected. Formal ConnectionEditor correctly disables its configuration fieldset until an explicit disconnect. The test now clicks Disconnect and asserts Name enabled before filling the unsaved long service draft. This is a test setup fix; production locking was not weakened. The already-loaded expanded-first run retains its original result, and root must rerun the corrected spec. Monitoring found all four real bilingual/light-dark Tools axe reports had zero violations before the config-edit phase.

## Expanded-first actual production outcome (root-run monitoring)

Read-only monitoring of `tests/evidence/m6-root/production-expanded-first.log` and sanitized `tests/evidence/m6-browser/*coverage.json` confirms the real run finished: seven tests ran, three passed, four failed. Of this worker's tests, expanded identity/management and configuration groups passed; T32b keyboard/axe passed. The representative T32a layout test failed at disabled connection Name editing, and the records group failed waiting for the old literal `成功 · 成功`. These two test-source corrections were made during the already-running process and did not change its loaded source; failures remain preserved and must be rerun. The two independent flow failures are root-owned.

Actual matrix coverage from this run: `identity-management-coverage.json` contains 17 reached views, each with 20 passed geometry cases, plus explicit pending initialization/expiry substates. `configuration-coverage.json` contains seven reached views with 20 passed cases each, plus explicit paired Agent/vault/backup prerequisite pending. `records-coverage.json` contains two reached views (arguments and expanded definition); execution/record/save/detail matrix scenes were not reached after the old-literal failure. Every available axe summary in this run's evidence directory had an empty violations array. Incomplete checks and human review remain pending.

This yields 24 completed identity/configuration composed views plus two initial records views (520 completed geometry cases), not a claim that all P01–P26 are signed off. Root's final rerun, browser/version coverage, screenshot review and acceptance ledger determine the final result.
