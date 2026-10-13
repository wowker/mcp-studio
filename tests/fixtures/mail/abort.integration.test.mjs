import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { withTestSchema, runChecked, queryTestDatabase } from '../../../scripts/test-runtime.mjs';

const database = process.env.MCP_STUDIO_TEST_DATABASE_URL;
const fixture = process.env.MCP_STUDIO_ABORT_TEST_BINARY ?? '.runtime/verify-abort-fixture';
async function readyJSON(file, observed) {
 let ended=false,outcome;observed.then(value=>{ended=true;outcome=value;},error=>{ended=true;outcome=error;});
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){
  try{return JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  if(ended)throw outcome instanceof Error?outcome:new Error('Fixture exited before readiness');
  await new Promise(resolve=>setTimeout(resolve,25));
 }
 throw new Error('Fixture readiness timed out');
}
async function exercise(mode) {
 const dir = await mkdtemp(join(tmpdir(), 'studio-abort-'));
 const ready = join(dir, 'ready.json');
 const controller = new AbortController(); let child;
 const sibling = 'test_' + randomBytes(16).toString('hex');
 await queryTestDatabase(database, `CREATE SCHEMA "${sibling}"`);
 try {
   await assert.rejects(withTestSchema(database, async scoped => {
     const running = runChecked(fixture, [ready,mode], { quiet:true, signal:controller.signal, env:{MCP_STUDIO_TEST_DATABASE_URL:scoped} });
     const observed = running.then(()=>null,error=>error); // Attach immediately: early exit cannot be unhandled.
     child=await readyJSON(ready,observed);
     if(mode==='wait') controller.abort();
     const error = await observed;assert.ok(error);throw error;
   }), error => error.exitCode === (mode==='wait'?130:7));
   assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${child.schema}'`),'0','inner Go fixture leaked after subprocess termination');
   assert.equal(await queryTestDatabase(database, `SELECT count(*) FROM pg_namespace WHERE nspname='${sibling}'`),'1','unclaimed same-prefix schema deleted');
 } finally {
   controller.abort();
   if(child && /^test_(?:abort_[a-f0-9]{24}|[a-f0-9]{24}_[a-f0-9]{24})$/.test(child.schema)) {
     try { process.kill(child.pid,'SIGTERM'); } catch(error) { if(error.code!=='ESRCH')throw error; }
     await queryTestDatabase(database, `DROP SCHEMA IF EXISTS "${child.schema}" CASCADE`);
   }
   await queryTestDatabase(database, `DROP SCHEMA "${sibling}" CASCADE`);
   await rm(dir,{recursive:true,force:true});
 }
}
test('aborted real Go child cleans only its claimed inner schema', {timeout:20000},()=>exercise('wait'));
test('failed real Go child cleans its inner schema even without t.Cleanup', {timeout:20000},()=>exercise('fail'));

