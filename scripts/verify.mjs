import { mkdir } from 'node:fs/promises';
import { runChecked, runRuntime, validateTestDatabaseURL, withTestSchema } from './test-runtime.mjs';

// Explicit database is mandatory. No environment silently skips integration or browser gates.
const database = process.env.MCP_STUDIO_TEST_DATABASE_URL;
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
const env = { GOCACHE: process.env.GOCACHE ?? '/private/tmp/mcp-studio-go-cache' };
const check = (label, command, args, extra = {}) => runChecked(command, args, { label, env: { ...env, ...extra }, signal: controller.signal });
try {
  validateTestDatabaseURL(database);
  await check('Generated contracts are current', process.execPath, ['scripts/generate-contracts.mjs', '--check']);
  await check('Generated Agent contracts are current', process.execPath, ['scripts/generate-agent-contracts.mjs', '--check']);
  await check('Shared contract semantics', process.execPath, ['scripts/contract-semantics.mjs']);
  await check('Generator, SDK, loopback security and runtime guards', process.execPath, ['--test', 'scripts/generate-contracts.test.mjs', 'scripts/generate-agent-contracts.test.mjs', 'tests/fixtures/sdk/ts-sdk.test.mjs', 'tests/fixtures/compat/security.test.mjs', 'tests/fixtures/compat/local-confirmation.test.mjs', 'tests/fixtures/mail/smtp.test.mjs', 'tests/fixtures/mail/runtime.test.mjs', 'tests/fixtures/mail/runtime.integration.test.mjs', 'tests/fixtures/m2/fixture.test.mjs', 'tests/fixtures/m5-agent/fixture.test.mjs']);
  await check('Frontend TypeScript', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/web/tsconfig.json']);
  await check('Frontend unit and component tests', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'apps/web/vite.config.ts']);
  await check('Frontend production build', process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.config.ts']);
  await withTestSchema(database, scoped => check('Go tests with real isolated PostgreSQL', 'go', ['test', '-count=1', './...'], { MCP_STUDIO_TEST_DATABASE_URL: scoped }));
  await check('Go vet', 'go', ['vet', './...']);
  await mkdir('.runtime', { recursive: true });
  await check('Go production platform build', 'go', ['build', '-o', '.runtime/platform', './cmd/platform']);
  await check('Go production Agent build', 'go', ['build', '-o', '.runtime/agent', './cmd/agent']);
  await check('Controlled Agent integration fixture build', 'go', ['build', '-o', '.runtime/m5-agent-fixture', './tests/fixtures/m5-agent']);
  await runRuntime([], { signal: controller.signal });
  console.log('[verify] all gates passed');
} catch (error) {
  console.error(`[verify] ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
}
