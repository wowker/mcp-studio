import type {ToolDefinition} from '../../runtime/browser-session';
export type ToolDraft={raw:string;mode:'form'|'raw';arguments?:import('./argumentDraft').ArgumentDraft;restore?:{recordId:string;missing:string[]}};
export type DebuggerLayoutState={ratio:number;requestScroll:number;resultScroll:number};
export type ToolTab={layout?:DebuggerLayoutState;id:string;definition:ToolDefinition;draft:ToolDraft;pinned:boolean;running:boolean;lastRunId?:string;lastSnapshot?:import('../../generated/platform').ExecutionSnapshot;uploadOperationId?:string};
/** Personal documents live only in root-owned memory, never browser storage. */
export class ToolScope {
 tabs:ToolTab[]=[];selectedId='';search='';
 constructor(private readonly changed:()=>void){}
 get selected(){return this.tabs.find(tab=>tab.id===this.selectedId);}
 open(definition:ToolDefinition,newDocument=false){
  let tab=newDocument?undefined:this.tabs.find(tab=>tab.definition.name===definition.name);
  if(!tab){tab={id:crypto.randomUUID(),definition:structuredClone(definition),draft:{raw:'{}',mode:'form'},pinned:false,running:false};this.tabs=[...this.tabs,tab];}
  this.selectedId=tab.id;this.changed();return tab;
 }
 select(id:string){if(this.tabs.some(tab=>tab.id===id)){this.selectedId=id;this.changed();}}
 updateDraft(id:string,draft:ToolDraft){const tab=this.tabs.find(tab=>tab.id===id);if(tab){tab.draft=structuredClone(draft);this.changed();}}
 setLayout(id:string,values:Partial<DebuggerLayoutState>,notify=true){const tab=this.tabs.find(tab=>tab.id===id);if(!tab)return;const previous=tab.layout??{ratio:52,requestScroll:0,resultScroll:0};const finite=(value:number|undefined,fallback:number)=>value!==undefined&&Number.isFinite(value)?value:fallback;tab.layout={ratio:Math.max(30,Math.min(65,finite(values.ratio,previous.ratio))),requestScroll:Math.max(0,finite(values.requestScroll,previous.requestScroll)),resultScroll:Math.max(0,finite(values.resultScroll,previous.resultScroll))};if(notify)this.changed();}
 setRunning(id:string,running:boolean){const tab=this.tabs.find(tab=>tab.id===id);if(tab){tab.running=running;this.changed();}}
 duplicate(id:string){const source=this.tabs.find(tab=>tab.id===id);if(!source)return;const tab=this.open(source.definition,true);tab.draft=structuredClone(source.draft);this.changed();return tab;}
 pin(id:string,pinned:boolean){const tab=this.tabs.find(tab=>tab.id===id);if(!tab||tab.pinned===pinned)return;tab.pinned=pinned;const others=this.tabs.filter(item=>item.id!==id);const pinnedCount=others.filter(item=>item.pinned).length;others.splice(pinned?pinnedCount:others.length,0,tab);this.tabs=others;this.changed();}
 canMove(id:string,direction:-1|1){const index=this.tabs.findIndex(tab=>tab.id===id);return index>=0&&!!this.tabs[index+direction]&&this.tabs[index].pinned===this.tabs[index+direction].pinned;}
 move(id:string,direction:-1|1){if(!this.canMove(id,direction))return;const index=this.tabs.findIndex(tab=>tab.id===id);const tabs=[...this.tabs];[tabs[index],tabs[index+direction]]=[tabs[index+direction],tabs[index]];this.tabs=tabs;this.changed();}
 close(id:string){const tab=this.tabs.find(tab=>tab.id===id);if(!tab||tab.running)return false;this.remove(new Set([id]));return true;}
 closeOthers(id:string){if(!this.tabs.some(tab=>tab.id===id))return;this.remove(new Set(this.tabs.filter(tab=>tab.id!==id&&!tab.pinned&&!tab.running).map(tab=>tab.id)));}
 closeRight(id:string){const index=this.tabs.findIndex(tab=>tab.id===id);if(index<0)return;this.remove(new Set(this.tabs.slice(index+1).filter(tab=>!tab.pinned&&!tab.running).map(tab=>tab.id)));}
 private remove(ids:Set<string>){const previousIndex=this.tabs.findIndex(tab=>tab.id===this.selectedId);this.tabs=this.tabs.filter(tab=>!ids.has(tab.id));if(ids.has(this.selectedId))this.selectedId=this.tabs[Math.min(previousIndex,this.tabs.length-1)]?.id??'';this.changed();}
}
export class ToolWorkspace {
 private readonly scopes=new Map<string,ToolScope>();
 constructor(private readonly changed:()=>void=()=>{}){}
 scope(projectId:string,connectionId:string){const key=JSON.stringify([projectId,connectionId]);let scope=this.scopes.get(key);if(!scope){scope=new ToolScope(this.changed);this.scopes.set(key,scope);}return scope;}
 revokeProject(projectId:string){for(const key of this.scopes.keys())if((JSON.parse(key) as string[])[0]===projectId)this.scopes.delete(key);this.changed();}
 invalidateRun(projectId:string,runId:string){if(!runId)return;for(const [key,scope]of this.scopes)if((JSON.parse(key) as string[])[0]===projectId)for(const tab of scope.tabs)if(tab.lastSnapshot?.runId===runId){tab.lastSnapshot=undefined;tab.uploadOperationId=undefined;}this.changed();}
 clear(){this.scopes.clear();this.changed();}
}
