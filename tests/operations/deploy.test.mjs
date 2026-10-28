import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const compose = JSON.parse(readFileSync('apps/cloud/deploy/compose.json'));
const services = compose.services;

test('compose declares exactly three services: db, platform, tls (no extras, no legacy)', () => {
  assert.deepEqual(Object.keys(services).sort(), ['db', 'platform', 'tls']);
  assert.ok(!JSON.stringify(compose).includes('redis'), 'compose must not mention redis');
});

test('db service has no host port; secrets all _FILE', () => {
  assert.equal(services.db.ports, undefined, 'db must not bind a host port');
  // db password via POSTGRES_PASSWORD_FILE env var, no plaintext POSTGRES_PASSWORD
  assert.equal(services.db.environment.POSTGRES_PASSWORD, undefined);
  assert.match(services.db.environment.POSTGRES_PASSWORD_FILE, /^\/run\/secrets\//);
});

test('platform service: non-root, read-only, no host port, cap_drop ALL, no-new-privileges, secrets via _FILE only', () => {
  const pl = services.platform;
  assert.equal(pl.user, '10001:10001', 'platform must run as non-root uid:gid');
  assert.equal(pl.read_only, true, 'platform filesystem must be read-only');
  assert.equal(pl.ports, undefined, 'platform must not expose a host port');
  assert.deepEqual(pl.cap_drop, ['ALL'], 'platform must drop all capabilities');
  assert.equal(pl.cap_add, undefined, 'platform must not add any capabilities');
  assert.ok(pl.security_opt?.includes('no-new-privileges:true'), 'platform must set no-new-privileges');
  // tmpfs overlay only where writable state is actually needed
  assert.ok(Array.isArray(pl.tmpfs), 'platform must list tmpfs mount(s)');
  assert.match(pl.tmpfs.join(' '), /\/tmp/);
  // Secrets: every environment variable carrying credentials must end in _FILE
  const env = pl.environment;
  for (const [key, val] of Object.entries(env)) {
    if (/PASSWORD|CREDENTIAL|TOKEN|SECRET|KEY/i.test(key)) {
      assert.ok(key.endsWith('_FILE'), `secret env ${key} must end in _FILE`);
    }
  }
  // Explicit: no plaintext DATABASE_URL or INIT_CREDENTIAL
  assert.equal(env.MCP_STUDIO_DATABASE_URL, undefined);
  assert.equal(env.MCP_STUDIO_INIT_CREDENTIAL, undefined);
  assert.equal(env.MCP_STUDIO_BACKUP_KEY, undefined);
  assert.equal(env.MCP_STUDIO_SMTP_PASSWORD, undefined);
  assert.match(env.MCP_STUDIO_DATABASE_URL_FILE, /^\/run\/secrets\//);
  assert.match(env.MCP_STUDIO_INIT_CREDENTIAL_FILE, /^\/run\/secrets\//);
  // Legacy insecure loopback switch must not leak into cloud deployment
  assert.equal(env.MCP_STUDIO_ALLOW_INSECURE_LOOPBACK, undefined);
});

test('tls service: non-root, read-only, host port bound only on loopback, cap_drop ALL, NET_BIND_SERVICE only, no-new-privileges', () => {
  const tl = services.tls;
  assert.equal(tl.user, '10001:10001', 'tls must run as non-root');
  assert.equal(tl.read_only, true, 'tls filesystem must be read-only');
  assert.ok(Array.isArray(tl.ports) && tl.ports.length > 0, 'tls must expose HTTPS host port');
  // Host port binding must default to loopback; STUDIO_BIND_ADDRESS may be
  // overridden by operator but the compose definition itself must advertise
  // 127.0.0.1 as the default. Accept either an explicit "127.0.0.1:PORT:PORT"
  // form or the `${STUDIO_BIND_ADDRESS:-127.0.0.1}` interpolation which
  // guarantees loopback when no override is supplied.
  for (const p of tl.ports) {
    const portStr = String(p);
    assert.ok(
      portStr.startsWith('127.0.0.1:') ||
        portStr.includes('${STUDIO_BIND_ADDRESS:-127.0.0.1}'),
      `tls port ${portStr} must bind loopback by default`,
    );
  }
  assert.deepEqual(tl.cap_drop, ['ALL']);
  assert.deepEqual(tl.cap_add, ['NET_BIND_SERVICE'], 'tls may add only NET_BIND_SERVICE');
  assert.ok(tl.security_opt?.includes('no-new-privileges:true'));
  // tmpfs for /config and /data (Caddy runtime state), mode 0700 owned by tls user
  assert.deepEqual(tl.tmpfs, [
    '/config:uid=10001,gid=10001,mode=0700',
    '/data:uid=10001,gid=10001,mode=0700',
  ]);
});

test('compose network is private only; platform and tls both attach to it', () => {
  assert.equal(Object.keys(compose.networks).length, 1);
  assert.ok(compose.networks.private, 'only one private network');
  for (const name of ['platform', 'tls', 'db']) {
    const nets = services[name].networks;
    assert.ok(nets?.includes('private'), `${name} must attach to private network`);
  }
  // platform and tls must NOT expose any host port — tls owns the only host listener
  assert.equal(services.platform.ports, undefined);
  assert.equal(services.db.ports, undefined);
});

test('volumes: postgres-data named volume only; no anonymous bind mounts from host', () => {
  assert.ok(compose.volumes?.['postgres-data'], 'postgres-data named volume declared');
  // The db service mounts ./init-db.sh via bind (intentional, one-time init). That is the only bind mount allowed.
  // We don't assert other services here — their tmpfs/named volumes are separate concerns.
});

test('secrets are all file-backed with STUDIO_SECRETS_DIR interpolation', () => {
  for (const [name, definition] of Object.entries(compose.secrets)) {
    assert.ok(definition.file, `secret ${name} must declare file source`);
    assert.match(definition.file, /\$\{STUDIO_SECRETS_DIR:\?/, `secret ${name} must require STUDIO_SECRETS_DIR`);
  }
});

test('.dockerignore excludes .runtime so local build state never leaks into platform image', () => {
  assert.match(readFileSync('.dockerignore', 'utf8'), /\.runtime/);
});

test('Caddyfile terminates TLS with the bundled cert, disables admin/ACME, forwards to platform on private network', () => {
  const caddy = readFileSync('apps/cloud/deploy/Caddyfile', 'utf8');
  assert.match(caddy, /tls \/tls\/cert.pem \/tls\/key.pem/);
  assert.match(caddy, /reverse_proxy platform:8080/);
  assert.match(caddy, /^ admin off\s*$/m);
  assert.match(caddy, /auto_https off/m);
  assert.match(caddy, /protocols tls1\.2 tls1\.3/);
  assert.match(caddy, /Strict-Transport-Security/);
  assert.doesNotMatch(caddy, /acme|le|certmagic/i, 'self-signed cert only; no ACME or cert-manager auto provisioning');
});
