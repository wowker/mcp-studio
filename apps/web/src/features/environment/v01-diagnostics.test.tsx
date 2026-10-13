import {useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {I18nextProvider} from 'react-i18next';
import type {Connection,Variable,VariableInput} from '../../generated/platform';
import {i18n} from '../../shared/i18n';
import {PlatformClient} from '../../shared/api';
import {buildLayers,resolveEnvironment} from '../../runtime/environment';
import {ConnectionsPage} from '../connections/ConnectionsPage';
import {M2Memory} from '../connections/runtimeStore';
import {emptyConnection,emptyVariable} from '../connections/session';
import {EnvironmentPage} from './EnvironmentPage';

const project={id:'p',teamId:'t',name:'Project',description:'',role:'maintainer',canRead:true,canManage:true,canTakeover:false};
const session={user:{id:'u',email:'u@example.test',name:'User',verified:true},teams:[],csrf:'csrf',expiresAt:'2099-01-01T00:00:00Z'};
const environment={id:'dev',name:'Development',projectId:'p',version:1,etag:'"e1"'};
const missingVariableAlert='A variable is missing or invalid. Open reference repair.';
const runtimeReferenceAlert='The selected reference is missing or unavailable. Repair its current effective definition.';
const memories:M2Memory[]=[];

beforeEach(async()=>{await i18n.changeLanguage('en-US');});
afterEach(()=>{for(const memory of memories.splice(0))memory.clear();vi.unstubAllGlobals();});

// Only the platform HTTP boundary is controlled. Pages, editors, resolver, vault,
// memory, and the failed BrowserSession are the actual production implementations.
it.each([
 {kind:'missing dependency',name:'ROUTE',type:'string' as const,valueJSON:'"{{SEGMENT}}"',oldDiagnostic:'ROUTE · Dependency missing',repairJSON:'"repaired-path"',previewJSON:'"repaired-path"'},
 {kind:'invalid typed reference',name:'COUNT',type:'number' as const,valueJSON:'"{{VALUE}}"',oldDiagnostic:'COUNT · Type mismatch',repairJSON:'7',previewJSON:'7'},
].flatMap(testCase=>[false,true].map(apply=>({...testCase,apply}))))('A51 clears the original $kind diagnosis after repair and returns without connecting (explicit apply=$apply)',async(testCase)=>{
 const connection:Connection={...emptyConnection,id:'c',projectId:'p',name:'Service',endpoint:'https://example.test/mcp',headers:[{name:'X-Value',value:`{{${testCase.name}}}`}],environmentId:'dev',version:1,etag:'"c1"'};
 const original:Variable={...emptyVariable,id:'original',projectId:'p',connectionId:'c',environmentId:'dev',name:testCase.name,type:testCase.type,required:true,valueJSON:testCase.valueJSON,version:1,etag:'"v1"'};
 let variables:Variable[]=testCase.kind==='missing dependency'?[original]:[original,{...original,id:'value',name:'VALUE',type:'string',valueJSON:'"wrong-number"',required:false}];
 const requests:{path:string;method:string;body?:VariableInput}[]=[];
 vi.stubGlobal('fetch',async(url:string,init?:RequestInit)=>{
  const method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)) as VariableInput:undefined;
  requests.push({path:url,method,body});
  const reply=(data:unknown)=>new Response(JSON.stringify({data}));
  if(method==='GET'&&url==='/api/v1/projects/p/connections')return reply([connection]);
  if(method==='GET'&&url==='/api/v1/projects/p/environments')return reply([environment]);
  if(method==='GET'&&url==='/api/v1/projects/p/variables')return reply(variables);
  if(method==='POST'&&url==='/api/v1/projects/p/variables'&&body){
   const created:Variable={...body,id:'segment',projectId:'p',version:1,etag:'"segment1"'};
   variables=[...variables,created];return reply(created);
  }
  if(method==='PATCH'&&url==='/api/v1/projects/p/variables/original'&&body){
   const repaired:Variable={...original,...body,version:2,etag:'"v2"'};
   variables=variables.map(value=>value.id===original.id?repaired:value);return reply(repaired);
  }
  throw new Error(`Unexpected boundary request: ${method} ${url}`);
 });
 const memory=new M2Memory();memories.push(memory);
 const runtime=(await memory.runtime('p','c','u'))!;
 await runtime.connect({connection,userId:'u',environment:resolveEnvironment({layers:buildLayers(variables,'p','c','dev'),personal:{}}),authorize:async()=>{throw new Error('Invalid reference must block authorization');}});
 expect(runtime.getSnapshot()).toEqual({status:'failed',diagnostic:'reference_missing'});
 expect(requests).toEqual([]);

 const client=new PlatformClient();client.setCSRF('csrf');
 const navigation:Record<string,string>[]=[];
 function RepairJourney(){
  const [route,setRoute]=useState({page:'servers',connection:'c',environment:'dev'});
  const navigate=(values:Record<string,string>)=>{navigation.push(values);setRoute(old=>({...old,...values}));};
  const props={client,project,session,memory,connectionId:route.connection,navigate,scopeRevision:0};
  return route.page==='environment'?<EnvironmentPage {...props} environmentId={route.environment}/>:<ConnectionsPage {...props}/>;
 }
 render(<I18nextProvider i18n={i18n}><RepairJourney/></I18nextProvider>);
 const user=userEvent.setup();
 await screen.findByLabelText('HTTP endpoint');
 expect(screen.getByRole('alert').textContent).toBe(runtimeReferenceAlert);
 expect(screen.getByRole('button',{name:'Connect'})).toHaveProperty('disabled',true);
 await user.click(screen.getByRole('button',{name:'Check references / repair'}));
 expect(navigation.at(-1)).toEqual({page:'environment',connection:'c',environment:'dev'});
 await screen.findByText(testCase.oldDiagnostic,{exact:true});
 expect(screen.getByRole('alert').textContent).toBe(missingVariableAlert);
 expect(screen.getByLabelText('Environment preview')).toHaveProperty('value','dev');
 expect(screen.getByLabelText('Definition scope')).toHaveProperty('value','c');
 expect(screen.getByRole('button',{name:'Use for my session'})).toHaveProperty('disabled',true);

 if(testCase.kind==='missing dependency'){
  await user.click(screen.getByRole('button',{name:'Create definition / override'}));
  const editor=screen.getByRole('heading',{name:'Create definition / override'}).closest('section')!;
  await user.type(within(editor).getByLabelText('Name'),'SEGMENT');
  await user.click(within(editor).getByLabelText('Value (serialized JSON)'));
  await user.paste(testCase.repairJSON);
  await user.click(within(editor).getByRole('button',{name:'Save changes'}));
 }else{
  const row=screen.getByText('COUNT',{exact:true}).closest('tr')!;
  await user.click(within(row).getByRole('button',{name:'Edit definition'}));
  const editor=screen.getByRole('heading',{name:'Edit definition'}).closest('section')!;
  const field=within(editor).getByLabelText('Value (serialized JSON)');
  await user.clear(field);await user.click(field);await user.paste(testCase.repairJSON);
  await user.click(within(editor).getByRole('button',{name:'Save changes'}));
 }
 await waitFor(()=>expect(screen.getByRole('button',{name:'Use for my session'})).toHaveProperty('disabled',false));
 expect(screen.queryByText(testCase.oldDiagnostic,{exact:true})).toBeNull();
 expect(screen.queryByText(missingVariableAlert,{exact:true})).toBeNull();
 expect(screen.queryByRole('alert')).toBeNull();
 const repairedRow=screen.getByText(testCase.name,{exact:true}).closest('tr')!;
 expect(within(repairedRow).getByText(testCase.previewJSON,{exact:true})).toBeTruthy();
 expect(within(repairedRow).getByText('Available',{exact:true})).toBeTruthy();
 expect(memory.applied.has('p:c')).toBe(false);
 expect(runtime.getSnapshot().status).toBe('failed');
 const mutation=requests.filter(request=>request.method!=='GET');
 expect(mutation).toHaveLength(1);
 expect(mutation[0]).toMatchObject({path:`/api/v1/projects/p/variables${testCase.kind==='missing dependency'?'':'/original'}`,method:testCase.kind==='missing dependency'?'POST':'PATCH',body:{name:testCase.kind==='missing dependency'?'SEGMENT':'COUNT',environmentId:'dev',connectionId:'c',valueJSON:testCase.repairJSON}});

 if(testCase.apply){
  await user.click(screen.getByRole('button',{name:'Use for my session'}));
  expect(memory.applied.get('p:c')).toBe('dev');
  await screen.findByText('Environment applied; connect manually when ready.');
  expect(runtime.getSnapshot()).toEqual({status:'disconnected'});
 }
 await user.click(screen.getByRole('button',{name:'Return to service'}));
 expect(navigation.at(-1)).toEqual({page:'servers',connection:'c',environment:'dev'});
 await waitFor(()=>expect(screen.getByRole('button',{name:'Connect'})).toHaveProperty('disabled',false));
 expect(screen.queryByText(runtimeReferenceAlert,{exact:true})).toBeNull();
 expect(screen.queryByText(missingVariableAlert,{exact:true})).toBeNull();
 expect(screen.queryByRole('button',{name:'Check references / repair'})).toBeNull();
 expect(screen.getByText('Disconnected',{exact:true})).toBeTruthy();
 expect(runtime.getSnapshot()).toEqual({status:'disconnected'});
 expect(memory.applied.has('p:c')).toBe(testCase.apply);
 expect(requests.filter(request=>request.method!=='GET')).toEqual(mutation);
 expect(requests.every(request=>request.path.startsWith('/api/v1/projects/p/'))).toBe(true);
});
