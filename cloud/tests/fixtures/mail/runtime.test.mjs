import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTestDatabaseURL, runChecked } from '../../../scripts/test-runtime.mjs';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { watch } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('runtime requires explicit loopback test database using the non-superuser test role', () => {
  for (const value of [undefined, '', 'postgres://postgres:test@127.0.0.1:55432/mcp_studio_test', 'postgres://mcp_studio_app:test@127.0.0.1:55432/production', 'postgres://mcp_studio_app:test@db.example:55432/mcp_studio_test']) {
    assert.throws(() => validateTestDatabaseURL(value), /test database/i);
  }
});

test('abort waits for TERM-ignoring descendant after its parent exits first', {timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-stubborn-')),ready=join(dir,'ready.json');
 const controller=new AbortController();let ids;
 const descendant=`const fs=require('fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({parent:process.ppid,child:process.pid}));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);setInterval(()=>{},1000);`;
 const parent=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)},process.argv[1]],{stdio:'ignore'});setInterval(()=>{},1000);`;
 const running=runChecked(process.execPath,['-e',parent,ready],{quiet:true,signal:controller.signal});
 const observed=running.then(()=>null,error=>error);
 try {
  const deadline=Date.now()+8000;
  while(!ids&&Date.now()<deadline){try{ids=JSON.parse(await readFile(ready,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;await new Promise(resolve=>setTimeout(resolve,25));}}
  assert.ok(ids,'descendant did not become ready');controller.abort();
  assert.equal((await observed).exitCode,130);
  assert.throws(()=>process.kill(ids.child,0),{code:'ESRCH'},'descendant remained alive when cancellation returned');
 } finally {
  controller.abort();await observed;
  for(const pid of [ids?.child,ids?.parent])if(pid){try{process.kill(pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
  await rm(dir,{recursive:true,force:true});
 }
});

test('gate propagates a failing real subprocess exit status', async () => {
  await assert.rejects(runChecked(process.execPath, ['-e', 'process.exit(7)'], { label: 'synthetic expected failure', quiet: true }), error => error.exitCode === 7);
});

test('abort waits for real parent and inherited child cleanup before returning', {timeout:15000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-process-'));const ready=join(dir,'ready.json'),stopped=join(dir,'stopped');
 const watcher=watch(dir);const controller=new AbortController();let ids;
 const received=new Promise((resolve,reject)=>{watcher.on('error',reject);watcher.on('change',async(_event,name)=>{if(name!=='ready.json')return;try{ids=JSON.parse(await readFile(ready,'utf8'));resolve();}catch(e){reject(e);}});});
 const body=`const fs=require('fs');const {spawn}=require('child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});process.on('SIGTERM',()=>{child.once('close',()=>{fs.writeFileSync(process.argv[2],'clean');process.exit(0)});});child.once('spawn',()=>{fs.writeFileSync(process.argv[1]+'.tmp',JSON.stringify({parent:process.pid,child:child.pid}));fs.renameSync(process.argv[1]+'.tmp',process.argv[1]);});setInterval(()=>{},1000);`;
 try {
  const running=runChecked(process.execPath,['-e',body,ready,stopped],{quiet:true,signal:controller.signal});
  const observed=running.then(()=>null,error=>error);
  await received;controller.abort();assert.equal((await observed).exitCode,130);
  await access(stopped); // Original helper returns before the real process tree cleans up.
 } finally {
  watcher.close();controller.abort();
  for(const pid of [ids?.child,ids?.parent])if(pid){try{process.kill(pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}}
  await rm(dir,{recursive:true,force:true});
 }
});
