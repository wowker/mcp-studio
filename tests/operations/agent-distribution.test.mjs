import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, existsSync, symlinkSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root=resolve('.');
const output=process.env.MCP_STUDIO_CANDIDATE_DIR || join(root,'.runtime','distribution');
const candidate=join(output,'mcp-studio-agent-0.1.0-m7-candidate-darwin-arm64');
const command=(args)=>spawnSync(join(candidate,'mcp-studio-agent'),args,{encoding:'utf8'});
test('production candidate diagnostic, private install, upgrade and uninstall preserve encrypted files',()=>{
 assert.ok(existsSync(join(candidate,'mcp-studio-agent')),'build candidate first');
 const temp=realpathSync(mkdtempSync(join(tmpdir(),'mcp-agent-install-')));
 try {
 const prefix=join(temp,'managed');const state=join(temp,'state');
 let r=command(['--diagnose','--origin','https://user:secret@private.example/?token=hidden','--state-dir',state]);
 assert.equal(r.status,0,r.stderr);assert.equal(existsSync(state),false);assert.ok(!r.stdout.includes('secret'));assert.equal(JSON.parse(r.stdout).vault,'not-probed');
 const run=(action,dir=prefix,s=state)=>spawnSync('/bin/sh',[join(candidate,'install.sh'),action,dir,s],{encoding:'utf8'});
 r=run('install');assert.equal(r.status,0,r.stderr);
 const otherState=join(temp,'other-state');
 r=spawnSync(join(prefix,'mcp-studio-agent'),['--origin','https://work.example','--state-dir',otherState],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.match(r.stderr,/managed_startup_mismatch/);assert.equal(existsSync(otherState),false);
 writeFileSync(join(state,'queue.enc'),'isolated-queue-bytes');writeFileSync(join(state,'vault.enc'),'isolated-vault-bytes');writeFileSync(join(state,'device-id'),'isolated-device');
 r=run('upgrade');assert.equal(r.status,0,r.stderr);
 r=run('uninstall');assert.equal(r.status,0,r.stderr);assert.equal(existsSync(join(prefix,'mcp-studio-agent')),false);
 assert.equal(readFileSync(join(state,'queue.enc'),'utf8'),'isolated-queue-bytes');assert.equal(readFileSync(join(state,'vault.enc'),'utf8'),'isolated-vault-bytes');assert.equal(readFileSync(join(state,'device-id'),'utf8'),'isolated-device');
 const unsafe=join(temp,'existing');mkdirSync(unsafe);writeFileSync(join(unsafe,'mine'),'untouched');assert.notEqual(run('install',unsafe).status,0);assert.equal(readFileSync(join(unsafe,'mine'),'utf8'),'untouched');
 symlinkSync(unsafe,join(temp,'linked'));assert.notEqual(run('install',join(temp,'linked','new')).status,0);
 } finally {rmSync(temp,{recursive:true,force:true});}
});
test('candidate archives have an exact allowlist without runtime, test or helper entries',()=>{
 const manifest=JSON.parse(readFileSync(join(output,'manifest.json'),'utf8'));
 assert.equal(manifest.artifacts.length,5);
 for(const artifact of manifest.artifacts.filter(a=>!a.file.endsWith('.pkg'))) {
  const archive=join(output,artifact.file);
  const r=spawnSync(artifact.file.endsWith('.zip')?'unzip':'tar',artifact.file.endsWith('.zip')?['-Z1',archive]:['-tzf',archive],{encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
  const names=r.stdout.trim().split('\n').filter(n=>!n.endsWith('/')).map(n=>n.split('/').at(-1)).sort();
  assert.deepEqual(names,['CHECKSUMS.sha256','manifest.json',artifact.target.os==='windows'?'install.ps1':'install.sh',artifact.target.os==='windows'?'mcp-studio-agent.exe':'mcp-studio-agent'].sort());
 }
});
