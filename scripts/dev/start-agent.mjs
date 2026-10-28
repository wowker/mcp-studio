// Dev launcher for the standalone Agent.
//
// Builds the Agent binary and runs it in the foreground against the dev
// platform started by `npm run dev`. The process keeps its own terminal so
// pairing and process confirmations still require a real TTY — run this in
// a separate terminal window.
//
// Usage:
//   node scripts/dev/start-agent.mjs           # default: build + run
//   node scripts/dev/start-agent.mjs --run      # skip build, run only
//   node scripts/dev/start-agent.mjs --build   # build only, no run
//
// Environment overrides:
//   MCP_STUDIO_DEV_API            workbench origin (default http://127.0.0.1:8080)
//   MCP_STUDIO_AGENT_STATE_DIR    Agent state dir (default .runtime/agent-dev-state)
//   MCP_STUDIO_AGENT_LISTEN       Agent loopback listen (default 127.0.0.1:45455)

import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join, resolve} from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const runtimeDir = join(repoRoot, '.runtime');
const agentBin = join(runtimeDir, 'agent-dev');
const stateDir = process.env.MCP_STUDIO_AGENT_STATE_DIR || join(runtimeDir, 'agent-dev-state');

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--run');
const buildOnly = args.has('--build');

const origin = process.env.MCP_STUDIO_DEV_API || 'http://127.0.0.1:8080';
const listen = process.env.MCP_STUDIO_AGENT_LISTEN || '127.0.0.1:45455';

async function buildAgent() {
  console.log('[dev:agent] building agent …');
  await mkdir(runtimeDir, {recursive: true});
  await new Promise((resolvePromise, reject) => {
    const go = spawn('go', ['build', '-o', agentBin, './cmd/agent'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    go.on('exit', (code) => (code === 0 ? resolvePromise() : reject(new Error(`go build exit ${code}`))));
    go.on('error', reject);
  });
  console.log('[dev:agent] agent built → .runtime/agent-dev');
}

try {
  if (!skipBuild || !existsSync(agentBin)) {
    await buildAgent();
  }
  if (buildOnly) process.exit(0);

  await mkdir(stateDir, {recursive: true});
  console.log(`[dev:agent] starting agent for ${origin} (state ${stateDir})`);
  console.log('[dev:agent] terminal confirmation stays in this window; pair from the workbench devices page');
  // stdio inherit keeps the TTY: pairing and execution confirmations must be
  // answerable on a real terminal, which piping would silently disable.
  const child = spawn(agentBin, [
    '--origin', origin,
    '--allow-insecure-loopback',
    '--listen', listen,
    '--state-dir', resolve(stateDir),
  ], {cwd: repoRoot, stdio: 'inherit', env: process.env});
  let exiting = false;
  // Forward stop signals: without this the launcher dies on SIGINT/SIGTERM
  // while the agent stays orphaned, holding its state lock and listen port.
  // The agent shuts down gracefully on the forwarded signal; we exit with its
  // code once it reports.
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      exiting = true;
      try {child.kill(sig);} catch {}
    });
  }
  child.on('exit', (code, signal) => {
    if (signal && !exiting) console.log(`[dev:agent] agent stopped (${signal})`);
    process.exit(exiting && code === null ? 0 : (code ?? 0));
  });
  child.on('error', (err) => {
    console.error(`[dev:agent] spawn error: ${err.message}`);
    process.exit(1);
  });
} catch (err) {
  console.error(`[dev:agent] fatal: ${err.message}`);
  process.exit(1);
}
