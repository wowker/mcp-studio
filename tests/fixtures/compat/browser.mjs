import assert from 'node:assert/strict';
import https from 'node:https';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { startFixture } from './fixture.mjs';

// Run from repository root. Playwright is a tool dependency, never legacy application source.
const { chromium } = await import(process.env.COMPAT_PLAYWRIGHT ?? 'playwright');
const temporary = await mkdtemp(join(os.tmpdir(), 'mcp-studio-compat-'));
let browser, fixture, secureFixture, workbench;
const results = [];
const diagnostics = [];
const attempt = async (name, run) => {
  try { results.push({ name, status: 'passed', ...await run() }); }
  catch (error) { results.push({ name, status: 'failed', error: error.message }); }
};
try {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(temporary, 'key.pem'), '-out', join(temporary, 'cert.pem'), '-subj', '/CN=localhost', '-days', '1'], { stdio: 'ignore' });
  workbench = https.createServer({ key: await readFile(join(temporary, 'key.pem')), cert: await readFile(join(temporary, 'cert.pem')) }, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    res.end('<!doctype html><html lang="en"><title>M0 isolated HTTPS workbench</title><h1>M0 compatibility fixture</h1><p>Test only. No production Agent or credentials.</p></html>');
  });
  await new Promise(resolve => workbench.listen(0, '127.0.0.1', resolve));
  const origin = `https://127.0.0.1:${workbench.address().port}`;
  fixture = await startFixture({ origin });
  secureFixture = await startFixture({ origin, tls: { key: await readFile(join(temporary, 'key.pem')), cert: await readFile(join(temporary, 'cert.pem')) } });
  browser = await chromium.launch({ executablePath: process.env.COMPAT_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--host-resolver-rules=MAP mcp-fixture.test 127.0.0.1'] });
  // TLS fixture trust exception only; no browser security, CORS, mixed-content or LNA flags.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.on('console', msg => { if (msg.type() === 'error') diagnostics.push(msg.text()); });
  page.on('requestfailed', req => diagnostics.push(`${req.method()} ${new URL(req.url()).pathname}: ${req.failure()?.errorText}`));
  await page.goto(origin);
  const environment = { at: new Date().toISOString(), os: execFileSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).trim(), build: execFileSync('sw_vers', ['-buildVersion'], { encoding: 'utf8' }).trim(), arch: os.arch(), browser: await browser.version(), playwright: (await import('playwright/package.json', { with: { type: 'json' } })).default.version, node: process.version, secureContext: await page.evaluate(() => isSecureContext), httpsOrigin: origin, tls: 'temporary self-signed test certificate; context ignoreHTTPSErrors only', sourceAddressSpace: 'loopback; public-HTTPS LNA prompt remains untested' };
  const post = async (path, message) => page.evaluate(async ({ base, path, message }) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(message), signal: AbortSignal.timeout(5000) });
    return { status: r.status, contentType: r.headers.get('Content-Type'), session: r.headers.get('MCP-Session-Id'), text: await r.text() };
  }, { base: fixture.base, path, message });
  const initialize = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'm0-fixture', version: '0.0.0' } } };
  await attempt('HTTPS secure workbench -> HTTP 127.0.0.1 with CORS', async () => {
    const value = await page.evaluate(async base => { const r = await fetch(base + '/ping'); return { status: r.status, body: await r.json() }; }, fixture.base);
    assert.equal(value.status, 200); assert.equal(value.body.ok, true);
    return { outcome: 'loopback HTTP reachable' };
  });
  await attempt('HTTPS secure workbench -> HTTP localhost alias', async () => {
    const response = await page.evaluate(async base => (await fetch(base.replace('127.0.0.1', 'localhost') + '/ping')).status, fixture.base);
    // Strict Host whitelist initially includes canonical IP only: alias must be explicitly registered.
    assert.equal(response, 200);
    return { outcome: 'explicitly registered localhost alias reachable' };
  });
  await attempt('CORS denied path fails in browser', async () => {
    const failed = await page.evaluate(async base => { try { await fetch(base + '/cors-denied'); return false; } catch { return true; } }, fixture.base);
    assert.equal(failed, true); assert.ok(diagnostics.some(line => line.includes('blocked by CORS policy'))); return { outcome: 'browser rejects missing allow-origin' };
  });
  await attempt('HTTPS workbench -> controlled cross-origin HTTPS endpoint', async () => {
    assert.match(secureFixture.base, /^https:/);
    const response = await page.evaluate(async base => (await fetch(base + '/ping')).status, secureFixture.base);
    assert.equal(response, 200); return { outcome: 'HTTPS cross-origin reachable with temporary certificate exception' };
  });
  await attempt('HTTPS workbench -> ordinary HTTP hostname blocked as mixed content', async () => {
    const before = fixture.events.length;
    const blocked = await page.evaluate(async base => { try { await fetch(base.replace('127.0.0.1', 'mcp-fixture.test') + '/ping'); return false; } catch { return true; } }, fixture.base);
    assert.equal(blocked, true); assert.equal(fixture.events.length, before);
    assert.ok(diagnostics.some(line => line.startsWith('Mixed Content:') && line.includes('mcp-fixture.test')));
    return { outcome: 'mixed-content blocked before server request', topology: 'test hostname maps to loopback; not a real public HTTP service' };
  });
  await attempt('Streamable HTTP JSON initialization + exposed session + notification + tools list', async () => {
    const init = await post('/mcp-json', initialize);
    assert.equal(init.status, 200); assert.equal(JSON.parse(init.text).result.protocolVersion, '2025-11-25'); assert.ok(init.session);
    const result = await page.evaluate(async ({ base, session }) => {
      const send = async message => { const r = await fetch(base + '/mcp-json', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Session-Id': session, 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify(message) }); return { status: r.status, body: await r.text() }; };
      return { notification: await send({ jsonrpc: '2.0', method: 'notifications/initialized' }), tools: await send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) };
    }, { base: fixture.base, session: init.session });
    assert.equal(result.notification.status, 202); assert.equal(JSON.parse(result.tools.body).result.tools[0].name, 'fixture_echo');
    return { outcome: 'initialize -> initialized -> tools/list', requests: 3 };
  });
  await attempt('Streamable HTTP SSE initialization response', async () => {
    const init = await post('/mcp-sse', initialize);
    assert.equal(init.status, 200); assert.match(init.contentType, /text\/event-stream/);
    const message = init.text.split('\n').find(line => line.startsWith('data: '));
    assert.equal(JSON.parse(message.slice(6)).result.protocolVersion, '2025-11-25');
    return { outcome: 'POST returns event-stream InitializeResult' };
  });
  await attempt('legacy HTTP+SSE POST 405 -> endpoint event -> initialize + initialized + tools/list', async () => {
    const fallback = await post('/legacy', initialize);
    assert.equal(fallback.status, 405);
    const outcome = await page.evaluate(async ({ base, initialize }) => {
      const ac = new AbortController();
      const response = await fetch(base + '/legacy', { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.any([ac.signal, AbortSignal.timeout(5000)]) });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const event = async () => {
        while (!buffer.includes('\n\n')) { const chunk = await reader.read(); if (chunk.done) throw Error('SSE closed early'); buffer += decoder.decode(chunk.value, { stream: true }); }
        const end = buffer.indexOf('\n\n'); const data = buffer.slice(0, end); buffer = buffer.slice(end + 2); return data;
      };
      const endpointEvent = await event();
      const endpoint = new URL(endpointEvent.split('\n').find(line => line.startsWith('data: ')).slice(6), base);
      if (endpoint.origin !== new URL(base).origin) throw Error('untrusted endpoint');
      const send = async message => { const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(5000) }); await r.text(); return r; };
      const sent = await send({ ...initialize, params: { ...initialize.params, protocolVersion: '2024-11-05' } });
      const init = JSON.parse((await event()).split('\n').find(line => line.startsWith('data: ')).slice(6));
      const notified = await send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const tools = JSON.parse((await event()).split('\n').find(line => line.startsWith('data: ')).slice(6));
      ac.abort();
      return { sent: sent.status, notified: notified.status, protocol: init.result.protocolVersion, tool: tools.result.tools[0].name };
    }, { base: fixture.base, initialize });
    assert.deepEqual(outcome, { sent: 202, notified: 202, protocol: '2024-11-05', tool: 'fixture_echo' });
    return { outcome: 'legacy handshake + tools discovered; no credentials in endpoint' };
  });
  await attempt('browser pairing waits for local confirmation then uses separate short session', async () => {
    const scope = { user: 'fixture-user', device: 'fixture-device', capabilities: ['status'] };
    const start = await post('/pair/start', scope); assert.equal(start.status, 202);
    const id = JSON.parse(start.text).requestId;
    const unapproved = await post('/pair/complete', { requestId: id, code: 'no-local-confirmation' }); assert.equal(unapproved.status, 403);
    // Local Node process simulates pressing approve, never an HTTP approval endpoint.
    const local = fixture.confirmLocally(id);
    const completion = await post('/pair/complete', { requestId: id, code: local.code }); assert.equal(completion.status, 200);
    const token = JSON.parse(completion.text).token;
    const status = await page.evaluate(async ({ base, token }) => (await fetch(base + '/agent/status', { headers: { Authorization: `Bearer ${token}` } })).status, { base: fixture.base, token }); assert.equal(status, 200);
    fixture.unpairLocally();
    const revoked = await page.evaluate(async ({ base, token }) => (await fetch(base + '/agent/status', { headers: { Authorization: `Bearer ${token}` } })).status, { base: fixture.base, token }); assert.equal(revoked, 401);
    return { outcome: 'local confirmation scope checked; revoked token rejected', localConfirmation: 'automated local-process simulation; human/native dialog pending M5' };
  });
  await page.screenshot({ path: 'tests/evidence/m0-compat/workbench.png' });
  const hashes = Object.fromEntries(await Promise.all(['fixture.mjs', 'browser.mjs', 'security.test.mjs', 'local-confirmation.mjs', 'local-confirmation.test.mjs'].map(async name => [name, createHash('sha256').update(await readFile(new URL(name, import.meta.url))).digest('hex')])));
  const report = { environment, results, diagnostics, serverEvents: fixture.events, sourceSHA256: hashes, pending: ['Chrome second stable major', 'Edge two stable majors', 'Windows', 'Linux', 'deployed public HTTPS workbench LNA permission allow/deny', 'native human confirmation dialog', 'remote HTTP/HTTPS real network topology'] };
  const output = process.env.COMPAT_REPORT ?? 'tests/evidence/m0-compat/browser-green.json';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, browser: environment.browser, passed: results.filter(r => r.status === 'passed').length, failed: results.filter(r => r.status === 'failed').length }));
  process.exitCode = results.some(r => r.status === 'failed') ? 1 : 0;
} finally {
  await browser?.close();
  await fixture?.close();
  await secureFixture?.close();
  if (workbench) await new Promise(resolve => workbench.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
