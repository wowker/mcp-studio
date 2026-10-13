import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
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
  await mkdir('.runtime', { recursive: true });
  await check('Controlled interruption regression fixture build', 'go', ['build', '-o', '.runtime/verify-abort-fixture', './tests/fixtures/verify-abort']);
  await check('Generator, SDK, loopback security and runtime guards', process.execPath, ['--test', 'scripts/generate-contracts.test.mjs', 'scripts/generate-agent-contracts.test.mjs', 'tests/fixtures/sdk/ts-sdk.test.mjs', 'tests/fixtures/compat/security.test.mjs', 'tests/fixtures/compat/local-confirmation.test.mjs', 'tests/fixtures/mail/smtp.test.mjs', 'tests/fixtures/mail/runtime.test.mjs', 'tests/fixtures/mail/runtime.integration.test.mjs', 'tests/fixtures/mail/abort.integration.test.mjs', 'tests/fixtures/m2/fixture.test.mjs', 'tests/fixtures/m5-agent/fixture.test.mjs']);
  await check('Frontend TypeScript', process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '-p', 'apps/web/tsconfig.json']);
  await check('Frontend unit and component tests', process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'apps/web/vite.config.ts']);
  await check('Frontend production build', process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'apps/web/vite.config.ts']);
  await withTestSchema(database, scoped => check('Go tests with real isolated PostgreSQL', 'go', ['test', '-count=1', './...'], { MCP_STUDIO_TEST_DATABASE_URL: scoped }));
  await check('Go vet', 'go', ['vet', './...']);
  await mkdir('.runtime', { recursive: true });
  await check('Go production platform build', 'go', ['build', '-o', '.runtime/platform', './cmd/platform']);
  await check('Go production Agent build', 'go', ['build', '-o', '.runtime/agent', './cmd/agent']);
  await check('Go offline administration build', 'go', ['build', '-o', '.runtime/studio-admin', './cmd/studio-admin']);
  await check('Controlled Agent integration fixture build', 'go', ['build', '-o', '.runtime/m5-agent-fixture', './tests/fixtures/m5-agent']);
  const candidate = resolve('.runtime', 'm7-verify-candidate-' + randomBytes(8).toString('hex'));
  const candidateEnv = { MCP_STUDIO_CANDIDATE_DIR: candidate };
  await check('Four-target unsigned Agent candidates', process.execPath, ['packaging/build-agent.mjs'], candidateEnv);
  const operationTests = (await readdir('tests/operations')).filter(name => name.endsWith('.test.mjs')).sort().map(name => 'tests/operations/' + name);
  await check('Deployment, recovery, packaging and real candidate lifecycle', process.execPath, ['--test', ...operationTests], candidateEnv);
  await check('Local platform container candidate build', 'docker', ['build', '-f', 'deploy/Dockerfile', '-t', 'mcp-studio-platform:m7-candidate', '.']);
  await check('Fresh isolated HTTPS deployment, recovery and upgrade', process.execPath, ['scripts/test-deployment.mjs']);
  await runRuntime([], { signal: controller.signal });
  const evidence = process.env.PLAYWRIGHT_EVIDENCE_DIR ?? 'tests/evidence/m7-final';
  await mkdir(evidence, { recursive: true });
  await writeFile(resolve(evidence, 'candidate-location.json'), JSON.stringify({ directory: candidate, gates: 'passed', publication: 'not-authorized', nativeAcceptance: 'pending' }, null, 2) + '\n');
  console.log('[verify] all gates passed');
} catch (error) {
  console.error(`[verify] ${error.message}`);
  process.exitCode = error.exitCode ?? 1;
}
