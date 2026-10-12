import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestDatabaseURL, runChecked } from '../../../scripts/test-runtime.mjs';

test('runtime requires explicit loopback test database using the non-superuser test role', () => {
  for (const value of [undefined, '', 'postgres://postgres:test@127.0.0.1:55432/mcp_studio_test', 'postgres://mcp_studio_app:test@127.0.0.1:55432/production', 'postgres://mcp_studio_app:test@db.example:55432/mcp_studio_test']) {
    assert.throws(() => validateTestDatabaseURL(value), /test database/i);
  }
});

test('gate propagates a failing real subprocess exit status', async () => {
  await assert.rejects(runChecked(process.execPath, ['-e', 'process.exit(7)'], { label: 'synthetic expected failure', quiet: true }), error => error.exitCode === 7);
});
