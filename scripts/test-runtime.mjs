import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { startM5Agent } from '../tests/fixtures/m5-agent/fixture.mjs';
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
  if (signal?.aborted) throw Object.assign(new Error(`${label}: interrupted`), { exitCode: 130 });
  await new Promise((resolve, reject) => {
    const group = process.platform !== 'win32';
    const child = spawn(command, args, { detached: group, stdio: quiet ? 'ignore' : 'inherit', env: { ...process.env, ...env } });
    let started = false, interrupted = false, failure, timer;
    const kill = kind => { try { if (group) process.kill(-child.pid, kind); else child.kill(kind); } catch (error) { if (error.code !== 'ESRCH') failure = new Error(`${label}: process termination unavailable`); } };
    const stop = () => {
      interrupted = true;
      if (!started) return;
      kill('SIGTERM');
      timer ??= setTimeout(() => kill('SIGKILL'), 5000);
    };
    signal?.addEventListener('abort', stop, { once: true });
    child.once('spawn', () => { started = true; if (signal?.aborted) stop(); });
    child.once('error', error => { failure = Object.assign(new Error(`${label}: process could not start (${error.code ?? 'error'})`), { exitCode: 1 }); });
    // The leader may exit before its descendants. Keep escalation armed until
    // the owned group disappears; database cleanup must not race a live child.
    const drainGroup = async () => {
      if (!group || !started) return;
      const deadline = Date.now() + 10000;
      while (true) {
        try { process.kill(-child.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') return; throw new Error(`${label}: process cleanup could not be confirmed`); }
        if (Date.now() >= deadline) throw new Error(`${label}: process cleanup could not be confirmed`);
        await new Promise(done => setTimeout(done, 25));
      }
    };
    child.once('close', async (code, childSignal) => {
      signal?.removeEventListener('abort', stop);
      if (interrupted || signal?.aborted || code !== 0) {
        if (started && !timer) { kill('SIGTERM'); timer = setTimeout(() => kill('SIGKILL'), 5000); }
        try { await drainGroup(); } catch (error) { failure = error; }
      }
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (interrupted || signal?.aborted) reject(Object.assign(new Error(`${label}: interrupted after process cleanup`), { exitCode: 130 }));
      else if (code === 0) resolve();
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
  const role = await queryTestDatabase(url.href, "SELECT current_user || ':' || (rolsuper OR rolbypassrls)::text FROM pg_roles WHERE rolname=current_user");
  if (role !== 'mcp_studio_app:false') throw new Error('Test database role must be mcp_studio_app and non-superuser.');
  const schema = 'e2e_' + randomBytes(12).toString('hex');
  const oid = await queryTestDatabase(url.href, `BEGIN; CREATE SCHEMA "${schema}"; COMMENT ON SCHEMA "${schema}" IS 'mcp-studio-test-run:${schema}'; COMMIT; SELECT oid FROM pg_namespace WHERE nspname='${schema}'`);
  if (!/^[1-9]\d*$/.test(oid)) throw new Error('Test run ownership unavailable.');
  url.searchParams.set('search_path', schema);
  let primaryError, callbackFailed = false;
  try { return await run(url.href); }
  catch (error) { primaryError = error; callbackFailed = true; throw error; }
  finally {
    // No prefix sweep: require the exact lease, namespace, owner and object identity.
    try { await queryTestDatabase(value, `BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('${schema}',0));
DO $cleanup$ DECLARE owned record; parent_oid oid; owner_oid oid; BEGIN
 SELECT oid INTO owner_oid FROM pg_roles WHERE rolname=current_user AND NOT rolsuper AND NOT rolbypassrls;
 SELECT oid INTO parent_oid FROM pg_namespace WHERE nspname='${schema}' AND nspowner=owner_oid AND obj_description(oid,'pg_namespace')='mcp-studio-test-run:${schema}';
 IF parent_oid IS DISTINCT FROM ${oid}::oid THEN RAISE EXCEPTION 'Test run ownership changed; cleanup refused'; END IF;
 COMMENT ON SCHEMA "${schema}" IS 'mcp-studio-test-closing:${schema}';
 FOR owned IN SELECT oid,nspname,nspowner FROM pg_namespace WHERE obj_description(oid,'pg_namespace')='mcp-studio-test-child:${schema}' LOOP
  IF owned.nspowner IS DISTINCT FROM owner_oid OR owned.nspname !~ '^test_${schema.slice(4)}_[a-f0-9]{24}$' THEN RAISE EXCEPTION 'Test child ownership changed; cleanup refused'; END IF;
  IF (SELECT oid FROM pg_namespace WHERE nspname=owned.nspname) IS DISTINCT FROM owned.oid THEN RAISE EXCEPTION 'Test child identity changed; cleanup refused'; END IF;
  EXECUTE format('DROP SCHEMA %I CASCADE',owned.nspname);
 END LOOP;
 DROP SCHEMA "${schema}" CASCADE;
END $cleanup$; COMMIT;`);
    console.log('[test-runtime] exact leased test schemas removed');
    } catch (error) {
      if (!callbackFailed) throw error;
      const detail = 'cleanup failed; owned test resources may remain';
      if (primaryError instanceof Error) {
        primaryError.message += `; ${detail}`;
        primaryError.cleanupFailed = true;
      } else throw new AggregateError([primaryError], detail);
      // Retain the callback's failure identity and exit code. Cleanup SQL,
      // resource names and credentials are never included in secondary detail.
    }
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
    let platform, certificate, terminator, mcp, oauth, agent;
    try {
      const port = await freePort();
      certificate = await temporaryTLS();
      terminator = await tlsTerminator(certificate.options, port);
      const origin = terminator.origin;
      mcp = await startM2Fixture({ allowedOrigin: origin });
      oauth = await startM2Fixture({ allowedOrigin: origin, tls: certificate.options, publicHostname: 'localhost', allowNativeCallback: true });
      platform = spawn('.runtime/platform', [], { stdio: ['ignore', 'inherit', 'inherit'], env: { ...process.env, MCP_STUDIO_DATABASE_URL: scopedDatabase, MCP_STUDIO_ORIGIN: origin, MCP_STUDIO_LISTEN: `127.0.0.1:${port}`, MCP_STUDIO_ALLOW_INSECURE_LOOPBACK: 'true', MCP_STUDIO_INIT_CREDENTIAL: 'fixture-init', MCP_STUDIO_SMTP_ADDRESS: mail.smtpAddress, MCP_STUDIO_SMTP_FROM: 'studio@example.test', MCP_STUDIO_STATIC_DIR: 'apps/web/dist', MCP_STUDIO_BACKUP_KEY: randomBytes(32).toString('base64') } });
      let spawnError;
      platform.once('error', () => { spawnError = true; });
      await ready(`http://127.0.0.1:${port}`, platform, signal);
      if (spawnError) throw new Error('Test platform failed to start.');
      agent = await startM5Agent({origin,tls:certificate.options});
      console.log('[test-runtime] production platform + TLS terminator + SMTP + controlled MCP/OAuth fixtures ready');
      await runChecked(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.config.ts', ...args], { label: 'Playwright production-entry E2E', signal, env: { PLAYWRIGHT_BASE_URL: origin, PLAYWRIGHT_INIT_CREDENTIAL: 'fixture-init', PLAYWRIGHT_MAIL_URL: mail.url, PLAYWRIGHT_MCP_ORIGIN: mcp.origin, PLAYWRIGHT_OAUTH_ORIGIN: oauth.origin, PLAYWRIGHT_FIXTURE_TLS: 'true', PLAYWRIGHT_AGENT_ADDRESS: agent.address, PLAYWRIGHT_AGENT_CONTROL: agent.controllerOrigin, PLAYWRIGHT_AGENT_STDIO_COMMAND: agent.stdioCommand, PLAYWRIGHT_AGENT_STDIO_ARGS: JSON.stringify(agent.stdioArgs) } });
    } finally {
      try { await stopProcess(platform); }
      finally {
        const dir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/m3-playwright';
        let evidenceError;try{await mkdir(dir,{recursive:true});
        if(mcp&&oauth)await writeFile(`${dir}/fixture-statistics.json`,JSON.stringify({mcp:mcp.stats,oauth:oauth.stats,agent:agent?.stats(),tls:'Temporary fixture CA trusted by the controlled Go Agent helper; browser ignoreHTTPSErrors for this fixture only; no CORS/mixed-content/LNA bypass',supportMatrix:'T02 remains pending; controlled MasterStore/native Confirm are not real OS/terminal confirmation evidence'},null,2)+'\n');}catch(error){evidenceError=error;}
        const cleanup=await Promise.allSettled([agent?.close(),mcp?.close(),oauth?.close(),terminator?.close(),certificate?.close(),mail.close()]);
        console.log('[test-runtime] Agent, platform, mail, MCP, OAuth and temporary TLS fixtures stopped');
        const failures=cleanup.filter(result=>result.status==='rejected').map(result=>result.reason);if(evidenceError)failures.push(evidenceError);if(failures.length)throw new AggregateError(failures,'Test runtime cleanup or evidence write failed.');
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
