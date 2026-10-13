import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { startM2Fixture } from '../tests/fixtures/m2/fixture.mjs';
import { temporaryTLS, tlsTerminator } from '../tests/fixtures/m2/tls.mjs';
import net from 'node:net';
import { startMailCapture } from '../tests/fixtures/mail/smtp.mjs';

export function validateTestDatabaseURL(value) {
  try {
    if (!value) throw Error();
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username !== 'mcp_studio_app' || url.pathname !== '/mcp_studio_test') throw Error();
    return url;
  } catch { throw new Error('Explicit loopback test database required: MCP_STUDIO_TEST_DATABASE_URL, database mcp_studio_test, role mcp_studio_app (non-superuser).'); }
}

export async function runChecked(command, args, { label = command, quiet = false, env = {}, signal } = {}) {
  if (!quiet) console.log(`[verify] ${label}`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: quiet ? 'ignore' : 'inherit', env: { ...process.env, ...env }, signal });
    child.once('error', error => reject(Object.assign(new Error(`${label}: process could not start (${error.code ?? 'error'})`), { exitCode: signal?.aborted ? 130 : 1 })));
    child.once('exit', (code, childSignal) => {
      if (code === 0) resolve();
      else reject(Object.assign(new Error(`${label}: failed with ${childSignal ?? `exit ${code}`}`), { exitCode: code ?? 130 }));
    });
  });
}

export async function queryTestDatabase(value, sql) {
  const url = validateTestDatabaseURL(value);
  // The existing disposable test container is only a transport; PostgreSQL authenticates as app role.
  // --env without a value prevents the test password from entering argv or logs.
  return await new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', '--env', 'PGPASSWORD', process.env.MCP_STUDIO_TEST_CONTAINER ?? 'mcp-studio-m1-pg', 'psql', '-X', '-h', '127.0.0.1', '-U', url.username, '-d', url.pathname.slice(1), '-v', 'ON_ERROR_STOP=1', '-Atq'], { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.resume(); // Never include SQL or credentials in a failure report.
    child.once('error', () => reject(new Error('Test database SQL transport unavailable.')));
    child.once('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`Test database SQL failed (exit ${code}).`)));
    child.stdin.on('error', () => {});
    child.stdin.end(sql + '\n');
  });
}

export async function withTestSchema(value, run) {
  const url = validateTestDatabaseURL(value);
  const role = await queryTestDatabase(url.href, "SELECT current_user || ':' || rolsuper::text FROM pg_roles WHERE rolname=current_user");
  if (role !== 'mcp_studio_app:false') throw new Error('Test database role must be mcp_studio_app and non-superuser.');
  const schema = 'e2e_' + randomBytes(12).toString('hex');
  await queryTestDatabase(url.href, `CREATE SCHEMA "${schema}"`);
  url.searchParams.set('search_path', schema);
  try { return await run(url.href); }
  finally {
    await queryTestDatabase(value, `DROP SCHEMA "${schema}" CASCADE`);
    console.log('[test-runtime] isolated schema removed');
  }
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function stopProcess(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function ready(origin, platform, signal) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw Object.assign(new Error('Test runtime interrupted.'), { exitCode: 130 });
    if (platform.exitCode !== null || platform.signalCode !== null) throw new Error('Test platform exited before becoming healthy.');
    try { const response = await fetch(origin + '/api/v1/health', { signal: AbortSignal.timeout(1000) }); if (response.status === 200 && (await response.json()).data?.status === 'ok') return; } catch { /* Startup may still be migrating. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Test platform health readiness timed out.');
}

export async function runRuntime(args = [], { signal } = {}) {
  const database = process.env.MCP_STUDIO_TEST_DATABASE_URL;
  validateTestDatabaseURL(database);
  await access('.runtime/platform');
  await access('apps/web/dist/index.html');
  return withTestSchema(database, async scopedDatabase => {
    const mail = await startMailCapture();
    let platform, certificate, terminator, mcp, oauth;
    try {
      const port = await freePort();
      certificate = await temporaryTLS();
      terminator = await tlsTerminator(certificate.options, port);
      const origin = terminator.origin;
      mcp = await startM2Fixture({ allowedOrigin: origin });
      oauth = await startM2Fixture({ allowedOrigin: origin, tls: certificate.options, publicHostname: 'localhost' });
      platform = spawn('.runtime/platform', [], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, MCP_STUDIO_DATABASE_URL: scopedDatabase, MCP_STUDIO_ORIGIN: origin, MCP_STUDIO_LISTEN: `127.0.0.1:${port}`, MCP_STUDIO_ALLOW_INSECURE_LOOPBACK: 'true', MCP_STUDIO_INIT_CREDENTIAL: 'fixture-init', MCP_STUDIO_SMTP_ADDRESS: mail.smtpAddress, MCP_STUDIO_SMTP_FROM: 'studio@example.test', MCP_STUDIO_STATIC_DIR: 'apps/web/dist' } });
      let spawnError;
      platform.once('error', () => { spawnError = true; });
      await ready(`http://127.0.0.1:${port}`, platform, signal);
      if (spawnError) throw new Error('Test platform failed to start.');
      console.log('[test-runtime] production platform + TLS terminator + SMTP + controlled MCP/OAuth fixtures ready');
      await runChecked(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts', ...args], { label: 'Playwright production-entry E2E', signal, env: { PLAYWRIGHT_BASE_URL: origin, PLAYWRIGHT_INIT_CREDENTIAL: 'fixture-init', PLAYWRIGHT_MAIL_URL: mail.url, PLAYWRIGHT_MCP_ORIGIN: mcp.origin, PLAYWRIGHT_OAUTH_ORIGIN: oauth.origin, PLAYWRIGHT_FIXTURE_TLS: 'true' } });
    } finally {
      try { await stopProcess(platform); }
      finally {
        const dir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/m2-playwright';
        await mkdir(dir,{recursive:true});
        if(mcp&&oauth)await writeFile(`${dir}/fixture-statistics.json`,JSON.stringify({mcp:mcp.stats,oauth:oauth.stats,tls:'Temporary self-signed certificate, browser ignoreHTTPSErrors only; no CORS/mixed-content/LNA bypass',supportMatrix:'T02 remains pending'},null,2)+'\n');
        await mcp?.close(); await oauth?.close(); await terminator?.close(); await certificate?.close();
        await mail.close(); console.log('[test-runtime] platform, mail, MCP, OAuth and temporary TLS fixtures stopped');
      }
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => controller.abort());
  try { await runRuntime(process.argv.slice(2), { signal: controller.signal }); }
  catch (error) { console.error(error.message); process.exitCode = error.exitCode ?? 1; }
}
