// Shared PostgreSQL binary resolution for local-edition dev and verify gates.
//
// Precedence (first directory containing initdb, postgres, pg_ctl and
// pg_isready wins):
//   1. MCP_STUDIO_LOCAL_PG_BIN (explicit bin directory)
//   2. MCP_STUDIO_LOCAL_PG_DIR/<…>/bin (installation prefix)
//   3. PATH entries
//   4. Repo-local download cache .runtime/pg-cache/<platform>/<arch>/pgsql/bin
//      (populated by apps/local/packaging or a manual Postgres.app extract)
//
// The Go binary performs 1–3 itself; this helper exists so Node-side
// orchestrators can pick up the repo cache and fail with a clear message.

import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {platform, arch} from 'node:os';

const TOOLS = ['initdb', 'postgres', 'pg_ctl', 'pg_isready'];

function dirHasAll(dir) {
  return TOOLS.every((tool) => existsSync(join(dir, tool)));
}

export function resolvePGBin(repoRoot) {
  const explicitBin = process.env.MCP_STUDIO_LOCAL_PG_BIN;
  if (explicitBin) {
    if (dirHasAll(explicitBin)) return explicitBin;
    throw new Error(`MCP_STUDIO_LOCAL_PG_BIN=${explicitBin} is missing one of ${TOOLS.join(', ')}`);
  }
  const explicitDir = process.env.MCP_STUDIO_LOCAL_PG_DIR;
  if (explicitDir) {
    const bin = join(explicitDir, 'bin');
    if (dirHasAll(bin)) return bin;
    throw new Error(`MCP_STUDIO_LOCAL_PG_DIR=${explicitDir} is missing bin/{${TOOLS.join(',')}}`);
  }
  for (const dir of (process.env.PATH || '').split(':')) {
    if (dir && dirHasAll(dir)) return dir;
  }
  const cache = join(repoRoot, '.runtime', 'pg-cache', platform(), arch(), 'pgsql', 'bin');
  if (dirHasAll(cache)) return cache;
  throw new Error(
    'PostgreSQL binaries not found. Install PostgreSQL 18 (e.g. Homebrew postgresql@18 or Postgres.app), ' +
    'set MCP_STUDIO_LOCAL_PG_BIN to its bin directory, or populate .runtime/pg-cache/<platform>/<arch>/pgsql.',
  );
}
