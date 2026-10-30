import {RuntimeError} from '../connection';
import {jsonLimit} from '../schema/profile';
import {deepFreeze} from './environment';
export type ToolErrorSummary={source:'sdk-error-summary';jsonrpcError:{code:number;sdkDiagnostic:string;data?:unknown}};
/** SDK diagnostics are transient private data. The normal Error surface remains safe. */
export class ToolProtocolError extends RuntimeError{
 #summary:ToolErrorSummary;
 constructor(code:number,sdkDiagnostic:string,data?:unknown){
  super('rpc_error');
  const omitted:ToolErrorSummary={source:'sdk-error-summary',jsonrpcError:{code,sdkDiagnostic:'[OMITTED]',data:{omitted:'protocol_limit'}}};
  const summary:ToolErrorSummary={source:'sdk-error-summary',jsonrpcError:{code,sdkDiagnostic,...data===undefined?{}:{data}}};
  if(sdkDiagnostic.length>1048576||jsonLimit(summary,'request'))this.#summary=deepFreeze(omitted);
  else{try{this.#summary=deepFreeze(structuredClone(summary));}catch{this.#summary=deepFreeze(omitted);}}
 }
 captureSummary():ToolErrorSummary{return this.#summary;}
}
