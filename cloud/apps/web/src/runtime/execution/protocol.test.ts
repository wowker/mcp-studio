import {it,expect} from 'vitest';
import {ToolProtocolError} from '../browser-session';
it.each(['size','depth','nonfinite','cycle'] as const)('keeps RPC code but omits unsafe transient %s data before cloning',kind=>{
 let data:unknown;
 if(kind==='size')data={echo:'x'.repeat(1048577)};
 else if(kind==='depth'){data={echo:'private-protocol-value'};for(let n=0;n<70;n++)data={nested:data};}
 else if(kind==='nonfinite')data={number:Infinity};
 else{const cyclic:Record<string,unknown>={};cyclic.self=cyclic;data=cyclic;}
 const error=new ToolProtocolError(-32603,'MCP error -32603: private-protocol-diagnostic',data);
 expect(error.message).toBe('rpc_error');expect(JSON.stringify(error)).not.toContain('private-protocol');expect(error.captureSummary().jsonrpcError.sdkDiagnostic==='[OMITTED]').toBe(true);expect(error.captureSummary()).toEqual({source:'sdk-error-summary',jsonrpcError:{code:-32603,sdkDiagnostic:'[OMITTED]',data:{omitted:'protocol_limit'}}});
});
it('bounds an oversized SDK diagnostic independently while retaining small ordinary summaries',()=>{
 const large=new ToolProtocolError(-32603,'x'.repeat(1048577));expect(large.captureSummary().jsonrpcError.sdkDiagnostic==='[OMITTED]').toBe(true);const normal=new ToolProtocolError(-32603,'MCP error -32603: ordinary',{safe:true});expect(normal.captureSummary()).toEqual({source:'sdk-error-summary',jsonrpcError:{code:-32603,sdkDiagnostic:'MCP error -32603: ordinary',data:{safe:true}}});
});
