import {describe,it,expect} from 'vitest';
import {ToolWorkspace,type ToolTab} from './workspace';
const tool={name:'inventory.lookup',description:'Lookup stock',inputSchema:{type:'object' as const,properties:{count:{type:'integer'}}}};
describe('connection scoped document commands',()=>{
 it('reuses an existing tool but explicit new and duplicate create independent unexecuted documents',()=>{
  const workspace=new ToolWorkspace();const scope=workspace.scope('project','connection');const first=scope.open(tool);
  scope.updateDraft(first.id,{raw:'{"count":0}',mode:'raw'});scope.setRunning(first.id,true);
  expect(scope.open(tool).id).toBe(first.id);const second=scope.open(tool,true);expect(second.id).not.toBe(first.id);expect(second.draft.raw).toBe('{}');
  const copy=scope.duplicate(first.id)!;expect(copy.id).not.toBe(first.id);expect(copy.draft).toEqual({raw:'{"count":0}',mode:'raw'});expect(copy.running).toBe(false);scope.updateDraft(copy.id,{raw:'{"count":2}',mode:'form'});expect(scope.tabs[0].draft.raw).toBe('{"count":0}');
 });
 it('duplicate never inherits a result, run identity or pending upload from the source document',()=>{
  const workspace=new ToolWorkspace();const scope=workspace.scope('project','connection');const first=scope.open(tool);
  scope.updateDraft(first.id,{raw:'{"count":1}',mode:'form'});scope.setRunning(first.id,true);scope.pin(first.id,true);
  const snapshot={runId:'run-1',toolName:'inventory.lookup'} as unknown as NonNullable<ToolTab['lastSnapshot']>;
  Object.assign(first,{lastSnapshot:snapshot,lastRunId:'run-1',uploadOperationId:'op-1'});
  const copy=scope.duplicate(first.id)!;
  expect(copy.id).not.toBe(first.id);expect(copy.draft).toEqual({raw:'{"count":1}',mode:'form'});
  expect(copy.lastSnapshot).toBeUndefined();expect(copy.lastRunId).toBeUndefined();expect(copy.uploadOperationId).toBeUndefined();
  expect(copy.running).toBe(false);expect(copy.pinned).toBe(false);
 });
 it('keeps tab identity, selection, ordering and drafts isolated by project and connection',()=>{
  const workspace=new ToolWorkspace();const a=workspace.scope('a','same-url-1'),b=workspace.scope('a','same-url-2'),c=workspace.scope('b','same-url-1');a.open(tool);b.open({...tool,name:'other'});c.open({...tool,name:'third'});expect(workspace.scope('a','same-url-1')).toBe(a);expect(a.tabs.map(tab=>tab.definition.name)).toEqual(['inventory.lookup']);expect(b.selected?.definition.name).toBe('other');workspace.clear();expect(workspace.scope('a','same-url-1').tabs).toEqual([]);
 });
 it('moves only within the pinned group and protects pinned and running tabs from bulk close',()=>{
  const scope=new ToolWorkspace().scope('p','c');const a=scope.open({...tool,name:'a'}),b=scope.open({...tool,name:'b'}),c=scope.open({...tool,name:'c'}),d=scope.open({...tool,name:'d'});scope.pin(c.id,true);expect(scope.tabs.map(tab=>tab.id)).toEqual([c.id,a.id,b.id,d.id]);scope.move(c.id,1);expect(scope.tabs[0].id).toBe(c.id);scope.move(b.id,-1);expect(scope.tabs.map(tab=>tab.id)).toEqual([c.id,b.id,a.id,d.id]);scope.setRunning(d.id,true);scope.closeOthers(b.id);expect(scope.tabs.map(tab=>tab.id)).toEqual([c.id,b.id,d.id]);expect(scope.close(d.id)).toBe(false);scope.pin(c.id,false);expect(scope.tabs.map(tab=>tab.id)).toEqual([b.id,d.id,c.id]);scope.closeRight(b.id);expect(scope.tabs.map(tab=>tab.id)).toEqual([b.id,d.id]);
 });
 it('commands targeting another tab never replace the selected draft and close selects a surviving neighbour',()=>{
  const scope=new ToolWorkspace().scope('p','c');const a=scope.open(tool),b=scope.open(tool,true),c=scope.open(tool,true);scope.select(b.id);scope.pin(a.id,true);expect(scope.selected?.id).toBe(b.id);scope.move(c.id,-1);expect(scope.selected?.id).toBe(b.id);scope.close(b.id);expect(scope.selected?.id).toBe(c.id);
 });
});
it('project revocation discards only target documents and preserves another project draft',()=>{
 const workspace=new ToolWorkspace();const a=workspace.scope('a','c'),b=workspace.scope('b','c');a.open(tool);const tab=b.open(tool);b.updateDraft(tab.id,{raw:'{"count":0}',mode:'raw'});workspace.revokeProject('a');expect(workspace.scope('a','c').tabs).toEqual([]);expect(workspace.scope('b','c').selected?.draft.raw).toBe('{"count":0}');
});
it('duplicates all nested argument editing metadata without sharing mutable state',()=>{const scope=new ToolWorkspace().scope('p','c');const source=scope.open(tool);const state={value:{nested:[0,false,null]},raw:'{"nested":[0,false,null]}',parseError:false,skipped:{'/other':true},omitted:{},touched:{'/nested':true},texts:{'/local':'invalid{'},expanded:{'/nested':false},branches:{},errors:[],revision:2};scope.updateDraft(source.id,{raw:state.raw,mode:'raw',arguments:state});const copy=scope.duplicate(source.id)!;copy.draft.arguments!.expanded['/nested']=true;(copy.draft.arguments!.value as {nested:unknown[]}).nested[0]=3;expect(source.draft.arguments!.expanded['/nested']).toBe(false);expect((source.draft.arguments!.value as {nested:unknown[]}).nested[0]).toBe(0);});
it('retains bounded pane and scroll positions per document without copying a previous result layout',()=>{
 const scope=new ToolWorkspace().scope('p','c'),first=scope.open(tool);scope.setLayout(first.id,{ratio:100,requestScroll:120,resultScroll:80});expect(first.layout).toEqual({ratio:65,requestScroll:120,resultScroll:80});const other=scope.open(tool,true);expect(other.layout).toBeUndefined();scope.select(first.id);expect(scope.selected?.layout?.requestScroll).toBe(120);const copy=scope.duplicate(first.id)!;expect(copy.layout).toBeUndefined();scope.setLayout(first.id,{ratio:-4,requestScroll:-1});expect(first.layout).toEqual({ratio:30,requestScroll:0,resultScroll:80});expect(first.draft.raw).toBe('{}');
});
