import {recordOperationReceiptSchema,recordUploadInputSchema,recordRevisionInputSchema} from '../../generated/platform';
import type {RecordUploadInput,RecordRevisionInput,RecordOperationReceipt} from '../../generated/platform';
import {codeOf} from '../../shared/api';
import type {PlatformClient} from '../../shared/api';
import {frozenDigest} from './canonical';
type Input=RecordUploadInput|RecordRevisionInput;
type Client={request(path:string,schema:typeof recordOperationReceiptSchema,options?:Parameters<PlatformClient['request']>[2]):Promise<RecordOperationReceipt>};
export type OperationState={input:Input;status:'pending'|'uploading'|'failed'|'recorded';error?:string;receipt?:RecordOperationReceipt};
type Entry=OperationState&{etag?:string;promise?:Promise<RecordOperationReceipt>;abort:AbortController};
/** Session memory only. Durable recovery and lifecycle admission belong to M4. */
export class SessionOperations{
 private entries=new Map<string,Entry>();
 private generation=0;private projectGenerations=new Map<string,number>();
 constructor(private readonly changed:()=>void=()=>{}){}
 get(operationId:string):OperationState|undefined{const entry=this.entries.get(operationId);if(!entry)return;return structuredClone({input:entry.input,status:entry.status,...entry.error?{error:entry.error}:{},...entry.receipt?{receipt:entry.receipt}:{}});}
 list(projectId:string){return [...this.entries.values()].filter(entry=>entry.input.projectId===projectId).map(entry=>this.get(entry.input.operationId)!);}
 async submit(client:Client,input:Input,etag?:string):Promise<RecordOperationReceipt>{
  const generation=this.generation,projectGeneration=this.projectGenerations.get(input.projectId)??0;
  const frozen=structuredClone(input);const schema='targetKind'in frozen?recordUploadInputSchema:recordRevisionInputSchema;
  if(!schema.safeParse(frozen).success||frozen.frozenDigest!==await frozenDigest(frozen))throw Error('invalid_input');
  if(generation!==this.generation||projectGeneration!==(this.projectGenerations.get(input.projectId)??0))throw Error('operation_cancelled');
  let entry=this.entries.get(frozen.operationId);
  if(entry){if(entry.input.frozenDigest!==frozen.frozenDigest||entry.etag!==etag)throw Error('operation_conflict');}
  else{entry={input:frozen,status:'pending',etag,abort:new AbortController()};this.entries.set(frozen.operationId,entry);this.changed();}
  return this.send(client,entry);
 }
 retry(client:Client,operationId:string):Promise<RecordOperationReceipt>{const entry=this.entries.get(operationId);if(!entry)return Promise.reject(Error('operation_missing'));return this.send(client,entry);}
 discard(operationId:string){const entry=this.entries.get(operationId);if(!entry||entry.status!=='failed')return false;entry.abort.abort();this.entries.delete(operationId);this.changed();return true;}
 invalidateRun(projectId:string,runId:string){if(!runId)return;for(const [id,entry]of this.entries)if(entry.input.projectId===projectId&&'snapshot'in entry.input&&entry.input.snapshot.runId===runId){entry.abort.abort();this.entries.delete(id);}this.changed();}
 private send(client:Client,entry:Entry):Promise<RecordOperationReceipt>{
  if(entry.receipt)return Promise.resolve(structuredClone(entry.receipt));if(entry.promise)return entry.promise;
  const input=entry.input,revision='recordId'in input;
  if(revision&&!entry.etag)return Promise.reject(Error('version_required'));
  entry.status='uploading';entry.error=undefined;this.changed();
  const active=()=>this.entries.get(input.operationId)===entry&&!entry.abort.signal.aborted;
  const path=`/projects/${encodeURIComponent(input.projectId)}/${revision?`records/${encodeURIComponent(input.recordId)}/revisions`:'record-uploads'}`;
  entry.promise=(async()=>{try{
   const result=await client.request(path,recordOperationReceiptSchema,{method:'POST',body:input,bodySchema:revision?recordRevisionInputSchema:recordUploadInputSchema,headers:entry.etag?{'If-Match':entry.etag}:undefined,signal:entry.abort.signal});
   if(!active())throw Error('operation_cancelled');
   if(result.operationId!==input.operationId||result.frozenDigest!==input.frozenDigest||result.recordId!==(revision?input.recordId:input.targetId)||result.responsibleEndpoint!==('responsibleEndpoint'in input?input.responsibleEndpoint:'browser'))throw Error('invalid_response');
   entry.status='recorded';entry.receipt=structuredClone(result);this.changed();return structuredClone(result);
  }catch(error){if(active()){entry.status='failed';entry.error=codeOf(error);this.changed();}throw error;}
  finally{entry.promise=undefined;}})();return entry.promise;
 }
 revokeProject(projectId:string){this.projectGenerations.set(projectId,(this.projectGenerations.get(projectId)??0)+1);for(const [id,entry]of this.entries)if(entry.input.projectId===projectId){entry.abort.abort();this.entries.delete(id);}this.changed();}
 clear(){this.generation++;for(const entry of this.entries.values())entry.abort.abort();this.entries.clear();this.projectGenerations.clear();this.changed();}
}
