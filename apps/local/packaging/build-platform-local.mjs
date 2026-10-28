import { spawnSync } from 'node:child_process';
import { prepareCandidateDirectory } from './candidate-path.mjs';
import { createHash } from 'node:crypto';
import {
  mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync,
  readdirSync, lstatSync, existsSync, rmSync, openSync, closeSync,
} from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';

// globalThis.fetch is the Node 18+ built-in; we run on Node 24+.
const { fetch } = globalThis;

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const output = prepareCandidateDirectory(root, process.env.MCP_STUDIO_LOCAL_CANDIDATE_DIR);
const version = '0.1.0-m7-candidate';
const pgBins = JSON.parse(readFileSync(join(root, 'apps/local/packaging/pg-bins.json'), 'utf8'));

const run = (command, args, options = {}) => {
  const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
  if (r.status !== 0) throw new Error(`${command} failed: ${r.stderr || r.error || 'unknown failure'}`);
  return r.stdout.trim();
};

const digest = (data) => createHash('sha256').update(data).digest('hex');

const hostOS = process.platform === 'darwin' ? 'darwin'
  : process.platform === 'win32' ? 'windows'
  : process.platform === 'linux' ? 'linux'
  : null;
const hostArch = process.arch === 'arm64' ? 'arm64'
  : process.arch === 'x64' ? 'amd64'
  : null;

// Resolve Go binary basename per platform.
const goExecutable = (os) => os === 'windows' ? 'mcp-studio.exe' : 'mcp-studio';

// Each archive contains the Go binary, a pg/ directory with the 4 essential
// PostgreSQL tools (initdb, postgres, pg_ctl, pg_isready), the install
// wrapper, and manifest + checksums.
const pgBinaries = ['initdb', 'postgres', 'pg_ctl', 'pg_isready'];

// macOS thread-check shim: a DYLD interpose library that makes
// pthread_is_threaded_np() return 0 so PostgreSQL's postmaster does not abort
// on macOS 26+ (see pg-thread-shim/pg_no_multithread_check.c). Shipped next to
// the platform binary in darwin archives; internal/platform injects it via
// DYLD_INSERT_LIBRARIES (pgEnv). Other platforms ship no dylib — the race is
// macOS-specific.
const shimSource = join(root, 'apps/local/packaging/pg-thread-shim/pg_no_multithread_check.c');
const shimName = 'pg_no_multithread_check.dylib';

// Compile the shim for the host arch and ad-hoc sign it. Failure is fatal for
// a darwin package: without the dylib the local edition intermittently fails
// to start on macOS 26+, and a missing toolchain (cc/codesign) means the host
// cannot produce a valid darwin candidate anyway.
function buildThreadShim({ arch, dir }) {
  const out = join(dir, shimName);
  run('cc', ['-dynamiclib', '-arch', arch === 'arm64' ? 'arm64' : 'x86_64', '-O2', '-o', out, shimSource]);
  run('codesign', ['--force', '--sign', '-', out]);
}

