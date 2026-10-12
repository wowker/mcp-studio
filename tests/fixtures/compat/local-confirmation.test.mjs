import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

test('local terminal displays exact pending identity and only issues code after explicit confirm', { timeout: 10_000 }, async () => {
  const process = spawn(globalThis.process.execPath, [new URL('./local-confirmation.mjs', import.meta.url).pathname], { stdio: ['pipe', 'pipe', 'pipe'] });
  const lines = createInterface({ input: process.stdout })[Symbol.asyncIterator]();
  const next = async () => JSON.parse((await lines.next()).value);
  try {
    const ready = await next();
    const body = { user: 'fixture-user', device: 'fixture-device', capabilities: ['status'] };
    const post = async (path, value) => {
      const r = await fetch(ready.base + path, { method: 'POST', headers: { Origin: 'https://fixture.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
      return { status: r.status, body: await r.json() };
    };
    const pending = await post('/pair/start', body);
    assert.equal(pending.status, 202);
    const id = pending.body.requestId;
    process.stdin.write(`confirm ${id}\n`);
    assert.equal((await next()).type, 'review-required');
    process.stdin.write('show\n');
    const display = await next();
    assert.equal(display.type, 'pending');
    assert.deepEqual(display.requests[0].identity, { origin: 'https://fixture.invalid', ...body });
    assert.equal('code' in display.requests[0], false);
    assert.equal((await post('/pair/complete', { requestId: id, code: 'not-confirmed' })).status, 403);
    process.stdin.write(`confirm ${id}\n`);
    const confirmation = await next();
    assert.equal(confirmation.type, 'local-pairing-code');
    // Pairing code stays in this test's memory; never printed or written to evidence.
    assert.equal((await post('/pair/complete', { requestId: id, code: confirmation.code })).status, 200);
    assert.equal((await post('/pair/complete', { requestId: id, code: confirmation.code })).status, 403);
  } finally {
    const exited = once(process, 'exit');
    process.kill('SIGTERM');
    await exited;
  }
});
