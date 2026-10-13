import {it,expect,vi,afterEach} from 'vitest';
import type {Connection,ConnectionAccess} from '../generated/platform';
import {BrowserSession} from './browser-session';import {resolveEnvironment} from './environment';
const connection:Connection={name:'fixture',transport:'streamable-http',channel:'browser',endpoint:'https://mcp.example/mcp?public=1',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:1000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[],id:'c',projectId:'p',version:1,etag:'v1'};
const environment=resolveEnvironment({layers:[],personal:{}});
const access:ConnectionAccess={userId:'u',projectId:'p',connectionId:'c',version:1,environmentId:''};
afterEach(()=>vi.unstubAllGlobals());
function mockMCP(){const calls:{url:string;init?:RequestInit}[]=[];const network=async(url:string|URL|Request,init?:RequestInit)=>{
 calls.push({url:String(url),init});if(init?.method!=='POST')return new Response(null,{status:405});const b=JSON.parse(String(init.body));if(b.id===undefined)return new Response(null,{status:202});return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'synthetic-token',version:'1'},capabilities:{tools:{}}}}),{headers:{'Content-Type':'application/json'}});
 };return {network,calls};}
it('uses real pinned SDK handshake only after authoritative scoped access, keeps tokens out of snapshot',async()=>{
 const {network,calls}=mockMCP();vi.stubGlobal('fetch',network);const session=new BrowserSession();const authorize=vi.fn(async()=>access);
 await session.connect({connection:{...connection,authMode:'token'},userId:'u',environment,credential:'synthetic-token',authorize});
 expect(authorize).toHaveBeenCalledOnce();expect(session.getSnapshot().status).toBe('connected');expect(session.locked).toBe(true);expect(session.getSnapshot().capabilities).toEqual(['tools']);expect(JSON.stringify(session.getSnapshot())).not.toContain('synthetic-token');
 for(const call of calls){expect(call.init?.credentials).toBe('omit');expect(call.init?.redirect).toBe('error');expect(new Headers(call.init?.headers).get('Authorization')).toBe('Bearer synthetic-token');}
 await session.disconnect();expect(session.locked).toBe(false);
});
it('blocks stale or foreign authority before any upstream request',async()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>({...access,version:2})});expect(session.getSnapshot()).toMatchObject({status:'failed',diagnostic:'config_conflict'});expect(network).not.toHaveBeenCalled();
});
it('cancellation during permission lookup prevents late connect',async()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);let release:(a:ConnectionAccess)=>void=()=>{};const session=new BrowserSession();const pending=session.connect({connection,userId:'u',environment,authorize:()=>new Promise(r=>release=r)});await session.disconnect();release(access);await pending;expect(session.getSnapshot().status).toBe('disconnected');expect(network).not.toHaveBeenCalled();
});
it('sanitizes browser policy failures and refuses automatic Agent selection',async()=>{
 vi.stubGlobal('fetch',async()=>{throw Error('CORS synthetic-private-token');});const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});expect(session.getSnapshot()).toMatchObject({status:'failed',diagnostic:'network_or_browser_policy'});
 await session.connect({connection:{...connection,channel:'agent'},userId:'u',environment,authorize:async()=>access});expect(session.getSnapshot()).toMatchObject({status:'failed',diagnostic:'agent_unavailable'});
});
it('allows trustworthy loopback HTTP to reach actual browser policy instead of treating it as mixed content',async()=>{
 const {network}=mockMCP();vi.stubGlobal('fetch',network);vi.stubGlobal('location',{protocol:'https:'});
 const session=new BrowserSession();await session.connect({connection:{...connection,endpoint:'http://127.0.0.1:1234/mcp'},userId:'u',environment,authorize:async()=>access});expect(session.getSnapshot().status).toBe('connected');await session.disconnect();
 await session.connect({connection:{...connection,endpoint:'http://remote.example/mcp'},userId:'u',environment,authorize:async()=>access});expect(session.getSnapshot()).toMatchObject({status:'failed',diagnostic:'mixed_content'});
});
it('refuses OAuth token for another resource before sending any target traffic',async()=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const s=new BrowserSession();await s.connect({connection:{...connection,authMode:'oauth'},userId:'u',environment,credential:'oauth-private',credentialResource:'https://other.example/mcp',authorize:async()=>access});expect(s.getSnapshot()).toMatchObject({status:'failed',diagnostic:'oauth_resource_mismatch'});expect(network).not.toHaveBeenCalled();
});
it.each(['streamable-http','sse'] as const)('fails %s immediately after a connected server stream breaks and never reconnects',async transport=>{
 let stream:ReadableStreamDefaultController<Uint8Array>|undefined;let getCount=0;const encoder=new TextEncoder();
 vi.stubGlobal('fetch',async(_input:string|URL|Request,init?:RequestInit)=>{
  if(init?.method!=='POST'){getCount++;return new Response(new ReadableStream<Uint8Array>({start(controller){stream=controller;if(transport==='sse')controller.enqueue(encoder.encode('retry: 1\nevent: endpoint\ndata: /messages\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}});}
  const body=JSON.parse(String(init.body));if(body.id===undefined)return new Response(null,{status:202});const message={jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-11-25',serverInfo:{name:'fixture',version:'1'},capabilities:{}}};
  if(transport==='sse'){stream?.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(message)}\n\n`));return new Response(null,{status:202});}
  return new Response(JSON.stringify(message),{headers:{'Content-Type':'application/json'}});
 });
 const session=new BrowserSession();await session.connect({connection:{...connection,transport},userId:'u',environment,authorize:async()=>access});expect(session.getSnapshot().status).toBe('connected');await vi.waitFor(()=>expect(stream).toBeDefined());stream?.error(new Error('controlled stream failure'));await vi.waitFor(()=>expect(session.getSnapshot()).toMatchObject({status:'failed',diagnostic:'network_or_browser_policy'}),{timeout:100});expect(getCount).toBe(1);expect(session.locked).toBe(false);await session.disconnect();
});
it('redacts nested sensitive JSON leaves echoed in server identity',async()=>{
 const privateValue='nested-fixture-private';const {network}=mockMCP();vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{const r=await network(input,init);if(init?.method==='POST'&&r.status===200){const json=await r.json();json.result.serverInfo={name:privateValue,version:'1'};return new Response(JSON.stringify(json),{headers:{'Content-Type':'application/json'}});}return r;});
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'s',name:'S',type:'json',sensitive:true,value:null}]}],personal:{s:{headers:[privateValue]}}});const session=new BrowserSession();await session.connect({connection,userId:'u',environment:env,authorize:async()=>access});expect(JSON.stringify(session.getSnapshot()).includes(privateValue)).toBe(false);await session.disconnect();
});
it('hides whole server identity if collecting known private leaves hits the bound',async()=>{
 const leaf='fixture-late-private',many=(prefix:string)=>Array.from({length:2500},(_,n)=>prefix+n);const b=many('b');b[2499]=leaf;
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'a',name:'A',type:'json',sensitive:true,value:null},{id:'b',name:'B',type:'json',sensitive:true,value:null}]}],personal:{a:many('a'),b}});
 const {network}=mockMCP();vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{const r=await network(input,init);if(init?.method==='POST'&&r.status===200){const j=await r.json();j.result.serverInfo={name:leaf,version:'1'};return new Response(JSON.stringify(j),{headers:{'Content-Type':'application/json'}});}return r;});
 const s=new BrowserSession();await s.connect({connection,userId:'u',environment:env,authorize:async()=>access});expect(s.getSnapshot().status).toBe('connected');expect(JSON.stringify(s.getSnapshot()).includes(leaf)).toBe(false);expect(s.getSnapshot().serverInfo?.name).toBe('[REDACTED]');await s.disconnect();
});
it.each([401,403])('preserves safe upstream %i diagnosis for actual legacy SSE initialize rejection',async status=>{
 const encoder=new TextEncoder();vi.stubGlobal('fetch',async(_input:string|URL|Request,init?:RequestInit)=>init?.method==='POST'?new Response('untrusted raw secret',{status}):new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(encoder.encode('event: endpoint\ndata: /messages\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}}));
 const s=new BrowserSession();await s.connect({connection:{...connection,transport:'sse'},userId:'u',environment,authorize:async()=>access});expect(s.getSnapshot()).toMatchObject({status:'failed',diagnostic:status===401?'credential_rejected':'authorization_denied'});expect(JSON.stringify(s.getSnapshot())).not.toContain('untrusted raw secret');await s.disconnect();
});
it.each([['version_conflict',409,'config_conflict'],['forbidden',403,'forbidden'],['unauthenticated',401,'session_expired']] as const)('preserves safe platform %s diagnosis and never sends MCP traffic',async(code,status,wanted)=>{
 const network=vi.fn();vi.stubGlobal('fetch',network);const s=new BrowserSession();await s.connect({connection,userId:'u',environment,authorize:async()=>{throw {code,status,message:'raw-private'};}});expect(s.getSnapshot()).toMatchObject({status:'failed',diagnostic:wanted});expect(network).not.toHaveBeenCalled();
});
