import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {queryTestDatabase} from '/Users/wuwei/code/github/mcp-studio/scripts/test-runtime.mjs';
const root='/Users/wuwei/code/github/mcp-studio';process.chdir(root);
const evidence='tests/evidence/v01-v02-interrupted';await mkdir(evidence,{recursive:true});
const query=sql=>queryTestDatabase(process.env.MCP_STUDIO_TEST_DATABASE_URL,sql);
assert.equal(await query("SELECT count(*) FROM pg_namespace WHERE nspname ~ '^(test_|e2e_)'"),'0','Preexisting fixture prevents unambiguous actual-entrypoint probe');
const entry=spawn(process.execPath,['scripts/verify.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,PLAYWRIGHT_EVIDENCE_DIR:evidence}});
let log='',goStage=false,closed=false;
for(const stream of [entry.stdout,entry.stderr])stream.on('data',chunk=>{log+=chunk.toString();if(log.includes('[verify] Go tests with real isolated PostgreSQL'))goStage=true;});
const exit=new Promise((resolve,reject)=>{entry.once('error',reject);entry.once('close',(code,signal)=>{closed=true;resolve({code,signal});});});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let parent,children=[],failure;
try {
 const deadline=Date.now()+120000;
 while(!goStage&&!closed&&Date.now()<deadline)await delay(100);
 assert.ok(goStage&&!closed,'Actual verifier did not reach its real Go stage');
 const parents=(await query("SELECT nspname FROM pg_namespace WHERE obj_description(oid,'pg_namespace')='mcp-studio-test-run:'||nspname ORDER BY nspname")).split('\n').filter(Boolean);
 assert.equal(parents.length,1);parent=parents[0];assert.match(parent,/^e2e_[a-f0-9]{24}$/);
 const readyDeadline=Date.now()+30000;
 while(!children.length&&!closed&&Date.now()<readyDeadline){
  children=(await query(`SELECT nspname FROM pg_namespace WHERE obj_description(oid,'pg_namespace')='mcp-studio-test-child:${parent}' ORDER BY nspname`)).split('\n').filter(Boolean);
  if(!children.length)await delay(100);
 }
 assert.ok(children.length,'No live internal Go schema was observed before interruption');
 entry.kill('SIGINT');
 const outcome=await Promise.race([exit,delay(20000).then(()=>{throw new Error('Actual verifier cancellation timed out');})]);
 assert.equal(outcome.code,130);assert.equal(outcome.signal,null);
 const remaining=await query(`SELECT count(*) FROM pg_namespace WHERE nspname='${parent}' OR obj_description(oid,'pg_namespace')='mcp-studio-test-child:${parent}'`);
 assert.equal(remaining,'0');
 assert.equal(await query("SELECT count(*) FROM pg_namespace WHERE nspname ~ '^(test_|e2e_)'"),'0');
 await writeFile(`${evidence}/result.json`,JSON.stringify({checkedAt:new Date().toISOString(),implementationRevision:'9ed9292473b4902e6b4ba7bd424f7915f6ff4a02',entrypoint:'node scripts/verify.mjs',signal:'SIGINT',stage:'Go tests with real isolated PostgreSQL',parent,observedChildren:children,exitCode:outcome.code,remainingOwnedSchemas:Number(remaining),testSchemas:0,manualDeletion:false,scope:'Real verifier Go-stage cancellation only; not Docker/native/media interruption acceptance'},null,2)+'\n');
 console.log('Actual verify Go-stage SIGINT: exit130, observed leased Go child and parent both removed without manual deletion');
} catch(error){failure=error;throw error;}
finally {
 if(!closed){entry.kill('SIGTERM');await Promise.race([exit,delay(20000)]);}
 await writeFile(`${evidence}/verify.log`,log);
 if(failure)await writeFile(`${evidence}/failure.json`,JSON.stringify({message:failure.message,manualDeletion:false},null,2)+'\n');
}
