import {it,expect,vi,afterEach} from 'vitest';
import {webcrypto} from 'node:crypto';
import {OAuthFlow,deliverOAuthCallback} from './oauth';import {MemoryVault} from './vault';
const scope={userId:'u',projectId:'p',connectionId:'c'};
const endpoint='https://mcp.example/mcp',issuer='https://auth.example';
const popup=()=>({location:{href:''},close:vi.fn(),closed:false}) as unknown as Window;
function fixtureNetwork(overrides:Record<string,unknown>={}){
 const calls:{url:string;init?:RequestInit}[]=[];
 const network=async(input:string|URL|Request,init?:RequestInit)=>{const url=String(input);calls.push({url,init});
  if(url===endpoint)return new Response(null,{status:401,headers:{'WWW-Authenticate':`Bearer resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp", scope="read"`}});
  if(url.includes('oauth-protected-resource'))return new Response(JSON.stringify({resource:endpoint,authorization_servers:[issuer],scopes_supported:['read'],...overrides.resource as object}));
  if(url.includes('oauth-authorization-server'))return new Response(JSON.stringify({issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',code_challenge_methods_supported:['S256'],...overrides.metadata as object}));
  if(url===issuer+'/token')return new Response(JSON.stringify({access_token:'fixture-access',token_type:'Bearer',expires_in:60,refresh_token:'fixture-refresh',...overrides.token as object}));
  throw Error('unplanned');};return {network,calls};
}
afterEach(()=>vi.unstubAllGlobals());
function setup(overrides:Record<string,unknown>={}){vi.stubGlobal('crypto',webcrypto);const {network,calls}=fixtureNetwork(overrides);vi.stubGlobal('fetch',network);const vault=new MemoryVault(),flow=new OAuthFlow(vault),p=popup();return {vault,flow,p,calls};}
const opts=(p:Window)=>({scope,endpoint,clientId:'public-client',scopes:['read'],redirectUri:location.origin+'/oauth/callback',popup:p});
it('discovers authorization server, binds resource and S256 PKCE, validates callback then exchanges once',async()=>{
 const {vault,flow,p,calls}=setup();await flow.begin(opts(p));expect(flow.getSnapshot().status).toBe('authorizing');const u=new URL(p.location.href);expect(u.searchParams.get('resource')).toBe(endpoint);expect(u.searchParams.get('code_challenge_method')).toBe('S256');expect(u.searchParams.get('scope')).toBe('read');const state=u.searchParams.get('state');
 const event={origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',code:'fixture-code',state,iss:issuer}} as MessageEvent;
 await flow.receiveCallback(event);await flow.receiveCallback(event);expect(vault.getCredential(scope)).toBe('fixture-access');expect(flow.getSnapshot().status).toBe('authorized');expect(calls.filter(c=>c.url===issuer+'/token')).toHaveLength(1);
 const body=new URLSearchParams(String(calls.at(-1)?.init?.body));expect(body.get('resource')).toBe(endpoint);expect(body.get('code_verifier')).toHaveLength(43);expect(body.has('client_secret')).toBe(false);expect(JSON.stringify(flow)).not.toContain('fixture-access');flow.cancel();
});
it('discards callback from wrong source or origin and rejects state or issuer mismatch',async()=>{
 const {vault,flow,p,calls}=setup();await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');await flow.receiveCallback({origin:'https://evil.example',source:p,data:{type:'mcp-studio-oauth-callback',code:'x',state,iss:issuer}} as MessageEvent);expect(flow.getSnapshot().status).toBe('authorizing');
 await flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',code:'x',state,iss:'https://evil.example'}} as MessageEvent);expect(flow.getSnapshot()).toMatchObject({status:'callback-failed',diagnostic:'oauth_callback_invalid'});expect(vault.getCredential(scope)).toBeUndefined();expect(calls.filter(c=>c.url===issuer+'/token')).toHaveLength(0);
});
it('rejects unsafe metadata, resource mismatch, missing PKCE and insecure issuer',async()=>{
 for(const overrides of [{metadata:{token_endpoint:'http://evil.example/token'}},{metadata:{issuer:'https://evil.example'}},{metadata:{code_challenge_methods_supported:[]}},{resource:{resource:'https://other.example/mcp'}},{resource:{authorization_servers:['http://auth.example']}}]){
  const {flow,p}=setup(overrides);await flow.begin(opts(p));expect(flow.getSnapshot().status).toBe('callback-failed');expect(p.location.href).toBe('');flow.cancel();
 }
});
it('cancels pending authorization and prevents callbacks from storing token',async()=>{
 const {vault,flow,p}=setup();await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');flow.cancel();await flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',code:'x',state,iss:issuer}} as MessageEvent);expect(vault.getCredential(scope)).toBeUndefined();expect(flow.getSnapshot().status).toBe('cancelled');
});
it('strips callback credentials before delivering only expected fields to same origin opener',()=>{
 const posted:unknown[]=[];let stripped=false;const win={location:{href:location.origin+'/oauth/callback?code=synthetic&state=s&iss=https%3A%2F%2Fauth.example&extra=x',origin:location.origin,pathname:'/oauth/callback'},history:{replaceState:()=>{stripped=true;}},opener:{postMessage:(data:unknown,origin:string)=>{expect(stripped).toBe(true);posted.push([data,origin]);}}} as unknown as Window;
 deliverOAuthCallback(win);expect(posted).toEqual([[{type:'mcp-studio-oauth-callback',code:'synthetic',state:'s',iss:issuer,error:''},location.origin]]);
});
it('treats genuine authorization denial with valid state and issuer as denied without redeeming',async()=>{
 const {flow,p,calls}=setup();await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');await flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer,error:'access_denied'}} as MessageEvent);expect(flow.getSnapshot().status).toBe('denied');expect(calls.filter(c=>c.url===issuer+'/token')).toHaveLength(0);
});
it('never stores late tokens after cancellation during code exchange',async()=>{
 const {vault,flow,p,calls}=setup();await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');let release:(r:Response)=>void=()=>{};vi.stubGlobal('fetch',()=>new Promise<Response>(r=>release=r));const pending=flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer,code:'code'}} as MessageEvent);flow.cancel();release(new Response(JSON.stringify({access_token:'late-private',token_type:'Bearer'})));await pending;expect(vault.getCredential(scope)).toBeUndefined();expect(flow.getSnapshot().status).toBe('cancelled');expect(calls.filter(c=>c.url===issuer+'/token')).toHaveLength(0);
});
it('clearing account secrets fences a delayed OAuth response even if caller forgets cancellation',async()=>{
 const {vault,flow,p}=setup();await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');let release:(r:Response)=>void=()=>{};vi.stubGlobal('fetch',()=>new Promise<Response>(r=>release=r));const pending=flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer,code:'code'}} as MessageEvent);vault.clear();release(new Response(JSON.stringify({access_token:'late-private',token_type:'Bearer'})));await pending;expect(vault.getCredential(scope)).toBeUndefined();flow.cancel();
});
it('bounds code exchange timeout and refuses a late token after timed-out exchange',async()=>{
 vi.useFakeTimers();try{const {vault,p}=setup();const flow=new OAuthFlow(vault,{timeoutMs:10});await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');let release:(r:Response)=>void=()=>{};vi.stubGlobal('fetch',()=>new Promise<Response>(r=>release=r));const pending=flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer,code:'code'}} as MessageEvent);await vi.advanceTimersByTimeAsync(11);expect(flow.getSnapshot().status).toBe('expired');release(new Response(JSON.stringify({access_token:'late-private',token_type:'Bearer'})));await pending;expect(vault.getCredential(scope)).toBeUndefined();flow.cancel();}finally{vi.useRealTimers();}
});
it('honors exact declared issuer including its trailing slash and refuses unknown state',async()=>{
 const {flow,p}=setup({resource:{authorization_servers:[issuer+'/']},metadata:{issuer:issuer+'/'}});await flow.begin(opts(p));expect(flow.getSnapshot().status).toBe('authorizing');const state=new URL(p.location.href).searchParams.get('state');await flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer+'/',code:'code'}} as MessageEvent);expect(flow.getSnapshot().status).toBe('authorized');flow.cancel();
 const next=setup();await next.flow.begin(opts(next.p));await next.flow.receiveCallback({origin:location.origin,source:next.p,data:{type:'mcp-studio-oauth-callback',state:'unknown',iss:issuer,code:'code'}} as MessageEvent);expect(next.flow.getSnapshot().status).toBe('callback-failed');expect(next.vault.getCredential(scope)).toBeUndefined();next.flow.cancel();
});
it('rejects finite token lifetimes whose derived expiry overflows safe clock range',async()=>{
 const {vault,flow,p}=setup({token:{expires_in:1e308}});await flow.begin(opts(p));const state=new URL(p.location.href).searchParams.get('state');await flow.receiveCallback({origin:location.origin,source:p,data:{type:'mcp-studio-oauth-callback',state,iss:issuer,code:'code'}} as MessageEvent);expect(flow.getSnapshot()).toMatchObject({status:'callback-failed',diagnostic:'oauth_token_invalid'});expect(vault.getCredential(scope)).toBeUndefined();flow.cancel();
});
it('refuses same-platform-hostname authorization navigation even on a different port',async()=>{
 const sameHost='https://localhost:9443';const {flow,p,vault}=setup({resource:{authorization_servers:[sameHost]},metadata:{issuer:sameHost,authorization_endpoint:sameHost+'/authorize',token_endpoint:sameHost+'/token'}});
 await flow.begin(opts(p));expect(flow.getSnapshot()).toMatchObject({status:'callback-failed',diagnostic:'oauth_platform_origin_conflict'});expect(p.location.href).toBe('');expect(vault.getCredential(scope)).toBeUndefined();flow.cancel();
});
