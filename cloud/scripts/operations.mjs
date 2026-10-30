import { mkdir, writeFile, readFile, lstat, readdir, unlink, rm, open } from 'node:fs/promises';
import { createHash, randomBytes, X509Certificate, createPrivateKey, createPublicKey } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { isIP } from 'node:net';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const deploy = resolve('apps/cloud/deploy');
const marker = '.mcp-studio-backup-store';
const archiveName = /^studio-\d{8}-[a-f0-9]{16}$/u;
async function fileDigest(path) { const hash = createHash('sha256'); for await (const chunk of createReadStream(path))
    hash.update(chunk); return hash.digest('hex'); }
export async function provision(directory, { origin, smtpAddress, smtpFrom, cert, key, backupEnabled = false } = {}) {
    let url;
    try {
        url = new URL(origin);
        const certificate = new X509Certificate(cert);
        const pub = createPublicKey(createPrivateKey(key)).export({ format: 'der', type: 'spki' });
        if (url.protocol !== 'https:' || url.origin !== origin || !smtpAddress || !/^\S+:\d+$/u.test(smtpAddress) || !smtpFrom || /[\r\n]/u.test(smtpFrom) || !certificate.publicKey.export({ format: 'der', type: 'spki' }).equals(pub) || !(isIP(url.hostname) ? certificate.checkIP(url.hostname) : certificate.checkHost(url.hostname)) || new Date(certificate.validTo) <= new Date())
            throw Error();
    }
    catch {
        throw Error('deployment configuration invalid');
    }
    const path = resolve(directory);
    await mkdir(path, { mode: 0o700 });
    try {
        const password = randomBytes(32).toString('hex');
        const values = { app_db_password: password, admin_db_password: randomBytes(32).toString('hex'), database_url: `postgres://mcp_studio_app:${password}@db:5432/mcp_studio?sslmode=disable&search_path=app`, init_credential: randomBytes(32).toString('hex'), tls_cert: cert, tls_key: key };
        if (backupEnabled)
            values.backup_key = randomBytes(32).toString('base64');
        for (const [name, value] of Object.entries(values))
            await writeFile(join(path, name), typeof value === 'string' ? value + '\n' : value, { flag: 'wx', mode: 0o444 });
        await writeFile(join(path, 'configuration.json'), JSON.stringify({ format: 1, origin, smtpAddress, smtpFrom, backupEnabled }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        return path;
    }
    catch {
        await rm(path, { recursive: true, force: true });
        throw Error('deployment provisioning failed');
    }
}
export async function deploymentEnv(directory) { const path = resolve(directory); const cfg = JSON.parse(await readFile(join(path, 'configuration.json'), 'utf8')); const url = new URL(cfg.origin); return { STUDIO_SECRETS_DIR: path, STUDIO_ORIGIN: cfg.origin, STUDIO_HTTPS_PORT: url.port || '443', STUDIO_SMTP_ADDRESS: cfg.smtpAddress, STUDIO_SMTP_FROM: cfg.smtpFrom }; }
export async function composeArgs(directory, project, args = []) { if (!/^[a-z0-9][a-z0-9_-]+$/u.test(project))
    throw Error('invalid compose project'); const cfg = JSON.parse(await readFile(join(resolve(directory), 'configuration.json'), 'utf8')); return ['compose', '--project-directory', deploy, '-p', project, '-f', join(deploy, 'compose.json'), ...cfg.backupEnabled ? ['-f', join(deploy, 'backup.compose.json')] : [], ...args]; }
export async function compose(directory, project, args, { input, output, includeStderr = false } = {}) { const argv = await composeArgs(directory, project, args); const env = { ...process.env, ...await deploymentEnv(directory) }; return new Promise((ok, fail) => { const child = spawn('docker', argv, { env, stdio: ['pipe', 'pipe', 'pipe'] }); let data = []; child.stderr.on('data', b => { if (includeStderr && data.reduce((n, x) => n + x.length, 0) + b.length <= 65536)
    data.push(b); }); if (output)
    child.stdout.pipe(output);
else
    child.stdout.on('data', b => { if (data.reduce((n, x) => n + x.length, 0) + b.length > 16 * 1024 * 1024) {
        child.kill();
        return;
    } data.push(b); }); child.once('error', () => fail(Error('compose transport unavailable'))); child.once('exit', code => code === 0 ? ok(Buffer.concat(data)) : fail(Error(`compose command failed (exit ${code})`))); child.stdin.on('error', () => { }); if (input && typeof input.pipe === 'function') {
    input.on('error', () => child.kill());
    input.pipe(child.stdin);
}
else if (input)
    child.stdin.end(input);
else
    child.stdin.end(); }); }
const pgPrefix = 'read -r PGPASSWORD < /run/secrets/app_db_password; export PGPASSWORD; ';
export async function sql(directory, project, query) { return (await compose(directory, project, ['exec', '-T', 'db', 'sh', '-c', pgPrefix + 'exec psql -X -q -At -v ON_ERROR_STOP=1 -U mcp_studio_app -d mcp_studio'], { input: query + '\n' })).toString().trim(); }
async function managed(directory, create = false) { const path = resolve(directory); try {
    if (create)
        await mkdir(path, { mode: 0o700 });
}
catch (e) {
    if (e.code !== 'EEXIST')
        throw e;
} const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== 'win32' && (info.mode & 0o077) !== 0)
    throw Error('unsafe backup store'); try {
    const i = await lstat(join(path, marker));
    if (!i.isFile() || i.isSymbolicLink())
        throw Error();
}
catch {
    if (!create || (await readdir(path)).length)
        throw Error('managed backup store required');
    await writeFile(join(path, marker), '1\n', { mode: 0o600, flag: 'wx' });
} return path; }
export async function backupDatabase(directory, project, store) { const root = await managed(store, true); const name = 'studio-' + new Date().toISOString().slice(0, 10).replaceAll('-', '') + '-' + randomBytes(8).toString('hex'); const file = join(root, name + '.dump'); const fd = await open(file, 'wx', 0o600); const stream = fd.createWriteStream(); try {
    const done = new Promise((ok, fail) => { stream.once('finish', ok); stream.once('error', fail); });
    await compose(directory, project, ['exec', '-T', 'db', 'sh', '-c', pgPrefix + 'exec pg_dump -U mcp_studio_app -d mcp_studio -Fc -n app'], { output: stream });
    await done;
    const info = await lstat(file);
    const hash = await fileDigest(file);
    await writeFile(join(root, name + '.json'), JSON.stringify({ format: 1, file: basename(file), createdAt: new Date().toISOString(), sha256: hash, bytes: info.size, secretKey: 'Not included: retain matching platform key in separate secret custody' }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    return file;
}
catch {
    stream.destroy();
    await fd.close().catch(() => { });
    await unlink(file).catch(() => { });
    throw Error('database backup failed');
} }
export function restoreTOC(toc) { const lines = toc.split('\n'); const schemas = lines.filter(line => /^\d+; \d+ \d+ SCHEMA /u.test(line)); if (schemas.length !== 1 || !/^\d+; \d+ \d+ SCHEMA - app(?: |$)/u.test(schemas[0]))
    throw Error('archive schema must be exactly app'); return lines.filter(line => line !== schemas[0]).join('\n'); }
export async function restoreDatabase(directory, project, file, { emptyTargetConfirmed = false } = {}) { if (!emptyTargetConfirmed)
    throw Error('empty target confirmation required'); const name = basename(file, '.dump'); if (!archiveName.test(name))
    throw Error('invalid archive'); const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink())
    throw Error('unsafe archive'); const meta = JSON.parse(await readFile(file.slice(0, -5) + '.json', 'utf8')); const hash = await fileDigest(file); if (meta.format !== 1 || meta.file !== basename(file) || meta.bytes !== info.size || meta.sha256 !== hash)
    throw Error('archive integrity failed'); const count = await sql(directory, project, "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='app'"); if (count !== '0')
    throw Error('restore requires empty application schema'); const toc = restoreTOC((await compose(directory, project, ['exec', '-T', 'db', 'pg_restore', '--list'], { input: createReadStream(file) })).toString()); const list = '/tmp/studio-toc-' + randomBytes(8).toString('hex'); try {
    await compose(directory, project, ['exec', '-T', 'db', 'sh', '-c', 'umask 077; cat >' + list], { input: toc });
    await compose(directory, project, ['exec', '-T', 'db', 'sh', '-c', pgPrefix + 'exec pg_restore -U mcp_studio_app -d mcp_studio --use-list=' + list + ' --no-owner --no-acl --single-transaction --exit-on-error'], { input: createReadStream(file) });
}
finally {
    await compose(directory, project, ['exec', '-T', 'db', 'rm', '-f', list]);
} }
export async function purgeBackups(directory, { days = 30, now = new Date() } = {}) {
    if (!Number.isInteger(days) || days < 1 || days > 30 || !Number.isFinite(now.getTime()))
        throw Error('retention must be 1–30 days');
    const root = await managed(directory), names = new Set((await readdir(root)).flatMap(file => { const match = /^(studio-\d{8}-[a-f0-9]{16})\.(?:json|dump)$/u.exec(file); return match ? [match[1]] : []; }));
    let count = 0, unsafe = false;
    const info = async (file) => { try {
        const value = await lstat(file);
        if (!value.isFile() || value.isSymbolicLink())
            throw Error('unsafe');
        return value;
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return undefined;
        throw e;
    } };
    for (const name of [...names].sort()) {
        const data = join(root, name + '.dump'), metaFile = join(root, name + '.json');
        try {
            const metaInfo = await info(metaFile), dataInfo = await info(data);
            if (!metaInfo) {
                if (dataInfo && now - dataInfo.mtime >= days * 86400000) {
                    await unlink(data);
                    count++;
                }
                continue;
            }
            const meta = JSON.parse(await readFile(metaFile, 'utf8'));
            const age = now - new Date(meta.createdAt);
            if (meta.format !== 1 || meta.file !== name + '.dump' || !Number.isFinite(age))
                throw Error('unsafe');
            // A completed dump deletion may precede metadata deletion. Retry safely.
            if (!dataInfo) {
                await unlink(metaFile);
                continue;
            }
            if (age >= days * 86400000) {
                await unlink(data);
                count++;
                await unlink(metaFile);
            }
        }
        catch {
            unsafe = true;
        }
    }
    // Never let an unsafe family prevent expiration of other owned archives.
    // A nonzero result still tells the operator to inspect remaining unsafe files.
    if (unsafe)
        throw Error('unsafe managed archive requires operator attention');
    return count;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [operation, directory, project, path, confirmation] = process.argv.slice(2);
    try {
        if (operation === 'backup') {
            await backupDatabase(directory, project, path);
            console.log('Private database archive created; key remains separate.');
        }
        else if (operation === 'restore') {
            await restoreDatabase(directory, project, path, { emptyTargetConfirmed: confirmation === '--empty-target-confirmed' });
            console.log('Archive restored into empty application schema.');
        }
        else if (operation === 'purge') {
            console.log(JSON.stringify({ deleted: await purgeBackups(directory, { days: Number(project ?? 30) }), mediaAcceptance: 'pending' }));
        }
        else
            throw Error('expected backup/restore/purge; see operations guide');
    }
    catch (e) {
        console.error(e.message);
        process.exitCode = 1;
    }
}
