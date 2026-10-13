import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {temporaryTLS} from '../m2/tls.mjs';
import {startM5Agent} from './fixture.mjs';
test('controlled Agent links real protected local API and restarts with guaranteed process cleanup',async()=>{
 const build=await mkdtemp(join(tmpdir(),'mcp-studio-m5-build-')),binary=join(build,'agent-fixture');let certificate,agent;
 try{await new Promise((resolve,reject)=>{const child=spawn('go',['build','-o',binary,'./tests/fixtures/m5-agent'],{env:{...process.env,GOCACHE:process.env.GOCACHE??'/private/tmp/mcp-studio-go-cache'},stdio:'ignore'});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Controlled Agent test build failed')));});certificate=await temporaryTLS();agent=await startM5Agent({origin:'https://127.0.0.1:44443',tls:certificate.options,binary});const rejected=await fetch(agent.address+'/v1/status',{headers:{Origin:'https://wrong.example'}});assert.equal(rejected.status,403);const status=await fetch(agent.address+'/v1/status',{headers:{Origin:'https://127.0.0.1:44443'}});assert.equal(status.status,200);assert.equal((await status.json()).data.contractVersion,'1.0.0');const restart=await fetch(agent.controllerOrigin+'/restart',{method:'POST',body:'{}',headers:{'Content-Type':'application/json'}});assert.equal(restart.status,200);assert.equal((await restart.json()).generation,2);const controllerOrigin=agent.controllerOrigin;await agent.close();await assert.rejects(fetch(controllerOrigin+'/state'));}finally{const results=await Promise.allSettled([agent?.close(),certificate?.close(),rm(build,{recursive:true,force:true})]);for(const result of results)if(result.status==='rejected')throw result.reason;}
});