test('fixture readiness fails promptly when the child exits without a marker', {timeout:10000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-no-ready-'));
 try {
  const observed=runChecked(process.execPath,['-e','process.exit(7)'],{quiet:true}).then(()=>null,error=>error);
  await assert.rejects(readyJSON(join(dir,'absent.json'),observed),error=>error.exitCode===7);
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('replaced parent identity is preserved and cleanup fails closed', {timeout:20000},async()=>{
 let parent;
 try {
  await assert.rejects(withTestSchema(database,async scoped=>{
   parent=new URL(scoped).searchParams.get('search_path');
   await queryTestDatabase(database,`DROP SCHEMA "${parent}"; CREATE SCHEMA "${parent}"; COMMENT ON SCHEMA "${parent}" IS 'mcp-studio-test-run:${parent}'`);
  }),/SQL failed/);
  assert.equal(await queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname='${parent}'`),'1');
 } finally {if(parent)await queryTestDatabase(database,`DROP SCHEMA IF EXISTS "${parent}" CASCADE`);}
});

for(const exitCode of [130,7])test(`cleanup failure preserves primary exit ${exitCode} and replacement schema`,{timeout:20000},async()=>{
 let parent;const primary=Object.assign(new Error('controlled primary failure'),{exitCode});
 try {
  await assert.rejects(withTestSchema(database,async scoped=>{
   parent=new URL(scoped).searchParams.get('search_path');
   await queryTestDatabase(database,`DROP SCHEMA "${parent}"; CREATE SCHEMA "${parent}"; COMMENT ON SCHEMA "${parent}" IS 'mcp-studio-test-run:${parent}'`);
   throw primary;
  }),error=>{
   assert.equal(error,primary);assert.equal(error.exitCode,exitCode);
   assert.match(error.message,/cleanup failed; owned test resources may remain/);
   assert.equal(error.message.includes(parent),false);assert.equal(error.message.includes(database),false);
   return true;
  });
  assert.equal(await queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname='${parent}'`),'1');
 } finally {if(parent)await queryTestDatabase(database,`DROP SCHEMA IF EXISTS "${parent}" CASCADE`);}
});

test('concurrent Go fixture leases leave the other run untouched', {timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-two-leases-'));let firstChild,secondChild;
 const create=async(scoped,file)=>{await assert.rejects(runChecked(fixture,[file,'fail'],{quiet:true,env:{MCP_STUDIO_TEST_DATABASE_URL:scoped}}),error=>error.exitCode===7);return JSON.parse(await readFile(file,'utf8')).schema;};
 const count=name=>queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname='${name}'`);
 try {
  await withTestSchema(database,async first=>{
   firstChild=await create(first,join(dir,'first.json'));
   await withTestSchema(database,async second=>{secondChild=await create(second,join(dir,'second.json'));assert.equal(await count(firstChild),'1');assert.equal(await count(secondChild),'1');});
   assert.equal(await count(firstChild),'1');assert.equal(await count(secondChild),'0');
  });
  assert.equal(await count(firstChild),'0');
 } finally {await rm(dir,{recursive:true,force:true});}
});

test('late Go schema creation is refused after its run closes', {timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-late-'));let scoped;
 try {
  await withTestSchema(database,async value=>{scoped=value;});
  const ready=join(dir,'late.json');
  await assert.rejects(runChecked(fixture,[ready,'fail'],{quiet:true,env:{MCP_STUDIO_TEST_DATABASE_URL:scoped}}),error=>error.exitCode===2);
  await assert.rejects(readFile(ready),{code:'ENOENT'});
  const token=new URL(scoped).searchParams.get('search_path').slice(4);
  assert.equal(await queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'test_${token}_%'`),'0');
 } finally {await rm(dir,{recursive:true,force:true});}
});

for(const signal of ['SIGINT','SIGTERM'])test(`real verifier entrypoint ${signal} returns 130 after exact fixture cleanup`,{timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-signal-')),ready=join(dir,'ready.json');let info,entry;
 try {
  entry=spawn(process.execPath,['tests/fixtures/verify-abort/runner.mjs',ready],{stdio:'ignore',env:{...process.env,MCP_STUDIO_TEST_DATABASE_URL:database}});
  const exited=new Promise((resolve,reject)=>{entry.once('error',reject);entry.once('close',code=>resolve(code));});
  info=await readyJSON(ready,exited);entry.kill(signal);assert.equal(await exited,130);
  assert.equal(await queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname='${info.schema}'`),'0');
  const parent='e2e_'+info.schema.split('_')[1];
  assert.equal(await queryTestDatabase(database,`SELECT count(*) FROM pg_namespace WHERE nspname='${parent}'`),'0');
 } finally {
  entry?.kill('SIGTERM');
  if(info){try{process.kill(info.pid,'SIGTERM');}catch(e){if(e.code!=='ESRCH')throw e;}}
  await rm(dir,{recursive:true,force:true});
 }
});
