// B1 acceptance evidence for the local edition (A01, A02).
//
// Starts the real local-edition binary (.runtime/local-platform, built with
// `-tags local`) against a fresh temporary data directory with its embedded
// PostgreSQL, then asserts over loopback HTTP — the same form users run:
//   A01: empty/duplicate project names are rejected with field-level errors,
//        a retry after failure creates exactly one maintained project.
//   A02: two projects keep their own connections and records; reading across
//        the project boundary returns not_found, and switching back keeps each
//        project's data intact (project-ownership filtering still applies on
//        the local edition, which skips role checks — methodology R3).
//
// Evidence: tests/evidence/acceptance-b1/local-edition.json.

import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtemp, stat, writeFile, mkdir, rm} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {resolvePGBin} from './local-pg-bin.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const binary = join(repoRoot, '.runtime', 'local-platform');
const evidenceDir = 'tests/evidence/acceptance-b1';
const checks = [];

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

async function waitHealthy(origin, child, getLog, timeoutMs = 360_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`local platform exited early (${child.exitCode}); log:\n${getLog()}`);
    try {
      const res = await fetch(`${origin}/api/v1/health`);
      if (res.ok) return await res.json();
    } catch {}
    if (Date.now() > deadline) throw new Error(`local platform did not become healthy; log:\n${getLog()}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

if (!existsSync(binary)) {
  execFileSync('go', ['build', '-tags', 'local', '-o', binary, './apps/local'], {cwd: repoRoot, stdio: 'inherit'});
}

const root = await mkdtemp(join(tmpdir(), 'mcp-studio-acceptance-b1-'));
let child;
try {
  const pgBin = resolvePGBin(repoRoot);
  const listenPort = await freePort();
  const pgPort = await freePort();
  const dataDir = join(root, 'data');
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
      MCP_STUDIO_ORIGIN: origin,
    },
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  await waitHealthy(origin, child, () => log);

  const call = async (method, path, body) => {
    const res = await fetch(origin + path, {
      method,
      headers: {Origin: origin, 'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {status: res.status, json: text ? JSON.parse(text) : undefined, text};
  };

  // 单机版无登录流程，/session 直接返回本地主体与团队。
  const sessionRes = await call('GET', '/api/v1/session');
  assert.equal(sessionRes.status, 200, `session ${sessionRes.status} ${sessionRes.text}`);
  const session = sessionRes.json.data;
  assert.ok(session?.user?.id, 'local subject present');
  assert.equal(session.csrf, '', 'local edition issues no CSRF token');
  const teamId = session.teams[0].id;
  const base = `/api/v1/teams/${encodeURIComponent(teamId)}/projects`;
  checks.push(`session: local subject ${session.user.id} on team ${teamId}, csrf empty`);

  // ---- A01 ----
  const initialProjects = (await call('GET', base)).json.data;
  const initialCount = initialProjects.length;
  const existing = await call('POST', base, {name: 'Existing'});
  assert.equal(existing.status, 200, `seed project ${existing.text}`);
  const empty = await call('POST', base, {name: '   '});
  assert.equal(empty.status, 400, `empty name ${empty.status}`);
  assert.equal(empty.json?.error?.code, 'name_required', `targeted error ${empty.text}`);
  const duplicate = await call('POST', base, {name: ' existing '});
  assert.equal(duplicate.status, 409, `duplicate name ${duplicate.status}`);
  checks.push('A01: empty name -> 400 name_required; duplicate (trim/case) -> 409');

  const retried = await call('POST', base, {name: 'Retried'});
  assert.equal(retried.status, 200, `retry ${retried.text}`);
  const created = retried.json.data;
  assert.notEqual(created.id, existing.json.data.id, 'retry created a distinct project');
  assert.equal(created.role, 'maintainer', `creator role ${created.role}`);
  assert.equal(created.canManage, true, 'creator can manage');
  assert.equal(created.canRead, true, 'creator can read');

  const listed = (await call('GET', base)).json.data;
  const retriedCount = listed.filter((p) => p.name === 'Retried').length;
  assert.equal(listed.length, initialCount + 2, `project list ${listed.map((p) => p.name)}`);
  assert.equal(retriedCount, 1, `duplicate Retried entries: ${retriedCount}`);
  checks.push(`A01: retry after failure -> one maintained project, no duplicates (${initialCount} seeded + 2)`);

  // ---- A02 ----
  const baseA = `/api/v1/projects/${existing.json.data.id}`;
  const baseB = `/api/v1/projects/${created.id}`;
  const connB = await call('POST', `${baseB}/connections`, {
    name: 'Local B source', transport: 'streamable-http', channel: 'browser',
    endpoint: 'http://localhost:9123/mcp?workspace=demo', args: [], headers: [], env: [],
    timeoutMs: 30000, authMode: 'none', oauthScopes: [],
  });
  assert.equal(connB.status, 200, `connection in B ${connB.text}`);

  const aConnections = (await call('GET', `${baseA}/connections`)).json.data;
  assert.equal(aConnections.length, 0, `A saw B connections: ${JSON.stringify(aConnections)}`);
  const bConnections = (await call('GET', `${baseB}/connections`)).json.data;
  assert.equal(bConnections.length, 1, 'B keeps its own connection');
  assert.equal(bConnections[0].id, connB.json.data.id, 'B connection identity preserved');

  const aRecords = (await call('GET', `${baseA}/records?kind=history`)).json.data;
  assert.equal(aRecords.items.length, 0, `A saw B records: ${JSON.stringify(aRecords.items)}`);
  const unknownRecord = await call('GET', `${baseA}/records/00000000000000000000000000000000`);
  assert.equal(unknownRecord.status, 404, `guessed record id ${unknownRecord.status}`);
  const crossProject = await call('GET', `${baseA}/connections/${connB.json.data.id}`);
  assert.equal(crossProject.status, 404, `cross-project connection read ${crossProject.status}`);

  // 返回 A 时 A 仍为空，B 仍完整 —— 切换不合并、不覆盖。
  const backToA = (await call('GET', `${baseA}/records?kind=history`)).json.data;
  assert.equal(backToA.items.length, 0, 'A still empty after round trip');
  const backToB = (await call('GET', `${baseB}/connections`)).json.data;
  assert.equal(backToB.length, 1, 'B still complete after round trip');
  checks.push('A02: connections/records scoped per project; cross-project reads 404; round trip preserves both');

  const mode = (await stat(dataDir)).mode & 0o777;
  checks.push(`edition: apps/local binary, embedded PG ${pgBin}, loopback ${origin}, data mode ${mode.toString(8)}`);

  await mkdir(evidenceDir, {recursive: true});
  await writeFile(resolve(evidenceDir, 'local-edition.json'), JSON.stringify({
    batch: 'B1',
    edition: 'local',
    binary: '.runtime/local-platform',
    items: ['A01', 'A02'],
    origin,
    checks,
    result: 'pass',
  }, null, 2) + '\n');
  console.log(`[acceptance-b1-local] ${checks.length} groups passed`);
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((ok) => child.once('exit', ok));
  }
  await rm(root, {recursive: true, force: true});
}
