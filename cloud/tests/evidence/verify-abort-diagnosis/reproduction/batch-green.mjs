import {spawn} from 'node:child_process';import{open,writeFile}from'node:fs/promises';
const dir='/Users/wuwei/code/github/mcp-studio/tests/evidence/verify-abort-diagnosis/reproduction';const outcomes=[];
for(let i=1;i<=6;i++){
 const file=await open(`${dir}/post-fix-${i}.log`,'w');const started=Date.now();
 const child=spawn(process.execPath,['--import','/private/tmp/studio-abort-observe.mjs','--test','--test-name-pattern','abort waits for TERM-ignoring','/private/tmp/studio-runtime-repro.test.mjs'],{stdio:['ignore',file.fd,file.fd]});
 const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});await file.close();outcomes.push({attempt:i,exitCode:exit,elapsedMs:Date.now()-started});console.log(JSON.stringify(outcomes.at(-1)));if(exit!==0)break;
}
await writeFile(`${dir}/post-fix-results.json`,JSON.stringify({limit:6,originalAssertionsAndTimeoutsUnchanged:true,diagnosticCopyOnly:true,outcomes},null,2)+'\n');
