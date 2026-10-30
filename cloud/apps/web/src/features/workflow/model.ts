export type WorkflowScope={userId:string;projectId:string};
export type WorkflowConnectionScope=WorkflowScope&{connectionId:string};
export type WorkflowRun=WorkflowConnectionScope&{runId:string;recordId:string;operationId?:string;status:'succeeded'|'failed'|'cancelled'};
export type WorkflowHistoryObservation=Omit<WorkflowRun,'operationId'>;
export type WorkflowSavedObservation=WorkflowConnectionScope&{runId:string;sourceRunId:string;recordId:string};
export type WorkflowUpload=WorkflowConnectionScope&{runId:string;recordId:string;operationId:string;status:'pending'|'uploading'|'recorded'|'failed'|'paused'};
export type WorkflowSavedUpload=WorkflowUpload&{sourceRunId:string};
export type WorkflowStepId='create'|'invite'|'service'|'environment'|'debug'|'history'|'save';
export type WorkflowStepStatus='done'|'skipped'|'pending'|'blocked'|'failed'|'cancelled'|'upload-failed'|'upload-pending';
export type WorkflowInput=WorkflowConnectionScope&{canRead:boolean;suspended:boolean;connectionExists:boolean;environment:{variableCount:number;valid:boolean;environmentId?:string};runId?:string;historyUpload?:WorkflowUpload;savedUploads:WorkflowSavedUpload[]};
const projectKey=(scope:WorkflowScope)=>JSON.stringify([scope.userId,scope.projectId]);
const connectionKey=(scope:WorkflowConnectionScope)=>JSON.stringify([scope.userId,scope.projectId,scope.connectionId]);
const runKey=(scope:WorkflowConnectionScope&{runId:string})=>JSON.stringify([scope.userId,scope.projectId,scope.connectionId,scope.runId]);
const matches=(a:WorkflowConnectionScope,b:WorkflowConnectionScope)=>a.userId===b.userId&&a.projectId===b.projectId&&a.connectionId===b.connectionId;
/** Ephemeral navigation evidence only. It neither authorizes an action nor stores a snapshot. */
export class WorkflowProgress {
 private created=new Set<string>();private invitations=new Map<string,'sent'|'skipped'>();
 private environmentSkips=new Map<string,string>();private completedRuns=new Map<string,WorkflowRun>();
 private views=new Map<string,string>();private histories=new Map<string,WorkflowHistoryObservation>();private savedRecords=new Map<string,Map<string,WorkflowSavedObservation>>();
 constructor(private readonly changed:()=>void=()=>{}){}
 projectCreated(scope:WorkflowScope){this.created.add(projectKey(scope));this.changed();}
 invitationSent(scope:WorkflowScope){this.invitations.set(projectKey(scope),'sent');this.changed();}
 skipInvitation(scope:WorkflowScope){if(this.invitations.get(projectKey(scope))!=='sent')this.invitations.set(projectKey(scope),'skipped');this.changed();}
 skipEnvironment(scope:WorkflowConnectionScope&{environmentId?:string}){this.environmentSkips.set(connectionKey(scope),scope.environmentId??'');this.changed();}
 runCompleted(run:WorkflowRun&{operationId:string}){if(!run.runId||!run.recordId||!run.operationId)return;const key=runKey(run),fact:WorkflowRun={userId:run.userId,projectId:run.projectId,connectionId:run.connectionId,runId:run.runId,recordId:run.recordId,operationId:run.operationId,status:run.status};this.completedRuns.set(key,fact);this.changed();}
 historyViewed(scope:WorkflowConnectionScope&{runId:string;recordId:string}){if(!scope.runId||!scope.recordId)return;this.views.set(runKey(scope),scope.recordId);this.changed();}
 /** Call only after an owner/snapshot/kind-scoped successful history detail GET. */
 historyObserved(scope:WorkflowHistoryObservation){if(!scope.runId||!scope.recordId)return;const key=runKey(scope),fact:WorkflowHistoryObservation={userId:scope.userId,projectId:scope.projectId,connectionId:scope.connectionId,runId:scope.runId,recordId:scope.recordId,status:scope.status};this.histories.set(key,fact);if(!this.completedRuns.has(key))this.completedRuns.set(key,fact);this.views.set(key,scope.recordId);this.changed();}
 /** A saved detail proves only its own source Run; it does not create a history execution. */
 savedObserved(scope:WorkflowSavedObservation){if(!scope.runId||scope.runId!==scope.sourceRunId||!scope.recordId)return;const key=runKey(scope),records=this.savedRecords.get(key)??new Map<string,WorkflowSavedObservation>();records.set(scope.recordId,{userId:scope.userId,projectId:scope.projectId,connectionId:scope.connectionId,runId:scope.runId,sourceRunId:scope.sourceRunId,recordId:scope.recordId});this.savedRecords.set(key,records);this.changed();}
 historyRecorded(run:WorkflowRun){const observed=this.histories.get(runKey(run));return observed?.recordId===run.recordId&&observed.status===run.status;}
 saved(run:WorkflowRun){return [...this.savedRecords.get(runKey(run))?.values()??[]].filter(record=>matches(record,run)&&record.runId===run.runId&&record.sourceRunId===run.runId).map(record=>({...record}));}
 wasCreated(scope:WorkflowScope){return this.created.has(projectKey(scope));}
 invitation(scope:WorkflowScope){return this.invitations.get(projectKey(scope));}
 environmentSkipped(scope:WorkflowConnectionScope,environmentId=''){return this.environmentSkips.get(connectionKey(scope))===environmentId;}
 runs(scope:WorkflowConnectionScope){return [...this.completedRuns.values()].filter(run=>matches(run,scope)).map(run=>({...run}));}
 viewed(run:WorkflowRun){return this.views.get(runKey(run))===run.recordId;}
 revokeProject(projectId:string){for(const set of [this.created])for(const key of set)if((JSON.parse(key) as string[])[1]===projectId)set.delete(key);for(const map of [this.invitations,this.environmentSkips,this.completedRuns,this.views,this.histories,this.savedRecords] as Map<string,unknown>[])for(const key of map.keys())if((JSON.parse(key) as string[])[1]===projectId)map.delete(key);this.changed();}
 clear(){this.created.clear();this.invitations.clear();this.environmentSkips.clear();this.completedRuns.clear();this.views.clear();this.histories.clear();this.savedRecords.clear();this.changed();}
}
export function deriveWorkflow(facts:WorkflowProgress,input:WorkflowInput){
 if(!input.canRead||input.suspended)return;
 const runs=facts.runs(input),run=input.runId?runs.find(item=>item.runId===input.runId):runs.at(-1);
 const invitation=facts.invitation(input),upload=input.historyUpload;
 const uploaded=!!run&&(facts.historyRecorded(run)||!!run.operationId&&!!upload&&matches(upload,run)&&upload.runId===run.runId&&upload.recordId===run.recordId&&upload.operationId===run.operationId&&upload.status==='recorded');
 const uploadMatches=!!run&&!!upload&&matches(upload,run)&&upload.runId===run.runId&&upload.recordId===run.recordId&&upload.operationId===run.operationId;
 const debug:WorkflowStepStatus=run?(run.status==='succeeded'?'done':run.status):'pending';
 const history:WorkflowStepStatus=debug!=='done'?'blocked':!uploaded?(uploadMatches&&upload?.status==='failed'?'upload-failed':'upload-pending'):facts.viewed(run!)?'done':'pending';
 const savedRecordId=run?(facts.saved(run)[0]?.recordId??input.savedUploads.find(item=>matches(item,run)&&item.runId===run.runId&&item.sourceRunId===run.runId&&item.status==='recorded')?.recordId):undefined;
 const saved=!!savedRecordId;
 const environment:WorkflowStepStatus=!input.connectionExists?'blocked':input.environment.variableCount>0?(input.environment.valid?'done':'pending'):input.environment.valid&&facts.environmentSkipped(input,input.environment.environmentId??'')?'skipped':'pending';
 const steps:{id:WorkflowStepId;status:WorkflowStepStatus}[]=[{id:'create',status:'done'},{id:'invite',status:invitation==='sent'?'done':invitation==='skipped'?'skipped':'pending'},{id:'service',status:input.connectionExists?'done':'pending'},{id:'environment',status:environment},{id:'debug',status:debug},{id:'history',status:history},{id:'save',status:history==='done'?(saved?'done':'pending'):'blocked'}];
 return {steps,run,runs,savedRecordId,createdHere:facts.wasCreated(input),complete:steps.every(step=>step.status==='done'||step.status==='skipped'),next:steps.find(step=>step.status!=='done'&&step.status!=='skipped')?.id};
}
