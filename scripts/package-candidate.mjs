import { open, mkdir, readdir, lstat, writeFile, readFile } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { prepareCandidateDirectory } from '../packaging/candidate-path.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
function safe(name) {
  if (isAbsolute(name) || name.includes('\\') || name.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) || !/\.(md|json|csv|sql|mjs|sh|sha256|log|txt|pkg|zip|tar\.gz)$/.test(name)) throw new Error('Unsafe delivery file.');
}
export async function digestFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export async function copyAllowlisted(source, target, names) {
  const entries = [];
  for (const name of names) {
    safe(name);
    let ancestor = source;
    for (const segment of name.split('/').slice(0, -1)) { ancestor = join(ancestor, segment); const info = await lstat(ancestor); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Delivery ancestor must be regular directory.'); }
    const info = await lstat(join(source, name));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Delivery source must be regular file.');
    const input = await open(join(source, name), 'r');
    try {
      const current = await input.stat();
      if (current.ino !== info.ino || current.dev !== info.dev) throw new Error('Delivery source changed.');
      await mkdir(dirname(join(target, name)), { recursive: true, mode: 0o700 });
      await pipeline(input.createReadStream({ autoClose: false }), createWriteStream(join(target, name), { flags: 'wx', mode: name.endsWith('.sh') ? 0o755 : 0o644 }));
    } finally { await input.close(); }
    entries.push({ file: name, bytes: info.size, sha256: await digestFile(join(target, name)) });
  }
  return entries;
}
export async function candidateFiles(directory) {
  const manifestInfo = await lstat(join(directory, 'manifest.json'));
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink()) throw new Error('Candidate manifest must be regular file.');
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== '0.1.0-m7-candidate' || !Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) throw new Error('Invalid candidate manifest.');
  const files = [];
  for (const artifact of manifest.artifacts) {
    safe(artifact.file);
    if (artifact.file.includes('/') || !/^mcp-studio-agent-0\.1\.0-m7-candidate-(darwin|windows|linux)-(arm64|amd64)(-unsigned)?\.(tar\.gz|pkg|zip)$/.test(artifact.file)) throw new Error('Unsafe candidate archive.');
    const info = await lstat(join(directory, artifact.file));
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Candidate archive must be regular file.');
    if (await digestFile(join(directory, artifact.file)) !== artifact.sha256) throw new Error('Candidate checksum mismatch.');
    if (files.includes(artifact.file)) throw new Error('Duplicate candidate archive.');
    files.push(artifact.file);
  }
  return [...files, 'manifest.json', 'CHECKSUMS.sha256'];
}
async function tree(dir) {
  const names = [];
  for (const item of await readdir(join(root, dir), { withFileTypes: true })) {
    const name = dir + '/' + item.name;
    if (item.isDirectory()) names.push(...await tree(name)); else names.push(name);
  }
  return names.sort();
}
async function saveImage(file) {
  const child = spawn('docker', ['save', 'mcp-studio-platform:m7-candidate'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const completed = new Promise((ok, fail) => { child.once('error', fail); child.once('exit', code => code === 0 ? ok() : fail(new Error('Local image export failed.'))); });
  // Attach both rejection handlers immediately; a failed exporter cannot be mistaken for an archive.
  await Promise.all([completed, pipeline(child.stdout, createGzip(), createWriteStream(file, { flags: 'wx', mode: 0o600 }))]);
}
async function main() {
  const evidence = resolve(process.argv[2] ?? 'tests/evidence/m7-final');
  const location = JSON.parse(await readFile(join(evidence, 'candidate-location.json'), 'utf8'));
  if (location.gates !== 'passed') throw new Error('A completed candidate gate is required.');
  const output = prepareCandidateDirectory(root, resolve('.runtime', 'm7-handoff-' + randomBytes(8).toString('hex')));
  const bundle = join(output, 'mcp-studio-m7-candidate'); await mkdir(bundle, { mode: 0o700 });
  const files = [...await tree('deploy'), ...await tree('contracts'), ...(await tree('migrations')).filter(p => p.endsWith('.sql')), 'scripts/operations.mjs', 'docs/operations/deployment-recovery.md', 'docs/operations/agent-distribution.md', 'docs/tasks/m7-review.md', 'docs/tasks/m7-acceptance-index.json'];
  // Dockerfile and Caddyfile have no suffix; their known public configuration is copied separately.
  const special = files.filter(p => /\/(Dockerfile|Caddyfile)$/.test(p));
  const normal = files.filter(p => !special.includes(p));
  const entries = await copyAllowlisted(root, bundle, normal);
  for (const name of special) {
    const info = await lstat(join(root, name)); if (!info.isFile() || info.isSymbolicLink()) throw new Error('Unsafe public configuration.');
    await writeFile(join(bundle, name), await readFile(join(root, name)), { flag: 'wx', mode: 0o644 });
    entries.push({ file: name, bytes: info.size, sha256: await digestFile(join(bundle, name)) });
  }
  const agentTarget = join(bundle, 'agent'); await mkdir(agentTarget, { mode: 0o700 });
  entries.push(...(await copyAllowlisted(location.directory, agentTarget, await candidateFiles(location.directory))).map(x => ({ ...x, file: 'agent/' + x.file })));
  const proofTarget = join(bundle, 'evidence'); await mkdir(proofTarget, { mode: 0o700 });
  entries.push(...(await copyAllowlisted(evidence, proofTarget, ['manifest.json', 'verify.log', 'results.json', 'deployment-report.json', 'cleanup.json'])).map(x => ({ ...x, file: 'evidence/' + x.file })));
  const image = JSON.parse(execFileSync('docker', ['image', 'inspect', 'mcp-studio-platform:m7-candidate', '--format', '{{json .}}'], { encoding: 'utf8' }));
  const imageFile = join(bundle, 'platform-image.tar.gz'); await saveImage(imageFile);
  entries.push({ file: 'platform-image.tar.gz', bytes: (await lstat(imageFile)).size, sha256: await digestFile(imageFile) });
  const manifest = { format: 'mcp-studio.delivery.candidate.v1', version: '0.1.0-m7-candidate', implementationRevision: JSON.parse(await readFile(join(evidence, 'manifest.json'))).implementationRevision, platformImage: { id: image.Id, os: image.Os, architecture: image.Architecture, tag: 'mcp-studio-platform:m7-candidate' }, publication: 'not-authorized', support: 'pending-native-manual-media-validation', entries: entries.sort((a, b) => a.file.localeCompare(b.file)) };
  await writeFile(join(bundle, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  await writeFile(join(bundle, 'CHECKSUMS.sha256'), [...manifest.entries.map(x => `${x.sha256}  ${x.file}`), `${await digestFile(join(bundle, 'manifest.json'))}  manifest.json`].join('\n') + '\n', { flag: 'wx', mode: 0o600 });
  const archive = join(output, 'mcp-studio-m7-candidate.tar.gz');
  execFileSync('tar', ['-czf', archive, '-C', output, 'mcp-studio-m7-candidate']);
  const result = { archive, sha256: await digestFile(archive), bytes: (await lstat(archive)).size, manifest: join(bundle, 'manifest.json'), publication: 'not-authorized' };
  await writeFile(join(evidence, 'delivery.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Candidate handoff failed; no publication occurred.'); process.exitCode = 1; });
