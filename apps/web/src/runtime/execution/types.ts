import type {CallToolResult} from '@modelcontextprotocol/sdk/types.js';
import type {Connection,ConnectionAccess,ExecutionSnapshot} from '../../generated/platform';
import type {BrowserSession,ToolDefinition} from '../browser-session';
import type {ResolvedEnvironment} from '../environment';
import type {RedactionResult} from '../records/redaction';
import type {SchemaIssue,SchemaValidation} from '../schema';
export type ExecutionOutcome={runId:string;recordId:string;operationId:string;tabId:string;userId:string;projectId:string;connectionId:string;environmentId:string;tool:ToolDefinition;connection:Connection;request:Record<string,unknown>;status:'succeeded'|'failed'|'cancelled';resultKind:ExecutionSnapshot['resultKind'];httpStatus:number;response?:CallToolResult;protocol?:unknown;responseRetention:'full'|'omitted';omissionReason?:string;errorCode?:string;outputValidation?:SchemaValidation;startedAt:string;finishedAt:string;durationMs:number;remoteOutcome:'known'|'unknown'};
export type ExecutionState={busy:boolean;phase:'idle'|'validating'|'authorizing'|'running'|'succeeded'|'failed'|'cancelled';issues:SchemaIssue[];diagnostic?:string;result?:unknown};
export type ExecutionOptions={tabId:string;session:BrowserSession;connection:Connection;userId:string;environment:ResolvedEnvironment;tool:ToolDefinition;arguments:Record<string,unknown>;localIssues?:SchemaIssue[];refreshTool?:()=>Promise<ToolDefinition>;authorize:()=>Promise<ConnectionAccess>;beforeRun?:()=>Promise<void>;onFinished?:(outcome:ExecutionOutcome,sanitize:(value:unknown)=>RedactionResult)=>void|Promise<void>};
