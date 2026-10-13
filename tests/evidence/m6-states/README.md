# M6 T31 component evidence

Scope: production React state/recovery changes and the 26-view mapping in `docs/tasks/m6-state-matrix.md`. These are component observations against explicit response fixtures, not acceptance of real mail, browser transports, PostgreSQL, OS vaults, physical pairing or backup media. Final implementation version and full verify belong to the root M6 execution record.

Observed failures before their corresponding implementation are retained in `connections-red.log`, `environment-red.log`, `members-red.log`, `identity-red.log`, `recovery-red.log`, `records-red.log` and `shared-query-red.log`. The initial connections/members green attempts also revealed test-oracle mistakes (Servers label, No members wording, list fixture after creation); the assertions were corrected without removing the intended recovery checks. Final results are in `focused-final.log`: 13 files, 69 tests passed, exit 0. `typecheck.log` records a concurrent App-test `exact` option failure; `typecheck-final.log` records the subsequent successful typecheck, exit 0. `git diff --check` was also executed successfully.

Final focused command:

```sh
npm test -- apps/web/src/shared/QueryFeedback.states.test.tsx apps/web/src/features/auth/IdentityStates.test.tsx apps/web/src/features/auth/IdentityPage.test.tsx apps/web/src/features/projects/Projects.test.tsx apps/web/src/features/team/MembersPage.test.tsx apps/web/src/features/connections/ConnectionsPage.test.tsx apps/web/src/features/connections/AgentBackupsPanel.test.tsx apps/web/src/features/environment/EnvironmentPage.test.tsx apps/web/src/features/environment/VariableEditor.test.tsx apps/web/src/features/devices/DevicesPage.test.tsx apps/web/src/features/records/RecordsPage.test.tsx apps/web/src/features/records/RecordStates.test.tsx apps/web/src/features/operations/OperationsPage.test.tsx
npm run typecheck
git diff --check
```

No full verify, real PostgreSQL or broad browser suite was run by this worker. T02 and the previous manual device, OS credential store and backup-media pending states remain pending. No task checkboxes or acceptance signatures were changed.
