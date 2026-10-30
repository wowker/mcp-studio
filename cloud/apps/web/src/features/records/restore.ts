import type {Record as StoredRecord} from '../../generated/platform';
import {connectionSchema,connectionAccessSchema,connectionAccessRequestSchema} from '../../generated/platform';
import {ApiError,type PlatformClient} from '../../shared/api';
import type {M2Memory} from '../connections/runtimeStore';
import {restoreRequest} from '../../runtime/records/redaction';
import {createArgumentDraft,setRawArgumentDraft} from '../tools/argumentDraft';
/** Restore always creates a new personal document and never reads or attaches an old result. */
export async function restoreRecord(client:PlatformClient,memory:M2Memory,record:StoredRecord,userId:string){
 if(record.snapshot.redactions.some(marker=>marker.path==='/context/toolName'||marker.path==='/context'))throw new ApiError('restore_identity_redacted');
 const isCurrent=memory.captureScope(record.projectId),shared=await client.request(`/projects/${encodeURIComponent(record.projectId)}/connections/${encodeURIComponent(record.connectionId)}`,connectionSchema);
 if(!isCurrent()||shared.projectId!==record.projectId||shared.id!==record.connectionId)throw new ApiError('restore_scope_changed');
 const connection={...shared,environmentId:memory.applied.get(`${record.projectId}:${record.connectionId}`)??shared.environmentId};
 const runtime=connection.channel==='agent'?memory.existingAgentRuntime(record.projectId,connection.id):memory.existingRuntime(record.projectId,connection.id);if(!runtime||runtime.getSnapshot().status!=='connected')throw new ApiError('restore_connection_required');
 try{runtime.assertConnection(connection,userId);}catch{throw new ApiError('restore_scope_changed');}
 const access=await client.request(`/projects/${encodeURIComponent(record.projectId)}/connections/${encodeURIComponent(record.connectionId)}/session-access`,connectionAccessSchema,{method:'POST',body:{version:connection.version,environmentId:connection.environmentId},bodySchema:connectionAccessRequestSchema});if(!isCurrent()||access.userId!==userId||access.projectId!==record.projectId||access.connectionId!==connection.id||access.version!==connection.version||access.environmentId!==connection.environmentId)throw new ApiError('restore_scope_changed');
 const tools=await runtime.listTools();if(!isCurrent())throw new ApiError('restore_scope_changed');const tool=tools.find(candidate=>candidate.name===record.snapshot.toolName);if(!tool)throw new ApiError('restore_missing_tool');
 const restored=restoreRequest(JSON.parse(record.snapshot.requestJSON) as unknown,record.snapshot.redactions),argumentsDraft=setRawArgumentDraft(createArgumentDraft(tool.inputSchema),JSON.stringify(restored.value,null,2));
 const scope=memory.tools.scope(record.projectId,connection.id),tab=scope.open(tool,true);scope.updateDraft(tab.id,{raw:argumentsDraft.raw,mode:'form',arguments:argumentsDraft,restore:{recordId:record.id,missing:restored.missing}});
 return {tabId:tab.id,connectionId:connection.id,missing:restored.missing,sourceRecordId:record.id,userId};
}
