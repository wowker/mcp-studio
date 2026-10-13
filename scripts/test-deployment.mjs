import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import assert from 'node:assert/strict';
import { provision, compose, sql, backupDatabase, restoreDatabase, purgeBackups } from './operations.mjs';
const evidence = process.env.PLAYWRIGHT_EVIDENCE_DIR ?? 'tests/evidence/m7-deployment';
await mkdir(evidence, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'mcp-studio-m7-'));
const project = 'm7_test_' + randomBytes(6).toString('hex');
let created = false;
let cookie = '', csrf = '';
let report = { project, scope: 'Owned loopback HTTPS containers; no publishing/native/manual/media acceptance', checks: [] };
async function port() { const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
const tlsPort = await port(), mailPort = await port();
const origin = `https://127.0.0.1:${tlsPort}`;
const directory = join(root, 'secrets');
let cert;
let c;
async function request(path, method = 'GET', body, headers = {}) { return new Promise((ok, fail) => { const req = https.request(origin + path, { method, ca: cert, headers: { Origin: origin, ...cookie ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}, ...body ? { 'Content-Type': 'application/json' } : {}, ...headers } }, res => { let text = ''; res.on('data', b => text += b); res.on('end', () => { if (res.headers['set-cookie'])
    cookie = res.headers['set-cookie'][0].split(';', 1)[0]; let data; try {
    data = JSON.parse(text);
}
catch { } if (data?.data?.csrf)
    csrf = data.data.csrf; ok({ status: res.statusCode, data, headers: res.headers, body: text }); }); }); req.on('error', fail); if (body)
    req.write(JSON.stringify(body)); req.end(); }); }
