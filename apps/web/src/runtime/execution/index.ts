import {validateToolInput,type SchemaValidation,type SchemaIssue} from '../schema';
import {jsonLimit} from '../schema/profile';
import {interpolate,RuntimeError} from '../connection';
import {ToolProtocolError} from './protocol';
import {copyJSON,deepFreeze,freezeEnvironment} from './environment';
import type {ExecutionOptions,ExecutionOutcome,ExecutionState} from './types';
export type {ExecutionOptions,ExecutionOutcome,ExecutionState} from './types';
const idle:ExecutionState={busy:false,phase:'idle',issues:[]};
const safeCode=(error:unknown):string=>{const code=error&&typeof error==='object'&&'code'in error?error.code:undefined;return typeof code==='string'&&['forbidden','unauthenticated','session_expired','config_conflict','version_conflict','environment_changed','connection_required','tools_unavailable','tool_removed','cancelled','timeout','rpc_error','http_error','credential_rejected','authorization_denied','network_error'].includes(code)?code:'platform_unavailable';};
async function abortable<T>(promise:Promise<T>,signal:AbortSignal):Promise<T>{if(signal.aborted)throw new RuntimeError('cancelled');let onAbort:()=>void=()=>{};const cancelled=new Promise<never>((_,reject)=>{onAbort=()=>reject(new RuntimeError('cancelled'));signal.addEventListener('abort',onAbort,{once:true});});try{return await Promise.race([promise,cancelled]);}finally{signal.removeEventListener('abort',onAbort);}}
export class ExecutionRunner{
 #states=new Map<string,ExecutionState>();#owners=new Map<string,string>();#resultRuns=new Map<string,string>();#active=new Map<string,{controller:AbortController;projectId:string;userId:string;generation:number}>();#listeners=new Set<()=>void>();#generation=0;#validate:typeof validateToolInput;
 constructor(options:{validate?:typeof validateToolInput}={}){this.#validate=options.validate??validateToolInput;}
 getSnapshot=(tabId:string):ExecutionState=>this.#states.get(tabId)??idle;
 subscribe=(listener:()=>void)=>{this.#listeners.add(listener);return ()=>{this.#listeners.delete(listener);};};
 #set(tabId:string,state:ExecutionState){this.#states.set(tabId,state);for(const listener of this.#listeners)listener();}
 cancel(tabId:string){this.#active.get(tabId)?.controller.abort();}
 clear(){this.#generation++;for(const job of this.#active.values())job.controller.abort();this.#active.clear();this.#states.clear();this.#owners.clear();this.#resultRuns.clear();for(const listener of this.#listeners)listener();}
 revokeProject(projectId:string){for(const [tabId,owner]of this.#owners)if(owner===projectId){this.#active.get(tabId)?.controller.abort();this.#active.delete(tabId);this.#states.delete(tabId);this.#owners.delete(tabId);this.#resultRuns.delete(tabId);}for(const listener of this.#listeners)listener();}
 invalidateRun(projectId:string,runId:string){for(const [tabId,owner]of this.#owners)if(owner===projectId&&this.#resultRuns.get(tabId)===runId){const state=this.getSnapshot(tabId);this.#resultRuns.delete(tabId);this.#set(tabId,{...state,result:undefined,diagnostic:undefined,phase:state.busy?state.phase:'idle'});}}
 async execute(options:ExecutionOptions):Promise<ExecutionOutcome|undefined>{
  const tabId=options.tabId;if(this.#active.has(tabId))return undefined;
  const controller=new AbortController(),generation=this.#generation,job={controller,projectId:options.connection.projectId,userId:options.userId,generation};this.#active.set(tabId,job);
  this.#owners.set(tabId,job.projectId);
  const previous=this.getSnapshot(tabId),active=()=>generation===this.#generation&&this.#active.get(tabId)===job;
  const set=(partial:Partial<ExecutionState>)=>{if(active())this.#set(tabId,{...this.getSnapshot(tabId),...partial});};
  set({busy:true,phase:'validating',issues:[],diagnostic:undefined});
  let outcome:ExecutionOutcome|undefined;
  const sanitize=options.session.captureSanitizer();
  try{
   const connection=deepFreeze(copyJSON(options.connection)),environment=freezeEnvironment(options.environment),requestDraft=copyJSON(options.arguments);let tool=deepFreeze(copyJSON(options.tool));
   if(options.localIssues?.length){set({issues:copyJSON(options.localIssues),phase:previous.phase});return undefined;}
   const limit=jsonLimit(requestDraft,'request');if(limit){set({issues:[{path:'',code:limit}],phase:previous.phase});return undefined;}
   options.session.assertContext(options);if(environment.error)throw new RuntimeError('environment_changed');
   if(options.refreshTool){tool=deepFreeze(copyJSON(await abortable(options.refreshTool(),controller.signal)));if(!tool||tool.name!==options.tool.name)throw new RuntimeError('tool_removed');}
   const issues:SchemaIssue[]=[];let visits=0;
   const resolve=(value:unknown,path='',depth=0):unknown=>{if(++visits>4096||depth>64){issues.push({path,code:'request_limit'});return undefined;}if(typeof value==='string'){const result=interpolate(value,environment);for(const code of result.errors)issues.push({path,code});return result.value;}if(Array.isArray(value))return value.map((child,n)=>resolve(child,path+'/'+n,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,resolve(child,path+'/'+key.replace(/~/gu,'~0').replace(/\//gu,'~1'),depth+1)]));return value;};
   const request=resolve(requestDraft) as Record<string,unknown>;if(issues.length){set({issues,phase:previous.phase});return undefined;}
   const resolvedLimit=jsonLimit(request,'request');if(resolvedLimit){set({issues:[{path:'',code:resolvedLimit}],phase:previous.phase});return undefined;}
   const validation:SchemaValidation=await abortable(this.#validate(tool.inputSchema,request),controller.signal);if(!validation.supported||!validation.valid){set({issues:validation.errors,diagnostic:validation.reason,phase:previous.phase});return undefined;}
   set({phase:'authorizing'});const access=await abortable(options.authorize(),controller.signal);
   if(access.userId!==options.userId||access.projectId!==connection.projectId||access.connectionId!==connection.id)throw new RuntimeError('forbidden');if(access.version!==connection.version||access.environmentId!==connection.environmentId)throw new RuntimeError('config_conflict');
   if(options.beforeRun)await abortable(options.beforeRun(),controller.signal);
   options.session.assertContext(options);if(controller.signal.aborted)throw new RuntimeError('cancelled');
   const started=Date.now();outcome={runId:crypto.randomUUID(),recordId:crypto.randomUUID(),operationId:crypto.randomUUID(),tabId,userId:options.userId,projectId:connection.projectId,connectionId:connection.id,environmentId:connection.environmentId,tool,connection,request:deepFreeze(copyJSON(request)),status:'failed',resultKind:'network_error',httpStatus:0,responseRetention:'full',startedAt:new Date(started).toISOString(),finishedAt:'',durationMs:0,remoteOutcome:'unknown'};
   set({phase:'running'});
   try{
    const response=await abortable(options.session.callTool({connection,userId:options.userId,environment,name:tool.name,arguments:request,signal:controller.signal}),controller.signal);
    outcome.remoteOutcome='known';outcome.resultKind=response.isError?'tool_error':'success';outcome.status=response.isError?'failed':'succeeded';
    if(new TextEncoder().encode(JSON.stringify(response)).length>10*1024*1024){outcome.responseRetention='omitted';outcome.omissionReason='response_size';}
    else outcome.response=response;
    if(tool.outputSchema&&!response.isError){outcome.outputValidation=await abortable(this.#validate(tool.outputSchema,response.structuredContent),controller.signal);if(!outcome.outputValidation.supported||!outcome.outputValidation.valid){outcome.status='failed';outcome.resultKind='output_invalid';outcome.errorCode='output_invalid';}}
   }catch(error){const code=safeCode(error);if(error instanceof ToolProtocolError)outcome.protocol=error.captureSummary();outcome.errorCode=code;outcome.status=code==='cancelled'?'cancelled':'failed';outcome.resultKind=code==='cancelled'?'cancelled':code==='timeout'?'timeout':code==='rpc_error'?'rpc_error':['http_error','credential_rejected','authorization_denied'].includes(code)?'http_error':'network_error';outcome.remoteOutcome=['rpc_error','credential_rejected','authorization_denied'].includes(code)?'known':'unknown';outcome.httpStatus=code==='credential_rejected'?401:code==='authorization_denied'?403:0;}
   outcome.finishedAt=new Date().toISOString();outcome.durationMs=Math.max(0,Date.now()-started);deepFreeze(outcome);
   if(active()){
    const safe=sanitize(outcome);this.#resultRuns.set(tabId,outcome.runId);set({phase:outcome.status,result:safe.value,diagnostic:outcome.errorCode,issues:[]});
    try{await options.onFinished?.(outcome,sanitize);}catch{set({diagnostic:'record_failed'});}
   }
   return outcome;
  }catch(error){set({phase:previous.phase,diagnostic:safeCode(error)});return undefined;}
  finally{if(active()){this.#active.delete(tabId);this.#set(tabId,{...this.getSnapshot(tabId),busy:false});}}
 }
}
