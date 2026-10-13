import {jsonLimit} from './profile';
import {unsupported,type SchemaValidation} from './types';
export type {SchemaIssue,SchemaValidation} from './types';
/** Every browser validation has a fresh interpreter registry and a bounded Worker lifetime. */
export async function validateToolInput(schema:unknown,value:unknown):Promise<SchemaValidation>{
 const schemaLimit=jsonLimit(schema,'schema');if(schemaLimit)return unsupported(schemaLimit==='invalid_json'?'invalid_schema':schemaLimit);
 const requestLimit=jsonLimit(value,'request');if(requestLimit)return {supported:true,valid:false,errors:[{path:'',code:requestLimit}]};
 if(typeof Worker==='undefined')return unsupported('schema_worker_unavailable');
 let worker:Worker;try{worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});}catch{return unsupported('schema_worker_unavailable');}
 return new Promise(resolve=>{
  let finished=false;const finish=(result:SchemaValidation)=>{if(finished)return;finished=true;clearTimeout(timer);worker.onmessage=null;worker.onerror=null;worker.terminate();resolve(result);};
  const timer=setTimeout(()=>finish(unsupported('schema_validation_timeout')),1500);
  worker.onmessage=event=>{const result:unknown=event.data;if(!result||typeof result!=='object'||!('supported'in result)||typeof result.supported!=='boolean'||!('valid'in result)||typeof result.valid!=='boolean'||!('errors'in result)||!Array.isArray(result.errors)){finish(unsupported('schema_worker_failed'));return;}finish(result as SchemaValidation);};
  worker.onerror=()=>finish(unsupported('schema_worker_failed'));
  try{worker.postMessage({schema,value});}catch{finish(unsupported('schema_worker_failed'));}
 });
}
