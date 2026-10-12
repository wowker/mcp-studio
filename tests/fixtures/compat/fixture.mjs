import http from 'node:http';
import https from 'node:https';
import { randomBytes } from 'node:crypto';

// Isolated feasibility fixture; no production Agent, credentials, OS vault or platform authorization.
export async function startFixture({ origin, now = Date.now, tls } = {}) {
  const pending = new Map();
  const sessions = new Map();
  const events = [];
  const mcpSessions = new Map();
  const legacyStreams = new Set();
  let base;
  const reply = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(value === undefined ? '' : JSON.stringify(value));
  };
  const handler = async (req, res) => {
    const path = new URL(req.url, base).pathname;
    events.push({ method: req.method, path }); // Fixed route names only. Never record headers, codes or bodies.
    const trustedHosts = [new URL(base).host, `localhost:${new URL(base).port}`];
    if (!trustedHosts.includes(req.headers.host) || req.headers.origin !== origin) return reply(res, 403, { error: 'untrusted-origin-or-host' });
    if (path === '/cors-denied') return reply(res, 200, { ok: true });
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Session-Id, MCP-Protocol-Version');
    res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
    if (req.method === 'OPTIONS') return reply(res, 204);
    let body;
    try {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 16_384) return reply(res, 413, { error: 'too-large' });
      }
      body = raw ? JSON.parse(raw) : undefined;
    } catch { return reply(res, 400, { error: 'invalid-json' }); }
    if (path === '/pair/start' && req.method === 'POST') {
      if (body?.user !== 'fixture-user' || body?.device !== 'fixture-device' || JSON.stringify(body?.capabilities) !== '["status"]') return reply(res, 400, { error: 'fixture-scope-only' });
      const requestId = randomBytes(16).toString('hex');
      pending.set(requestId, { identity: { origin, user: body.user, device: body.device, capabilities: body.capabilities }, expires: now() + 120_000 });
      return reply(res, 202, { requestId });
    }
    if (path === '/pair/complete' && req.method === 'POST') {
      const p = pending.get(body?.requestId);
      if (!p || !p.code || p.expires <= now() || p.code !== body.code) return reply(res, 403, { error: 'pairing-denied' });
      pending.delete(body.requestId);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { identity: p.identity, expires: now() + 60_000 });
      return reply(res, 200, { token, expiresInSeconds: 60 });
    }
    if (path === '/agent/status') {
      const session = sessions.get(req.headers.authorization?.replace(/^Bearer /, ''));
      if (!session || session.expires <= now()) return reply(res, 401, { error: 'session-required' });
      return reply(res, 200, { paired: true, identity: session.identity });
    }
    if (path === '/ping') return reply(res, 200, { ok: true });
    const resultFor = (message, protocolVersion) => {
      if (message?.method === 'initialize') return { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'm0-wire-fixture', version: '0.0.0' } };
      if (message?.method === 'tools/list') return { tools: [{ name: 'fixture_echo', description: 'fixture only', inputSchema: { type: 'object', properties: {} } }] };
      return undefined;
    };
    if (path === '/mcp-json' || path === '/mcp-sse') {
      if (req.method !== 'POST') return reply(res, 405, { error: 'post-required' });
      if (!req.headers.accept?.includes('application/json') || !req.headers.accept?.includes('text/event-stream')) return reply(res, 400, { error: 'accept-required' });
      let session;
      if (body?.method === 'initialize') {
        session = randomBytes(16).toString('hex');
        mcpSessions.set(session, '2025-11-25');
        res.setHeader('MCP-Session-Id', session);
      } else {
        session = req.headers['mcp-session-id'];
        if (!session) return reply(res, 400, { error: 'session-required' });
        if (!mcpSessions.has(session)) return reply(res, 404, { error: 'unknown-session' });
        if (req.headers['mcp-protocol-version'] !== '2025-11-25') return reply(res, 400, { error: 'protocol-version-required' });
      }
      if (body?.id === undefined) return reply(res, 202);
      const result = resultFor(body, '2025-11-25');
      const message = result ? { jsonrpc: '2.0', id: body.id, result } : { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unknown method' } };
      if (path === '/mcp-sse') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        return res.end(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      }
      return reply(res, 200, message);
    }
    if (path === '/legacy') {
      if (req.method === 'POST') return reply(res, 405, { error: 'legacy-get-required' });
      if (req.method !== 'GET') return reply(res, 405);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
      res.write('event: endpoint\ndata: /messages\n\n');
      legacyStreams.add(res);
      res.on('close', () => legacyStreams.delete(res));
      return;
    }
    if (path === '/messages' && req.method === 'POST') {
      if (legacyStreams.size !== 1) return reply(res, 409, { error: 'fixture-supports-one-legacy-stream' });
      if (body?.id !== undefined) {
        const result = resultFor(body, '2024-11-05');
        const message = result ? { jsonrpc: '2.0', id: body.id, result } : { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Unknown method' } };
        [...legacyStreams][0].write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
      }
      return reply(res, 202);
    }
    return reply(res, 404, { error: 'not-implemented' });
  };
  const server = tls ? https.createServer(tls, handler) : http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `${tls ? 'https' : 'http'}://127.0.0.1:${server.address().port}`;
  return {
    base, address: server.address().address, events,
    listPendingLocally() {
      return [...pending].filter(([, p]) => p.expires > now()).map(([requestId, p]) => ({ requestId, identity: structuredClone(p.identity), expires: p.expires }));
    },
    confirmLocally(requestId) {
      const p = pending.get(requestId);
      if (!p || p.expires <= now()) throw new Error('pairing-expired');
      p.code = randomBytes(18).toString('base64url');
      return { identity: structuredClone(p.identity), code: p.code };
    },
    unpairLocally() { sessions.clear(); pending.clear(); },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}
