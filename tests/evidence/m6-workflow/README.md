# M6 T33a focused evidence

Date: 2026-10-13. Scope: workflow domain, component, translations, upload-state projection and the minimal root memory lifetime binding. Source integration and continuous production journey checks are owned by the root task.

- `model-red.log` / `model-green.log`: initial absent implementation, then 9 domain regressions passed.
- `runtime-red.log` / `runtime-green.log`: absent workflow memory interface, then 7 root-memory regressions passed.
- `uploads-red.log` / `uploads-green.log`: absent projection, then 2 browser/Agent identity projection regressions passed.
- `observed-records-red.log` / `observed-records-green.log`: missing authoritative history/saved-detail APIs, then 15 model regressions passed. The added cases retain unknown original operation identity, require same-owner/source scope, preserve failed/cancelled outcomes and clear observed facts on revocation.
- `component-red.log` / `component-green.log`: absent component then component implementation; later green logs include delayed Agent definition readiness regressions.
- `agent-readiness-red.log`: the delayed environment definition test failed before the readiness dependency fix.
- `applied-environment-red.log`: personal applied override tests failed before effective-environment precedence was fixed.
- `focused.log`: command `npm test -- apps/web/src/features/workflow apps/web/src/features/connections/runtimeStore.test.ts`; 4 files / 37 tests passed (domain 15, upload projection 3, page 12, memory 7), including the authoritative record continuation thin slice.
- `typecheck.log`: repository `npm run typecheck` passed after the authoritative record continuation slice and root integration fixes. Root owns the final full verify.

Regressions cover real configuration queries, permission/identity gating with no content read, explicit optional skips, failed/cancelled execution, upload failure with owner queue continuation, same Run history/save correlation, cross-user/project/connection isolation, applied environment precedence and deletion, deferred Agent readiness with scoped preview, bilingual strings and keyboard actions. No raw preview payload or secret is rendered or retained by workflow memory.

These focused tests are not a substitute for full verify, production browser evidence, OS/mail/media acceptance or the formal A01–A60 sign-off. No M7 scope or task acceptance checkbox was changed.
