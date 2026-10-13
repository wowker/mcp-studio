import {afterEach,it,expect,vi} from 'vitest';
import {M2Memory} from './runtimeStore';
import {emptyConnection} from './session';
import {resolveEnvironment} from '../../runtime/environment';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('disconnects an expired credential session while its authorization panel is not mounted',async()=>{
 vi.useFakeTimers();vi.stubGlobal('fetch',async(_url:unknown,init?:RequestInit)=>{if(init?.method!=='POST')return new Response(null,{status:405});const message=JSON.parse(String(init.body));if(message.id===undefined)return new Response(null,{status:202});return new Response(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'controlled',version:'1'},capabilities:{}}}),{headers:{'Content-Type':'application/json'}});});const memory=new M2Memory();const scope={userId:'u',projectId:'p',connectionId:'c'};memory.vault.setCredential(scope,'private-test-token',Date.now()+20);const session=await memory.runtime('p','c','u');await session!.connect({connection:{...emptyConnection,id:'c',projectId:'p',version:1,etag:'"v1"',name:'Private',endpoint:'https://mcp.example/mcp',authMode:'token'},userId:'u',environment:resolveEnvironment({layers:[],personal:{}}),credential:memory.vault.getCredential(scope),authorize:async()=>({...scope,version:1,environmentId:''})});expect(session!.getSnapshot().status).toBe('connected');await vi.advanceTimersByTimeAsync(21);expect(memory.vault.getCredential(scope)).toBeUndefined();expect(session!.getSnapshot().status).toBe('disconnected');memory.clear();
});
