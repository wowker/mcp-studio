import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import http from 'node:http';
import { createInterface } from 'node:readline';
import { startMailCapture } from './smtp.mjs';

async function sendMail(address, to, body) {
  const [host, port] = address.split(':');
  const socket = net.createConnection({ host, port: Number(port) });
  const lines = createInterface({ input: socket })[Symbol.asyncIterator]();
  const response = async () => { let line; do { line = (await lines.next()).value; assert.ok(line, 'SMTP reply required'); } while (line[3] === '-'); return Number(line.slice(0, 3)); };
  const command = async (value, expected) => { socket.write(value + '\r\n'); assert.equal(await response(), expected); };
  try {
    assert.equal(await response(), 220);
    await command('EHLO test.example', 250);
    await command('MAIL FROM:<studio@example.test>', 250);
    await command(`RCPT TO:<${to}>`, 250);
    await command('DATA', 354);
    await command(`From: studio@example.test\r\nTo: ${to}\r\nSubject: Test\r\n\r\n${body}\r\n.`, 250);
  } finally { socket.destroy(); }
}

test('loopback SMTP delivers captured recipient-filtered body without bypassing verification', async () => {
  const f = await startMailCapture();
  try {
    // Only synthetic marker here; production verification code is never part of TAP evidence.
    await sendMail(f.smtpAddress, 'one@example.test', 'Verify\r\nfixture-marker-one');
    await sendMail(f.smtpAddress, 'two@example.test', 'Verify\r\nfixture-marker-two');
    const r = await fetch(f.url + '/messages?to=one%40example.test');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const data = await r.json();
    assert.equal(data.messages.length, 1);
    assert.equal(data.messages[0].to, 'one@example.test');
    assert.equal(data.messages[0].from, 'studio@example.test');
    assert.equal(data.messages[0].body.trim().split(/\r?\n/).at(-1), 'fixture-marker-one');
  } finally { await f.close(); }
});

test('capture API rejects foreign Host and browser Origin without a verification mutation route', async () => {
  const f = await startMailCapture();
  try {
    const forged = await new Promise((resolve, reject) => {
      const req = http.get(f.url + '/messages', { headers: { Host: 'evil.invalid' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject);
    });
    assert.equal(forged, 403);
    assert.equal((await fetch(f.url + '/messages', { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    assert.equal((await fetch(f.url + '/set-verified', { method: 'POST' })).status, 404);
  } finally { await f.close(); }
});
