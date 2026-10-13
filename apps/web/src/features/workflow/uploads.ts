import type {AgentRunState} from '../../generated/agent';
import type {OperationState} from '../../runtime/records/operations';
import type {WorkflowRun,WorkflowUpload,WorkflowSavedUpload} from './model';
/** Project only identities and upload states; original snapshots never enter workflow memory. */
export function workflowUploads(run:WorkflowRun|undefined,operations:OperationState[],agentRuns:AgentRunState[]){
 let historyUpload:WorkflowUpload|undefined;const savedUploads:WorkflowSavedUpload[]=[];
 if(!run)return {historyUpload,savedUploads};
 for(const entry of operations){
  const input=entry.input;if(!('targetKind'in input)||input.userId!==run.userId||input.projectId!==run.projectId||input.connectionId!==run.connectionId||input.snapshot.userId!==run.userId||input.snapshot.projectId!==run.projectId||input.snapshot.connectionId!==run.connectionId||input.snapshot.runId!==run.runId)continue;
  if(entry.status==='recorded'&&entry.receipt&&(entry.receipt.operationId!==input.operationId||entry.receipt.recordId!==input.targetId||entry.receipt.targetKind!==input.targetKind))continue;
  const upload:WorkflowUpload={userId:input.userId,projectId:input.projectId,connectionId:input.connectionId,runId:input.snapshot.runId,recordId:input.targetId,operationId:input.operationId,status:entry.status};
  if(input.targetKind==='history'&&input.operationId===run.operationId&&input.targetId===run.recordId)historyUpload=upload;
  if(input.targetKind==='saved'&&input.sourceRunId===run.runId)savedUploads.push({...upload,sourceRunId:input.sourceRunId});
 }
 for(const item of agentRuns)if(item.userId===run.userId&&item.projectId===run.projectId&&item.connectionId===run.connectionId&&item.runId===run.runId&&item.recordId===run.recordId&&item.operationId===run.operationId)historyUpload={userId:item.userId,projectId:item.projectId,connectionId:item.connectionId,runId:item.runId,recordId:item.recordId,operationId:item.operationId,status:item.uploadStatus};
 return {historyUpload,savedUploads};
}
