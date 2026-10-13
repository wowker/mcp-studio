import {useSyncExternalStore} from 'react';
import {MemoryVault} from '../../runtime/vault';
import type {AgentClient} from '../../runtime/agent-client';
import type {AgentSession} from '../../runtime/agent-session';
import type {AgentRunState} from '../../generated/agent';
import type {BrowserSession} from '../../runtime/browser-session';
import {ToolWorkspace} from '../tools/workspace';
import {SessionOperations} from '../../runtime/records/operations';
import {IndexedDBOperationStorage} from '../../runtime/records/queueStorage';
import {ApiError,PlatformClient} from '../../shared/api';
import {sessionSchema,projectSchema} from '../../generated/platform';
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
 readonly records:SessionOperations;
 identitySuspended=false;
 private queueOwner?:string;private resumeTicket=0;private durableMode=false;
 retentionPreferenceUnavailable=false;
 private deferredProjects=new Map<string,string>();
 readonly recordViews=new RecordsViews(()=>this.touch());
 readonly execution=new ExecutionRunner();
 recordRefresh=0;private invalidatedRuns=new Set<string>();
 private identityRevision=0;private projectRevisions=new Map<string,number>();
 readonly agentRuns=new Map<string,AgentRunState>();
 private agentClient?:AgentClient;private agentLoading?:Promise<AgentClient|undefined>;
 private agentSessions=new Map<string,AgentSession>();
 private sessions=new Map<string,BrowserSession>();private sessionUsers=new Map<string,string>();
 private listeners=new Set<()=>void>();private revision=0;private generation=0;
 constructor(options:{durable?:boolean}={}){super();this.durableMode=!!options.durable;this.records=new SessionOperations(()=>this.touch(),options.durable?{storage:new IndexedDBOperationStorage(),authorize:async(client,projectId,userId,signal)=>{const platform=client as PlatformClient,current=await platform.request('/session',sessionSchema,{signal});if(current.user.id!==userId){platform.expireSession();throw new ApiError('operation_owner');}const project=await platform.request(`/projects/${encodeURIComponent(projectId)}`,projectSchema,{signal});if(project.id!==projectId||!project.canRead||!['developer','maintainer'].includes(project.role))throw new ApiError('forbidden',403);}}:{});this.execution.subscribe(()=>{for(const [projectId,userId]of this.deferredProjects)if(!this.execution.hasRunning(projectId)){this.deferredProjects.delete(projectId);this.vault.revokeProject(userId,projectId);for(const [key,session]of this.sessions)if(key.startsWith(`${projectId}:`))void session.disconnect();}this.touch();});this.vault.subscribe(()=>this.touch());this.vault.subscribeInvalidation(scope=>{const key=`${scope.projectId}:${scope.connectionId}`;if(this.sessionUsers.get(key)===scope.userId)void this.sessions.get(key)?.disconnect();});}
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};};
 getSnapshot=()=>this.revision;
 get operationGeneration(){return this.generation;}
 captureScope(projectId:string){const identity=this.identityRevision,project=this.projectRevisions.get(projectId)??0;return()=>identity===this.identityRevision&&project===(this.projectRevisions.get(projectId)??0);}
 captureIdentity(){const identity=this.identityRevision;return()=>identity===this.identityRevision;}
 suspendIdentity(){this.agentClient?.clear();for(const session of this.agentSessions.values())session.forget();this.resumeTicket++;this.identitySuspended=true;this.records.suspend();this.touch();}
 async resumeIdentity(userId:string){const ticket=++this.resumeTicket,current=this.captureIdentity();await this.records.bindUser(userId);if(ticket!==this.resumeTicket||!current())return;this.queueOwner=userId;if(this.durableMode){let mode:'persistent'|'memory'='persistent';try{if(localStorage.getItem(`mcp-studio.queue-mode:${userId}`)==='memory')mode='memory';}catch{this.retentionPreferenceUnavailable=true;}await this.records.setRetention(mode);if(ticket!==this.resumeTicket||!current())return;}this.identitySuspended=false;this.touch();}
 async chooseRecordRetention(mode:'persistent'|'memory'){const owner=this.queueOwner,current=this.captureIdentity();await this.records.setRetention(mode);if(owner!==this.queueOwner||!current())return;if(this.durableMode&&owner){try{localStorage.setItem(`mcp-studio.queue-mode:${owner}`,mode);this.retentionPreferenceUnavailable=false;}catch{this.retentionPreferenceUnavailable=true;}}this.touch();}
 recordSanitizer(scope:CredentialScope){const connected=this.existingRuntime(scope.projectId,scope.connectionId)?.captureSanitizer();const values=[this.vault.getCredential(scope),...Object.values(this.vault.getPersonal(scope.userId,scope.projectId))];return(value:unknown)=>{const source=connected?.(value);if(source?.omitted)return source;const safe=redact(source?source.value:value,{sensitiveValues:values});return {...safe,markers:[...safe.markers,...source?.markers??[]]};};}
 isRunInvalidated(projectId:string,runId:string){return !!runId&&this.invalidatedRuns.has(JSON.stringify([projectId,runId]));}
 invalidateRecordRun(projectId:string,runId:string){for(const [key,run]of this.agentRuns)if(run.projectId===projectId&&run.runId===runId)this.agentRuns.set(key,{...run,snapshotJSON:''});this.recordRefresh++;if(runId){this.invalidatedRuns.add(JSON.stringify([projectId,runId]));this.tools.invalidateRun(projectId,runId);this.execution.invalidateRun(projectId,runId);this.records.invalidateRun(projectId,runId);this.recordViews.invalidateRun(projectId,runId);}this.touch();}
 touch(){this.revision++;for(const listener of this.listeners)listener();}
 async runtime(projectId:string,connectionId:string,userId?:string){const generation=this.generation;const {BrowserSession}=await import('../../runtime/browser-session');if(generation!==this.generation)return undefined;const key=`${projectId}:${connectionId}`;let session=this.sessions.get(key);if(session&&userId&&this.sessionUsers.get(key)!==userId){void session.disconnect();this.sessions.delete(key);session=undefined;}if(!session){session=new BrowserSession();this.sessions.set(key,session);session.subscribe(()=>this.touch());}if(userId)this.sessionUsers.set(key,userId);return session;}
 async agent(){if(this.agentClient)return this.agentClient;if(this.agentLoading)return this.agentLoading;const generation=this.generation;this.agentLoading=import('../../runtime/agent-client').then(({AgentClient})=>{if(generation!==this.generation)return undefined;const client=new AgentClient();this.agentClient=client;client.subscribe(()=>this.touch());this.touch();return client;}).finally(()=>{this.agentLoading=undefined;});return this.agentLoading;}
 existingAgent(){return this.agentClient;}
 async agentRuntime(projectId:string,connectionId:string,userId:string){const generation=this.generation;const client=await this.agent();const {AgentSession}=await import('../../runtime/agent-session');if(!client||generation!==this.generation)return undefined;if(client.getSnapshot().userId!==userId)throw new ApiError('agent_identity');const key=`${projectId}:${connectionId}`;let session=this.agentSessions.get(key);if(!session){session=new AgentSession(client);session.subscribe(()=>this.touch());this.agentSessions.set(key,session);}return session;}
 existingAgentRuntime(projectId:string,connectionId:string){return this.agentSessions.get(`${projectId}:${connectionId}`);}
 existingRuntime(projectId:string,connectionId:string){return this.sessions.get(`${projectId}:${connectionId}`);}
 revokeProject(projectId:string,userId:string){for(const [key,session]of this.agentSessions)if(key.startsWith(`${projectId}:`))session.forget();for(const [key,run]of this.agentRuns)if(run.projectId===projectId)this.agentRuns.delete(key);this.generation++;this.projectRevisions.set(projectId,(this.projectRevisions.get(projectId)??0)+1);const issued=this.execution.hasRunning(projectId);if(!issued)this.execution.revokeProject(projectId);this.tools.revokeProject(projectId);this.records.revokeProject(projectId);this.recordViews.revokeProject(projectId);if(issued)this.deferredProjects.set(projectId,userId);else{this.vault.revokeProject(userId,projectId);for(const [key,session]of this.sessions)if(key.startsWith(`${projectId}:`))void session.disconnect();}this.touch();}
 revoke(){this.agentClient?.clear();for(const session of this.agentSessions.values())session.dispose();this.agentSessions.clear();this.agentRuns.clear();this.generation++;this.vault.clear();for(const session of this.sessions.values())void session.disconnect();this.touch();}
 override clear(){super.clear();this.resumeTicket++;this.queueOwner=undefined;this.retentionPreferenceUnavailable=false;this.identityRevision++;this.identitySuspended=false;this.deferredProjects.clear();this.projectRevisions.clear();this.invalidatedRuns.clear();this.recordRefresh++;this.execution.clear();this.tools.clear();this.records.clear();this.recordViews.clear();this.connectionBases.clear();this.connectionRawArgs.clear();this.connectionScopesRaw.clear();this.variableBases.clear();this.environmentDrafts.clear();this.revoke();this.sessions.clear();this.sessionUsers.clear();}
}
export function useMemory(memory:M2Memory){useSyncExternalStore(memory.subscribe,memory.getSnapshot,memory.getSnapshot);}
