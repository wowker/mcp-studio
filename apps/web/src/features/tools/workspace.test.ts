import {describe,it,expect} from 'vitest';
import {ToolWorkspace} from './workspace';
const tool={name:'inventory.lookup',description:'Lookup stock',inputSchema:{type:'object' as const,properties:{count:{type:'integer'}}}};
describe('connection scoped document commands',()=>{
 it('reuses an existing tool but explicit new and duplicate create independent unexecuted documents',()=>{
  const workspace=new ToolWorkspace();const scope=workspace.scope('project','connection');const first=scope.open(tool);
  scope.updateDraft(first.id,{raw:'{"count":0}',mode:'raw'});scope.setRunning(first.id,true);
  expect(scope.open(tool).id).toBe(first.id);const second=scope.open(tool,true);expect(second.id).not.toBe(first.id);expect(second.draft.raw).toBe('{}');
  const copy=scope.duplicate(first.id)!;expect(copy.id).not.toBe(first.id);expect(copy.draft).toEqual({raw:'{"count":0}',mode:'raw'});expect(copy.running).toBe(false);scope.updateDraft(copy.id,{raw:'{"count":2}',mode:'form'});expect(scope.tabs[0].draft.raw).toBe('{"count":0}');
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
