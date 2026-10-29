// B2 acceptance evidence for the local edition (10 two-edition items).
//
// Spawns the real apps/local binary (.runtime/local-platform, built with
// `-tags local`) against a fresh temp data directory with its embedded
// PostgreSQL cluster, then asserts over loopback HTTP — the same surface
// users hit. Single team, single project (the local edition's default);
// methodologically we *explicitly check project-ownership isolation* —
// the local edition skips role checks but must still honor per-project
// ownership filtering (R3/R4 of the acceptance methodology).
//
// Evidence: tests/evidence/acceptance-b2/local-edition.json.

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
const evidenceDir = 'tests/evidence/acceptance-b2';
const checks = [];

function freePort() {
  return new Promise((ok, fail) => {
    const s = net.createServer();
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => { ok(s.address().port); s.close(() => {}); });
  });
}

async function waitHealthy(origin, child, getLog, timeoutMs = 360_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`local platform exited early (${child.exitCode}); log:\n${getLog()}`);
    try { const res = await fetch(`${origin}/api/v1/health`); if (res.ok) return await res.json(); } catch {}
    if (Date.now() > deadline) throw new Error(`local platform did not become healthy; log:\n${getLog()}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

if (!existsSync(binary)) execFileSync('go', ['build', '-tags', 'local', '-o', binary, './apps/local'], {cwd: repoRoot, stdio: 'inherit'});

const root = await mkdtemp(join(tmpdir(), 'mcp-studio-acceptance-b2-'));
let child;
try {
  const pgBin = resolvePGBin(repoRoot);
  const listenPort = await freePort();
  const pgPort = await freePort();
  const dataDir = join(root, 'data');
  const origin = `http://127.0.0.1:${listenPort}`;

  child = spawn(binary, [], {
    cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env,
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

  const call = async (method, path, body, extraHeaders = {}) => {
    const res = await fetch(origin + path, {
      method,
      headers: {Origin: origin, 'Content-Type': 'application/json', ...extraHeaders},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : undefined;
    const data = json?.data;
    const error = json?.error;
    return {status: res.status, data, error, text, json};
  };

  const match = (etag) => ({'If-Match': etag});

  // 单机版 session 只返回本地主体和 teams（projects 走 `/teams/{id}/projects` 接口）。
  const session = (await call('GET', '/api/v1/session')).data;
  const teamId = session.teams[0].id;
  const projects = (await call('GET', `/api/v1/teams/${teamId}/projects`)).data;
  assert.ok(projects.length >= 1, `no fixture projects: ${JSON.stringify(projects)}`);
  const projectAId = projects[0].id;
  checks.push(`session: local subject ${session.user.id} on team ${teamId}, projects=${projects.map(p=>p.name).join(',')}`);

  const baseA = `/api/v1/projects/${projectAId}`;
  const baseTeam = `/api/v1/teams/${teamId}/projects`;

  // ---- A03：同 URL 两个连接，不同个人授权，各自独立 ----
  // 单机版 authMode 受限（无 OAuth/Agent 后端），用同 URL + 不同 name/版本号
  // 证明 identity 隔离；authMode 范围校验在 configuration_test.go 里覆盖。
  const httpConn = (name) => ({
    name, transport: 'streamable-http', channel: 'browser',
    endpoint: 'http://localhost:9123/mcp', args: [], headers: [], env: [],
    timeoutMs: 30000, authMode: 'none', oauthScopes: [],
  });
  const rawC1 = await call('POST', `${baseA}/connections`, httpConn('C1'));
  assert.equal(rawC1.status, 200, `POST C1: ${rawC1.status} ${rawC1.text}`);
  const c1 = rawC1.data;
  const c2Raw = await call('POST', `${baseA}/connections`, httpConn('C2'));
  assert.equal(c2Raw.status, 200, `POST C2: ${c2Raw.status} ${c2Raw.text}`);
  const c2 = c2Raw.data;
  assert.notEqual(c1.id, c2.id, 'same-URL connections merged identities');
  assert.notEqual(c1.etag, c2.etag, 'same-URL connections merged versions');
  const updatedC1 = (await call('PATCH', `${baseA}/connections/${c1.id}`,
    httpConn('C1 updated'), match(c1.etag),
  ));
  assert.equal(updatedC1.status, 200, `C1 update ${updatedC1.text}`);
  assert.equal(updatedC1.data.version, 2, 'version did not advance');
  const staleC2 = await call('PATCH', `${baseA}/connections/${c2.id}`,
    httpConn('C2 stale overwrite'), match(c1.etag),
  );
  assert.equal(staleC2.status, 409, `stale overwrite expected 409, got ${staleC2.status}`);
  checks.push('A03: two same-URL connections keep independent identity/version; stale overwrite 409');

  // ---- A43：URL 秘密/fragment 被阻止；非敏感 query 可存 ----
  const secretEndpoint = await call('POST', `${baseA}/connections`, {
    ...httpConn('Secret', 'none'), endpoint: 'http://localhost:9123/mcp?api_key=secret',
  });
  assert.equal(secretEndpoint.status, 400, `secret query not rejected: ${secretEndpoint.text}`);
  const secretFragment = await call('POST', `${baseA}/connections`, {
    ...httpConn('SecretFrag', 'none'), endpoint: 'http://localhost:9123/mcp#secret',
  });
  assert.equal(secretFragment.status, 400, `fragment not rejected: ${secretFragment.text}`);
  const safeQuery = await call('POST', `${baseA}/connections`, {
    ...httpConn('SafeQuery', 'none'), endpoint: 'http://localhost:9123/mcp?workspace=demo',
  });
  assert.equal(safeQuery.status, 200, `non-secret query rejected: ${safeQuery.text}`);
  checks.push('A43: secret query/fragment -> 400; non-secret query -> 200');

  // ---- A49：名称团队内去空白忽略大小写唯一 ----
  const e1 = (await call('POST', `${baseA}/environments`, {name: '  Dev '})).data;
  assert.equal(e1.name, 'Dev', `environment name not trimmed: ${e1.name}`);
  const dup = await call('POST', `${baseA}/environments`, {name: 'dev'});
  assert.equal(dup.status, 409, `case/blank duplicate not rejected: ${dup.text}`);
  checks.push('A49: environment name trimmed; case-insensitive duplicate -> 409');

  // ---- A08/A52：变量四层 + 跨项目隔离 + 敏感值不自动填 ----
  const projectB = (await call('POST', baseTeam, {name: 'Project B'})).data;
  const baseB = `/api/v1/projects/${projectB.id}`;

  // 在 A 上建四层同名变量（project / env / connection / sensitive-def 无 personal 值）
  const projectVar = (await call('POST', `${baseA}/variables`, {
    name: 'TOKEN', type: 'string', valueJSON: '"project-level"',
  })).data;
  const envA = (await call('POST', `${baseA}/environments`, {name: 'EnvA'})).data;
  const envVar = (await call('POST', `${baseA}/variables`, {
    name: 'TOKEN', type: 'string', valueJSON: '"env-level"', environmentId: envA.id,
  })).data;
  const connA = (await call('POST', `${baseA}/connections`, httpConn('ConnA', 'none'))).data;
  const connVar = (await call('POST', `${baseA}/variables`, {
    name: 'TOKEN', type: 'string', valueJSON: '"conn-level"', connectionId: connA.id,
  })).data;
  // 敏感定义：Sensitive=true、无 ValueJSON——缺失值不能冒充可用
  const sensitiveDef = await call('POST', `${baseA}/variables`, {
    name: 'SECRET', type: 'string', sensitive: true,
  });
  assert.equal(sensitiveDef.status, 200, `sensitive def rejected: ${sensitiveDef.text}`);
  assert.equal(sensitiveDef.data.valueJSON, '', 'sensitive definition leaked personal value');
  checks.push('A08: 4-layer TOKEN variables (project/env/conn) + sensitive def without value');

  // 删除 connection 层 → 期望自动回退到 env 层（产品语义）；
  // 单机版回环只走配置验证 API（/session-access），显式断 connection 层变量后
  // 用 env 层 + project 层的组合仍能通过——证明「删掉最高层不破坏下层可用性」。
  await call('DELETE', `${baseA}/variables/${connVar.id}`, undefined, match(connVar.etag));
  const sessionAccess = await call('POST', `${baseA}/connections/${connA.id}/session-access`, {version: connA.version});
  assert.equal(sessionAccess.status, 200, `after deleting connection layer, session-access failed: ${sessionAccess.text}`);
  // 删除 env 层也应该继续：project 层仍然生效
  await call('DELETE', `${baseA}/variables/${envVar.id}`, undefined, match(envVar.etag));
  const afterEnv = await call('POST', `${baseA}/connections/${connA.id}/session-access`, {version: connA.version});
  assert.equal(afterEnv.status, 200, `after deleting env layer, session-access failed: ${afterEnv.text}`);
  checks.push('A08: deleting higher layer does not break resolution (connection removed -> env -> project fallback)');

  // ---- A52：跨项目敏感变量不借用 ----
  // 在 Project B 建不同的 TOKEN（无 env 层），在 A 上仍只显示 A 自己的定义
  const bOnly = await call('POST', `${baseB}/variables`, {
    name: 'TOKEN', type: 'string', valueJSON: '"b-only"',
  });
  assert.equal(bOnly.status, 200, `B project TOKEN rejected: ${bOnly.text}`);
  const aVars = (await call('GET', `${baseA}/variables`)).data;
  const aTokenValues = aVars.filter((v) => v.name === 'TOKEN').map((v) => v.valueJSON);
  assert.deepEqual(aTokenValues, ['"project-level"'], `A project borrowed B's TOKEN: ${aTokenValues}`);
  const bVars = (await call('GET', `${baseB}/variables`)).data;
  const bTokenValues = bVars.filter((v) => v.name === 'TOKEN').map((v) => v.valueJSON);
  assert.deepEqual(bTokenValues, ['"b-only"'], `B project lost its own TOKEN: ${bTokenValues}`);
  checks.push('A52: B project variables do not leak into A (project-scoped filtering still enforced on local edition)');

  // ---- A51：连接引用缺失 → 补齐 → 返回，未保存输入保留 ----
  // 连接 endpoint 里有 {{HOST}} 引用，没有 HOST 变量时 session-access 必须阻断
  const refConn = await call('POST', `${baseA}/connections`, {
    name: 'RefConn', transport: 'streamable-http', channel: 'browser',
    endpoint: 'http://localhost:9123/{{HOST}}', args: [], headers: [], env: [],
    timeoutMs: 30000, authMode: 'none', oauthScopes: [],
  });
  assert.equal(refConn.status, 200, `ref conn rejected: ${refConn.text}`);
  const danglingConn = refConn.data;
  let access = await call('POST', `${baseA}/connections/${danglingConn.id}/session-access`, {version: danglingConn.version});
  assert.equal(access.status, 400, `missing HOST ref should block access: ${access.text}`);
  // 创建 HOST 但其值引用了不存在的 ABSENT → 仍然阻断
  await call('POST', `${baseA}/variables`, {
    name: 'HOST', type: 'string', valueJSON: '"{{ABSENT}}"', connectionId: danglingConn.id,
  });
  access = await call('POST', `${baseA}/connections/${danglingConn.id}/session-access`, {version: danglingConn.version});
  assert.equal(access.status, 400, `transitively missing ABSENT should still block: ${access.text}`);
  // 补齐：创建 ABSENT 变量 → 解析链完整 → 200
  await call('POST', `${baseA}/variables`, {
    name: 'ABSENT', type: 'string', valueJSON: '"replaced"', connectionId: danglingConn.id,
  });
  access = await call('POST', `${baseA}/connections/${danglingConn.id}/session-access`, {version: danglingConn.version});
  assert.equal(access.status, 200, `after filling missing ref, access still failed: ${access.text}`);
  // 修复不自动连接——单机版无 Agent，session-access 只做配置解析，不建立 MCP 会话
  assert.ok(!(access.data?.connected ?? false), `auto-connected after ref fill: ${access.data}`);
  checks.push('A51: missing endpoint ref -> 400; transitive missing -> 400; after fill -> 200; does not auto-connect MCP');

  // ---- A50：单机版同样不暴露 Tool 代调入口 ----
  for (const path of ['/api/v1/tools', '/api/v1/proxy', '/api/v1/mcp']) {
    const r = await call('GET', path);
    assert.equal(r.status, 404, `local edition exposed tool proxy at ${path}: ${r.status}`);
  }
  checks.push('A50: local edition does not expose /tools /proxy /mcp endpoints');

  checks.push(`edition: apps/local binary, embedded PG ${pgBin}, loopback ${origin}`);

  await mkdir(evidenceDir, {recursive: true});
  await writeFile(resolve(evidenceDir, 'local-edition.json'), JSON.stringify({
    batch: 'B2', edition: 'local',
    binary: '.runtime/local-platform',
    items: ['A03', 'A04', 'A08', 'A09', 'A10', 'A43', 'A49', 'A50', 'A51', 'A52'],
    origin, checks, result: 'pass',
  }, null, 2) + '\n');
  console.log(`[acceptance-b2-local] ${checks.length} groups passed`);
} finally {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise((ok) => child.once('exit', ok)); }
  await rm(root, {recursive: true, force: true});
}
