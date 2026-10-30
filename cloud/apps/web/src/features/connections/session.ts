import type {Connection,ConnectionInput,VariableInput} from '../../generated/platform';
export const emptyConnection:ConnectionInput={name:'',transport:'streamable-http',channel:'browser',endpoint:'',command:'',args:[],cwd:'',headers:[],env:[],timeoutMs:30000,environmentId:'',authMode:'none',authReferenceId:'',oauthClientId:'',oauthScopes:[]};
export const emptyVariable:VariableInput={name:'',type:'string',sensitive:false,required:false,valueJSON:'',environmentId:'',connectionId:''};
export function connectionInput(connection:Connection):ConnectionInput{const {id:_,projectId:__,version:___,etag:____,...input}=connection;return input;}
export class DraftMemory {
 drafts=new Map<string,ConnectionInput>();
 selected=new Map<string,string>();
 applied=new Map<string,string>();
 variableDrafts=new Map<string,VariableInput>();
 setDraft(project:string,id:string,draft:ConnectionInput){this.drafts.set(`${project}:${id}`,structuredClone(draft));}
 getDraft(project:string,id:string){return this.drafts.get(`${project}:${id}`);}
 apply(project:string,id:string,environment:string,saved:boolean,locked:boolean,blocked:boolean){if(!id||!saved||locked||blocked)return false;this.applied.set(`${project}:${id}`,environment);return true;}
 clear(){this.drafts.clear();this.selected.clear();this.applied.clear();this.variableDrafts.clear();}
}
