// Dev orchestrator for the local edition.
//
// Starts two processes and tears both down on any exit signal:
//   1. The single-binary local platform (embedded PostgreSQL + HTTP API)
//   2. Vite dev server (frontend hot reload, proxies /api → local platform)
//
// Usage:
//   node scripts/dev/start-local.mjs           # default: build + run
//   node scripts/dev/start-local.mjs --run      # skip build, run only
//   node scripts/dev/start-local.mjs --build   # build only, no run
//
// Environment overrides:
//   MCP_STUDIO_DEV_API          proxy target (default inferred from local listen)
//   MCP_STUDIO_LOCAL_DATA_DIR   per-user data dir override
//   MCP_STUDIO_LOCAL_PG_BIN     explicit postgres bin dir
//
// PostgreSQL binaries resolve in order: MCP_STUDIO_LOCAL_PG_BIN →
// MCP_STUDIO_LOCAL_PG_DIR/bin → PATH → .runtime/pg-cache/<os>/<arch>/pgsql/bin
// (see scripts/local-pg-bin.mjs). An existing data directory with PG_VERSION
// is reused; only a missing one triggers initdb.

import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {createConnection} from 'node:net';
import {resolvePGBin} from '../local-pg-bin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const runtimeDir = join(repoRoot, '.runtime');
const localBin = join(runtimeDir, 'local-dev');

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--run');
const buildOnly = args.has('--build');

// --- helpers ---------------------------------------------------------------

function log(tag, ...parts) {
  const line = parts.join(' ').trimEnd();
  if (!line) return;
  // Prefix every line the child emits.
  if (line.includes('\n')) {
    for (const l of line.split('\n').filter(Boolean)) console.log(`[${tag}] ${l}`);
  } else {
    console.log(`[${tag}] ${line}`);
  }
}

function mustHave(code, step) {
  if (code !== 0) {
    console.error(`[dev] ${step} failed (exit ${code}) — aborting`);
    process.exit(code);
  }
}

function waitPort(host, port, {timeoutMs = 60_000, intervalMs = 300} = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`timeout waiting for ${host}:${port}`));
        return;
      }
      const sock = createConnection({host, port});
      sock.once('connect', () => {sock.destroy(); resolve();});
      sock.once('error', () => {sock.destroy(); setTimeout(check, intervalMs);});
    }
    check();
  });
}

// --- build local edition ---------------------------------------------------

async function buildLocal() {
  console.log('[dev] building local edition …');
  await mkdir(runtimeDir, {recursive: true});
  await new Promise((resolve, reject) => {
    const go = spawn('go', ['build', '-tags', 'local', '-trimpath', '-o', localBin, './apps/local'], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {...process.env, CGO_ENABLED: '0'},
    });
    go.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`go build exit ${code}`))));
    go.on('error', reject);
  });
  console.log('[dev] local edition built → .runtime/local-dev');
}

// --- run -------------------------------------------------------------------

const children = new Map(); // label → ChildProcess

function teardownAll() {
  // Send SIGTERM to every child, then hard-kill after 3s.
  for (const [label, child] of children) {
    if (child.exitCode !== null) continue;
    console.log(`[dev] stopping ${label} …`);
    try {child.kill('SIGTERM');} catch {}
  }
  const forceTimer = setTimeout(() => {
    for (const [label, child] of children) {
      if (child.exitCode !== null) continue;
      console.log(`[dev] ${label} did not exit, sending SIGKILL`);
      try {child.kill('SIGKILL');} catch {}
    }
  }, 3000);
  // Give children a moment to exit gracefully before we terminate ourselves.
  const waitExit = new Promise((resolve) => {
    const check = () => {
      for (const child of children.values()) if (child.exitCode === null) return setTimeout(check, 100);
      resolve();
    };
    check();
  });
  waitExit.finally(() => clearTimeout(forceTimer));
  return waitExit;
}

function onChildExit(label, code, signal) {
  if (code === null && signal === null) return; // spawn error, will be handled separately
  console.log(`[dev] ${label} exited (code=${code}, signal=${signal})`);
  if (!children.has(label)) return; // already removed during teardown
  // If any child dies, tear everything down.
  teardownAll().finally(() => {
    process.exit(code ?? 128);
  });
}

function forwardSignals() {
  const handle = async (sig) => {
    console.log(`[dev] received ${sig}`);
    await teardownAll();
    process.exit(0);
  };
  process.on('SIGINT', () => handle('SIGINT'));
  process.on('SIGTERM', () => handle('SIGTERM'));
}

function startLocalPlatform() {
  const pgBin = resolvePGBin(repoRoot);
  console.log(`[dev] starting local platform (embedded PG + HTTP API, pg: ${pgBin}) …`);
  const child = spawn(localBin, [], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {...process.env, MCP_STUDIO_LOCAL_PG_BIN: pgBin},
  });
  children.set('platform', child);
  child.stdout.on('data', (d) => log('platform', d.toString()));
  child.stderr.on('data', (d) => log('platform', d.toString()));
  child.on('exit', (code, signal) => onChildExit('platform', code, signal));
  child.on('error', (err) => {
    console.error(`[dev] platform spawn error: ${err.message}`);
    process.exit(1);
  });
  return child;
}

function startVite() {
  console.log('[dev] starting vite dev server …');
  const child = spawn('npx', ['vite', '--config', 'apps/web/vite.config.ts'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  children.set('vite', child);
  child.stdout.on('data', (d) => log('vite', d.toString()));
  child.stderr.on('data', (d) => log('vite', d.toString()));
  child.on('exit', (code, signal) => onChildExit('vite', code, signal));
  child.on('error', (err) => {
    console.error(`[dev] vite spawn error: ${err.message}`);
    process.exit(1);
  });
  return child;
}

async function run() {
  forwardSignals();

  startLocalPlatform();

  // Wait for local platform to accept connections on its HTTP port.
  // Default listen is 127.0.0.1:8080; MCP_STUDIO_LISTEN overrides.
  const listen = process.env.MCP_STUDIO_LISTEN || '127.0.0.1:8080';
  const [host, port] = listen.split(':');
  console.log(`[dev] waiting for platform on ${host}:${port} …`);
  try {
    await waitPort(host, parseInt(port, 10), {timeoutMs: 60_000});
  } catch (err) {
    console.error(`[dev] platform did not become ready: ${err.message}`);
    await teardownAll();
    process.exit(1);
  }
  console.log(`[dev] platform ready on ${host}:${port}`);

  // Let vite use the same API target if not overridden.
  if (!process.env.MCP_STUDIO_DEV_API) {
    process.env.MCP_STUDIO_DEV_API = `http://${host}:${port}`;
  }
  startVite();
}

// --- main ------------------------------------------------------------------

try {
  if (buildOnly) {
    await buildLocal();
    process.exit(0);
  }

  if (!skipBuild || !existsSync(localBin)) {
    await buildLocal();
  }

  await run();
} catch (err) {
  console.error(`[dev] fatal: ${err.message}`);
  teardownAll().finally(() => process.exit(1));
}