async function downloadPG(ctx) {
  const { os, arch, dir } = ctx;
  const key = `${os}/${arch}`;
  const info = pgBins.downloads[key];
  if (!info) {
    console.warn(`[pg] no binary entry for ${key} — archive will ship without pg/ subdir`);
    return false;
  }
  const cacheDir = join(root, '.runtime', 'pg-cache', key);
  const cacheArchive = join(cacheDir, basename(new URL(info.url).pathname));
  const cacheMarker = join(cacheDir, '.sha256');

  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });

  // Verify against cached copy first.
  if (existsSync(cacheArchive)) {
    const cachedHash = digest(readFileSync(cacheArchive));
    if (info.sha256 && cachedHash !== info.sha256) {
      console.warn(`[pg] cached archive SHA256 mismatch (expected ${info.sha256}, got ${cachedHash}) — re-downloading`);
      rmSync(cacheArchive, { force: true });
      rmSync(cacheMarker, { force: true });
    } else {
      console.log(`[pg] using cached ${key} archive`);
    }
  }

  if (!existsSync(cacheArchive)) {
    console.log(`[pg] fetching ${info.url}`);
    const res = fetch(info.url, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`[pg] download failed: ${res.statusText} — archive will ship without pg/ subdir`);
      return false;
    }
    // Stream to disk; pg archives are tens of MB, don't buffer in memory.
    const tmp = cacheArchive + '.part';
    await pipeline(res.body, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
    const finalDigest = digest(readFileSync(tmp));
    if (info.sha256 && finalDigest !== info.sha256) {
      rmSync(tmp, { force: true });
      console.warn(`[pg] SHA256 mismatch after download — expected ${info.sha256}, got ${finalDigest} — skipping pg/`);
      return false;
    }
    rmSync(cacheArchive, { force: true });
    rmSync(tmp, { force: false });
    writeFileSync(cacheMarker, finalDigest);
  }

  // Extract only the 4 required binaries into dir/pg/. We don't need libpq
  // .dylibs/.so because Go connects via pgx native protocol, and we don't need
  // client tools like psql for the local edition.
  const pgOut = join(dir, 'pg');
  mkdirSync(pgOut, { mode: 0o700 });

  if (os === 'windows') {
    // Windows archives are never built from a Windows host in this
    // environment; cross-compile windows targets ship without pg/ and the
    // install script tells the user to install PG separately.
    console.warn('[pg] cross-compiled windows archive ships without pg/ — install PG separately');
    rmSync(pgOut, { recursive: true, force: true });
    return false;
  }

  // Tar.gz — EDB tarball layout is PostgreSQL-18/bin/<tool>. We extract just
  // the bin/ entries for our 4 tools, stripping down to flat names.
  const patterns = pgBinaries.map(name => `*bin/${name}`).concat(pgBinaries.map(name => `*bin/${name}.dylib`));
  const tarExtract = spawnSync('tar', [
    '--no-acls', '--no-xattrs', '-xzf', cacheArchive,
    '--strip-components=2',
    '-C', pgOut,
    '--wildcards',
    ...patterns,
  ], { encoding: 'utf8' });
  if (tarExtract.status !== 0) {
    console.warn(`[pg] tar extract failed: ${tarExtract.stderr || tarExtract.error || 'unknown'} — shipping without pg/`);
    rmSync(pgOut, { recursive: true, force: true });
    return false;
  }

  // chmod +x every extracted binary. tar strips keep original exec bit on
  // Unix, but be explicit.
  for (const name of pgBinaries) {
    const p = join(pgOut, name);
    if (existsSync(p)) chmodSync(p, 0o700);
  }

  // Verify we got all 4 binaries.
  const found = pgBinaries.filter(name => existsSync(join(pgOut, name)));
  if (found.length < pgBinaries.length) {
    console.warn(`[pg] only found ${found.length}/${pgBinaries.length} binaries after extract — shipping partial pg/`);
  }

  // Ad-hoc re-sign darwin binaries so the thread-check shim's
  // DYLD_INSERT_LIBRARIES injection is honored despite the original
  // hardened-runtime signature. Extraction restores the archive's original
  // signatures, so this must run at packaging time even if the cache was
  // previously re-signed.
  if (os === 'darwin') {
    for (const name of found) {
      run('codesign', ['--force', '--sign', '-', join(pgOut, name)]);
    }
  }
  return found.length > 0;
}

