import type {RecordUploadInput,RecordRevisionInput,RecordOperationReceipt} from '../../generated/platform';
export type QueueInput=RecordUploadInput|RecordRevisionInput;
export type QueueRow={key:string;userId:string;projectId:string;input:QueueInput;etag?:string;status:'pending'|'failed'|'paused';error?:string;createdAt:number;bytes:number;lease?:{owner:string;expiresAt:number}};
export type QueueLimits={count:number;bytes:number};
export const DEFAULT_QUEUE_LIMITS:QueueLimits={count:1000,bytes:100*1024*1024};
export const queueKey=(userId:string,operationId:string)=>JSON.stringify([userId,operationId]);
export const queueBytes=(input:QueueInput,etag?:string)=>new TextEncoder().encode(JSON.stringify({input,...etag?{etag}:{}})).byteLength;
export interface OperationStorage {
 load(userId:string):Promise<QueueRow[]>;
 add(row:QueueRow,limits:QueueLimits):Promise<void>;
 update(row:QueueRow):Promise<void>;
 remove(key:string):Promise<void>;
 discardUser(userId:string):Promise<void>;
 complete(key:string,receipt:RecordOperationReceipt,etag?:string):Promise<void>;
 getReceipt(key:string):Promise<RecordOperationReceipt|undefined>;
 claim(key:string,owner:string,now:number,ttl:number):Promise<boolean>;
 release(key:string,owner:string):Promise<void>;
}
/** Only sanitized frozen operation envelopes enter this database; credentials and drafts have no storage API. */
export class IndexedDBOperationStorage implements OperationStorage {
 private database?:Promise<IDBDatabase>;
 constructor(private readonly name='mcp-studio-sanitized-queue-v1',private readonly factory:IDBFactory|undefined=globalThis.indexedDB){}
 private open():Promise<IDBDatabase>{
  if(!this.factory)return Promise.reject(Error('storage_unavailable'));
  if(!this.database)this.database=new Promise((resolve,reject)=>{const request=this.factory!.open(this.name,1);request.onupgradeneeded=()=>{const database=request.result;const queue=database.createObjectStore('queue',{keyPath:'key'});queue.createIndex('userId','userId');database.createObjectStore('receipts',{keyPath:'key'}).createIndex('userId','userId');};request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();this.database=undefined;};resolve(request.result);};request.onerror=()=>{this.database=undefined;reject(storageFailure(request.error));};request.onblocked=()=>{this.database=undefined;reject(Error('storage_unavailable'));};});
  return this.database;
 }
 private async transaction<T>(stores:string[],mode:IDBTransactionMode,work:(tx:IDBTransaction,set:(result:T)=>void,fail:(error:Error)=>void)=>void):Promise<T>{
  const database=await this.open();return new Promise((resolve,reject)=>{let result:T,error:Error|undefined;const tx=database.transaction(stores,mode);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(error??storageFailure(tx.error));tx.onabort=()=>reject(error??storageFailure(tx.error));const fail=(reason:Error)=>{error=reason;tx.abort();};try{work(tx,value=>result=value,fail);}catch(reason){fail(storageFailure(reason));}});
 }
 load(userId:string){return this.transaction<QueueRow[]>(['queue'],'readonly',(tx,set)=>{const request=tx.objectStore('queue').index('userId').getAll(userId);request.onsuccess=()=>set(request.result as QueueRow[]);});}
 add(row:QueueRow,limits:QueueLimits){return this.transaction<void>(['queue','receipts'],'readwrite',(tx,_set,fail)=>{const store=tx.objectStore('queue');const existing=store.get(row.key);existing.onsuccess=()=>{const prior=existing.result as QueueRow|undefined;if(prior){if(prior.input.frozenDigest!==row.input.frozenDigest||prior.etag!==row.etag)fail(Error('operation_conflict'));return;}const receipt=tx.objectStore('receipts').get(row.key);receipt.onsuccess=()=>{const recorded=receipt.result as {receipt:RecordOperationReceipt;etag?:string}|undefined;if(recorded){if(recorded.receipt.frozenDigest!==row.input.frozenDigest||recorded.etag!==row.etag)fail(Error('operation_conflict'));return;}const request=store.index('userId').getAll(row.userId);request.onsuccess=()=>{const project=(request.result as QueueRow[]).filter(item=>item.projectId===row.projectId);if(project.length>=limits.count||project.reduce((sum,item)=>sum+item.bytes,0)+row.bytes>limits.bytes){fail(Error('queue_full'));return;}store.add(structuredClone(row));};};};});}
 update(row:QueueRow){return this.transaction<void>(['queue'],'readwrite',tx=>{const store=tx.objectStore('queue'),request=store.get(row.key);request.onsuccess=()=>{const current=request.result as QueueRow|undefined;if(current)store.put({...row,...current.lease?{lease:current.lease}:{}});};});}
 remove(key:string){return this.transaction<void>(['queue'],'readwrite',tx=>{tx.objectStore('queue').delete(key);});}
 discardUser(userId:string){return this.transaction<void>(['queue','receipts'],'readwrite',tx=>{for(const name of ['queue','receipts']){const store=tx.objectStore(name),request=store.index('userId').getAllKeys(userId);request.onsuccess=()=>{for(const key of request.result)store.delete(key);};}});}
 /** Receipt commit and pending-payload cleanup share one transaction: aborted commits leave the retry envelope intact. */
 complete(key:string,receipt:RecordOperationReceipt,etag?:string){return this.transaction<void>(['queue','receipts'],'readwrite',tx=>{tx.objectStore('receipts').put({key,userId:JSON.parse(key)[0] as string,receipt:structuredClone(receipt),...etag?{etag}:{}});tx.objectStore('queue').delete(key);});}
 getReceipt(key:string){return this.transaction<RecordOperationReceipt|undefined>(['receipts'],'readonly',(tx,set)=>{const request=tx.objectStore('receipts').get(key);request.onsuccess=()=>set((request.result as {receipt:RecordOperationReceipt}|undefined)?.receipt);});}
 claim(key:string,owner:string,now:number,ttl:number){return this.transaction<boolean>(['queue'],'readwrite',(tx,set)=>{const store=tx.objectStore('queue'),request=store.get(key);request.onsuccess=()=>{const row=request.result as QueueRow|undefined;if(!row||row.lease&&row.lease.owner!==owner&&row.lease.expiresAt>now){set(false);return;}store.put({...row,lease:{owner,expiresAt:now+ttl}});set(true);};});}
 release(key:string,owner:string){return this.transaction<void>(['queue'],'readwrite',tx=>{const store=tx.objectStore('queue'),request=store.get(key);request.onsuccess=()=>{const row=request.result as QueueRow|undefined;if(row?.lease?.owner===owner){delete row.lease;store.put(row);}};});}
}
export function storageFailure(error:unknown):Error{if(error instanceof DOMException&&error.name==='QuotaExceededError')return Error('storage_quota');if(error instanceof Error&&['queue_full','operation_conflict','storage_quota'].includes(error.message))return Error(error.message);return Error('storage_unavailable');}
