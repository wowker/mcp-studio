import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startFixture } from './fixture.mjs';

const origin = 'https://example.com';
function request(base, path, { host, from = origin, token, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const headers = { Host: host ?? url.host };
    if (from !== null) headers.Origin = from;
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers['Content-Type'] = 'application/json';
    const req = http.request(url, { method: body ? 'POST' : 'GET', headers }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

test('loopback refuses spoofed Host, absent/foreign Origin, and missing authentication', async () => {
  const f = await startFixture({ origin });
  try {
    for (const options of [{ host: 'attacker.invalid' }, { from: null }, { from: 'https://example.com.attacker.invalid' }]) {
      assert.equal((await request(f.base, '/agent/status', options)).status, 403);
    }
    assert.equal((await request(f.base, '/agent/status')).status, 401);
    assert.equal(f.address, '127.0.0.1');
  } finally { await f.close(); }
});

test('pairing requires local approval, a short-lived one-use code and separately scoped session', async () => {
  let now = 1000;
  const f = await startFixture({ origin, now: () => now });
  try {
    const scope = { user: 'fixture-user', device: 'fixture-device', capabilities: ['status'] };
    const pending = await request(f.base, '/pair/start', { body: scope });
    assert.equal(pending.status, 202);
    const id = pending.body.requestId;
    assert.equal((await request(f.base, '/pair/complete', { body: { requestId: id, code: 'unapproved' } })).status, 403);
    const approved = f.confirmLocally(id);
    assert.deepEqual(approved.identity, { origin, ...scope });
    const paired = await request(f.base, '/pair/complete', { body: { requestId: id, code: approved.code } });
    assert.equal(paired.status, 200);
    const token = paired.body.token;
    assert.equal((await request(f.base, '/agent/status', { token })).status, 200);
    assert.equal((await request(f.base, '/agent/status', { token, from: 'https://evil.invalid' })).status, 403);
    assert.equal((await request(f.base, '/pair/complete', { body: { requestId: id, code: approved.code } })).status, 403);
    now += 60_001;
    assert.equal((await request(f.base, '/agent/status', { token })).status, 401);
  } finally { await f.close(); }
});

test('expired codes and local unpair reject new requests', async () => {
  let now = 1000;
  const f = await startFixture({ origin, now: () => now });
  try {
    const make = async () => {
      const p = await request(f.base, '/pair/start', { body: { user: 'fixture-user', device: 'fixture-device', capabilities: ['status'] } });
      assert.equal(p.status, 202);
      return { id: p.body.requestId, approval: f.confirmLocally(p.body.requestId) };
    };
    const expired = await make();
    now += 120_001;
    assert.equal((await request(f.base, '/pair/complete', { body: { requestId: expired.id, code: expired.approval.code } })).status, 403);
    const active = await make();
    const paired = await request(f.base, '/pair/complete', { body: { requestId: active.id, code: active.approval.code } });
    f.unpairLocally();
    assert.equal((await request(f.base, '/agent/status', { token: paired.body.token })).status, 401);
  } finally { await f.close(); }
});
