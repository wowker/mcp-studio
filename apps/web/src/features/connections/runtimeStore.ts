import {useSyncExternalStore} from 'react';
import {MemoryVault} from '../../runtime/vault';
import type {BrowserSession} from '../../runtime/browser-session';
import {DraftMemory} from './session';
/** The root owns this object. Navigation retains drafts, identity end destroys them. */
export class M2Memory extends DraftMemory {
 connectionRawArgs=new Map<string,string>();
 connectionScopesRaw=new Map<string,string>();
 variableBases=new Map<string,import('../../generated/platform').Variable>();
 environmentDrafts=new Map<string,{name:string;base?:import('../../generated/platform').Environment}>();
 connectionBases=new Map<string,import("../../generated/platform").Connection>();
 readonly vault=new MemoryVault();
 private sessions=new Map<string,BrowserSession>();private sessionUsers=new Map<string,string>();
 private listeners=new Set<()=>void>();private revision=0;private generation=0;
 constructor(){super();this.vault.subscribe(()=>this.touch());this.vault.subscribeInvalidation(scope=>{const key=`${scope.projectId}:${scope.connectionId}`;if(this.sessionUsers.get(key)===scope.userId)void this.sessions.get(key)?.disconnect();});}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.revision;
 get operationGeneration(){return this.generation;}
 touch(){this.revision++;for(const listener of this.listeners)listener();}
 async runtime(projectId:string,connectionId:string,userId?:string){const generation=this.generation;const {BrowserSession}=await import('../../runtime/browser-session');if(generation!==this.generation)return undefined;const key=`${projectId}:${connectionId}`;let session=this.sessions.get(key);if(session&&userId&&this.sessionUsers.get(key)!==userId){void session.disconnect();this.sessions.delete(key);session=undefined;}if(!session){session=new BrowserSession();this.sessions.set(key,session);session.subscribe(()=>this.touch());}if(userId)this.sessionUsers.set(key,userId);return session;}
 existingRuntime(projectId:string,connectionId:string){return this.sessions.get(`${projectId}:${connectionId}`);}
 revoke(){this.generation++;this.vault.clear();for(const session of this.sessions.values())void session.disconnect();this.touch();}
 override clear(){super.clear();this.connectionBases.clear();this.connectionRawArgs.clear();this.connectionScopesRaw.clear();this.variableBases.clear();this.environmentDrafts.clear();this.revoke();this.sessions.clear();this.sessionUsers.clear();}
}
export function useMemory(memory:M2Memory){useSyncExternalStore(memory.subscribe,memory.getSnapshot,memory.getSnapshot);}
