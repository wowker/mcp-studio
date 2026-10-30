import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runChecked } from '../../../scripts/test-runtime.mjs';

// Removing the bounded EPERM wait must fail the transient case. Treating EPERM
// as proof of disappearance must fail the persistent case. Signal denials must
// never be mistaken for completed cleanup. Only our actual fixture group is mocked.
async function permissionCase(t, mode, check) {
  const dir = await mkdtemp(join(tmpdir(), 'studio-permission-'));
  const ready = join(dir, 'ready.json'), controller = new AbortController();
  const nativeKill = process.kill;
  let ids, deniedProbes = 0, escalationSent = false, deniedSignal = false;
  t.mock.method(process, 'kill', function(pid, signal) {
    if (ids && pid === -ids.parent) {
      if (signal === 'SIGKILL' && mode === 'signal-denied') {
        deniedSignal = true;
        throw Object.assign(new Error('controlled signal permission refusal'), { code: 'EPERM' });
      }
      if (signal === 0 && (mode === 'persistent' || mode === 'transient' && escalationSent && deniedProbes < 2)) {
        deniedProbes++;
        throw Object.assign(new Error('controlled existence permission refusal'), { code: 'EPERM' });
      }
    }
    const result = nativeKill.call(process, pid, signal);
    if (ids && pid === -ids.parent && signal === 'SIGKILL') escalationSent = true;
    return result;
  });
  const descendant = `const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({parent:process.ppid,child:process.pid}));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setInterval(()=>{},1000);`;
  const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)},process.argv[1]],{stdio:'ignore'});setInterval(()=>{},1000);`;
  const running = runChecked(process.execPath, ['-e', parent, ready], { quiet: true, signal: controller.signal });
  const observed = running.then(() => null, error => error);
  try {
    const deadline = Date.now() + 8000;
    while (!ids && Date.now() < deadline) {
      try { ids = JSON.parse(await readFile(ready, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; await new Promise(done => setTimeout(done, 25)); }
    }
    assert.ok(ids, 'descendant did not become ready');
    const started = performance.now();
    controller.abort();
    const error = await observed;
    await check({ error, elapsed: performance.now() - started, ids, deniedProbes, escalationSent, deniedSignal, nativeKill });
  } finally {
    controller.abort();
    await observed;
    t.mock.restoreAll();
    // The signal-denied case deliberately leaves our child alive until this
    // point. Kill only the PIDs recorded by this synthetic fixture, then confirm.
    for (const pid of [ids?.child, ids?.parent]) if (pid) {
      try { nativeKill.call(process, pid, 'SIGKILL'); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
    if (ids) {
      const deadline = Date.now() + 2000;
      while (true) {
        try { nativeKill.call(process, -ids.parent, 0); }
        catch (error) { if (error.code === 'ESRCH') break; if (error.code !== 'EPERM') throw error; }
        assert.ok(Date.now() < deadline, 'owned fixture group remained after final cleanup');
        await new Promise(done => setTimeout(done, 25));
      }
    }
    await rm(dir, { recursive: true, force: true });
  }
}

test('abort waits through transient existence EPERM after real SIGKILL until the owned group is gone', { timeout: 20000 }, t => permissionCase(t, 'transient', ({ error, ids, deniedProbes, escalationSent, nativeKill }) => {
  assert.equal(error.exitCode, 130);
  assert.equal(escalationSent, true);
  assert.equal(deniedProbes, 2, 'cleanup must continue after each unavailable existence probe');
  assert.throws(() => nativeKill.call(process, -ids.parent, 0), { code: 'ESRCH' });
  assert.throws(() => nativeKill.call(process, ids.child, 0), { code: 'ESRCH' });
}));

test('persistent existence EPERM fails closed at the original cleanup deadline', { timeout: 20000 }, t => permissionCase(t, 'persistent', ({ error, elapsed, deniedProbes }) => {
  assert.match(error.message, /process cleanup could not be confirmed/);
  assert.notEqual(error.exitCode, 130);
  assert.ok(elapsed >= 10000, 'permission refusal cannot confirm disappearance or shorten the drain deadline');
  assert.ok(elapsed < 13000, 'permission refusal cannot extend the original bounded cleanup wait');
  assert.ok(deniedProbes > 1);
}));

test('actual escalation permission denial fails closed while the owned descendant remains alive', { timeout: 20000 }, t => permissionCase(t, 'signal-denied', ({ error, ids, deniedSignal, nativeKill }) => {
  assert.match(error.message, /process cleanup could not be confirmed/);
  assert.notEqual(error.exitCode, 130);
  assert.equal(deniedSignal, true);
  assert.doesNotThrow(() => nativeKill.call(process, ids.child, 0));
}));
