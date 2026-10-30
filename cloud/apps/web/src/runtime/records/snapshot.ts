import type {ExecutionSnapshot,Record as StoredRecord,RecordMetadata,RecordUploadInput,RecordRevisionInput,RedactionMarker} from '../../generated/platform';
import {redact,redactionMarker,isRedactionMarker,pointerParts,sensitiveName,type RedactionOptions,type RedactionResult} from './redaction';
import {frozenDigest,compareUnicode} from './canonical';
export type Sanitizer=(value:unknown)=>RedactionResult;
const parse=(raw:string)=>{try{return JSON.parse(raw) as unknown;}catch{return redactionMarker;}};
const context=(snapshot:ExecutionSnapshot)=>({toolName:snapshot.toolName,toolDefinitionVersion:snapshot.toolDefinitionVersion,environmentVersion:snapshot.environmentVersion,omissionReason:snapshot.omissionReason});
export function snapshotProjection(snapshot:ExecutionSnapshot,metadata:RecordMetadata){return {request:parse(snapshot.requestJSON),response:parse(snapshot.responseJSON),protocol:parse(snapshot.protocolJSON),metadata,context:context(snapshot)};}
/** Schema property names are definitions, not request values; sanitize annotations separately. */
function safeSchema(schema:unknown,sanitize:Sanitizer):{value:unknown;markers:RedactionMarker[]}{
 let omitted=false,changed=false,visits=0;
 const maps=new Set(['properties','patternProperties','$defs','definitions','dependentSchemas']);
 const singles=new Set(['additionalProperties','additionalItems','unevaluatedProperties','unevaluatedItems','propertyNames','contains','if','then','else','not','contentSchema']);
 const arrays=new Set(['allOf','anyOf','oneOf','prefixItems']);
 const risky=(value:unknown)=>{const result=sanitize({value});return result.omitted||result.markers.length>0;};
 const visit=(value:unknown,depth=0,sensitive=false):unknown=>{
  if(++visits>65536||depth>64){omitted=true;return {};}
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key,item])=>{
   if(['title','description','default','examples','$comment'].includes(key)){if(risky(item)||sensitive&&['default','examples'].includes(key)){changed=true;return [];}return [[key,item]];}
   if(maps.has(key)&&item&&typeof item==='object'&&!Array.isArray(item))return [[key,Object.fromEntries(Object.entries(item).map(([name,node])=>[name,visit(node,depth+1,key==='properties'&&sensitiveName(name))]))]];
   if(arrays.has(key)&&Array.isArray(item))return [[key,item.map(node=>visit(node,depth+1,sensitive))]];
   if(singles.has(key))return [[key,visit(item,depth+1,sensitive)]];
   if(key==='items')return [[key,Array.isArray(item)?item.map(node=>visit(node,depth+1,sensitive)):visit(item,depth+1,sensitive)]];
   if(key==='dependencies'&&item&&typeof item==='object'&&!Array.isArray(item))return [[key,Object.fromEntries(Object.entries(item).map(([name,node])=>{if(Array.isArray(node)){if(risky(node))omitted=true;return [name,node];}return [name,visit(node,depth+1)];}))]];
   if(risky(item)||sensitive&&['const','enum'].includes(key)&&item!==null&&(typeof item==='number'||typeof item==='boolean'||typeof item==='string'&&item!==''||Array.isArray(item)&&item.length>0||typeof item==='object'&&Object.keys(item).length>0))omitted=true;
   return [[key,item]];
  }));
 };
 const value=visit(schema);return {value:omitted?{}:value,markers:omitted||changed?[{path:'/schema',reason:'omitted'}]:[]};
}
export function sanitizeSnapshot(snapshot:ExecutionSnapshot,options:RedactionOptions={},captured?:Sanitizer):ExecutionSnapshot{
 const sanitize:Sanitizer=value=>{
  const source=captured?.(value);if(source?.omitted)return source;
  const policy=redact(source?source.value:value,options);
  return {...policy,markers:[...policy.markers,...source?.markers??[]]};
 };
 const request=parse(snapshot.requestJSON);
 const joint=sanitize({request,response:parse(snapshot.responseJSON),protocol:parse(snapshot.protocolJSON),context:context(snapshot)});
 const omitted=joint.omitted||isRedactionMarker(joint.value);
 const safe=omitted?{request:redactionMarker,response:null,protocol:null,context:{}}:joint.value as {request:unknown;response:unknown;protocol:unknown;context:Record<string,unknown>};
 const schema=safeSchema(parse(snapshot.inputSchemaJSON),value=>{
  const checked=sanitize({request,value});if(checked.omitted||isRedactionMarker(checked.value))return {...checked,omitted:true};
  return {value:(checked.value as {value:unknown}).value,omitted:false,markers:checked.markers.filter(marker=>marker.path==='/value'||marker.path.startsWith('/value/'))};
 });
 const prior=snapshot.redactions??[];const markers=[...omitted?['/request','/response','/protocol','/context'].map(path=>({path,reason:'omitted' as const})):joint.markers,...schema.markers,...prior];const deduplicated=new Map(markers.map(marker=>[marker.path,marker]));
 return {...structuredClone(snapshot),toolName:safeText(safe.context.toolName),toolDefinitionVersion:safeText(safe.context.toolDefinitionVersion),environmentVersion:safeText(safe.context.environmentVersion),requestJSON:JSON.stringify(safe.request),responseJSON:JSON.stringify(safe.response),protocolJSON:JSON.stringify(safe.protocol),inputSchemaJSON:JSON.stringify(schema.value),responseRetention:omitted?'omitted':snapshot.responseRetention,omissionReason:omitted?joint.reason??'source_context':safeText(safe.context.omissionReason),redactions:[...deduplicated.values()].sort((a,b)=>compareUnicode(a.path,b.path))};
}
const safeText=(value:unknown)=>typeof value==='string'?value:'[REDACTED]';
function safeMetadata(metadata:RecordMetadata,options:RedactionOptions){const result=redact({metadata},options);const safe=result.omitted?undefined:(result.value as {metadata?:Record<string,unknown>}).metadata;return {...metadata,name:safeText(safe?.name),note:safeText(safe?.note)};}
export async function makeUpload(input:{userId:string;targetKind:'history'|'saved';snapshot:ExecutionSnapshot;metadata:RecordMetadata;sourceRunId?:string;targetId?:string;operationId?:string},options:RedactionOptions={},captured?:Sanitizer):Promise<RecordUploadInput>{
 const projection=snapshotProjection(input.snapshot,input.metadata);
 const selected=(options.projectPointers??[]).flatMap(path=>{let value:unknown=projection;for(const key of pointerParts(path)){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))return [];value=(value as Record<string,unknown>)[key];}return [value];});
 options={...options,sensitiveValues:[...options.sensitiveValues??[],...selected]};
 const source=captured?.(projection);const policy=redact(source?source.value:projection,options);
 const combined={...policy,omitted:policy.omitted||!!source?.omitted,markers:[...policy.markers,...source?.markers??[]]};
 const omitted=combined.omitted||isRedactionMarker(combined.value);
 const body=omitted?undefined:combined.value as {request:unknown;response:unknown;protocol:unknown;metadata:Record<string,unknown>;context:Record<string,unknown>};
 const preliminary=sanitizeSnapshot(input.snapshot,options,captured);
 const snapshot=sanitizeSnapshot({...preliminary,...body?{toolName:safeText(body.context.toolName),toolDefinitionVersion:safeText(body.context.toolDefinitionVersion),environmentVersion:safeText(body.context.environmentVersion),omissionReason:safeText(body.context.omissionReason)}:{},requestJSON:JSON.stringify(body?body.request:redactionMarker),responseJSON:JSON.stringify(body?body.response:null),protocolJSON:JSON.stringify(body?body.protocol:null),redactions:[...omitted?[]:combined.markers,...preliminary.redactions]},options);
 const metadata={...input.metadata,name:safeText(body?.metadata.name),note:safeText(body?.metadata.note)};
 if(omitted){snapshot.responseRetention='omitted';snapshot.omissionReason=combined.reason??'source_context';}
 if(metadata.contentKind==='request'){snapshot.responseJSON='null';snapshot.protocolJSON='null';snapshot.redactions=snapshot.redactions.filter(marker=>!marker.path.startsWith('/response')&&!marker.path.startsWith('/protocol'));}
 if(!snapshot.schemaValid||snapshot.runStatus==='idle'&&metadata.completeness==='incomplete'){metadata.completeness='incomplete';metadata.visibility='private';}
 const result:RecordUploadInput={contractVersion:'1.2.0',userId:input.userId,projectId:snapshot.projectId,connectionId:snapshot.connectionId,operationId:input.operationId??crypto.randomUUID(),targetKind:input.targetKind,targetId:input.targetId??crypto.randomUUID(),responsibleEndpoint:'browser',frozenDigest:'',sourceRunId:input.targetKind==='history'?'':input.sourceRunId??snapshot.runId,snapshot,metadata};
 result.frozenDigest=await frozenDigest(result);return result;
}
export async function makeRevision(input:{record:StoredRecord;userId:string;revisionKind:'metadata'|'additional-redaction';metadata?:RecordMetadata;redactionPointers?:string[];reason?:string;operationId?:string},options:RedactionOptions={},captured?:Sanitizer):Promise<RecordRevisionInput>{
 if(input.revisionKind==='additional-redaction'){
  const wrapper=snapshotProjection(input.record.snapshot,input.record.metadata);
  const values=(input.redactionPointers??[]).map(path=>{let value:unknown=wrapper;for(const key of pointerParts(path)){if(!value||typeof value!=='object'||!Object.hasOwn(value,key))throw Error('invalid_pointer');value=(value as Record<string,unknown>)[key];}return value;});
  options={...options,sensitiveValues:[...options.sensitiveValues??[],...values]};
 }
 const metadata=safeMetadata(input.metadata??input.record.metadata,options),reason=safeText(redact(input.reason??'',options).value);
 const checked=captured?.({metadata,reason});const body=checked?.value as {metadata?:Record<string,unknown>;reason?:unknown}|undefined;
 const result:RecordRevisionInput={contractVersion:'1.2.0',userId:input.userId,projectId:input.record.projectId,connectionId:input.record.connectionId,operationId:input.operationId??crypto.randomUUID(),recordId:input.record.id,baseVersion:input.record.version,revisionKind:input.revisionKind,frozenDigest:'',metadata:checked?{...metadata,name:safeText(body?.metadata?.name),note:safeText(body?.metadata?.note)}:metadata,redactionPointers:[...input.redactionPointers??[]],reason:checked?safeText(body?.reason):reason};
 result.frozenDigest=await frozenDigest(result);return result;
}
