export type CredentialInvalidationReason='expired'|'removed'|'replaced'|'revoked'|'cleared';
export type CredentialScope={userId:string;projectId:string;connectionId:string};
type Credential={token:string;expiresAt?:number;resource?:string};
const key=(...parts:string[])=>JSON.stringify(parts);
/** Ephemeral secrets only. Private fields deliberately cannot be serialized by UI snapshots. */
export class MemoryVault {
 #generation=0;
 get generation(){return this.#generation;}
 #credentials=new Map<string,Credential>();
 #timers=new Map<string,ReturnType<typeof setTimeout>>();
 #variables=new Map<string,Record<string,unknown>>();
 #listeners=new Set<()=>void>();
 #invalidations=new Set<(scope:CredentialScope,reason:CredentialInvalidationReason)=>void>();
 #pendingExpiry=new Set<string>();
 subscribeInvalidation(listener:(scope:CredentialScope,reason:CredentialInvalidationReason)=>void){this.#invalidations.add(listener);return ()=>{this.#invalidations.delete(listener);};}
 #invalidate(k:string,reason:CredentialInvalidationReason){const [userId,projectId,connectionId]=JSON.parse(k) as string[];for(const listener of this.#invalidations)listener({userId,projectId,connectionId},reason);}
 subscribe(listener:()=>void){this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};}
 #notify(){for(const listener of this.#listeners)listener();}
 #stopTimer(k:string){const t=this.#timers.get(k);if(t!==undefined)clearTimeout(t);this.#timers.delete(k);}
 #schedule(k:string,entry:Credential){
  if(entry.expiresAt===undefined)return;
  const timer=setTimeout(()=>{
   this.#timers.delete(k);if(this.#credentials.get(k)!==entry)return;
   if((entry.expiresAt??0)>Date.now()){this.#schedule(k,entry);return;}
   this.#credentials.delete(k);++this.#generation;this.#invalidate(k,'expired');this.#notify();
  },Math.max(0,Math.min(2147483647,entry.expiresAt-Date.now())));
  this.#timers.set(k,timer);
 }
 setCredential(scope:CredentialScope,token:string,expiresAt?:number,resource?:string){
  const k=key(scope.userId,scope.projectId,scope.connectionId),entry={token,expiresAt,resource},replaced=this.#credentials.has(k)||this.#pendingExpiry.has(k);this.#pendingExpiry.delete(k);this.#stopTimer(k);this.#credentials.set(k,entry);this.#schedule(k,entry);if(replaced)this.#invalidate(k,'replaced');this.#notify();
 }
 getCredential(scope:CredentialScope,now=Date.now()):string|undefined{
  const k=key(scope.userId,scope.projectId,scope.connectionId),entry=this.#credentials.get(k);
  if(entry?.expiresAt!==undefined&&entry.expiresAt<=now){this.#stopTimer(k);this.#credentials.delete(k);++this.#generation;this.#pendingExpiry.add(k);queueMicrotask(()=>{if(this.#pendingExpiry.delete(k)){this.#invalidate(k,'expired');this.#notify();}});return undefined;}
  return entry?.token;
 }
 getCredentialResource(scope:CredentialScope):string|undefined{return this.#credentials.get(key(scope.userId,scope.projectId,scope.connectionId))?.resource;}
 removeCredential(scope:CredentialScope){++this.#generation;const k=key(scope.userId,scope.projectId,scope.connectionId);this.#stopTimer(k);this.#pendingExpiry.delete(k);this.#credentials.delete(k);this.#invalidate(k,'removed');this.#notify();}
 setVariable(userId:string,projectId:string,definitionId:string,value:unknown){const k=key(userId,projectId),values=this.#variables.get(k)??Object.create(null) as Record<string,unknown>;if(value===undefined)delete values[definitionId];else values[definitionId]=structuredClone(value);this.#variables.set(k,values);this.#notify();}
 getPersonal(userId:string,projectId:string):Record<string,unknown>{return structuredClone(this.#variables.get(key(userId,projectId))??{});}
 revokeProject(userId:string,projectId:string){++this.#generation;for(const k of new Set([...this.#credentials.keys(),...this.#pendingExpiry])){const [u,p]=JSON.parse(k) as string[];if(u===userId&&p===projectId){this.#stopTimer(k);this.#pendingExpiry.delete(k);this.#credentials.delete(k);this.#invalidate(k,'revoked');}}this.#variables.delete(key(userId,projectId));this.#notify();}
 clear(){++this.#generation;const scopes=new Set([...this.#credentials.keys(),...this.#pendingExpiry]);for(const k of this.#timers.keys())this.#stopTimer(k);this.#pendingExpiry.clear();this.#credentials.clear();for(const k of scopes)this.#invalidate(k,'cleared');this.#variables.clear();this.#notify();}
}
