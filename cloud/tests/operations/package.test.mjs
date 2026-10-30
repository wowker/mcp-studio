import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { regularTarFiles } from './archive-headers.mjs';
import { copyAllowlisted, candidateFiles, archiveBundle } from '../../scripts/package-candidate.mjs';

test('handoff copies only explicit regular files and refuses escape, links and overwrite', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm7-package-'));
  try {
    const source = join(root, 'source'), target = join(root, 'target');
    await mkdir(source); await mkdir(target);
    await writeFile(join(source, 'guide.md'), 'public guide');
    await writeFile(join(source, 'secret.key'), 'do not distribute');
    await symlink('secret.key', join(source, 'alias.md'));
    const copied = await copyAllowlisted(source, target, ['guide.md']);
    assert.equal(copied[0].sha256, createHash('sha256').update('public guide').digest('hex'));
    assert.equal(await readFile(join(target, 'guide.md'), 'utf8'), 'public guide');
    await assert.rejects(readFile(join(target, 'secret.key')), { code: 'ENOENT' });
    await assert.rejects(copyAllowlisted(source, target, ['../escape']), /Unsafe/);
    await assert.rejects(copyAllowlisted(source, target, ['alias.md']), /regular/);
    await assert.rejects(copyAllowlisted(source, target, ['secret.key']), /Unsafe/);
    await assert.rejects(copyAllowlisted(source, target, ['guide.md']), { code: 'EEXIST' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('candidate archive contains the allowlist even when macOS source files have extended metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm7-metadata-'));
  try {
    const bundle = join(root, 'bundle'); await mkdir(bundle);
    await writeFile(join(bundle, 'guide.md'), 'public guide');
    execFileSync('xattr', ['-w', 'com.apple.m7test', 'owned fixture metadata', join(bundle, 'guide.md')]);
    const archive = join(root, 'handoff.tar.gz'); archiveBundle(bundle, archive);
    // BSD tar's listing hides AppleDouble entries; inspect physical TAR headers independently.
    const raw = gunzipSync(await readFile(archive)); const names = regularTarFiles(archive);
    assert.deepEqual(names, ['bundle/guide.md']);
    assert.equal(raw.includes(Buffer.from('owned fixture metadata')), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('candidate archive selection checks each declared hash and rejects traversal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'm7-archives-'));
  try {
    const name = 'mcp-studio-agent-0.1.0-m7-candidate-linux-amd64.tar.gz';
    await writeFile(join(root, name), 'synthetic archive');
    const manifest = { version: '0.1.0-m7-candidate', artifacts: [{ file: name, sha256: createHash('sha256').update('synthetic archive').digest('hex') }] };
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(root, 'CHECKSUMS.sha256'), 'archive hashes');
    assert.deepEqual(await candidateFiles(root), [name, 'manifest.json', 'CHECKSUMS.sha256']);
    await writeFile(join(root, name), 'tampered');
    await assert.rejects(candidateFiles(root), /checksum/);
    manifest.artifacts[0].file = '../secret.key';
    await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
    await assert.rejects(candidateFiles(root), /Unsafe/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
