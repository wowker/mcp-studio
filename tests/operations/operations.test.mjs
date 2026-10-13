import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('managed backup retention refuses >30d and unsafe stores, removes only expired owned archives', async () => { const { purgeBackups } = await import('../../scripts/operations.mjs'); const root = await mkdtemp(join(tmpdir(), 'm7-retention-')); try {
    await assert.rejects(purgeBackups(root, { days: 31 }), /retention/);
    await assert.rejects(purgeBackups(root, { days: 30 }), /managed/);
    await writeFile(join(root, '.mcp-studio-backup-store'), '1\n');
    const old = 'studio-20000101-aaaaaaaaaaaaaaaa';
    const recent = 'studio-20990101-bbbbbbbbbbbbbbbb';
    for (const [name, date] of [[old, '2000-01-01T00:00:00Z'], [recent, '2099-01-01T00:00:00Z']]) {
        await writeFile(join(root, name + '.dump'), 'private fixture');
        await writeFile(join(root, name + '.json'), JSON.stringify({ format: 1, file: name + '.dump', createdAt: date }));
    }
    await writeFile(join(root, 'unmanaged-key'), 'retained');
    assert.equal(await purgeBackups(root, { days: 30, now: new Date('2026-10-13T00:00:00Z') }), 1);
    await assert.rejects(stat(join(root, old + '.dump')));
    assert.equal(await readFile(join(root, 'unmanaged-key'), 'utf8'), 'retained');
    assert.ok(await stat(join(root, recent + '.dump')));
    await symlink(join(root, recent + '.dump'), join(root, 'studio-20000101-cccccccccccccccc.dump'));
    await writeFile(join(root, 'studio-20000101-cccccccccccccccc.json'), JSON.stringify({ format: 1, file: 'studio-20000101-cccccccccccccccc.dump', createdAt: '2000-01-01T00:00:00Z' }));
    await assert.rejects(purgeBackups(root, { days: 30 }), /unsafe/);
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('provision rejects invalid configuration without writing secrets or overwriting any existing directory', async () => { const { provision } = await import('../../scripts/operations.mjs'); const root = await mkdtemp(join(tmpdir(), 'm7-provision-')); try {
    await assert.rejects(provision(join(root, 'new'), { origin: 'http://localhost' }), /configuration/);
    await assert.rejects(stat(join(root, 'new')));
    await writeFile(join(root, 'sentinel'), 'keep');
    await assert.rejects(provision(root, { origin: 'https://example.test' }));
    assert.equal(await readFile(join(root, 'sentinel'), 'utf8'), 'keep');
}
finally {
    await rm(root, { recursive: true, force: true });
} });
test('provision accepts a matching DNS certificate and keeps secrets outside compose environment values', async () => { const { provision, deploymentEnv } = await import('../../scripts/operations.mjs'); const { temporaryTLS } = await import('../fixtures/m2/tls.mjs'); const tls = await temporaryTLS(); const root = await mkdtemp(join(tmpdir(), 'm7-provision-tls-')); try {
    const target = join(root, 'private');
    await provision(target, { origin: 'https://localhost:8443', smtpAddress: 'mail.example.test:587', smtpFrom: 'studio@example.test', ...tls.options });
    const env = await deploymentEnv(target);
    assert.equal(env.STUDIO_ORIGIN, 'https://localhost:8443');
    assert.equal(env.MCP_STUDIO_DATABASE_URL, undefined);
    assert.equal((await stat(target)).mode & 0o777, 0o700);
    assert.equal((await stat(join(target, 'database_url'))).mode & 0o777, 0o444);
    assert.equal(await readFile(join(target, 'backup_key'), 'utf8').catch(() => ''), '');
    await assert.rejects(provision(target, { origin: 'https://localhost:8443', smtpAddress: 'mail.example.test:587', smtpFrom: 'studio@example.test', ...tls.options }));
}
finally {
    await tls.close();
    await rm(root, { recursive: true, force: true });
} });
test('restore TOC skips only the preprovisioned app schema and rejects unrelated schema archives', async () => { const { restoreTOC } = await import('../../scripts/operations.mjs'); const toc = '; archive\n5; 2615 123 SCHEMA - app mcp_studio_app\n6; 1259 124 TABLE app users mcp_studio_app\n7; 0 124 TABLE DATA app users mcp_studio_app\n'; const filtered = restoreTOC(toc); assert.ok(!filtered.includes('SCHEMA - app')); assert.ok(filtered.includes('TABLE DATA app users')); assert.throws(() => restoreTOC(toc.replace('SCHEMA - app', 'SCHEMA - other')), /schema/); assert.throws(() => restoreTOC(toc + '8; 2615 125 SCHEMA - another owner\n'), /schema/); });
test('interrupted purge and dump fragments do not block later managed expiration', async () => { const { purgeBackups } = await import('../../scripts/operations.mjs'); const { utimes } = await import('node:fs/promises'); const root = await mkdtemp(join(tmpdir(), 'm7-orphan-')); try {
    await writeFile(join(root, '.mcp-studio-backup-store'), '1\n');
    const orphan = 'studio-20000101-aaaaaaaaaaaaaaaa', complete = 'studio-20000101-bbbbbbbbbbbbbbbb', partial = 'studio-20000101-cccccccccccccccc';
    await writeFile(join(root, orphan + '.json'), JSON.stringify({ format: 1, file: orphan + '.dump', createdAt: '2000-01-01T00:00:00Z' }));
    await writeFile(join(root, complete + '.json'), JSON.stringify({ format: 1, file: complete + '.dump', createdAt: '2000-01-01T00:00:00Z' }));
    await writeFile(join(root, complete + '.dump'), 'fixture');
    await writeFile(join(root, partial + '.dump'), 'partial private fixture');
    await utimes(join(root, partial + '.dump'), new Date('2000-01-01'), new Date('2000-01-01'));
    await writeFile(join(root, 'unmanaged'), 'keep');
    assert.equal(await purgeBackups(root, { days: 30, now: new Date('2026-10-13') }), 2);
    for (const name of [orphan + '.json', complete + '.json', complete + '.dump', partial + '.dump'])
        await assert.rejects(stat(join(root, name)));
    assert.equal(await readFile(join(root, 'unmanaged'), 'utf8'), 'keep');
    assert.equal(await purgeBackups(root, { days: 30 }), 0);
}
finally {
    await rm(root, { recursive: true, force: true });
} });
