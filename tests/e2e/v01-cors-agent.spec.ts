import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {bootstrap,createProject,fixtureStats,requestData,session} from './production-helpers';
import * as wire from '../../apps/web/src/generated/platform';

type ControllerState={prompts:{code:string;origin:string;userId:string;deviceId:string;capabilities:string[]}[];uploads:{operationId:string;targetId:string;frozenDigest:string;status:number}[]};
async function control(request:APIRequestContext){const response=await request.get(process.env.PLAYWRIGHT_AGENT_CONTROL!+'/state');expect(response.status()).toBe(200);return await response.json() as ControllerState;}
async function pair(page:Page,request:APIRequestContext){
 const before=await control(request);await page.getByRole('button',{name:'Local Agent',exact:true}).first().click();
 await page.getByLabel('Agent loopback address',{exact:true}).fill(process.env.PLAYWRIGHT_AGENT_ADDRESS!);await page.getByRole('button',{name:'Check device',exact:true}).click();
 await page.getByRole('button',{name:'Start pairing',exact:true}).click();await expect.poll(async()=>(await control(request)).prompts.length).toBe(before.prompts.length+1);
 const prompt=(await control(request)).prompts.at(-1)!,owner=await session(page.request);
 expect(prompt.origin).toBe(process.env.PLAYWRIGHT_BASE_URL);expect(prompt.userId).toBe(owner.user.id);expect(prompt.deviceId).toBe('m5-controlled-device');
 await page.getByLabel('One-time code from local Agent',{exact:true}).fill(prompt.code);await page.getByRole('button',{name:'Confirm code',exact:true}).click();await expect(page.getByText('Paired',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(prompt.code);
}
async function service(page:Page,name:string,endpoint:string,channel:'browser'|'agent'){
 await page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('button',{name:'Servers',exact:true}).click();await page.getByRole('button',{name:'Create service',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('HTTP endpoint',{exact:true}).fill(endpoint);await page.getByLabel('Execution channel',{exact:true}).selectOption(channel);await page.getByLabel('Authorization mode',{exact:true}).selectOption('token');
 const saved=page.waitForResponse(response=>response.url().includes('/connections')&&response.request().method()==='POST');await page.getByRole('button',{name:'Save changes',exact:true}).click();const response=await saved;expect(response.status()).toBe(200);
 const created=wire.connectionSchema.parse((await response.json() as {data:unknown}).data);
 await expect.poll(()=>new URL(page.url()).searchParams.get('connection')).toBe(created.id);await expect(page.getByLabel('Execution channel',{exact:true})).toHaveValue(channel);
 return created.id;
}
async function credential(page:Page){await page.getByLabel('Personal Agent token',{exact:true}).fill('fixture-token');await page.getByLabel('Credential location',{exact:true}).selectOption('session');await page.getByRole('button',{name:'Save Agent credential',exact:true}).click();await expect(page.getByText(/Credential available.*Saved.*Agent session only/)).toBeVisible();}

test('V01 A04 production: same CORS-denied connection switches explicitly to Agent without borrowing credentials',async({page,request})=>{
 const errors:string[]=[],endpoint=process.env.PLAYWRIGHT_MCP_ORIGIN+'/cors-token-mcp',agentOrigin=new URL(process.env.PLAYWRIGHT_AGENT_ADDRESS!).origin;
 let policyErrors=0,failedUpstream=0;
 page.on('pageerror',()=>errors.push('pageerror'));
 page.on('console',event=>{if(event.type()!=='error')return;const text=event.text();if(text.includes(endpoint)&&text.includes('CORS policy'))policyErrors++;else if(!text.startsWith('Failed to load resource:'))errors.push('unexpected-console-error');});
 page.on('requestfailed',entry=>{if(entry.url()===endpoint)failedUpstream++;});
 await bootstrap(page,request);const projectId=await createProject(page);await page.getByLabel('语言').selectOption('en-US');await pair(page,request);
 // An already paired Agent and an available same-URL credential must not become
 // an automatic fallback or an authorization source for the target connection.
 const otherId=await service(page,'A04 other credential',endpoint,'agent');await credential(page);
 const connectionId=await service(page,'A04 browser target',endpoint,'browser');expect(connectionId).not.toBe(otherId);
 await page.getByLabel('Personal access token',{exact:true}).fill('fixture-token');await page.getByRole('button',{name:'Save for this session',exact:true}).click();await expect(page.getByText('Authorized, waiting to connect',{exact:true})).toBeVisible();
 const before=await fixtureStats(request),beforeAgent=await control(request),agentActions:{path:string;connectionId?:string}[]=[],snapshots:wire.Connection[]=[];
 page.on('request',entry=>{const url=new URL(entry.url());if(url.origin!==agentOrigin||entry.method()!=='POST'||!['/v1/connections','/v1/runs','/v1/credentials'].includes(url.pathname))return;const body=entry.postDataJSON() as {connectionId?:string};agentActions.push({path:url.pathname,connectionId:body.connectionId});});
 const configuration=async()=>requestData(page.request,`/projects/${projectId}/connections/${connectionId}`,wire.connectionSchema);
 snapshots.push(await configuration());expect(snapshots[0]).toMatchObject({id:connectionId,projectId,channel:'browser',endpoint,authMode:'token'});
 await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByText(/The browser cannot reliably distinguish these causes/)).toBeVisible();
 expect(policyErrors).toBeGreaterThan(0);expect(failedUpstream).toBeGreaterThan(0);expect((await fixtureStats(request)).initialize).toBe(before.initialize);expect((await fixtureStats(request)).toolsCall).toBe(before.toolsCall);
 expect(agentActions).toEqual([]);expect((await control(request)).prompts.length).toBe(beforeAgent.prompts.length);expect((await control(request)).uploads).toEqual(beforeAgent.uploads);
 expect(await configuration()).toEqual(snapshots[0]);
 // Selecting the channel and saving is an explicit user choice. It keeps the
 // original ID and endpoint and does not itself connect or copy credentials.
 await page.getByLabel('Execution channel',{exact:true}).selectOption('agent');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect(page.getByText('Execution source: local Agent',{exact:true})).toBeVisible();snapshots.push(await configuration());
 expect(snapshots[1]).toMatchObject({id:connectionId,projectId,endpoint,channel:'agent',authMode:'token'});expect(snapshots[1].version).toBe(snapshots[0].version+1);expect(agentActions).toEqual([]);
 await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'credential_missing'})).toBeVisible();
 expect((await fixtureStats(request)).initialize).toBe(before.initialize);expect((await fixtureStats(request)).toolsCall).toBe(before.toolsCall);
 expect(agentActions).toEqual([{path:'/v1/connections',connectionId}]);
 // Browser memory and the other connection both contain a usable token, yet
 // this target is blocked until its own Agent credential is explicitly saved.
 await credential(page);expect(agentActions.filter(entry=>entry.path==='/v1/credentials')).toEqual([{path:'/v1/credentials',connectionId}]);
 await page.getByRole('button',{name:'Connect',exact:true}).click();await expect(page.getByText(/Connected.*m2-controlled-fixture/)).toBeVisible();
 expect((await fixtureStats(request)).initialize).toBe(before.initialize+1);
 await page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('button',{name:'Tools',exact:true}).click();await page.getByLabel('Service',{exact:true}).selectOption(connectionId);await page.getByRole('button',{name:'Open echo',exact:true}).click();await page.getByRole('button',{name:'Raw JSON',exact:true}).click();await page.getByLabel('Raw parameters',{exact:true}).fill('{"text":"same endpoint via explicit Agent"}');
 await page.getByRole('button',{name:'Execute tool',exact:true}).click();await expect(page.locator('.tool-execution > p[role="status"]').filter({hasText:'Succeeded'})).toBeVisible();
 await expect.poll(async()=>(await requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema)).items.length).toBe(1);
 const record=(await requestData(page.request,`/projects/${projectId}/records?kind=history`,wire.recordPageSchema)).items[0];
 expect(record.snapshot).toMatchObject({projectId,connectionId,executor:'agent',credentialSource:'token',runStatus:'succeeded'});expect(JSON.parse(record.snapshot.responseJSON)).toMatchObject({structuredContent:{text:'same endpoint via explicit Agent'}});
 expect(agentActions.filter(entry=>entry.path==='/v1/runs')).toEqual([{path:'/v1/runs',connectionId}]);expect((await fixtureStats(request)).toolsCall).toBe(before.toolsCall+1);
 expect(await configuration()).toEqual(snapshots[1]);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain('fixture-token');
 const dir=process.env.PLAYWRIGHT_EVIDENCE_DIR??'tests/evidence/v01-a04-a07-focused/cors';await mkdir(dir,{recursive:true});
 await writeFile(`${dir}/cors-agent-journey.json`,JSON.stringify({scope:'Controlled production browser/Agent same-endpoint journey; no native/target-browser/manual signoff',projectId,connectionId,otherConnectionId:otherId,endpointUnchanged:true,configurationVersions:snapshots.map(item=>item.version),policyErrors,failedUpstream,agentActions,counters:{before,after:await fixtureStats(request)},runId:record.snapshot.runId,pageErrors:errors},null,2)+'\n');
});