async function mail() { return new Promise((ok, fail) => http.get(`http://127.0.0.1:${mailPort}`, r => { let b = ''; r.on('data', x => b += x); r.on('end', () => ok(JSON.parse(b))); }).on('error', fail)); }
try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,DNS:mail,IP:127.0.0.1', '-days', '1'], { stdio: 'ignore' });
    cert = await readFile(join(root, 'cert.pem'));
    await provision(directory, { origin, smtpAddress: 'mail:2525', smtpFrom: 'studio@example.test', cert, key: await readFile(join(root, 'key.pem')), backupEnabled: true });
    const override = join(root, 'test.compose.json');
    await writeFile(override, JSON.stringify({ services: { platform: { environment: { SSL_CERT_FILE: '/run/secrets/tls_cert' }, secrets: ['tls_cert'] }, mail: { image: 'node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20', command: ['node', '/fixture/mail.mjs'], volumes: [`${resolve('tests/fixtures/m7/mail.mjs')}:/fixture/mail.mjs:ro`], secrets: ['tls_cert', 'tls_key'], ports: [`127.0.0.1:${mailPort}:3030`], networks: ['private'] } } }));
    c = (args, opts) => compose(directory, project, ['-f', override, ...args], opts);
    created = true;
    report.phase = 'compose config';
    await c(['config', '--quiet']);
    report.phase = 'fresh startup';
    await c(['up', '-d', '--wait', '--wait-timeout', '90']);
    const output = (await c(['ps', '--format', 'json'])).toString().trim();
    const inspect = output.startsWith('[') ? JSON.parse(output) : output.split('\n').map(line => JSON.parse(line));
    report.checks.push('compose config; fresh nonroot platform/HTTPS/PostgreSQL healthy');
    assert.equal((await request('/api/v1/health')).status, 200);
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.headers['content-security-policy'], /default-src/);
    assert.match(home.headers['strict-transport-security'], /31536000/);
    assert.ok((await request('/api/v1/bootstrap')).data.data.mailConfigured);
    assert.equal((await request('/api/v1/session')).status, 401);
    report.phase = 'identity and STARTTLS';
    const init = { credential: (await readFile(join(directory, 'init_credential'), 'utf8')).trim(), email: 'owner-m7@example.test', password: 'Fixture-Password-12', name: 'M7 Owner', teamName: 'M7 Team' };
    assert.equal((await request('/api/v1/initialize', 'POST', init)).status, 200);
    assert.equal((await request('/api/v1/initialize', 'POST', init)).status, 409);
    const login = await request('/api/v1/login', 'POST', { email: init.email, password: init.password });
    assert.equal(login.status, 200);
    assert.match(login.headers['set-cookie'][0], /Secure/);
    assert.match(login.headers['set-cookie'][0], /HttpOnly/);
    const owner = login.data.data;
    assert.equal((await request('/api/v1/verification/request', 'POST', {})).status, 200);
    const delivery = await mail();
    assert.ok(delivery.upgrades > 0);
    const code = delivery.messages.at(-1).body.trim().split(/\r?\n/u).at(-1);
    assert.equal((await request('/api/v1/verification/confirm', 'POST', { token: code })).status, 200);
    report.checks.push('one-time init; Secure HttpOnly cookie; real STARTTLS certificate verification and mailbox confirmation');
    const team = owner.teams[0].id;
    const createdProject = await request(`/api/v1/teams/${team}/projects`, 'POST', { name: 'M7 restore', description: 'Synthetic disaster recovery' });
    assert.equal(createdProject.status, 200);
    const pid = createdProject.data.data.id;
    const unauthCookie = cookie;
    cookie = '';
    assert.equal((await request(`/api/v1/projects/${pid}`)).status, 401);
    cookie = unauthCookie;
    assert.equal((await request(`/api/v1/teams/${team}/projects`, 'POST', { name: 'Denied origin', description: '' }, { Origin: 'https://other.example.test' })).status, 403);
    const privileges = await sql(directory, project, "SELECT rolsuper::text||':'||rolbypassrls::text FROM pg_roles WHERE rolname=current_user");
    assert.equal(privileges, 'false:false');
    report.checks.push('real object authorization; foreign Origin rejection; non-superuser/non-BYPASSRLS database role');
    report.phase = 'archive and restore';
    await c(['stop', 'tls', 'platform']);
    const archive = await backupDatabase(directory, project, join(root, 'backups'));
    await assert.rejects(restoreDatabase(directory, project, archive, { emptyTargetConfirmed: true }), /empty/);
    await c(['down', '--volumes', '--remove-orphans']);
    await c(['up', '-d', '--wait', 'db']);
    await restoreDatabase(directory, project, archive, { emptyTargetConfirmed: true });
    assert.equal(await sql(directory, project, 'SELECT count(*) FROM app.projects'), '1');
    assert.equal(await sql(directory, project, 'SELECT count(*) FROM app.schema_migrations'), '5');
    report.checks.push('protected custom pg_dump; nonempty restore refused; fresh-database atomic restore preserves identity/project/migration ledger');
    await c(['up', '-d', '--wait', '--wait-timeout', '90']);
    cookie = '';
    assert.equal((await request('/api/v1/login', 'POST', { email: init.email, password: init.password })).status, 200);
    assert.equal((await request(`/api/v1/projects/${pid}`)).status, 200);
    assert.equal((await request('/api/v1/bootstrap')).data.data.initialized, true);
    await c(['stop', 'tls', 'platform']);
    report.phase = 'migration rejection';
    await sql(directory, project, "INSERT INTO app.schema_migrations(version,digest) VALUES(6,'future')");
    await assert.rejects(c(['up', '-d', '--wait', '--wait-timeout', '15', 'platform']));
    report.checks.push('restored platform restart keeps initialized state; future migration prevents startup');
    report.status = 'passed';
    report.containers = inspect.map(x => ({ service: x.Service, state: x.State, health: x.Health }));
    report.limits = ['Controlled internal SMTP is not real mail-provider acceptance', 'Temporary CA trusted explicitly; no TLS skip', 'T02/T32b/native/manual/media remain pending', 'No production deployment or publication'];
}
catch (e) {
    report.status = 'failed';
    try {
        const status = (await c(['ps', '--all', '--format', 'json'])).toString().trim();
        const entries = status.startsWith('[') ? JSON.parse(status) : status.split('\n').filter(Boolean).map(x => JSON.parse(x));
        report.failedServices = entries.map(x => ({ service: x.Service, state: x.State, health: x.Health, exitCode: x.ExitCode }));
        const logs = (await c(['logs', '--no-color', '--tail', '12', 'tls'], { includeStderr: true })).toString();
        report.tlsStartupError = logs.split('\n').filter(line => /Error:/u.test(line) && !(/PRIVATE KEY|BEGIN |END /u.test(line))).map(line => line.replaceAll(root, '[fixture]'));
        report.tlsDiagnostics = logs.split('\n').flatMap(line => { try {
            const x = JSON.parse(line.slice(line.indexOf('{')));
            return x.msg ? [{ message: x.msg, error: x.error ?? null }] : [];
        }
        catch {
            return [];
        } });
    }
    catch { }
    report.error = 'isolated deployment assertion or transport failure; see test stderr';
    throw e;
}
finally {
    try {
        if (created) {
            const override = join(root, 'test.compose.json');
            await compose(directory, project, ['-f', override, 'down', '--volumes', '--remove-orphans']);
            report.cleanup = 'owned containers/network/volume removed';
        }
    }
    finally {
        await rm(root, { recursive: true, force: true });
        await writeFile(join(evidence, 'deployment-report.json'), JSON.stringify(report, null, 2) + '\n');
    }
}
console.log('[deployment] isolated HTTPS, STARTTLS, permissions, backup/restore and upgrade checks passed; fixtures removed');
