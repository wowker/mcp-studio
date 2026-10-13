import {z} from 'zod';
import {recordOperationReceiptSchema,recordUploadInputSchema,recordRevisionInputSchema} from '../../generated/platform';
import type {RecordOperationReceipt} from '../../generated/platform';
import {ApiError,codeOf} from '../../shared/api';
import type {PlatformClient} from '../../shared/api';
import {frozenDigest} from './canonical';
import {DEFAULT_QUEUE_LIMITS,queueBytes,queueKey,storageFailure} from './queueStorage';
import type {QueueInput as Input,QueueRow,QueueLimits,OperationStorage} from './queueStorage';
export type OperationClient={request(path:string,schema:typeof recordOperationReceiptSchema,options?:Parameters<PlatformClient['request']>[2]):Promise<RecordOperationReceipt>};
export type OperationState={input:Input;status:'pending'|'uploading'|'failed'|'recorded'|'paused';error?:string;receipt?:RecordOperationReceipt;persisted:boolean;storageError?:string;createdAt:number;bytes:number;stale:boolean;lossRisk:boolean};
type Entry=Omit<OperationState,'stale'>&{etag?:string;promise?:Promise<RecordOperationReceipt>;abort:AbortController;corrupt?:boolean};
export type OperationsOptions={storage?:OperationStorage;limits?:QueueLimits;now?:()=>number;authorize?:(client:OperationClient,projectId:string,userId:string,signal:AbortSignal)=>Promise<void>};
const rowSchema=z.object({key:z.string(),userId:z.string(),projectId:z.string(),input:z.union([recordUploadInputSchema,recordRevisionInputSchema]),etag:z.string().optional(),status:z.enum(['pending','failed','paused']),error:z.string().regex(/^[a-z_]{1,64}$/).optional(),createdAt:z.number().int().nonnegative(),bytes:z.number().int().nonnegative(),lease:z.object({owner:z.string(),expiresAt:z.number().int().nonnegative()}).strict().optional()}).strict();
const WEEK=7*24*60*60*1000,LEASE=30000;
const localQueueCodes=new Set(['queue_corrupt','operation_busy','storage_unavailable','storage_quota','queue_full','invalid_response','version_required','operation_conflict','operation_cancelled','invalid_input','operation_owner','operation_paused','queue_loading','queue_paused','operation_missing']);
/** Only known local codes cross the shared UI error boundary; free-form upstream errors remain opaque. */
const queueError=(code:string)=>new ApiError(localQueueCodes.has(code)?code:'unknown');
const safeError=(error:unknown)=>{const code=codeOf(error);return /^[a-z_]{1,64}$/.test(code)?code:'unknown';};
/** Frozen inputs only. New execution admission and explicit identity transitions are separate from upload retries. */
export class SessionOperations{
 private damaged=new Map<string,{keys:Set<string>;ids:Set<string>;usage:Map<string,{count:number;bytes:number}>}>();private cleanupWarnings=new Set<string>();private discardingUsers=new Set<string>();
 private entries=new Map<string,Entry>();private partitions=new Map<string,Map<string,Entry>>();
 private generation=0;private projectGenerations=new Map<string,number>();private revoked=new Set<string>();
 private userId:string|undefined;private identityBound=false;private paused=false;private hydration:Promise<void>=Promise.resolve();private hydrated=true;private readError?:string;
 private retention:'persistent'|'memory';private readonly owner=crypto.randomUUID();
 constructor(private readonly changed:()=>void=()=>{},private readonly options:OperationsOptions={}){this.retention=options.storage?'persistent':'memory';if(options.storage)this.hydrated=false;}
 /** Opaque logout warning includes inaccessible project queues; it never exposes their payloads. */
 get pendingCount(){return this.userId===undefined?0:[...this.entries.values()].filter(entry=>entry.input.userId===this.userId&&entry.status!=='recorded').length+(this.damaged.get(this.userId)?.keys.size??0);}
 get damagedCount(){return this.userId===undefined?0:this.damaged.get(this.userId)?.keys.size??0;}
 get retentionMode(){return this.retention;}
 get ready(){return this.hydrated;}
 get storageError(){return this.readError;}
 get storageWarning(){return this.userId!==undefined&&this.cleanupWarnings.has(this.userId)?'storage_cleanup_unconfirmed':undefined;}
 private damagedUsage(projectId:string){if(this.userId===undefined)return {count:0,bytes:0};const usage=this.damaged.get(this.userId)?.usage;const project=usage?.get(projectId),unknown=usage?.get('');return {count:(project?.count??0)+(unknown?.count??0),bytes:(project?.bytes??0)+(unknown?.bytes??0)};}
 private now(){return this.options.now?.()??Date.now();}
 private key(entry:Entry){return queueKey(entry.input.userId,entry.input.operationId);}
 private row(entry:Entry):QueueRow{return {key:this.key(entry),userId:entry.input.userId,projectId:entry.input.projectId,input:structuredClone(entry.input),...entry.etag?{etag:entry.etag}:{},status:entry.status==='failed'?'failed':entry.status==='paused'?'paused':'pending',...entry.error?{error:entry.error}:{},createdAt:entry.createdAt,bytes:entry.bytes};}
 private visible(entry:Entry){return !this.paused&&!this.revoked.has(entry.input.projectId)&&(this.userId===undefined||entry.input.userId===this.userId);}
 get(operationId:string):OperationState|undefined{const entry=this.entries.get(operationId);if(!entry||!this.visible(entry))return;return structuredClone({input:entry.input,status:entry.status,...entry.error?{error:entry.error}:{},...entry.receipt?{receipt:entry.receipt}:{},persisted:entry.persisted,...entry.storageError?{storageError:entry.storageError}:{},createdAt:entry.createdAt,bytes:entry.bytes,stale:entry.status!=='recorded'&&this.now()-entry.createdAt>=WEEK,lossRisk:entry.lossRisk});}
 all():OperationState[]{return [...this.entries.keys()].flatMap(key=>{const state=this.get(key);return state?[state]:[];});}
 list(projectId:string){return this.all().filter(entry=>entry.input.projectId===projectId);}
 bindUser(userId:string):Promise<void>{
  this.suspend();if(this.userId!==undefined)this.partitions.set(this.userId,this.entries);
  this.userId=userId;this.identityBound=true;this.entries=this.partitions.get(userId)??new Map();this.partitions.set(userId,this.entries);this.revoked.clear();this.paused=false;this.hydrated=false;this.readError=this.retention==='memory'&&this.cleanupWarnings.has(userId)?'storage_unavailable':undefined;
  const generation=this.generation;
  for(const entry of this.entries.values()){entry.abort=new AbortController();if(entry.status==='paused')entry.status='pending';}
  this.hydration=(async()=>{try{if(this.retention==='persistent'&&this.options.storage){const rows=await this.options.storage.load(userId);if(generation!==this.generation)return;this.damaged.set(userId,{keys:new Set(),ids:new Set(),usage:new Map()});let rowIndex=0;for(const raw of rows){rowIndex++;if(generation!==this.generation)return;const parsed=rowSchema.safeParse(raw);let digestValid=false;if(parsed.success)try{digestValid=raw.input.frozenDigest===await frozenDigest(raw.input);}catch{digestValid=false;}if(generation!==this.generation)return;if(!parsed.success||raw.userId!==userId||raw.input.userId!==userId||raw.projectId!==raw.input.projectId||raw.key!==queueKey(userId,raw.input.operationId)||raw.bytes!==queueBytes(raw.input,raw.etag)||!digestValid){
    // Untrusted content never becomes an OperationState. Keep only opaque owner-scoped identifiers.
    if(raw?.userId===userId){const damaged=this.damaged.get(userId)!;damaged.keys.add(typeof raw.key==='string'?raw.key:`malformed:${rowIndex}`);const projectId=typeof raw.projectId==='string'?raw.projectId:'';const usage=damaged.usage.get(projectId)??{count:0,bytes:0};usage.count++;let bytes=(this.options.limits??DEFAULT_QUEUE_LIMITS).bytes;try{bytes=queueBytes(raw.input,raw.etag);}catch{/* unmeasurable damaged payload conservatively consumes the byte budget */}usage.bytes+=bytes;damaged.usage.set(projectId,usage);let keyId:unknown;try{const key=JSON.parse(raw.key) as unknown;if(Array.isArray(key)&&key[0]===userId)keyId=key[1];}catch{/* malformed keys remain quarantined */}for(const id of [keyId,raw.input?.operationId])if(typeof id==='string'){damaged.ids.add(id);this.entries.delete(id);}}
    this.readError='queue_corrupt';continue;}
   if(generation!==this.generation)return;if(!this.entries.has(raw.input.operationId))this.entries.set(raw.input.operationId,{input:structuredClone(raw.input),etag:raw.etag,status:raw.status==='paused'?'pending':raw.status,error:raw.error,persisted:true,createdAt:raw.createdAt,bytes:raw.bytes,lossRisk:false,abort:new AbortController()});
  }}}catch{if(generation===this.generation)this.readError='storage_unavailable';}finally{if(generation===this.generation){this.hydrated=true;this.changed();}}})();this.changed();return this.hydration;
 }
 resumeUser(userId:string){return this.bindUser(userId);}
 suspend(){this.generation++;this.paused=true;for(const entry of this.entries.values()){entry.abort.abort();if(entry.status==='uploading'||entry.status==='pending')entry.status='paused';}this.changed();}
 async discardUser(userId:string){
  const current=this.userId===userId,paused=this.paused;this.discardingUsers.add(userId);if(current)this.suspend();const generation=this.generation;
  try{if(this.options.storage)await this.options.storage.discardUser(userId);if(current&&this.userId===userId&&this.generation===generation){this.clear();this.userId=undefined;}this.partitions.delete(userId);this.damaged.delete(userId);this.cleanupWarnings.delete(userId);}
  catch(error){this.cleanupWarnings.add(userId);if(this.userId===userId&&this.generation===generation){this.paused=paused;this.readError='storage_unavailable';for(const entry of this.entries.values())if(entry.status==='paused'&&!paused)entry.status='pending';}throw queueError(storageFailure(error).message);}
  finally{this.discardingUsers.delete(userId);this.changed();}
 }
 async setRetention(mode:'persistent'|'memory'){
  if(mode===this.retention)return;await this.hydration;
  if(mode==='memory'){
   const userId=this.userId,generation=this.generation;let cleared=true;
   if(this.options.storage&&userId!==undefined)try{await this.options.storage.discardUser(userId);this.cleanupWarnings.delete(userId);}catch{cleared=false;this.cleanupWarnings.add(userId);this.readError='storage_unavailable';}
   if(generation!==this.generation)throw queueError('operation_cancelled');
   if(cleared){this.damaged.delete(userId??'');this.readError=undefined;}
   this.retention=mode;for(const entry of this.entries.values()){if(cleared)entry.persisted=false;entry.lossRisk=entry.status!=='recorded';}
  }else{
   this.retention=mode;
   const userId=this.userId;let generation=this.generation;
   if(userId!==undefined){const revoked=new Set(this.revoked),paused=this.paused;const hydration=this.bindUser(userId);generation=this.generation;await hydration;if(this.userId!==userId||this.generation!==generation)throw queueError('operation_cancelled');this.revoked=new Set([...revoked,...this.revoked]);this.paused=paused;}
   for(const entry of this.entries.values()){if(this.userId!==userId||this.generation!==generation)throw queueError('operation_cancelled');if(entry.status!=='recorded'&&!entry.corrupt){await this.persist(entry);if(this.userId!==userId||this.generation!==generation)throw queueError('operation_cancelled');}}
  }
  this.changed();
 }
 async assertAdmission(projectId:string){await this.hydration;if(this.paused||this.revoked.has(projectId))throw queueError('operation_paused');if(!this.hydrated)throw queueError('queue_loading');if(this.retention==='persistent'&&this.readError)throw queueError(this.readError);
  const limits=this.options.limits??DEFAULT_QUEUE_LIMITS;const damaged=this.retention==='memory'?this.damagedUsage(projectId):{count:0,bytes:0};let count=damaged.count,bytes=damaged.bytes;const seen=new Set<string>();if(this.retention==='persistent'&&this.options.storage&&this.userId!==undefined){let rows:QueueRow[];try{rows=await this.options.storage.load(this.userId);}catch{this.readError='storage_unavailable';this.changed();throw queueError(this.readError);}for(const row of rows)if(row.projectId===projectId){count++;bytes+=row.bytes;seen.add(row.input.operationId);}}
  for(const entry of this.entries.values())if(entry.input.projectId===projectId&&entry.status!=='recorded'&&!seen.has(entry.input.operationId)){count++;bytes+=entry.bytes;}if(count>=limits.count||bytes>=limits.bytes)throw queueError('queue_full');
 }
 async submit(client:OperationClient,input:Input,etag?:string):Promise<RecordOperationReceipt>{
  const generation=this.generation,projectGeneration=this.projectGenerations.get(input.projectId)??0;
  const frozen=structuredClone(input);const schema='targetKind'in frozen?recordUploadInputSchema:recordRevisionInputSchema;
  if(!schema.safeParse(frozen).success||frozen.frozenDigest!==await frozenDigest(frozen))throw queueError('invalid_input');
  await this.hydration;if(generation!==this.generation||projectGeneration!==(this.projectGenerations.get(input.projectId)??0))throw queueError('operation_cancelled');
  if(this.userId!==undefined&&input.userId!==this.userId)throw queueError('operation_owner');if((this.options.storage||this.identityBound)&&this.userId===undefined||this.discardingUsers.has(input.userId))throw queueError('operation_paused');
  if(this.userId!==undefined&&this.damaged.get(this.userId)?.ids.has(frozen.operationId))throw queueError('queue_corrupt');
  let entry=this.entries.get(frozen.operationId);
  if(entry){if(entry.input.frozenDigest!==frozen.frozenDigest||entry.etag!==etag)throw queueError('operation_conflict');}
  else{entry={input:frozen,status:'pending',etag,abort:new AbortController(),persisted:false,createdAt:this.now(),bytes:queueBytes(frozen,etag),lossRisk:true};this.entries.set(frozen.operationId,entry);this.changed();}
  if(this.paused||this.revoked.has(input.projectId)){entry.status='paused';await this.persist(entry);throw queueError('queue_paused');}
  return this.send(client,entry);
 }
 retry(client:OperationClient,operationId:string):Promise<RecordOperationReceipt>{if(this.userId!==undefined&&this.damaged.get(this.userId)?.ids.has(operationId))return Promise.reject(queueError('queue_corrupt'));const entry=this.entries.get(operationId);if(!entry)return Promise.reject(queueError('operation_missing'));if(!this.visible(entry))return Promise.reject(queueError('operation_paused'));return this.send(client,entry);}
 discard(operationId:string){const entry=this.entries.get(operationId);if(!entry||!this.visible(entry)||!['failed','pending','paused'].includes(entry.status))return false;entry.abort.abort();this.entries.delete(operationId);if(entry.persisted&&this.options.storage)void this.options.storage.remove(this.key(entry)).catch(()=>{this.entries.set(operationId,entry);entry.storageError='storage_unavailable';entry.lossRisk=true;this.changed();});this.changed();return true;}
 invalidateRun(projectId:string,runId:string){if(!runId)return;for(const [id,entry]of this.entries)if(entry.input.projectId===projectId&&'snapshot'in entry.input&&entry.input.snapshot.runId===runId){entry.abort.abort();this.entries.delete(id);if(entry.persisted&&this.options.storage)void this.options.storage.remove(this.key(entry)).catch(()=>{this.entries.set(id,entry);entry.storageError='storage_unavailable';this.changed();});}this.changed();}
 private async persist(entry:Entry){if(this.retention!=='persistent'){const limits=this.options.limits??DEFAULT_QUEUE_LIMITS;const pending=[...this.entries.values()].filter(item=>item.input.projectId===entry.input.projectId&&item.status!=='recorded');const damaged=this.damagedUsage(entry.input.projectId);if(pending.length+damaged.count>limits.count||pending.reduce((sum,item)=>sum+item.bytes,0)+damaged.bytes>limits.bytes)entry.storageError='queue_full';return;}if(!this.options.storage){entry.storageError='storage_unavailable';return;}try{await this.options.storage.add(this.row(entry),this.options.limits??DEFAULT_QUEUE_LIMITS);entry.persisted=true;entry.lossRisk=false;entry.storageError=undefined;}catch(error){const code=storageFailure(error).message;if(code==='operation_conflict')throw queueError(code);entry.persisted=false;entry.lossRisk=true;entry.storageError=code;}this.changed();}
 private send(client:OperationClient,entry:Entry):Promise<RecordOperationReceipt>{
  if(entry.corrupt)return Promise.reject(queueError('queue_corrupt'));if(entry.receipt)return Promise.resolve(structuredClone(entry.receipt));if(entry.promise)return entry.promise;
  const input=entry.input,revision='recordId'in input;if(revision&&!entry.etag)return Promise.reject(queueError('version_required'));
  if(entry.abort.signal.aborted)entry.abort=new AbortController();const abort=entry.abort,generation=this.generation;
  const active=()=>generation===this.generation&&this.entries.get(input.operationId)===entry&&!abort.signal.aborted&&this.visible(entry);
  const check=()=>{if(!active())throw queueError('operation_cancelled');};
  const path=`/projects/${encodeURIComponent(input.projectId)}/${revision?`records/${encodeURIComponent(input.recordId)}/revisions`:'record-uploads'}`;
  entry.promise=(async()=>{let leased=false,timer:ReturnType<typeof setInterval>|undefined;try{
   await this.persist(entry);check();const storage=this.retention==='persistent'?this.options.storage:undefined;
   if(storage&&entry.persisted){const prior=await storage.getReceipt(this.key(entry));check();if(prior){this.validateReceipt(prior,input);entry.status='recorded';entry.receipt=structuredClone(prior);entry.persisted=false;entry.lossRisk=false;this.changed();return structuredClone(prior);}leased=await storage.claim(this.key(entry),this.owner,this.now(),LEASE);check();if(!leased)throw queueError('operation_busy');timer=setInterval(()=>{void storage.claim(this.key(entry),this.owner,this.now(),LEASE).then(ok=>{if(!ok)abort.abort();}).catch(()=>abort.abort());},LEASE/3);}
   if(this.options.authorize){await this.options.authorize(client,input.projectId,input.userId,abort.signal);check();}
   entry.status='uploading';entry.error=undefined;this.changed();
   const result=await client.request(path,recordOperationReceiptSchema,{method:'POST',body:structuredClone(input),bodySchema:revision?recordRevisionInputSchema:recordUploadInputSchema,headers:entry.etag?{'If-Match':entry.etag}:undefined,signal:abort.signal});check();this.validateReceipt(result,input);
   if(storage){try{await storage.complete(this.key(entry),result,entry.etag);}catch(error){entry.storageError=storageFailure(error).message;entry.lossRisk=true;throw queueError(entry.storageError);}check();}
   entry.status='recorded';entry.receipt=structuredClone(result);entry.persisted=false;entry.lossRisk=false;this.changed();return structuredClone(result);
  }catch(error){if(active()){entry.status='failed';entry.error=error instanceof Error&&['queue_corrupt','operation_busy','storage_unavailable','storage_quota','queue_full','invalid_response','version_required','operation_conflict'].includes(error.message)?error.message:safeError(error);if(this.retention==='persistent'&&entry.persisted&&this.options.storage)try{await this.options.storage.update(this.row(entry));}catch{entry.storageError='storage_unavailable';entry.lossRisk=true;}this.changed();}throw error;}
  finally{if(timer)clearInterval(timer);if(leased&&this.options.storage)await this.options.storage.release(this.key(entry),this.owner).catch(()=>{});entry.promise=undefined;}})();return entry.promise;
 }
 private validateReceipt(result:RecordOperationReceipt,input:Input){const revision='recordId'in input;if(!recordOperationReceiptSchema.safeParse(result).success||result.operationId!==input.operationId||result.frozenDigest!==input.frozenDigest||result.targetKind!==(revision?'revision':input.targetKind)||result.targetId!==(revision?input.recordId:input.targetId)||result.recordId!==(revision?input.recordId:input.targetId)||result.responsibleEndpoint!==('responsibleEndpoint'in input?input.responsibleEndpoint:'browser'))throw queueError('invalid_response');}
 allowProject(projectId:string){this.revoked.delete(projectId);for(const entry of this.entries.values())if(entry.input.projectId===projectId&&entry.status==='paused'){entry.status='pending';entry.abort=new AbortController();}this.changed();}
 revokeProject(projectId:string){this.projectGenerations.set(projectId,(this.projectGenerations.get(projectId)??0)+1);this.revoked.add(projectId);for(const entry of this.entries.values())if(entry.input.projectId===projectId){entry.abort.abort();if(entry.status!=='recorded')entry.status='paused';}this.changed();}
 clear(){this.suspend();this.entries.clear();this.partitions.clear();this.projectGenerations.clear();this.revoked.clear();if(!this.options.storage&&this.userId===undefined)this.paused=false;this.changed();}
}
