import {test,expect,type APIRequestContext,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import * as wire from '../../apps/web/src/generated/platform';
import * as agentWire from '../../apps/web/src/generated/agent';
import {bootstrap,createProject,fixtureStats,requestData,session} from './production-helpers';

const evidenceDir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/v01-a04-a07-focused/backup';
const correctPassword='Fixture-Password-12',wrongPassword='Wrong-Fixture-Password-12';
type BackupAttempt={projectId:string;connectionId:string;kind:string;referenceId:string;sourceDigest:string;sourceDigestMatchesValue:boolean;expectedVersion:number;status:number};
type Control={prompts:{code:string;origin:string;userId:string;deviceId:string;capabilities:string[]}[];backups:BackupAttempt[]};
type DiskMetadata={files:{name:string;sha256:string;mtimeMs:number;size:number}[]};
async function control(request:APIRequestContext){const response=await request.get(process.env.PLAYWRIGHT_AGENT_CONTROL+'/state');expect(response.status()).toBe(200);return await response.json() as Control;}
async function diskMetadata(request:APIRequestContext){const response=await request.get(process.env.PLAYWRIGHT_AGENT_CONTROL+'/disk-metadata');expect(response.status()).toBe(200);return await response.json() as DiskMetadata;}
async function pair(page:Page,request:APIRequestContext){
 const before=await control(request);
 await page.getByRole('button',{name:'Local Agent',exact:true}).first().click();
 await page.getByLabel('Agent loopback address',{exact:true}).fill(process.env.PLAYWRIGHT_AGENT_ADDRESS!);
 await page.getByRole('button',{name:'Check device',exact:true}).click();
 await expect(page.getByRole('button',{name:'Start pairing',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Start pairing',exact:true}).click();
 await expect.poll(async()=>(await control(request)).prompts.length).toBe(before.prompts.length+1);
 const prompt=(await control(request)).prompts.at(-1)!,owner=await session(page.request);
 expect(prompt).toMatchObject({origin:process.env.PLAYWRIGHT_BASE_URL,userId:owner.user.id,deviceId:'m5-controlled-device'});
 expect(prompt.capabilities).toContain('credentials');
 await page.getByLabel('One-time code from local Agent',{exact:true}).fill(prompt.code);
 await page.getByRole('button',{name:'Confirm code',exact:true}).click();
 await expect(page.getByText('Paired',{exact:true})).toBeVisible();
}

// Catch backing up a failed OAuth save, losing the local value on backup error,
// silently creating a backup, retrying authorization/Tool execution, or rewriting
// the credential. The failure is real platform password reauthentication, not a
// browser route mock or an Agent-only success/failure stub.
test('V01 A07 production: failed personal backup preserves saved OAuth authorization and retries only the backup',async({page,request,browser})=>{
 test.setTimeout(120000);
 const agentOrigin=process.env.PLAYWRIGHT_AGENT_ADDRESS!,agentCalls:{method:string;path:string}[]=[],pageErrors:string[]=[];
 let leaked=false;
 const secretMarkers=[correctPassword,wrongPassword,'synthetic-refresh-not-supported'];
 page.on('pageerror',()=>pageErrors.push('pageerror'));
 page.on('console',message=>{if(secretMarkers.some(marker=>message.text().includes(marker)))leaked=true;});
 page.on('request',outgoing=>{const url=new URL(outgoing.url());if(secretMarkers.some(marker=>url.href.includes(marker)))leaked=true;if(url.origin===agentOrigin)agentCalls.push({method:outgoing.method(),path:url.pathname});});
 await bootstrap(page,request);
 const projectId=await createProject(page);
 await page.getByLabel('语言',{exact:true}).selectOption('en-US');
 await pair(page,request);
 await page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('button',{name:'Servers',exact:true}).click();
 await page.getByRole('button',{name:'Create service',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('V01 A07 independent OAuth backup');
 await page.getByLabel('HTTP endpoint',{exact:true}).fill(process.env.PLAYWRIGHT_OAUTH_ORIGIN+'/oauth-mcp');
 await page.getByLabel('Execution channel',{exact:true}).selectOption('agent');
 await page.getByLabel('Authorization mode',{exact:true}).selectOption('oauth');
 await page.getByLabel('OAuth client ID',{exact:true}).fill('mcp-studio-public');
 await page.getByLabel('OAuth scopes (space separated)',{exact:true}).fill('read');
 const savedConnection=page.waitForResponse(response=>response.url().includes('/connections')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 const connectionResponse=await savedConnection;expect(connectionResponse.status()).toBe(200);
 const persistedConnection=wire.connectionSchema.parse((await connectionResponse.json()).data);
 await expect.poll(()=>new URL(page.url()).searchParams.get('connection')).toBe(persistedConnection.id);
 await expect(page.getByText('Execution source: local Agent',{exact:true})).toBeVisible();
 const connectionId=new URL(page.url()).searchParams.get('connection')!,backupPath=`/projects/${projectId}/connections/${connectionId}/credential-backups`;
 const platformBackups=()=>requestData(page.request,backupPath,wire.credentialBackupSchema.array());
 expect(await platformBackups()).toEqual([]);
 const initialOAuth=await fixtureStats(request,true);
 await page.getByRole('button',{name:'Authorize with Agent',exact:true}).click();
 const popupEvent=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Open authorization page',exact:true}).click();const popup=await popupEvent;
 await expect.poll(async()=>(await fixtureStats(request,true)).oauthExchanges).toBe(initialOAuth.oauthExchanges+1);await popup.close();
 const statusRequestEvent=page.waitForRequest(outgoing=>outgoing.method()==='GET'&&new URL(outgoing.url()).origin===agentOrigin&&/^\/v1\/oauth\/[^/]+$/u.test(new URL(outgoing.url()).pathname));
 await page.getByRole('button',{name:'Check authorization',exact:true}).click();
 await expect(page.getByText('Authorized, ready to connect',{exact:true})).toBeVisible();
 // Keep the actual authenticated request only in test memory. The panel remounts
 // when visiting Tools; this checks the same protected OAuth attempt afterward.
 const statusRequest=await statusRequestEvent,statusHeaders=await statusRequest.allHeaders();
 const oauthState=async()=>{const response=await request.get(statusRequest.url(),{headers:statusHeaders});expect(response.status()).toBe(200);return agentWire.agentOAuthStateSchema.parse((await response.json()).data);};
 const authorized=await oauthState();expect(authorized).toMatchObject({status:'authorized',saved:false});
 const diskBeforeSave=await diskMetadata(request);
 await page.getByLabel('Credential location',{exact:true}).selectOption('local');
 await page.getByRole('button',{name:'Save authorization',exact:true}).click();
 await expect(page.getByText(/Credential available.*Saved.*System credential store/)).toBeVisible();
 expect(await oauthState()).toMatchObject({attemptId:authorized.attemptId,status:'authorized',saved:true});
 const savedDisk=await diskMetadata(request),newFiles=savedDisk.files.filter(file=>!diskBeforeSave.files.some(prior=>prior.name===file.name));
 expect(newFiles).toHaveLength(1);expect(newFiles[0].size).toBeGreaterThan(0);
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByText(/Connected.*m2-controlled-fixture/)).toBeVisible();
 await page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('button',{name:'Tools',exact:true}).click();
 await page.getByLabel('Service',{exact:true}).selectOption(connectionId);
 await page.getByRole('button',{name:'Open echo',exact:true}).click();
 await page.getByRole('button',{name:'Raw JSON',exact:true}).click();
 const beforeTool=await fixtureStats(request,true);
 await page.getByLabel('Raw parameters',{exact:true}).fill('{"text":"V01 A07 saved OAuth is usable"}');
 await page.getByRole('button',{name:'Execute tool',exact:true}).click();
 await expect(page.locator('.tool-execution > p[role="status"]').filter({hasText:'Succeeded'})).toBeVisible();
 await expect(page.locator('.tool-execution > p[role="status"]').filter({hasText:'Recorded'})).toBeVisible();
 expect((await fixtureStats(request,true)).toolsCall).toBe(beforeTool.toolsCall+1);
 const historyPath=`/projects/${projectId}/records?kind=history`,history=await requestData(page.request,historyPath,wire.recordPageSchema);
 expect(history.items).toHaveLength(1);expect(history.items[0].snapshot).toMatchObject({executor:'agent',credentialSource:'oauth',runStatus:'succeeded'});
 await page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('button',{name:'Servers',exact:true}).click();
 await page.getByRole('button',{name:'Check credential status',exact:true}).click();
 await expect(page.getByText(/Credential available.*Saved.*System credential store/)).toBeVisible();
 await page.getByRole('button',{name:'Check personal backups',exact:true}).click();
 await expect(page.getByText('No personal backup exists.',{exact:true})).toBeVisible();
 const baselineStats=await fixtureStats(request,true),baselineCalls=agentCalls.slice(),baselineDisk=await diskMetadata(request);
 expect(baselineDisk).toEqual(savedDisk);
 const counts=()=>({oauthStart:agentCalls.filter(call=>call.method==='POST'&&call.path==='/v1/oauth').length,oauthSave:agentCalls.filter(call=>call.method==='POST'&&/^\/v1\/oauth\/[^/]+\/save$/u.test(call.path)).length,credentialMutation:agentCalls.filter(call=>call.path==='/v1/credentials').length,backup:agentCalls.filter(call=>call.method==='POST'&&call.path==='/v1/credentials/backup').length,restore:agentCalls.filter(call=>call.path==='/v1/credentials/restore').length,runs:agentCalls.filter(call=>call.method==='POST'&&call.path==='/v1/runs').length});
 const baselineCounts=counts();expect(baselineCounts).toMatchObject({oauthStart:1,oauthSave:1,backup:0,restore:0,credentialMutation:0,runs:1});
 const assertIndependent=async(backupAttempts:number)=>{
  expect(await oauthState()).toMatchObject({attemptId:authorized.attemptId,status:'authorized',saved:true});
  await page.getByRole('button',{name:'Check credential status',exact:true}).click();
  await expect(page.getByText(/Credential available.*Saved.*System credential store/)).toBeVisible();
  expect(await diskMetadata(request)).toEqual(baselineDisk);
  expect(await requestData(page.request,historyPath,wire.recordPageSchema)).toEqual(history);
  const stats=await fixtureStats(request,true);expect(stats.oauthExchanges).toBe(baselineStats.oauthExchanges);expect(stats.toolsCall).toBe(baselineStats.toolsCall);expect(stats.initialize).toBe(baselineStats.initialize);
  expect(counts()).toEqual({...baselineCounts,backup:backupAttempts});
 };
 const reauth=page.getByLabel('Reauthenticate with platform password',{exact:true}),confirmed=page.getByRole('checkbox',{name:'I explicitly choose to back up this personal credential.',exact:true});
 await reauth.fill(wrongPassword);await confirmed.check();
 const failedResponseEvent=page.waitForResponse(response=>response.url()===agentOrigin+'/v1/credentials/backup'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Create personal backup',exact:true}).click();const failedResponse=await failedResponseEvent;
 expect(failedResponse.status()).toBe(409);expect(wire.errorSchema.parse(await failedResponse.json()).error.code).toBe('reauthentication_failed');
 await expect(page.getByRole('alert').filter({hasText:'reauthentication_failed'})).toBeVisible();
 await expect(reauth).toHaveValue(wrongPassword);await expect(confirmed).toBeChecked();
 await expect(page.getByRole('button',{name:'Restore personal backup',exact:true})).toHaveCount(0);
 expect(await platformBackups()).toEqual([]);await assertIndependent(1);
 await expect.poll(async()=>(await control(request)).backups.filter(attempt=>attempt.projectId===projectId&&attempt.connectionId===connectionId).length).toBe(1);
 const failedAttempt=(await control(request)).backups.filter(attempt=>attempt.projectId===projectId&&attempt.connectionId===connectionId);
 expect(failedAttempt).toHaveLength(1);expect(failedAttempt[0]).toMatchObject({kind:'oauth',referenceId:'',status:403,expectedVersion:0,sourceDigestMatchesValue:true});
 expect(failedAttempt[0].sourceDigest).toMatch(/^[a-f0-9]{64}$/u);
 await reauth.fill(correctPassword);
 const retryResponseEvent=page.waitForResponse(response=>response.url()===agentOrigin+'/v1/credentials/backup'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Create personal backup',exact:true}).click();const retryResponse=await retryResponseEvent;
 expect(retryResponse.status()).toBe(200);
 const receipt=agentWire.agentBackupsSchema.parse((await retryResponse.json()).data),returned=wire.credentialBackupSchema.array().parse(JSON.parse(receipt.backupsJSON));
 await expect(page.getByRole('button',{name:'Restore personal backup',exact:true})).toHaveCount(1);
 await expect(reauth).toHaveValue('');await expect(confirmed).not.toBeChecked();await expect(page.getByRole('alert')).toHaveCount(0);
 const backups=await platformBackups();expect(backups).toHaveLength(1);expect(backups).toEqual(returned);
 expect(backups[0]).toMatchObject({kind:'oauth',referenceId:'',version:1,sourceDigest:failedAttempt[0].sourceDigest});expect(backups[0].id).not.toBe('');
 await expect(page.locator('.ui-confirmation').filter({hasText:backups[0].id})).toHaveCount(1);
 await assertIndependent(2);
 await expect.poll(async()=>(await control(request)).backups.filter(attempt=>attempt.projectId===projectId&&attempt.connectionId===connectionId).length).toBe(2);
 const attempts=(await control(request)).backups.filter(attempt=>attempt.projectId===projectId&&attempt.connectionId===connectionId);
 expect(attempts).toHaveLength(2);expect(attempts[1]).toEqual({...attempts[0],status:200});
 // Read native browser persistence without returning its content to the runner.
 const persistenceSafe=await page.evaluate(async markers=>{
  const serialized=[JSON.stringify({...localStorage}),JSON.stringify({...sessionStorage})];
  for(const metadata of await indexedDB.databases()){
   if(!metadata.name)continue;
   const database=await new Promise<IDBDatabase>((resolve,reject)=>{const open=indexedDB.open(metadata.name!);open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(Error('storage_open'));});
   for(const name of database.objectStoreNames){const rows=await new Promise<unknown[]>((resolve,reject)=>{const tx=database.transaction(name,'readonly'),read=tx.objectStore(name).getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(Error('storage_read'));});serialized.push(JSON.stringify(rows));}database.close();
  }
  return serialized.every(value=>markers.every(marker=>!value.includes(marker)))&&!markers.some(marker=>location.href.includes(marker));
 },[...secretMarkers,'accessToken','refreshToken']);
 expect(persistenceSafe).toBe(true);expect(leaked).toBe(false);expect(pageErrors).toEqual([]);
 await mkdir(evidenceDir,{recursive:true});
 await page.screenshot({path:`${evidenceDir}/a07-backup-retry-en-US-light.png`});
 await writeFile(`${evidenceDir}/a07-backup-retry.json`,JSON.stringify({scope:'Supplemental A07 same-connection production UI + real Agent + real PostgreSQL; wrong-password backup failure then successful retry. Controlled MasterStore/native pairing; real OS/T02/manual/media and formal A07 remain pending.',browser:browser.version(),identity:{projectId,connectionId,attemptId:authorized.attemptId,runId:history.items[0].snapshot.runId,backupId:backups[0].id},failure:{platformStatus:attempts[0].status,agentStatus:failedResponse.status(),code:'reauthentication_failed',backupRows:0,passwordRetained:true,confirmationRetained:true},retry:{platformStatus:attempts[1].status,agentStatus:retryResponse.status(),backupRows:backups.length,version:backups[0].version,sourceDigest:backups[0].sourceDigest},attempts,baselineCounts,finalCounts:counts(),baselineStats,finalStats:await fixtureStats(request,true),credentialDiskUnchanged:true,historyUnchanged:true,persistenceSafe,secretLeak:leaked,pageErrors,requestObservations:{baseline:baselineCalls.length,final:agentCalls.length}},null,2)+'\n');
});
