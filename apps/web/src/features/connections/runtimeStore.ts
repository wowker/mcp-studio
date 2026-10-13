import {useSyncExternalStore} from 'react';
import {MemoryVault} from '../../runtime/vault';
import type {BrowserSession} from '../../runtime/browser-session';
import {ToolWorkspace} from '../tools/workspace';
import {SessionOperations} from '../../runtime/records/operations';
import {RecordsViews} from '../records/viewStore';
import {ExecutionRunner} from '../../runtime/execution';
import {redact} from '../../runtime/records/redaction';
import type {CredentialScope} from '../../runtime/vault';
import {DraftMemory} from './session';
/** The root owns this object. Navigation retains drafts, identity end destroys them. */
export class M2Memory extends DraftMemory {
 connectionRawArgs=new Map<string,string>();
 connectionScopesRaw=new Map<string,string>();
 variableBases=new Map<string,import('../../generated/platform').Variable>();
 environmentDrafts=new Map<string,{name:string;base?:import('../../generated/platform').Environment}>();
 connectionBases=new Map<string,import("../../generated/platform").Connection>();
 readonly vault=new MemoryVault();
 readonly tools=new ToolWorkspace(()=>this.touch());
 readonly records=new SessionOperations(()=>this.touch());
 readonly recordViews=new RecordsViews(()=>this.touch());
 readonly execution=new ExecutionRunner();
 recordRefresh=0;private invalidatedRuns=new Set<string>();
 private identityRevision=0;private projectRevisions=new Map<string,number>();
 private sessions=new Map<string,BrowserSession>();private sessionUsers=new Map<string,string>();
 private listeners=new Set<()=>void>();private revision=0;private generation=0;
 constructor(){super();this.execution.subscribe(()=>this.touch());this.vault.subscribe(()=>this.touch());this.vault.subscribeInvalidation(scope=>{const key=`${scope.projectId}:${scope.connectionId}`;if(this.sessionUsers.get(key)===scope.userId)void this.sessions.get(key)?.disconnect();});}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.revision;
 get operationGeneration(){return this.generation;}
 captureScope(projectId:string){const identity=this.identityRevision,project=this.projectRevisions.get(projectId)??0;return()=>identity===this.identityRevision&&project===(this.projectRevisions.get(projectId)??0);}
 recordSanitizer(scope:CredentialScope){const connected=this.existingRuntime(scope.projectId,scope.connectionId)?.captureSanitizer();const values=[this.vault.getCredential(scope),...Object.values(this.vault.getPersonal(scope.userId,scope.projectId))];return(value:unknown)=>{const source=connected?.(value);if(source?.omitted)return source;const safe=redact(source?source.value:value,{sensitiveValues:values});return {...safe,markers:[...safe.markers,...source?.markers??[]]};};}
 isRunInvalidated(projectId:string,runId:string){return !!runId&&this.invalidatedRuns.has(JSON.stringify([projectId,runId]));}
 invalidateRecordRun(projectId:string,runId:string){this.recordRefresh++;if(runId){this.invalidatedRuns.add(JSON.stringify([projectId,runId]));this.tools.invalidateRun(projectId,runId);this.execution.invalidateRun(projectId,runId);this.records.invalidateRun(projectId,runId);this.recordViews.invalidateRun(projectId,runId);}this.touch();}
 touch(){this.revision++;for(const listener of this.listeners)listener();}
 async runtime(projectId:string,connectionId:string,userId?:string){const generation=this.generation;const {BrowserSession}=await import('../../runtime/browser-session');if(generation!==this.generation)return undefined;const key=`${projectId}:${connectionId}`;let session=this.sessions.get(key);if(session&&userId&&this.sessionUsers.get(key)!==userId){void session.disconnect();this.sessions.delete(key);session=undefined;}if(!session){session=new BrowserSession();this.sessions.set(key,session);session.subscribe(()=>this.touch());}if(userId)this.sessionUsers.set(key,userId);return session;}
 existingRuntime(projectId:string,connectionId:string){return this.sessions.get(`${projectId}:${connectionId}`);}
 revokeProject(projectId:string,userId:string){this.generation++;this.projectRevisions.set(projectId,(this.projectRevisions.get(projectId)??0)+1);this.execution.revokeProject(projectId);this.tools.revokeProject(projectId);this.records.revokeProject(projectId);this.recordViews.revokeProject(projectId);this.vault.revokeProject(userId,projectId);for(const [key,session] of this.sessions)if(key.startsWith(`${projectId}:`))void session.disconnect();this.touch();}
 revoke(){this.generation++;this.vault.clear();for(const session of this.sessions.values())void session.disconnect();this.touch();}
 override clear(){super.clear();this.identityRevision++;this.projectRevisions.clear();this.invalidatedRuns.clear();this.recordRefresh++;this.execution.clear();this.tools.clear();this.records.clear();this.recordViews.clear();this.connectionBases.clear();this.connectionRawArgs.clear();this.connectionScopesRaw.clear();this.variableBases.clear();this.environmentDrafts.clear();this.revoke();this.sessions.clear();this.sessionUsers.clear();}
}
export function useMemory(memory:M2Memory){useSyncExternalStore(memory.subscribe,memory.getSnapshot,memory.getSnapshot);}
