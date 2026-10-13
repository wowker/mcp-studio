# Focused test authoring corrections

The initial component test attempt failed because the expected English notice was written as `Remove Other from project “Project” only. Team and other project memberships remain.`. The rendered production translation was `Remove Other from Project only. Team and other project memberships remain.`. The test expectation was corrected; no production translation or behavior changed.

The first TypeScript check reported `TS2769: No overload matches this call` at the newly added role-query options on MembersPage.test.tsx lines 41–56: `'exact' does not exist in type 'ByRoleOptions'`. These Testing Library queries use exact string names by default; the Playwright-specific `exact` option was removed from the component tests. The subsequent focused component suite and TypeScript check exited 0.

These were test-authoring errors, not reproduced product defects or behavior RED evidence. The successful latest logs are `frontend.log` (9 passing cases), `typecheck.log` (no diagnostics), `go.log` (named real PostgreSQL/API cases), and `browser.log` / `results.json` (2 real production-entry Chromium cases, no failures/skips/retries).

The production build ran before the focused browser run. The runtime created and automatically removed its leased isolated database schemas and stopped its platform, Agent, SMTP, MCP, OAuth and temporary TLS fixtures. This focused run is not formal acceptance or a Chrome/Edge/OS matrix.
