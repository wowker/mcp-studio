// @vitest-environment node
import {it,expect,vi,afterAll} from 'vitest';
vi.stubGlobal('localStorage',{clear:()=>{}});
afterAll(()=>vi.unstubAllGlobals());
import {BrowserSession} from '../browser-session';
import {ExecutionRunner} from './index';
import {validateWithInterpreter} from '../schema/interpreter';
import {resolveEnvironment} from '../environment';
import type {Connection,ConnectionAccess} from '../../generated/platform';
const fixtureModule='../../../../../tests/fixtures/m2/fixture.mjs';
const {startM2Fixture}=await import(fixtureModule) as {startM2Fixture:(options:{allowedOrigin:string})=>Promise<{origin:string;stats:Record<string,number>;close:()=>Promise<void>}>};
it.each(['streamable-http','sse'] as const)('executes actual %s SDK echo and business/protocol errors without retry or platform proxy',async transport=>{
 const fixture=await startM2Fixture({allowedOrigin:'http://localhost:3000'});const runtime=new BrowserSession();const connection:Connection={name:'fixture',transport,channel:'browser',endpoint:fixture.origin+(transport==='sse'?'/sse':'/mcp'),command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:1000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[],id:'c',projectId:'p',version:1,etag:'v1'},access:ConnectionAccess={userId:'u',projectId:'p',connectionId:'c',version:1,environmentId:''},environment=resolveEnvironment({layers:[],personal:{}}),authorize=async()=>access;
 try{await runtime.connect({connection,userId:'u',environment,authorize});const tool=(await runtime.listTools())[0],runner=new ExecutionRunner({validate:validateWithInterpreter}),options={tabId:'tab',session:runtime,connection,userId:'u',environment,tool,arguments:{text:'hello'},authorize};expect(await runner.execute(options)).toMatchObject({status:'succeeded',resultKind:'success',response:{structuredContent:{text:'hello'}}});expect(await runner.execute({...options,arguments:{text:'fixture-tool-error'}})).toMatchObject({status:'failed',resultKind:'tool_error'});expect(await runner.execute({...options,arguments:{text:'fixture-rpc-error'}})).toMatchObject({status:'failed',resultKind:'rpc_error',remoteOutcome:'known'});expect(fixture.stats.toolsCall).toBe(3);expect(fixture.stats.cookieRequests).toBe(0);}finally{await runtime.disconnect();await fixture.close();}
});
it('records a real post-handshake HTTP 401 as a known rejection with no retry',async()=>{
 const fixture=await startM2Fixture({allowedOrigin:'http://localhost:3000'}),session=new BrowserSession(),connection:Connection={name:'fixture',transport:'streamable-http',channel:'browser',endpoint:fixture.origin+'/mcp',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:1000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[],id:'c',projectId:'p',version:1,etag:'v1'},access:ConnectionAccess={userId:'u',projectId:'p',connectionId:'c',version:1,environmentId:''},environment=resolveEnvironment({layers:[],personal:{}}),authorize=async()=>access;
 try{await session.connect({connection,userId:'u',environment,authorize});const tool=(await session.listTools())[0],runner=new ExecutionRunner({validate:validateWithInterpreter});expect(await runner.execute({tabId:'tab',session,connection,userId:'u',environment,tool,arguments:{text:'fixture-call-401'},authorize})).toMatchObject({status:'failed',resultKind:'http_error',httpStatus:401,remoteOutcome:'known'});expect(fixture.stats.toolsCall).toBe(1);}finally{await session.disconnect();await fixture.close();}
});
