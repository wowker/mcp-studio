// Local edition smoke gate (E09a).
//
// Runs the local-edition binary built by verify.mjs (.runtime/local-platform)
// against a fresh temporary data directory and asserts:
//   1. initdb ran        — PG_VERSION exists in the new data directory
//   2. permissions       — the data directory mode is exactly 0700
//   3. health check      — GET /api/v1/health returns 200 with status ok
//   4. graceful shutdown — SIGTERM exits 0 and leaves no postmaster.pid
//
// PostgreSQL binaries resolve through scripts/local-pg-bin.mjs (env, PATH,
// repo cache); missing binaries fail the gate loudly — nothing is skipped.

import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, stat, writeFile, mkdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {resolvePGBin} from './local-pg-bin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const binary = join(repoRoot, '.runtime', 'local-platform');
const evidenceDir = process.env.PLAYWRIGHT_EVIDENCE_DIR ?? 'tests/evidence/e09-local-edition';

const startedAt = Date.now();
const report = {edition: 'local', binary: '.runtime/local-platform', checks: []};

function freePort() {
  return new Promise((ok, fail) => {
    const server = net.createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => ok(port));
    });
  });
}

// Budget must exceed startCluster's PG retry window (default 5m on macOS, see
// pgStartTimeout in internal/platform/local_pg.go) plus server boot time.
async function waitHealthy(origin, child, getLog, timeoutMs = 360_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`local platform exited early (${child.exitCode}); log:\n${getLog()}`);
    try {
      const res = await fetch(`${origin}/api/v1/health`);
      if (res.ok) return await res.json();
    } catch {}
    if (Date.now() > deadline) throw new Error(`local platform did not become healthy in time; log:\n${getLog()}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

const root = await mkdtemp(join(tmpdir(), 'mcp-studio-local-smoke-'));
let child;
try {
  const pgBin = resolvePGBin(repoRoot);
  report.pgBin = pgBin;
  const listenPort = await freePort();
  const pgPort = await freePort();
  const dataDir = join(root, 'data'); // intentionally absent: initdb must create it
  const origin = `http://127.0.0.1:${listenPort}`;

  child = spawn(binary, [], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      MCP_STUDIO_LOCAL_DATA_DIR: dataDir,
      MCP_STUDIO_LOCAL_PG_BIN: pgBin,
      MCP_STUDIO_LOCAL_PG_PORT: String(pgPort),
      MCP_STUDIO_LISTEN: `127.0.0.1:${listenPort}`,
    },
  });
  let childLog = '';
  child.stdout.on('data', (d) => { childLog += d; });
  child.stderr.on('data', (d) => { childLog += d; });

  const health = await waitHealthy(origin, child, () => childLog);
  assert.equal(health?.data?.status, 'ok', 'health status');
  report.checks.push('health: GET /api/v1/health 200 {"status":"ok"}');

  assert.ok(existsSync(join(dataDir, 'PG_VERSION')), 'initdb created PG_VERSION');
  report.checks.push('initdb: PG_VERSION present in fresh data directory');

  const mode = (await stat(dataDir)).mode & 0o777;
  assert.equal(mode, 0o700, `data directory mode ${mode.toString(8)}`);
  report.checks.push('permissions: data directory mode 0700');

  child.kill('SIGTERM');
  const code = await new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error('local platform did not exit on SIGTERM')), 30_000);
    child.once('exit', (c) => { clearTimeout(timer); ok(c); });
  });
  assert.equal(code, 0, `graceful shutdown exit code ${code}; log:\n${childLog}`);
  assert.ok(!existsSync(join(dataDir, 'postmaster.pid')), 'postmaster.pid removed after pg_ctl stop');
  report.checks.push('shutdown: SIGTERM exit 0, no stale postmaster.pid');

  report.durationMs = Date.now() - startedAt;
  report.result = 'pass';
  await mkdir(evidenceDir, {recursive: true});
  await writeFile(resolve(evidenceDir, 'local-edition-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[local-smoke] ${report.checks.length} checks passed in ${report.durationMs}ms (pg: ${pgBin})`);
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  await rm(root, {recursive: true, force: true});
}
