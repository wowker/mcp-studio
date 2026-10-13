import type {CredentialScope} from './vault';
import {MemoryVault} from './vault';
import {RuntimeError} from './connection';
export type OAuthSnapshot={status:'unauthenticated'|'authorizing'|'authorized'|'denied'|'expired'|'callback-failed'|'cancelled';diagnostic?:string};
export type OAuthBegin={scope:CredentialScope;endpoint:string;clientId:string;scopes:string[];redirectUri:string;popup:Window;resourceMetadataUrl?:string};
export type OAuthOptions={/** Only development fixtures may allow insecure loopback AS endpoints. */allowLoopbackHTTP?:boolean;timeoutMs?:number};
type Pending={options:OAuthBegin;state:string;verifier:string;issuer:string;tokenEndpoint:string;resource:string;origin:string;generation:number;vaultGeneration:number};
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new RuntimeError('oauth_metadata_invalid');return value as Record<string,unknown>;};
const strings=(value:unknown):string[]=>Array.isArray(value)&&value.every(v=>typeof v==='string')?value:[];
const code=(e:unknown)=>e instanceof RuntimeError?e.code:'oauth_network_or_browser_policy';
const canonical=(u:URL)=>u.pathname==='/'&&!u.search?u.origin:u.href;
const bytes=(n:number)=>{const b=new Uint8Array(n);crypto.getRandomValues(b);return b;};
const base64url=(b:Uint8Array)=>btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/u,'');
const random=()=>base64url(bytes(32));
/** Browser memory authorization. No automatic connect, dynamic registration or refresh-token persistence. */
export class OAuthFlow {
 #snapshot:OAuthSnapshot={status:'unauthenticated'};#listeners=new Set<()=>void>();#generation=0;#pending?:Pending;#controller?:AbortController;#popup?:Window;#timeout?:ReturnType<typeof setTimeout>;#monitor?:ReturnType<typeof setInterval>;#onMessage=(e:MessageEvent)=>{void this.receiveCallback(e);};
 constructor(private readonly vault:MemoryVault,private readonly settings:OAuthOptions={}){}
 getSnapshot=():OAuthSnapshot=>this.#snapshot;
 subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};};
 #set(snapshot:OAuthSnapshot){this.#snapshot=snapshot;for(const listener of this.#listeners)listener();}
 #url(raw:unknown,redirect=false):URL{
  if(typeof raw!=='string')throw new RuntimeError('oauth_metadata_invalid');let u:URL;try{u=new URL(raw);}catch{throw new RuntimeError('oauth_metadata_invalid');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(u.hostname);
  if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||(u.protocol==='http:'&&loopback&&(redirect||this.settings.allowLoopbackHTTP))))throw new RuntimeError('oauth_insecure_endpoint');
  return u;
 }
 async #fetch(url:URL,init:RequestInit={}):Promise<Response>{
  if(this.#controller?.signal.aborted)throw new RuntimeError('cancelled');
  const response=await fetch(url,{...init,credentials:'omit',redirect:'error',cache:'no-store',signal:this.#controller?.signal});
  if(response.redirected)throw new RuntimeError('oauth_discovery_redirect');
  if(response.url&&new URL(response.url).href!==url.href)throw new RuntimeError('oauth_discovery_redirect');
  return response;
 }
 async #metadata(candidates:URL[]):Promise<Record<string,unknown>>{
  for(const url of candidates){const res=await this.#fetch(url,{headers:{Accept:'application/json'}});if(res.status===404||res.status===405)continue;if(!res.ok)throw new RuntimeError('oauth_discovery_failed');return record(await res.json());}
  throw new RuntimeError('oauth_discovery_failed');
 }
 #cleanup(close=true){if(this.#timeout!==undefined)clearTimeout(this.#timeout);if(this.#monitor!==undefined)clearInterval(this.#monitor);this.#timeout=undefined;this.#monitor=undefined;globalThis.window?.removeEventListener('message',this.#onMessage);if(close){try{this.#popup?.close();}catch{/* Browser may have severed opener. */}}this.#popup=undefined;this.#pending=undefined;}
 async begin(options:OAuthBegin){
  if(this.#snapshot.status==='authorizing')throw new RuntimeError('oauth_locked');
  this.#cleanup();const generation=++this.#generation;this.#controller=new AbortController();this.#popup=options.popup;this.#set({status:'authorizing'});
  this.#timeout=setTimeout(()=>{if(generation===this.#generation){++this.#generation;this.#controller?.abort();this.#cleanup();this.#set({status:'expired',diagnostic:'oauth_expired'});}},this.settings.timeoutMs??120000);
  try{
   if(!options.clientId.trim()||/[\r\n\0]/u.test(options.clientId))throw new RuntimeError('oauth_client_required');
   if(!options.popup||options.popup.closed)throw new RuntimeError('oauth_popup_blocked');
   const endpoint=this.#url(options.endpoint),resource=canonical(endpoint),redirect=this.#url(options.redirectUri,true);
   if(redirect.origin!==globalThis.location.origin||redirect.pathname!=='/oauth/callback')throw new RuntimeError('oauth_redirect_invalid');
   let metadataHint=options.resourceMetadataUrl,challengedScopes:string[]=[];
   // Fetch only the selected resource, without credentials. Cancel a public SSE body immediately.
   const challenge=await this.#fetch(endpoint,{headers:{Accept:'application/json, text/event-stream'}});
   if(challenge.status===401||challenge.status===403){const header=challenge.headers.get('WWW-Authenticate')??'';if(/^Bearer\s/iu.test(header)){metadataHint=/\bresource_metadata="([^"]+)"/iu.exec(header)?.[1]??metadataHint;const challengeScope=/\bscope="([^"]*)"/iu.exec(header)?.[1];if(challengeScope!==undefined)challengedScopes=challengeScope.split(/\s+/u).filter(Boolean);}}
   await challenge.body?.cancel();
   const paths=endpoint.pathname==='/'?['']: [endpoint.pathname,''];
   const resources=metadataHint?[this.#url(metadataHint)]:paths.map(path=>new URL(`/.well-known/oauth-protected-resource${path}`,endpoint.origin));
   if(resources.some(u=>u.origin!==endpoint.origin))throw new RuntimeError('oauth_untrusted_metadata');
   const protectedResource=await this.#metadata(resources);
   if(canonical(this.#url(protectedResource.resource))!==resource)throw new RuntimeError('oauth_resource_mismatch');
   const issuers=strings(protectedResource.authorization_servers);if(!issuers.length)throw new RuntimeError('oauth_metadata_invalid');
   const issuer=this.#url(issuers[0]),issuerValue=issuers[0],issuerPath=issuer.pathname==='/'?'':issuer.pathname;
   const candidates=[new URL(`/.well-known/oauth-authorization-server${issuerPath}`,issuer.origin),new URL(`/.well-known/openid-configuration${issuerPath}`,issuer.origin)];
   if(issuerPath)candidates.push(new URL(`${issuerPath.replace(/\/$/u,'')}/.well-known/openid-configuration`,issuer.origin));
   const metadata=await this.#metadata(candidates);
   this.#url(metadata.issuer);
   if(metadata.issuer!==issuerValue)throw new RuntimeError('oauth_issuer_mismatch');
   if(!strings(metadata.code_challenge_methods_supported).includes('S256'))throw new RuntimeError('oauth_pkce_unsupported');
   const authorization=this.#url(metadata.authorization_endpoint),token=this.#url(metadata.token_endpoint);
   // Popup navigation cannot omit cookies: cookies do not isolate hosts by port.
   if(authorization.hostname===new URL(globalThis.location.origin).hostname)throw new RuntimeError('oauth_platform_origin_conflict');
   // Narrow support profile: AS endpoints must share the declared issuer origin.
   if(authorization.origin!==issuer.origin||token.origin!==issuer.origin)throw new RuntimeError('oauth_restricted_endpoint');
   if(metadata.response_types_supported!==undefined&&!strings(metadata.response_types_supported).includes('code'))throw new RuntimeError('oauth_response_unsupported');
   if(metadata.token_endpoint_auth_methods_supported!==undefined&&!strings(metadata.token_endpoint_auth_methods_supported).includes('none'))throw new RuntimeError('oauth_public_client_unsupported');
   const verifier=random(),state=random(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
   if(generation!==this.#generation||this.#controller.signal.aborted)return;
   const scopes=challengedScopes.length?challengedScopes:options.scopes.length?options.scopes:strings(protectedResource.scopes_supported);
   if(scopes.some(s=>!s||/[\s\x00-\x1f\x7f]/u.test(s)))throw new RuntimeError('oauth_scope_invalid');
   this.#pending={options,state,verifier,issuer:issuerValue,tokenEndpoint:token.href,resource,origin:redirect.origin,generation,vaultGeneration:this.vault.generation};
   for(const [k,v]of Object.entries({response_type:'code',client_id:options.clientId,redirect_uri:redirect.href,state,code_challenge:base64url(new Uint8Array(digest)),code_challenge_method:'S256',resource}))authorization.searchParams.set(k,v);
   if(scopes.length)authorization.searchParams.set('scope',[...new Set(scopes)].join(' '));
   window.addEventListener('message',this.#onMessage);options.popup.location.href=authorization.href;
   this.#monitor=setInterval(()=>{if(options.popup.closed&&generation===this.#generation)this.cancel();},500);
  }catch(e){if(generation===this.#generation){this.#controller.abort();this.#cleanup();this.#set({status:'callback-failed',diagnostic:code(e)});}}
 }
 async receiveCallback(event:MessageEvent){
  const p=this.#pending;if(!p||event.origin!==p.origin||event.source!==p.options.popup)return;
  if(!event.data||typeof event.data!=='object'||event.data.type!=='mcp-studio-oauth-callback')return;
  const data=event.data as Record<string,unknown>;
  // Consume even an invalid callback from the expected window. Replays cannot redeem a code twice.
  this.#pending=undefined;this.#cleanup();
  if(data.state!==p.state||data.iss!==p.issuer){this.#set({status:'callback-failed',diagnostic:'oauth_callback_invalid'});return;}
  if(data.error){this.#set({status:'denied',diagnostic:'oauth_denied'});return;}
  if(typeof data.code!=='string'||!data.code||data.code.length>4096){this.#set({status:'callback-failed',diagnostic:'oauth_callback_invalid'});return;}
  const exchangeTimeout=setTimeout(()=>{if(p.generation===this.#generation){++this.#generation;this.#controller?.abort();this.#cleanup();this.#set({status:'expired',diagnostic:'oauth_expired'});}},this.settings.timeoutMs??30000);this.#timeout=exchangeTimeout;
  try{
   const params=new URLSearchParams({grant_type:'authorization_code',client_id:p.options.clientId,code:data.code,code_verifier:p.verifier,redirect_uri:p.options.redirectUri,resource:p.resource});
   const response=await this.#fetch(new URL(p.tokenEndpoint),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:params.toString()});
   if(!response.ok)throw new RuntimeError('oauth_exchange_failed');
   const token=record(await response.json());
   if(typeof token.access_token!=='string'||!token.access_token.trim()||/[\s\x00-\x1f\x7f]/u.test(token.access_token)||typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer'||(token.expires_in!==undefined&&(typeof token.expires_in!=='number'||!Number.isFinite(token.expires_in)||token.expires_in<=0))||(token.resource!==undefined&&token.resource!==p.resource))throw new RuntimeError('oauth_token_invalid');
   if(p.generation!==this.#generation||this.#controller?.signal.aborted)return;
   if(p.vaultGeneration!==this.vault.generation){this.#set({status:'cancelled'});return;}
   // Refresh tokens are deliberately discarded. Explicit reauthorization preserves resource isolation.
   const expiresAt=Date.now()+(typeof token.expires_in==='number'?token.expires_in:3600)*1000;
   if(!Number.isSafeInteger(expiresAt)||expiresAt>8640000000000000)throw new RuntimeError('oauth_token_invalid');
   this.vault.setCredential(p.options.scope,token.access_token,expiresAt,p.resource);this.#set({status:'authorized'});
  }catch(e){if(p.generation===this.#generation)this.#set({status:'callback-failed',diagnostic:code(e)});}
  finally{clearTimeout(exchangeTimeout);if(this.#timeout===exchangeTimeout)this.#timeout=undefined;}
 }
 cancel(){++this.#generation;this.#controller?.abort();this.#cleanup();this.#set({status:'cancelled'});}
}
/** Call before rendering callback UI. Remove credentials from the address bar immediately. */
export function deliverOAuthCallback(win:Window=window){
 const url=new URL(win.location.href);win.history.replaceState(null,'',win.location.pathname);
 const field=(name:string)=>url.searchParams.getAll(name).length===1?url.searchParams.get(name)??'':'';
 const message={type:'mcp-studio-oauth-callback',code:field('code'),state:field('state'),iss:field('iss'),error:field('error')};
 if(win.opener)win.opener.postMessage(message,win.location.origin);
}
