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

const catalogTools=[{name:'echo',title:'Echo',description:'Returns supplied text',inputSchema:{type:'object' as const,properties:{text:{type:'string'}},required:['text']},outputSchema:{type:'object' as const,properties:{text:{type:'string'}}},annotations:{readOnlyHint:true}},{name:'nested',inputSchema:{type:'object' as const,properties:{items:{type:'array',items:{type:'object',properties:{enabled:{type:'boolean'}}}}}}}];
function catalogMCP({transport='streamable-http',tools=true,page}: {transport?:Connection['transport'];tools?:boolean;page?:(cursor:unknown)=>unknown|Promise<unknown>}={}){
 const requests:{method:string;params?:{cursor?:string}}[]=[];let stream:ReadableStreamDefaultController<Uint8Array>|undefined;const encoder=new TextEncoder();
 const network=async(_input:string|URL|Request,init?:RequestInit)=>{
  if(init?.method!=='POST')return transport==='sse'?new Response(new ReadableStream<Uint8Array>({start(controller){stream=controller;controller.enqueue(encoder.encode('event: endpoint\ndata: /messages\n\n'));}}),{headers:{'Content-Type':'text/event-stream'}}):new Response(null,{status:405});
  const message=JSON.parse(String(init.body));requests.push(message);if(message.id===undefined)return new Response(null,{status:202});
  const result=message.method==='initialize'?{protocolVersion:'2025-11-25',serverInfo:{name:'catalog-fixture',version:'1'},capabilities:tools?{tools:{}}:{}}:await(page?.(message.params?.cursor)??{tools:catalogTools});
  const response={jsonrpc:'2.0',id:message.id,...(result&&typeof result==='object'&&'error'in result?result:{result})};
  if(transport==='sse'){stream?.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(response)}\n\n`));return new Response(null,{status:202});}
  return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
 };return {network,requests};
}
it.each(['streamable-http','sse'] as const)('lists real SDK validated tools and follows cursors over explicit %s transport',async transport=>{
 const {network,requests}=catalogMCP({transport,page:cursor=>cursor?{tools:[catalogTools[1]]}:{tools:[{...catalogTools[0],_meta:{private:'omit'}}],nextCursor:'second'}});vi.stubGlobal('fetch',network);
 const session=new BrowserSession();await session.connect({connection:{...connection,transport},userId:'u',environment,authorize:async()=>access});
 expect(await session.listTools()).toEqual(catalogTools);expect(requests.filter(r=>r.method==='tools/list').map(r=>r.params?.cursor)).toEqual([undefined,'second']);await session.disconnect();
});
it('requires a connected tools-capable session before catalog network requests',async()=>{
 const {network,requests}=catalogMCP({tools:false});vi.stubGlobal('fetch',network);const session=new BrowserSession();
 await expect(session.listTools()).rejects.toMatchObject({code:'connection_required'});await session.connect({connection,userId:'u',environment,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({code:'tools_unavailable'});expect(requests.some(r=>r.method==='tools/list')).toBe(false);await session.disconnect();
});
it('returns a real empty tool catalog as an empty array',async()=>{
 const {network}=catalogMCP({page:()=>({tools:[]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});expect(await session.listTools()).toEqual([]);await session.disconnect();
});
it('rejects a late catalog from a disconnected generation without exposing its result',async()=>{
 let release:(value:unknown)=>void=()=>{};let entered:()=>void=()=>{};const started=new Promise<void>(r=>entered=r);
 const {network}=catalogMCP({page:()=>{entered();return new Promise(r=>release=r);}});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});
 const pending=session.listTools();const rejected=expect(pending).rejects.toMatchObject({code:'cancelled'});await started;await session.disconnect();
 const next=catalogMCP({page:()=>({tools:[]})});vi.stubGlobal('fetch',next.network);await session.connect({connection,userId:'u',environment,authorize:async()=>access});release({tools:catalogTools});await rejected;expect(session.getSnapshot().status).toBe('connected');expect(await session.listTools()).toEqual([]);await session.disconnect();
});
it.each([
 ['repeated cursor',(cursor:unknown)=>({tools:cursor?[]:[catalogTools[0]],nextCursor:'repeat'}),'tools_catalog_limit'],
 ['too many tools',()=>({tools:Array.from({length:1025},(_,n)=>({name:'tool-'+n,inputSchema:{type:'object'}}))}),'tools_catalog_limit'],
 ['too many pages',(cursor:unknown)=>({tools:[],nextCursor:String(Number(cursor??0)+1)}),'tools_catalog_limit'],
 ['duplicate tool names',()=>({tools:[catalogTools[0],catalogTools[0]]}),'tools_catalog_invalid'],
 ['empty tool identity',()=>({tools:[{...catalogTools[0],name:''}]}),'tools_catalog_invalid'],
 ['malformed schema',()=>({tools:[{...catalogTools[0],inputSchema:{type:'string'}}]}),'tools_list_failed'],
 ['large catalog',()=>({tools:[{...catalogTools[0],description:'x'.repeat(1048577)}]}),'tools_catalog_limit'],
 ['untrusted protocol error',()=>({error:{code:-32603,message:'Bearer synthetic-private-token',data:{secret:'private'}}}),'tools_list_failed'],
] as const)('bounds and safely rejects %s',async(_name,page,code)=>{
 const {network,requests}=catalogMCP({page});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({name:'RuntimeError',message:code,code});expect(requests.filter(r=>r.method==='tools/list').length).toBeLessThanOrEqual(100);expect(JSON.stringify(session.getSnapshot())).not.toContain('synthetic-private-token');await session.disconnect();
});
it.each([401,403])('maps catalog HTTP %i rejection into safe diagnostics without fallback',async status=>{
 const {network,requests}=catalogMCP();vi.stubGlobal('fetch',async(input:string|URL|Request,init?:RequestInit)=>{const message=init?.method==='POST'?JSON.parse(String(init.body)):undefined;return message?.method==='tools/list'?new Response('Bearer synthetic-private-token',{status}):network(input,init);});
 const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});await expect(session.listTools()).rejects.toMatchObject({code:status===401?'credential_rejected':'authorization_denied'});expect(requests.filter(r=>r.method==='initialize')).toHaveLength(1);await session.disconnect();
});
it.each(['name','description','schema'] as const)('rejects known credential echoed in tool %s before returning metadata',async field=>{
 const secret='catalog-fixture-private-token';const tool={...catalogTools[0],...(field==='name'?{name:secret}:field==='description'?{description:'Echo '+secret}:{inputSchema:{type:'object',properties:{text:{type:'string',default:secret}}}})};
 const {network}=catalogMCP({page:()=>({tools:[tool]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection:{...connection,authMode:'token'},userId:'u',environment,credential:secret,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({code:'tools_sensitive_metadata',message:'tools_sensitive_metadata'});expect(JSON.stringify(session.getSnapshot())).not.toContain(secret);await session.disconnect();
});
it.each(['Bearer obvious-fixture-private','eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmaXh0dXJlIn0.signature','sk-fixtureprivate0123456789'] as const)('rejects recognizable secret metadata without including its value in errors (%#)',async value=>{
 const {network}=catalogMCP({page:()=>({tools:[{...catalogTools[0],inputSchema:{type:'object',properties:{text:{type:'string',default:value}}}}]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({code:'tools_sensitive_metadata',message:'tools_sensitive_metadata'});await session.disconnect();
});
it('clears metadata secrets on disconnect and reconnect while retaining protection for sensitive environment leaves',async()=>{
 const secret='catalog-nested-private';const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'s',name:'S',type:'json',sensitive:true,value:null}]}],personal:{s:{nested:[secret]}}});
 const {network}=catalogMCP({page:()=>({tools:[{...catalogTools[0],title:secret}]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment:env,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({code:'tools_sensitive_metadata'});await session.disconnect();await session.connect({connection,userId:'u',environment,authorize:async()=>access});expect((await session.listTools())[0].title).toBe(secret);await session.disconnect();
});
it('refuses catalog when known sensitive leaf collection could not finish',async()=>{
 const env=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'s',name:'S',type:'json',sensitive:true,value:null},{id:'t',name:'T',type:'json',sensitive:true,value:null}]}],personal:{s:Array.from({length:2500},(_,n)=>'s'+n),t:Array.from({length:2500},(_,n)=>'t'+n)}});
 const {network,requests}=catalogMCP();vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment:env,authorize:async()=>access});
 await expect(session.listTools()).rejects.toMatchObject({code:'tools_sensitive_metadata'});expect(requests.filter(r=>r.method==='tools/list')).toHaveLength(0);await session.disconnect();
});
it('does not treat ordinary public header values as catalog secrets',async()=>{
 const {network}=catalogMCP({page:()=>({tools:[{...catalogTools[0],description:'demo workspace uses application/json'}]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();
 await session.connect({connection:{...connection,headers:[{name:'X-Workspace',value:'demo'},{name:'Accept',value:'application/json'}]},userId:'u',environment,authorize:async()=>access});expect((await session.listTools())[0].description).toBe('demo workspace uses application/json');await session.disconnect();
});
it.each(['https://example.test/mcp?api_key=opaque-private','https://example.test/mcp?%74oken=opaque-private','https://user:opaque-private@example.test/mcp'] as const)('rejects authentication-bearing metadata URLs without exposing URL in error (%#)',async value=>{
 const {network}=catalogMCP({page:()=>({tools:[{...catalogTools[0],inputSchema:{type:'object',properties:{url:{type:'string',default:value}}}}]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});await expect(session.listTools()).rejects.toMatchObject({code:'tools_sensitive_metadata',message:'tools_sensitive_metadata'});await session.disconnect();
});
it('preserves public query parameters in tool metadata URLs',async()=>{
 const value='https://example.test/mcp?workspace=demo&public=1';const {network}=catalogMCP({page:()=>({tools:[{...catalogTools[0],description:'Documentation '+value}]})});vi.stubGlobal('fetch',network);const session=new BrowserSession();await session.connect({connection,userId:'u',environment,authorize:async()=>access});expect((await session.listTools())[0].description).toBe('Documentation '+value);await session.disconnect();
});
it.each(['streamable-http','sse'] as const)('discovers output schemas over %s without SDK dynamic validator compilation under strict CSP',async transport=>{
 const {AjvJsonSchemaValidator}=await import('@modelcontextprotocol/sdk/validation/ajv');const compile=vi.spyOn(AjvJsonSchemaValidator.prototype,'getValidator').mockImplementation(()=>{throw new EvalError('CSP blocks dynamic Function');});
 const {network}=catalogMCP({transport,page:cursor=>cursor?{tools:[catalogTools[1]]}:{tools:[catalogTools[0]],nextCursor:'second'}});vi.stubGlobal('fetch',network);const session=new BrowserSession();
 try{await session.connect({connection:{...connection,transport},userId:'u',environment,authorize:async()=>access});expect(await session.listTools()).toEqual(catalogTools);expect(compile).not.toHaveBeenCalled();}finally{await session.disconnect();compile.mockRestore();}
});
