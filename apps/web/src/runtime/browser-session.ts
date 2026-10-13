import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {Connection,ConnectionAccess} from '../generated/platform';
import type {ResolvedEnvironment} from './environment';
import {resolveConnection,RuntimeError} from './connection';
export type SessionSnapshot={status:'disconnected'|'connecting'|'connected'|'failed';diagnostic?:string;serverInfo?:{name:string;version:string};capabilities?:string[]};
export type ConnectOptions={connection:Connection;userId:string;environment:ResolvedEnvironment;credential?:string;credentialResource?:string;authorize:()=>Promise<ConnectionAccess>};
const display=(text:unknown,secrets:string[]):string=>{let safe=typeof text==='string'?text:'';for(const secret of secrets)if(secret)safe=safe.split(secret).join('[REDACTED]');return safe.replace(/(?:Bearer\s+\S+|https?:\/\/\S+[?@]\S*)/giu,'[REDACTED]').replace(/[\x00-\x1f\x7f]/gu,'').slice(0,128);};
const diagnostic=(e:unknown):string=>{if(e instanceof RuntimeError)return e.code;if(e&&typeof e==='object'&&'code'in e){if(e.code==='version_conflict'||e.code==='config_conflict')return 'config_conflict';if(e.code==='forbidden')return 'forbidden';if(e.code==='unauthenticated'||e.code==='session_expired')return 'session_expired';if(e.code===401)return 'credential_rejected';if(e.code===403)return 'authorization_denied';}return 'network_or_browser_policy';};
/** One explicit browser connection. No tools/execution and no fallback to another channel. */
export class BrowserSession {
 #snapshot:SessionSnapshot={status:'disconnected'};#listeners=new Set<()=>void>();#generation=0;#abort?:AbortController;#client?:Client;
 getSnapshot=():SessionSnapshot=>this.#snapshot;
 subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};};
 #set(snapshot:SessionSnapshot){this.#snapshot=snapshot;for(const l of this.#listeners)l();}
 get locked(){return this.#snapshot.status==='connecting'||this.#snapshot.status==='connected';}
 async connect(options:ConnectOptions){
  if(this.locked)throw new RuntimeError('connection_locked');
  const generation=++this.#generation,controller=new AbortController();this.#abort=controller;this.#set({status:'connecting'});
  let upstreamFailure:string|undefined;
  let client:Client|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const cancelled=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new RuntimeError('cancelled')),{once:true}));
  try{
   await Promise.race([(async()=>{
    const c=options.connection;if(c.channel!=='browser'||c.transport==='stdio')throw new RuntimeError('agent_unavailable');
    const {endpoint,headers}=resolveConnection(c,options.environment,options.credential);
    const resource=endpoint.pathname==='/'&&!endpoint.search?endpoint.origin:endpoint.href;
    if(c.authMode==='oauth'&&options.credentialResource!==resource)throw new RuntimeError('oauth_resource_mismatch');
    const loopback=endpoint.hostname==='localhost'||endpoint.hostname.endsWith('.localhost')||endpoint.hostname==='[::1]'||/^127\./u.test(endpoint.hostname);
    if(globalThis.location?.protocol==='https:'&&endpoint.protocol==='http:'&&!loopback)throw new RuntimeError('mixed_content');
    const access=await options.authorize();if(controller.signal.aborted||generation!==this.#generation)throw new RuntimeError('cancelled');
    if(access.userId!==options.userId||access.projectId!==c.projectId||access.connectionId!==c.id)throw new RuntimeError('forbidden');
    if(access.version!==c.version||access.environmentId!==c.environmentId)throw new RuntimeError('config_conflict');
    const upstreamFetch:typeof fetch=async(input,init)=>{
     const url=new URL(input instanceof Request?input.url:String(input));
     if(url.origin!==endpoint.origin||url.username||url.password||url.hash)throw new RuntimeError('untrusted_transport_endpoint');
     if(controller.signal.aborted||generation!==this.#generation)throw new RuntimeError('cancelled');
     const signal=init?.signal;const onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});
     try{const response=await fetch(input,{...init,credentials:'omit',redirect:'error',signal:controller.signal});if(response.status===401||response.status===403){upstreamFailure=response.status===401?'credential_rejected':'authorization_denied';await response.body?.cancel();throw new RuntimeError(upstreamFailure);}return response;}finally{signal?.removeEventListener('abort',onAbort);}
    };
    const [sdk,module]=await Promise.all([import('@modelcontextprotocol/sdk/client/index.js'),c.transport==='sse'?import('@modelcontextprotocol/sdk/client/sse.js'):import('@modelcontextprotocol/sdk/client/streamableHttp.js')]);
    if(controller.signal.aborted||generation!==this.#generation)throw new RuntimeError('cancelled');
    const transport='SSEClientTransport' in module?new module.SSEClientTransport(endpoint,{fetch:upstreamFetch,requestInit:{headers,credentials:'omit',redirect:'error'}}):new module.StreamableHTTPClientTransport(endpoint,{fetch:upstreamFetch,requestInit:{headers,credentials:'omit',redirect:'error'},reconnectionOptions:{maxReconnectionDelay:0,initialReconnectionDelay:0,reconnectionDelayGrowFactor:1,maxRetries:0}});
    client=new sdk.Client({name:'mcp-studio',version:'0.2.0'});this.#client=client;
    client.onclose=()=>{if(generation===this.#generation&&this.#snapshot.status==='connected')this.#set({status:'failed',diagnostic:'connection_closed'});};
    client.onerror=(error)=>{if(generation===this.#generation&&this.#snapshot.status==='connected'){this.#set({status:'failed',diagnostic:upstreamFailure??diagnostic(error)});controller.abort();this.#client=undefined;void client?.close().catch(()=>{});}};
    await client.connect(transport,{timeout:c.timeoutMs});if(controller.signal.aborted||generation!==this.#generation)throw new RuntimeError('cancelled');
    const secrets=[options.credential??'',...c.headers.map(h=>headers.get(h.name)??'')];
    let visits=0,incomplete=false;const collect=(value:unknown,depth=0)=>{if(++visits>4096||depth>64){incomplete=true;return;}if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'){secrets.push(String(value));return;}if(Array.isArray(value))for(const child of value)collect(child,depth+1);else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){secrets.push(k);collect(v,depth+1);}};
    for(const row of options.environment.rows)if(row.sensitive)collect(options.environment.read(row.name)?.value);
    const server=client.getServerVersion();
    this.#set({status:'connected',serverInfo:{name:incomplete?'[REDACTED]':display(server?.name,secrets),version:incomplete?'[REDACTED]':display(server?.version,secrets)},capabilities:Object.keys(client.getServerCapabilities()??{}).filter(k=>['tools','resources','prompts','logging','completions','tasks'].includes(k)).sort()});
   })(),cancelled,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RuntimeError('connection_timeout')),options.connection.timeoutMs);})]);
  }catch(e){if(generation===this.#generation){this.#set({status:'failed',diagnostic:upstreamFailure??diagnostic(e)});controller.abort();await client?.close().catch(()=>{});this.#client=undefined;}}
  finally{if(timer!==undefined)clearTimeout(timer);}
 }
 async disconnect(){++this.#generation;this.#abort?.abort();this.#abort=undefined;const client=this.#client;this.#client=undefined;this.#set({status:'disconnected'});await client?.close().catch(()=>{});}
}
