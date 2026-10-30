import type {RecordMetadata} from '../../generated/platform';
export type ToolRecordScope={connectionId:string;toolName:string};
export type RecordFilters={search:string;connectionId:string;toolName:string;status:string;visibility:string;contentKind:string;ownerId:string;environmentId:string;from:string;to:string};
export const emptyRecordFilters=():RecordFilters=>({search:'',connectionId:'',toolName:'',status:'',visibility:'',contentKind:'',ownerId:'',environmentId:'',from:'',to:''});
export type RecordListView={kind:'history'|'saved';filters:RecordFilters;cursors:string[];page:number;selectedId:string};
export type RecordDetailView={reason:string;pointers:string;metadata?:RecordMetadata;metadataOperationId:string;operationId:string;editing:boolean;saving:boolean;deleting:boolean;saveSource?:import('../../generated/platform').ExecutionSnapshot;saveOperationId:string;saveMetadata?:RecordMetadata};
/** UI navigation and draft state share identity lifetime with the root memory. */
export class RecordsViews {
 private lists=new Map<string,RecordListView>();private details=new Map<string,RecordDetailView>();
 constructor(readonly changed:()=>void=()=>{}){}
 list(projectId:string,scope?:ToolRecordScope){const key=JSON.stringify([projectId,scope?.connectionId??'',scope?.toolName??'']);let view=this.lists.get(key);if(!view){view={kind:'history',filters:emptyRecordFilters(),cursors:[''],page:0,selectedId:''};this.lists.set(key,view);}return view;}
 detail(projectId:string,recordId:string){const key=JSON.stringify([projectId,recordId]);let view=this.details.get(key);if(!view){view={reason:'',pointers:'',operationId:'',metadataOperationId:'',editing:false,saving:false,deleting:false,saveOperationId:''};this.details.set(key,view);}return view;}
 invalidateRun(projectId:string,runId:string){if(!runId)return;for(const [key,view]of this.details)if((JSON.parse(key) as string[])[0]===projectId&&view.saveSource?.runId===runId){view.saveSource=undefined;view.saveOperationId='';view.saving=false;}this.changed();}
 invalidateSources(projectId:string,recordIds:string[]){for(const [key,view]of this.details){const [project,record]=JSON.parse(key) as string[];if(project===projectId&&recordIds.some(id=>record===id||record===`copy:${id}`)){view.saveSource=undefined;view.saving=false;}}this.changed();}
 revokeProject(projectId:string){for(const map of [this.lists,this.details])for(const key of map.keys())if((JSON.parse(key) as string[])[0]===projectId)map.delete(key);this.changed();}
 clear(){this.lists.clear();this.details.clear();this.changed();}
}
export function recordListPath(projectId:string,view:RecordListView,scope?:ToolRecordScope){const query=new URLSearchParams({kind:view.kind,limit:'50'});for(const [key,value]of Object.entries(view.filters)){if(value)query.set(key,key==='from'||key==='to'?new Date(value).toISOString():value);}if(scope){query.set('connectionId',scope.connectionId);query.set('toolName',scope.toolName);}const cursor=view.cursors[view.page];if(cursor)query.set('cursor',cursor);return `/projects/${encodeURIComponent(projectId)}/records?${query}`;}
export function recordWritable(record:import('../../generated/platform').Record,userId:string,role:string){return (role==='developer'||role==='maintainer')&&(record.metadata.visibility==='private'?record.ownerId===userId:role==='maintainer');}
