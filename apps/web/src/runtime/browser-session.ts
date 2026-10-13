import type {Client} from '@modelcontextprotocol/sdk/client/index.js';
import type {Tool} from '@modelcontextprotocol/sdk/types.js';
import {ListToolsResultSchema} from '@modelcontextprotocol/sdk/types.js';
import type {Connection,ConnectionAccess} from '../generated/platform';
import type {ResolvedEnvironment} from './environment';
import {resolveConnection,RuntimeError} from './connection';
export type SessionSnapshot={status:'disconnected'|'connecting'|'connected'|'failed';diagnostic?:string;serverInfo?:{name:string;version:string};capabilities?:string[]};
export type ConnectOptions={connection:Connection;userId:string;environment:ResolvedEnvironment;credential?:string;credentialResource?:string;authorize:()=>Promise<ConnectionAccess>};
export type ToolDefinition=Pick<Tool,'name'|'title'|'description'|'inputSchema'|'outputSchema'|'annotations'>;
const display=(text:unknown,secrets:string[]):string=>{let safe=typeof text==='string'?text:'';for(const secret of secrets)if(secret)safe=safe.split(secret).join('[REDACTED]');return safe.replace(/(?:Bearer\s+\S+|https?:\/\/\S+[?@]\S*)/giu,'[REDACTED]').replace(/[\x00-\x1f\x7f]/gu,'').slice(0,128);};
const diagnostic=(e:unknown):string=>{if(e instanceof RuntimeError)return e.code;if(e&&typeof e==='object'&&'code'in e){if(e.code==='version_conflict'||e.code==='config_conflict')return 'config_conflict';if(e.code==='forbidden')return 'forbidden';if(e.code==='unauthenticated'||e.code==='session_expired')return 'session_expired';if(e.code===401)return 'credential_rejected';if(e.code===403)return 'authorization_denied';}return 'network_or_browser_policy';};
/** One explicit browser connection. No fallback to another channel or transport. */
export class BrowserSession {
 #snapshot:SessionSnapshot={status:'disconnected'};#listeners=new Set<()=>void>();#generation=0;#abort?:AbortController;#client?:Client;#timeoutMs=1000;#knownSecrets:string[]=[];#metadataSecretsIncomplete=false;
 getSnapshot=():SessionSnapshot=>this.#snapshot;
 subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};};
 #set(snapshot:SessionSnapshot){this.#snapshot=snapshot;for(const l of this.#listeners)l();}
 get locked(){return this.#snapshot.status==='connecting'||this.#snapshot.status==='connected';}
 #hasSensitiveMetadata(value:unknown):boolean{
  let visits=0;
  const check=(item:unknown,depth=0):boolean=>{
   if(++visits>65536||depth>64)return true;
   if(typeof item==='string'||typeof item==='number'||typeof item==='boolean'){
    const text=String(item);
    if(this.#knownSecrets.some(secret=>text.includes(secret))||/(?:Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|sk-[A-Za-z0-9_-]{16,})/iu.test(text))return true;
    for(const match of text.matchAll(/https?:\/\/[^\s"'<>]+/giu)){
     try{const url=new URL(match[0]);if(url.username||url.password||Array.from(url.searchParams.keys()).some(key=>/(^|[^a-z0-9])(authorization|cookie|password|passwd|secret|token|access[-_]?token|refresh[-_]?token|id[-_]?token|api[-_]?key|client[-_]?secret|credential|signature)([^a-z0-9]|$)/iu.test(key)))return true;}catch{/* Non-URL external text is handled as text. */}
    }
    return false;
   }
   if(Array.isArray(item))return item.some(child=>check(child,depth+1));
   if(item&&typeof item==='object')return Object.entries(item).some(([key,child])=>check(key,depth+1)||check(child,depth+1));
   return false;
  };
  return check(value);
 }
 async listTools():Promise<ToolDefinition[]>{
  const client=this.#client;if(this.#snapshot.status!=='connected'||!client)throw new RuntimeError('connection_required');
  if(!client.getServerCapabilities()?.tools)throw new RuntimeError('tools_unavailable');
  if(this.#metadataSecretsIncomplete)throw new RuntimeError('tools_sensitive_metadata');
  const generation=this.#generation,tools:ToolDefinition[]=[],cursors=new Set<string>(),names=new Set<string>();let cursor:string|undefined,pages=0,bytes=0;
  const active=()=>generation===this.#generation&&client===this.#client&&this.#snapshot.status==='connected';
  try{
   do{
    if(!active())throw new RuntimeError('cancelled');
    if(++pages>100)throw new RuntimeError('tools_catalog_limit');
    // SDK listTools additionally compiles output validators with dynamic Function,
    // which strict production CSP forbids. Discovery needs only SDK wire validation.
    const page=await client.request({method:'tools/list',params:cursor===undefined?{}:{cursor}},ListToolsResultSchema,{signal:this.#abort?.signal,timeout:this.#timeoutMs});
    if(!active())throw new RuntimeError('cancelled');
    bytes+=new TextEncoder().encode(JSON.stringify(page)).length;
    if(tools.length+page.tools.length>1024||bytes>1048576)throw new RuntimeError('tools_catalog_limit');
    if(this.#hasSensitiveMetadata(page.tools))throw new RuntimeError('tools_sensitive_metadata');
    for(const tool of page.tools){
     if(!tool.name.trim()||names.has(tool.name))throw new RuntimeError('tools_catalog_invalid');names.add(tool.name);
     const {name,title,description,inputSchema,outputSchema,annotations}=tool;
     tools.push({name,...title===undefined?{}:{title},...description===undefined?{}:{description},inputSchema,...outputSchema===undefined?{}:{outputSchema},...annotations===undefined?{}:{annotations}});
    }
    cursor=page.nextCursor;
    if(cursor!==undefined){if(cursors.has(cursor))throw new RuntimeError('tools_catalog_limit');cursors.add(cursor);}
   }while(cursor!==undefined);
   return tools;
  }catch(error){
   if(generation!==this.#generation)throw new RuntimeError('cancelled');
   if(error instanceof RuntimeError&&['cancelled','tools_catalog_limit','tools_catalog_invalid','tools_sensitive_metadata'].includes(error.code))throw error;
   const safe=this.#snapshot.diagnostic;
   if(safe&&['credential_rejected','authorization_denied','network_or_browser_policy','connection_closed'].includes(safe))throw new RuntimeError(safe);
   if(error&&typeof error==='object'&&'code'in error&&error.code===-32001)throw new RuntimeError('tools_list_timeout');
   throw new RuntimeError('tools_list_failed');
  }
 }
 async connect(options:ConnectOptions){
  if(this.locked)throw new RuntimeError('connection_locked');
  this.#knownSecrets=[];this.#metadataSecretsIncomplete=false;
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
    const metadataSecrets=[options.credential??'',...Array.from(headers).filter(([name])=>/(authorization|cookie|token|api[-_]?key|secret|password|credential|signature)/iu.test(name)).map(([,value])=>value)];
    let visits=0,incomplete=false;const collect=(value:unknown,depth=0)=>{if(++visits>4096||depth>64){incomplete=true;return;}if(typeof value==='string'||typeof value==='number'||typeof value==='boolean'){secrets.push(String(value));metadataSecrets.push(String(value));return;}if(Array.isArray(value))for(const child of value)collect(child,depth+1);else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value)){secrets.push(k);metadataSecrets.push(k);collect(v,depth+1);}};
    for(const row of options.environment.rows)if(row.sensitive)collect(options.environment.read(row.name)?.value);
    this.#knownSecrets=[...new Set(metadataSecrets.filter(Boolean))];this.#metadataSecretsIncomplete=incomplete;
    const server=client.getServerVersion();this.#timeoutMs=c.timeoutMs;
    this.#set({status:'connected',serverInfo:{name:incomplete?'[REDACTED]':display(server?.name,secrets),version:incomplete?'[REDACTED]':display(server?.version,secrets)},capabilities:Object.keys(client.getServerCapabilities()??{}).filter(k=>['tools','resources','prompts','logging','completions','tasks'].includes(k)).sort()});
   })(),cancelled,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new RuntimeError('connection_timeout')),options.connection.timeoutMs);})]);
  }catch(e){if(generation===this.#generation){this.#set({status:'failed',diagnostic:upstreamFailure??diagnostic(e)});controller.abort();await client?.close().catch(()=>{});this.#client=undefined;}}
  finally{if(timer!==undefined)clearTimeout(timer);}
 }
 async disconnect(){++this.#generation;this.#abort?.abort();this.#abort=undefined;const client=this.#client;this.#client=undefined;this.#knownSecrets=[];this.#metadataSecretsIncomplete=false;this.#set({status:'disconnected'});await client?.close().catch(()=>{});}
}
