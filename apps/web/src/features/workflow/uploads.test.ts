import {it,expect} from 'vitest';
import {workflowUploads} from './uploads';
import {makeUpload} from '../../runtime/records/snapshot';
import {snapshot,historyRecord} from '../records/testFixtures';
import type {OperationState} from '../../runtime/records/operations';
it('joins upload progress only from matching frozen user/project/connection/Run and target identity',async()=>{
 const run={userId:'u',projectId:'p',connectionId:'c',runId:'run',recordId:'history',operationId:'upload',status:'succeeded' as const};
 const history=await makeUpload({userId:'u',snapshot,metadata:historyRecord.metadata,targetKind:'history',operationId:'upload',targetId:'history'});
 const saved=await makeUpload({userId:'u',snapshot,metadata:historyRecord.metadata,targetKind:'saved',sourceRunId:'run'});
 const row=(input:typeof history):OperationState=>({input,status:'recorded',persisted:false,createdAt:0,bytes:1,stale:false,lossRisk:false});
 expect(workflowUploads(run,[row(history),row(saved)],[]).savedUploads).toHaveLength(1);
 expect(workflowUploads(run,[row({...history,userId:'other'})],[]).historyUpload).toBeUndefined();
 expect(workflowUploads(run,[row({...history,snapshot:{...snapshot,userId:'other'}})],[]).historyUpload).toBeUndefined();
 expect(workflowUploads(run,[row({...history,targetId:'other'})],[]).historyUpload).toBeUndefined();
});
it('reads Agent-owned history state while saved copies remain independent browser operations',()=>{
 const run={userId:'u',projectId:'p',connectionId:'c',runId:'run',recordId:'history',operationId:'upload',status:'succeeded' as const};
 const agent={...run,tabId:'tab',snapshotJSON:'private response',diagnostic:'',uploadStatus:'failed' as const,persisted:true,lossRisk:false};
 const result=workflowUploads(run,[],[agent]);expect(result.historyUpload?.status).toBe('failed');expect(JSON.stringify(result)).not.toContain('private response');expect(workflowUploads(run,[],[{...agent,userId:'other'}]).historyUpload).toBeUndefined();
});
it('does not invent an original history operation when a server-observed Run lacks its upload identity',async()=>{
 const run={userId:'u',projectId:'p',connectionId:'c',runId:'run',recordId:'history',status:'succeeded' as const};const input=await makeUpload({userId:'u',snapshot,metadata:historyRecord.metadata,targetKind:'history',operationId:'some-operation',targetId:'history'});const result=workflowUploads(run,[{input,status:'recorded',persisted:false,createdAt:0,bytes:1,stale:false,lossRisk:false}],[]);expect(result.historyUpload).toBeUndefined();
});
