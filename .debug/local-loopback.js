// .debug/local-loopback.js - macOS local edition full chain verification
// Usage: node .debug/local-loopback.js
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const ROOT = '/Users/wuwei/code/github/mcp-studio';
const PG_BIN = `${ROOT}/.runtime/pg-brew/postgresql@18/18.6_1/bin`;
const BIN = `${ROOT}/.runtime/local-platform`;
const BASE = 'http://127.0.0.1:8080';
const OUT = `${ROOT}/tests/evidence/acceptance-b9/local-edition.json`;

const env = { ...process.env, PATH: `${PG_BIN}:${envPath()}` };
function envPath() {
  const p = process.env.PATH || '';
  const nv = '/Users/wuwei/.nvm/versions/node/v24.21.0/bin';
  return nv + ':' + p;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpReq(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, BASE);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, headers: { 'Accept': 'application/json' }
    };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    if (cookie) opts.headers['Cookie'] = cookie;
    const req = http.request(opts, (res) => {
      let data = '';
      let setCookie = res.headers['set-cookie'];
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed ?? data, raw: data, setCookie });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const startMs = Date.now();
  const results = { time: new Date().toISOString(), steps: [], exit: null };

  // --- Start ---
  console.log('Starting local-platform...');
  const child = spawn(BIN, [], { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stdout.on('data', d => process.stdout.write(`[LP] ${d}`));
  child.stderr.on('data', d => process.stderr.write(`[LP-ERR] ${d}`));
  child.unref();

  // --- Wait ready ---
  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    try {
      const r = await httpReq('GET', '/api/v1/health');
      if (r.status === 200 && r.body?.data?.status === 'ok') {
        ready = true;
        results.steps.push({ name: 'startup', status: 'ok', health: r.body, durationMs: Date.now() - startMs });
        console.log(`✓ Startup OK after ${Date.now() - startMs}ms`);
        break;
      }
    } catch (_) {}
  }
  if (!ready) {
    results.exit = 'startup_timeout';
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    console.error('✗ Startup timeout');
    process.exit(1);
  }

  let cookie = null;
  const step = async (name, fn) => {
    try {
      const r = await fn();
      results.steps.push({ name, status: 'ok', ...r });
      console.log(`✓ ${name}: ${r.summary ?? JSON.stringify(r.body ?? r.status)}`);
      return r;
    } catch (e) {
      results.steps.push({ name, status: 'error', error: String(e) });
      console.error(`✗ ${name}: ${e.message}`);
    }
  };

  // --- Bootstrap check ---
  await step('bootstrap_check', async () => {
    const r = await httpReq('GET', '/api/v1/bootstrap');
    return { status: r.status, body: r.body };
  });

  // --- Initialize ---
  await step('initialize', async () => {
    const r = await httpReq('POST', '/api/v1/initialize', JSON.stringify({
      credential: 'local-dev-init',
      email: 'owner@local.dev',
      name: 'Local Owner',
      password: 'LocalP@ss123!',
      teamName: 'Local Team'
    }));
    return { status: r.status, body: r.body };
  });

  // --- Bootstrap after init ---
  await step('bootstrap_after', async () => {
    const r = await httpReq('GET', '/api/v1/bootstrap');
    return { status: r.status, body: r.body };
  });

  // --- Login ---
  await step('login', async () => {
    const r = await httpReq('POST', '/api/v1/login', JSON.stringify({
      email: 'owner@local.dev', password: 'LocalP@ss123!'
    }));
    if (r.setCookie) cookie = r.setCookie.map(c => c.split(';')[0]).join('; ');
    return { status: r.status, cookieSet: !!cookie };
  });

  // --- Current subject ---
  await step('auth_current', async () => {
    const r = await httpReq('GET', '/api/v1/auth/current', null, cookie);
    return { status: r.status, body: r.body, summary: r.body?.data?.user?.email ?? r.body?.error?.code };
  });

  // --- Projects ---
  await step('projects_list', async () => {
    const r = await httpReq('GET', '/api/v1/projects', null, cookie);
    const count = r.body?.data?.length ?? 0;
    return { status: r.status, count, summary: `${count} projects` };
  });

  // --- Connections ---
  await step('connections_list', async () => {
    const r = await httpReq('GET', '/api/v1/connections', null, cookie);
    const count = r.body?.data?.length ?? 0;
    return { status: r.status, count };
  });

  // --- Configuration ---
  await step('configuration_get', async () => {
    const r = await httpReq('GET', '/api/v1/configuration', null, cookie);
    return { status: r.status };
  });

  // --- Records ---
  await step('records_list', async () => {
    const r = await httpReq('GET', '/api/v1/records', null, cookie);
    return { status: r.status };
  });

  // --- Agent health ---
  await step('agent_health', async () => {
    const r = await httpReq('GET', '/api/v1/agent/health', null, cookie);
    return { status: r.status };
  });

  // --- Agent platforms ---
  await step('agent_platforms', async () => {
    const r = await httpReq('GET', '/api/v1/agent/platforms', null, cookie);
    return { status: r.status };
  });

  results.exit = 'completed';
  results.totalSteps = results.steps.length;
  results.okSteps = results.steps.filter(s => s.status === 'ok').length;
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`\nDone: ${results.okSteps}/${results.totalSteps} ok. Saved to ${OUT}`);

  // --- Stop ---
  process.kill(child.pid, 'SIGTERM');
  child.on('exit', () => console.log('Child exited'));
  setTimeout(() => process.exit(0), 2000);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