async function build() {
  const revision = run('git', ['rev-parse', 'HEAD']);
  const dirty = run('git', ['status', '--porcelain']).length > 0;

  // Source hash: Go + packaging files + pg-bins.json. Everything that feeds
  // into the candidate.
  const sources = [];
  function collect(dir) {
    for (const name of readdirSync(join(root, dir)).sort()) {
      const p = join(dir, name);
      const info = lstatSync(join(root, p));
      if (info.isDirectory()) collect(p);
      else if (/\.(go|c|m|mjs|sh|json|sql|txt)$/.test(p) || /go\.(mod|sum)$/.test(p) || p.endsWith('pg-bins.json')) {
        sources.push(p);
      }
    }
  }
  collect('apps/local');
  collect('internal');
  collect('migrations');
  for (const name of ['go.mod', 'go.sum']) sources.push(name);
  const sourceHash = digest(sources.sort().map(p => `${p}\0${digest(readFileSync(join(root, p)))}`).join('\n'));

  const targets = [
    { os: 'darwin', arch: 'arm64', cgo: '1' },
    { os: 'linux', arch: 'amd64', cgo: '0' },
    { os: 'linux', arch: 'arm64', cgo: '0' },
    { os: 'windows', arch: 'amd64', cgo: '0' },
  ];

  const artifacts = [];
  const goVersion = run('go', ['version']);
  const ldflags = `-X main.version=${version} -X main.revision=${revision}${dirty ? '-dirty' : ''}`;

  for (const target of targets) {
    const name = `mcp-studio-local-${version}-${target.os}-${target.arch}`;
    const dir = join(output, name);
    if (existsSync(dir)) throw new Error('Output exists; move previous candidate directory before rebuilding.');
    mkdirSync(dir, { mode: 0o700 });

    // 1. Compile Go binary.
    const executable = goExecutable(target.os);
    const binary = join(dir, executable);
    const buildEnv = {
      ...process.env,
      GOOS: target.os,
      GOARCH: target.arch,
      CGO_ENABLED: target.cgo,
      GOCACHE: process.env.GOCACHE || '/tmp/mcp-studio-go-cache',
    };
    run('go', ['build', '-tags', 'local', '-trimpath', '-ldflags', ldflags, '-o', binary, './apps/local'], { env: buildEnv });

    // 2. Download + extract PG binaries (only for matching host, since we
    //    cross-compile Go but PG binary downloads are host-native for now).
    const isHostTarget = target.os === hostOS && target.arch === hostArch;
    let pgIncluded = false;
    if (isHostTarget) {
      pgIncluded = await downloadPG({ os: target.os, arch: target.arch, dir });
    } else {
      console.log(`[pg] skipping ${target.os}/${target.arch} (cross-compile target without matching host)`);
    }

    // 2b. macOS thread-check shim, next to the platform binary where
    //     pgThreadShimPath resolution rule 2 finds it. Darwin host target only.
    const shimIncluded = isHostTarget && target.os === 'darwin';
    if (shimIncluded) {
      buildThreadShim({ arch: target.arch, dir });
      console.log(`[shim] built ${shimName} for darwin/${target.arch}`);
    }

    // 3. Install wrapper.
    const wrapper = target.os === 'windows' ? 'install-platform.ps1' : 'install-platform.sh';
    const wrapperPath = join(root, 'apps/local/packaging', wrapper);
    if (existsSync(wrapperPath)) {
      copyFileSync(wrapperPath, join(dir, wrapper));
      if (target.os !== 'windows') chmodSync(join(dir, wrapper), 0o700);
    } else {
      console.warn(`[pkg] missing wrapper ${wrapperPath} — archive will ship without install script`);
    }

    // 4. Manifest.
    const manifest = {
      format: 'mcp-studio-local.candidate.v1',
      version, revision, dirty, sourceSHA256: sourceHash,
      target, goVersion,
      binarySHA256: digest(readFileSync(binary)),
      pgIncluded,
      pgThreadShim: shimIncluded,
      pgVersion: pgBins.version,
      support: 'pending-native-validation',
      signing: 'unsigned-not-published',
    };
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

    // 5. Checksums — everything except directories and the checksums file itself.
    const relFiles = [];
    function walk(d, rel) {
      for (const entry of readdirSync(join(dir, d), { withFileTypes: true })) {
        const sub = join(d, entry.name);
        const relp = join(rel, entry.name);
        if (entry.isDirectory()) walk(sub, relp);
        else relFiles.push(relp);
      }
    }
    walk('.', '.');
    const checksums = relFiles.map(p => `${digest(readFileSync(join(dir, p)))}  ${p}`).join('\n') + '\n';
    writeFileSync(join(dir, 'CHECKSUMS.sha256'), checksums);

    // 6. Archive.
    const archive = join(output, `${name}.${target.os === 'windows' ? 'zip' : 'tar.gz'}`);
    if (target.os === 'windows') {
      run('zip', ['-q', '-r', archive, name], { cwd: output });
    } else {
      run('tar', ['--no-acls', '--no-xattrs', '-czf', archive, '-C', output, name], {
        cwd: output,
        env: { ...process.env, COPYFILE_DISABLE: '1' },
      });
    }
    artifacts.push({ file: relative(output, archive), sha256: digest(readFileSync(archive)), ...manifest });
  }

  // Top-level manifest + checksums.
  writeFileSync(join(output, 'manifest.json'), JSON.stringify({
    format: 'mcp-studio-local.delivery.v1',
    version, revision, dirty, sourceSHA256: sourceHash,
    pgVersion: pgBins.version,
    artifacts,
  }, null, 2) + '\n');

  const topChecksums = artifacts.map(a => `${a.sha256}  ${a.file}`).concat(
    `${digest(readFileSync(join(output, 'manifest.json')))}  manifest.json`,
  ).join('\n') + '\n';
  writeFileSync(join(output, 'CHECKSUMS.sha256'), topChecksums);

  process.stdout.write(JSON.stringify({
    output, version, revision, dirty,
    sourceSHA256: sourceHash, pgVersion: pgBins.version,
    artifacts: artifacts.map(({ file, sha256, target, pgIncluded }) => ({ file, sha256, target, pgIncluded })),
  }, null, 2) + '\n');
}

build().catch(err => { console.error(`\n[pkg] build-platform-local.mjs failed: ${err.message}`); process.exit(1); });
