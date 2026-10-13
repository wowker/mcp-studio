import {describe,it,expect} from 'vitest';
import vectors from '../../../../contracts/fixtures/semantics-v1.json';
import {resolveEnvironment,buildLayers,type EnvironmentInput} from './environment';
import type {Variable} from '../generated/platform';
describe('production environment contract',()=>{
 for(const vector of vectors.cases.filter(v=>v.kind==='environment'))it(vector.id,()=>{
  const result=resolveEnvironment(vector.input as EnvironmentInput);
  expect(result.error ? {error:result.error}: result.rows).toEqual(vector.expected);
 });
 it('keeps tainted actual values private and resolves dependencies only after layer selection',()=>{
  const r=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'s',name:'S',type:'string',sensitive:true,value:null},{id:'j',name:'J',type:'json',value:{n:['{{S}}']}}]}],personal:{s:'private'},targets:['J']});
  expect(JSON.stringify(r)).not.toContain('private');expect(r.read('J')?.value).toEqual({n:['private']});
 });
 it('selects only matching project, connection and environment in fixed layer order',()=>{
  const variable=(id:string,projectId:string,connectionId:string,environmentId:string):Variable=>({id,name:'X',projectId,connectionId,environmentId,type:'string',sensitive:false,required:false,valueJSON:JSON.stringify(id),version:1,etag:'v1'});
  const layers=buildLayers([variable('base','p','',''),variable('selected','p','','e'),variable('service','p','c',''),variable('service-selected','p','c','e'),variable('foreign','q','c','e'),variable('other-connection','p','other','e')],'p','c','e');
  expect(layers.map(l=>l.definitions[0].id)).toEqual(['base','selected','service','service-selected']);
 });
});
it('does not let authorization by a deleted or overridden definition borrow a same-name value',()=>{
 const r=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'old',name:'S',type:'string',sensitive:true,value:null}]},{source:'base-connection',definitions:[{id:'new',name:'S',type:'string',sensitive:true,value:null}]}],personal:{old:'old-private',new:'new-private'}});
 expect(r.readDefinition('old')).toBeUndefined();expect(r.readDefinition('new')?.value).toBe('new-private');expect(r.definition('S')?.id).toBe('new');
});
it('bounds definition and recursive expansion work without exposing sensitive values',()=>{
 const definitions=Array.from({length:257},(_,n)=>({id:String(n),name:'V'+n,type:'string' as const,value:'x'}));expect(resolveEnvironment({layers:[{source:'base-project',definitions}],personal:{}}).error).toBe('resolution_limit');
 let nested:unknown='secret';for(let n=0;n<70;n++)nested={child:nested};const r=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'J',name:'J',type:'json',value:nested}]}],personal:{}});expect(r.rows[0].status).toBe('resolution_limit');expect(r.read('J')).toBeUndefined();
});
it('builds a sensitive definition with an absent shared value as a personal-only slot',()=>{
 const v:Variable={id:'s',name:'S',projectId:'p',connectionId:'',environmentId:'',type:'string',sensitive:true,required:false,valueJSON:'',version:1,etag:'1'};expect(resolveEnvironment({layers:buildLayers([v],'p','c',''),personal:{}}).rows[0].status).toBe('personal_missing');
});
it('rejects nonfinite nested private JSON instead of silently serializing it to null',()=>{
 const r=resolveEnvironment({layers:[{source:'base-project',definitions:[{id:'j',name:'J',type:'json',sensitive:true,value:null}]}],personal:{j:{n:Infinity}}});expect(r.rows[0].status).toBe('type_error');expect(r.read('J')).toBeUndefined();
});
it('keeps project-only browsing out of connection layers',()=>{
 const v:Variable={id:'x',name:'X',projectId:'p',connectionId:'',environmentId:'',type:'string',sensitive:false,required:false,valueJSON:'"public"',version:1,etag:'1'};const layers=buildLayers([v],'p','','');expect(layers.map(l=>l.source)).toEqual(['base-project']);expect(resolveEnvironment({layers,personal:{}}).rows[0].source).toBe('base-project');
});
