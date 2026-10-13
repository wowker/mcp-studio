// @vitest-environment node
import {it,expect,vi,afterAll} from 'vitest';
// The shared React test teardown clears storage even in this Node-only SDK test.
vi.stubGlobal('localStorage',{clear:()=>{}});
afterAll(()=>vi.unstubAllGlobals());
import {BrowserSession} from '../browser-session';
import {resolveEnvironment,type EnvironmentInput} from '../environment';
import {ExecutionRunner} from './index';
import {validateWithInterpreter} from '../schema/interpreter';
import type {Connection,ConnectionAccess} from '../../generated/platform';

const fixtureModule='../../../../../tests/fixtures/m2/fixture.mjs';
const {startM2Fixture}=await import(fixtureModule) as {startM2Fixture:(options:{allowedOrigin:string})=>Promise<{origin:string;stats:Record<string,number>;close:()=>Promise<void>}>};
const layers:EnvironmentInput['layers']=[{source:'base-project',definitions:[
 {id:'private',name:'PRIVATE',type:'json',sensitive:true,required:true,value:null},
 {id:'cycle',name:'CYCLE',type:'string',value:'{{PRIVATE}}'},
]}];
const cases=[{name:'cycle',value:'{{CYCLE}}',status:'cycle'},{name:'nested missing dependency',value:{deep:['{{MISSING}}']},status:'dependency_missing'}];

for(const entry of cases)it(`A09 Browser connect and Run block ${entry.name} with zero upstream calls`,async()=>{
 const fixture=await startM2Fixture({allowedOrigin:'http://localhost:3000'}),blocked=new BrowserSession(),connected=new BrowserSession();
 const connection:Connection={name:'Dependency guard',transport:'streamable-http',channel:'browser',endpoint:fixture.origin+'/mcp',command:'',args:[],cwd:'',headers:[{name:'X-Resolved',value:'{{PRIVATE}}'}],env:[],timeoutMs:1000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[],id:'c',projectId:'p',version:1,etag:'v1'};
 const access:ConnectionAccess={userId:'u',projectId:'p',connectionId:'c',version:1,environmentId:''},authorize=async()=>access;
 const invalid=resolveEnvironment({layers,personal:{private:entry.value}});
 const valid=resolveEnvironment({layers,personal:{private:{deep:['ready']}}});
 try {
  expect(invalid.rows.find(row=>row.name==='PRIVATE')?.status).toBe(entry.status);
  await blocked.connect({connection,userId:'u',environment:invalid,authorize});
  expect(blocked.getSnapshot()).toEqual({status:'failed',diagnostic:'reference_missing'});
  expect(fixture.stats.initialize).toBe(0);expect(fixture.stats.toolsCall).toBe(0);
  // Establish a real SDK session first, then inject the invalid current values.
  await connected.connect({connection,userId:'u',environment:valid,authorize});
  expect(connected.getSnapshot().status).toBe('connected');
  const tool=(await connected.listTools())[0],runner=new ExecutionRunner({validate:validateWithInterpreter});let finished=0;
  const outcome=await runner.execute({tabId:'tab',session:connected,connection,userId:'u',environment:invalid,tool,arguments:{text:'should-not-run'},authorize,onFinished:()=>{finished++;}});
  expect(outcome).toBeUndefined();expect(runner.getSnapshot('tab')).toMatchObject({busy:false,phase:'idle',diagnostic:'environment_changed'});
  expect(finished).toBe(0);expect(fixture.stats.initialize).toBe(1);expect(fixture.stats.toolsCall).toBe(0);
  // Explicitly repair and reconnect; the failure must not leave a permanent block.
  await blocked.connect({connection,userId:'u',environment:valid,authorize});expect(blocked.getSnapshot().status).toBe('connected');
  const repaired=(await blocked.listTools())[0];
  expect(await runner.execute({tabId:'repaired',session:blocked,connection,userId:'u',environment:valid,tool:repaired,arguments:{text:'repaired'},authorize})).toMatchObject({status:'succeeded',response:{structuredContent:{text:'repaired'}}});
  expect(fixture.stats.toolsCall).toBe(1);
 } finally {await blocked.disconnect();await connected.disconnect();await fixture.close();}
});
